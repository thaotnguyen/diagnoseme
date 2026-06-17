from flask import Flask, render_template, request, jsonify, session, Response, stream_with_context
import logging
import json
import os
import boto3
import uuid
from liquid import Template
from boto3.dynamodb.conditions import Key, Attr
# Import the new function
from disease_selector import select_random_disease, select_disease_by_criteria
from flask_cors import CORS
import google.generativeai as genai
import urllib.parse  # Importing urllib for URL encoding
from url_shortener import encode_case_data, decode_case_data
from dotenv import load_dotenv
from datetime import datetime
from flask import after_this_request

project_folder = os.path.expanduser(
    '~/Development/diagnoseme')  # adjust as appropriate
load_dotenv(os.path.join(project_folder, '.env'))

# Set up logging
logging.basicConfig(level=logging.INFO)

API_KEY = os.getenv('GOOGLE_API_KEY')

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-3.5-flash')
advanced_model = genai.GenerativeModel('gemini-3.5-flash')

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
app.secret_key = 'your_secret_key'

dynamodb = boto3.client('dynamodb')

CONVERSATIONS_TABLE = os.getenv(
    'CONVERSATIONS_TABLE', 'diagnosemeconversations')
CASES_TABLE = os.getenv('CASES_TABLE', 'diagnosemecases')


@app.before_request
def log_request_info():
    logging.info('Request URL: %s, Method: %s', request.url, request.method)


@app.route('/')
def home():
    logging.info("Home route accessed")
    return render_template('index.html', config=app.config)


def get_client_ip():
    # Use a persistent, device-scoped UUID stored in a cookie.
    device_id = request.cookies.get('device_id')
    if device_id:
        return device_id

    new_device_id = str(uuid.uuid4())

    # Set the cookie on the outgoing response so it's stable across visits.
    try:

        @after_this_request
        def _set_device_cookie(response):
            # Persist for ~2 years
            max_age = 60 * 60 * 24 * 730
            response.set_cookie(
                'device_id',
                new_device_id,
                max_age=max_age,
                httponly=True,
                samesite='Lax',
                secure=request.is_secure
            )
            return response
    except Exception:
        pass

    return new_device_id


user_played_diseases = {}


@app.route('/new_random_case', methods=['POST'])
def new_random_case():
    """Get a new random case that's different from previously played cases today."""
    try:
        data = request.get_json() or {}
        previous_disease = data.get('previous_disease')

        # Get user identifier
        user_id = get_client_ip()

        # Initialize played diseases set for this user if not exists
        if user_id not in user_played_diseases:
            user_played_diseases[user_id] = set()

        # Add previous disease to played set if provided
        if previous_disease:
            user_played_diseases[user_id].add(previous_disease)

        # Get a disease that hasn't been played today by this user
        max_attempts = 10  # Avoid infinite loop
        disease = None
        for _ in range(max_attempts):
            disease = select_random_disease(case_of_the_day=False)
            if disease not in user_played_diseases[user_id]:
                break

        if not disease or disease in user_played_diseases[user_id]:
            # If we couldn't find a new disease after max attempts, just use any random one
            # This is a fallback and should rarely happen
            disease = select_random_disease()

        # Add to played diseases
        user_played_diseases[user_id].add(disease)

        logging.info(f"Selected new random disease: {disease}")

        # Generate patient case
        case_record = get_patient_case_record(disease)
        patient_case = case_record['case']

        # Build placeholder snippet
        placeholder_snippet = build_placeholder_snippet(patient_case, disease)

        # Return the new case details
        return jsonify({
            "message": "New random case generated",
            "patient_context": {
                "case": patient_case,
                "disease": disease,
                "attempts": 2,
                "completed": False,
                "history": [],
                "placeholder_snippet": placeholder_snippet,
                "rubric": case_record['rubric'],
                "case_key": case_record['case_key']
            }
        })
    except Exception as e:
        logging.error(f"Error generating new random case: {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate new case: {str(e)}"}), 500


@app.route('/generate_case_by_criteria', methods=['POST'])
def generate_case_by_criteria():
    """Generate a case using AI based on optional chief complaint and specialty criteria."""
    try:
        data = request.get_json() or {}
        chief_complaint = data.get('chief_complaint', '').strip()
        specialty = data.get('specialty', '').strip()

        # Both fields are now optional
        logging.info(
            f"Generating AI case with criteria - Chief complaint: '{chief_complaint}', Specialty: '{specialty}'")

        # Generate disease using AI based on criteria
        disease = select_disease_by_criteria(chief_complaint, specialty)
        logging.info(f"AI selected disease: {disease}")

        if not disease:
            return jsonify({"error": "Failed to generate a disease based on criteria"}), 500

        # Generate patient case
        case_record = get_patient_case_record(disease)
        patient_case = case_record['case']
        placeholder_snippet = build_placeholder_snippet(patient_case, disease)

        # Return the case details
        return jsonify({
            "message": "Case generated successfully using AI",
            "disease": disease,
            "url": f"case/{urllib.parse.quote(encode_case_data(disease, encrypt=True))}",
            "criteria_used": {
                "chief_complaint": chief_complaint if chief_complaint else None,
                "specialty": specialty if specialty else None
            },
            "patient_context": {
                "case": patient_case,
                "disease": disease,
                "attempts": 2,
                "completed": False,
                "history": [],
                "placeholder_snippet": placeholder_snippet,
                "rubric": case_record['rubric'],
                "case_key": case_record['case_key']
            }
        })

    except Exception as e:
        logging.error(
            f"Error generating AI case by criteria: {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate case: {str(e)}"}), 500

# Modify save_conversation to ensure unique sessions


@app.route('/save_conversation', methods=['POST'])
def save_conversation():
    """Upsert a snapshot of the current game conversation to DynamoDB."""
    try:
        data = request.get_json(force=True, silent=True) or {}

        user_id = get_client_ip()
        disease = data.get('disease') or (
            data.get('patient_context') or {}).get('disease')
        if not disease:
            return jsonify({'ok': False, 'error': 'Missing disease'}), 400

        date_str = data.get('date') or datetime.utcnow().strftime('%Y-%m-%d')
        training_level = data.get('training_level', 'unknown')
        daily_streak = int(data.get('daily_streak') or 0)
        games_played = int(data.get('games_played') or 0)
        games_completed = int(data.get('games_completed') or 0)
        last_played = data.get('last_played') or date_str
        elapsed_time = int(data.get('elapsed_time') or 0)
        conversation = data.get('conversation', '')

        # NEW: Create a unique session ID for each game play using timestamp
        # This ensures each game is saved as a separate entity
        timestamp = datetime.utcnow().isoformat()
        session_id = data.get(
            'session_id') or f"{user_id}|{date_str}|{disease}|{timestamp}"

        dynamodb.update_item(
            TableName=CONVERSATIONS_TABLE,
            Key={'session_id': {'S': session_id}},
            UpdateExpression=(
                "SET user_id = :uid, "
                "training_level = :tl, "
                "game_date = :gd, "
                "disease = :dz, "
                "daily_streak = :ds, "
                "games_played = :gp, "
                "games_completed = :gc, "
                "last_played = :lp, "
                "elapsed_time = :et, "
                "conversation = :cv, "
                "updated_at = :now"
            ),
            ExpressionAttributeValues={
                ':uid': {'S': str(user_id)},
                ':tl': {'S': str(training_level)},
                ':gd': {'S': str(date_str)},
                ':dz': {'S': str(disease)},
                ':ds': {'N': str(daily_streak)},
                ':gp': {'N': str(games_played)},
                ':gc': {'N': str(games_completed)},
                ':lp': {'S': str(last_played)},
                ':et': {'N': str(elapsed_time)},
                ':cv': {'S': str(conversation)},
                ':now': {'S': datetime.utcnow().isoformat()},
            },
            ReturnValues='NONE'
        )
        return jsonify({'ok': True, 'session_id': session_id})
    except Exception as e:
        logging.error("Error saving conversation to DynamoDB: %s",
                      e, exc_info=True)
        return jsonify({'ok': False, 'error': str(e)}), 500


def get_case_key(disease, case_details=None):
    if case_details:
        return encode_case_data(disease, case_details, encrypt=False)
    return encode_case_data(disease, encrypt=False)


def fallback_case_rubric(disease):
    return {
        "disease": disease,
        "key_history": [
            "Elicit the chief concern, symptom timeline, associated symptoms, relevant risk factors, and pertinent negatives."
        ],
        "key_physical_exam": [
            "Request focused exam findings that help distinguish the likely diagnosis from close alternatives."
        ],
        "key_tests": [
            "Order targeted labs or imaging only when they would reasonably affect diagnostic confidence."
        ],
        "diagnostic_reasoning": [
            "Use the case findings to name the most likely diagnosis and avoid premature closure."
        ],
        "common_pitfalls": [
            "Guessing before gathering enough discriminating information or requesting overly broad exams/tests."
        ],
        "performance_levels": {
            "excellent": "Focused, efficient questioning and testing that identifies discriminating findings before diagnosing.",
            "adequate": "Reaches the diagnosis with some relevant information but misses important supporting or excluding features.",
            "weak": "Relies on broad requests, unsupported guesses, or misses the main diagnostic clues."
        }
    }


def parse_json_object(text):
    if not text:
        raise ValueError("Empty JSON response")

    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find('{')
        end = cleaned.rfind('}')
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(cleaned[start:end + 1])


def generate_case_rubric(disease, case_text):
    """Generate a structured performance rubric for a case."""
    prompt = (
        "You are an expert medical educator creating a rubric for a diagnostic reasoning game.\n\n"
        f"Correct diagnosis: {disease}\n\n"
        f"Full case record:\n{case_text}\n\n"
        "Create a concise rubric for what good performance in this specific case looks like. "
        "Focus on observable player behavior in the encounter, not generic facts about the disease. "
        "Return ONLY valid JSON with this exact shape:\n"
        "{\n"
        '  "disease": "string",\n'
        '  "key_history": ["string"],\n'
        '  "key_physical_exam": ["string"],\n'
        '  "key_tests": ["string"],\n'
        '  "diagnostic_reasoning": ["string"],\n'
        '  "common_pitfalls": ["string"],\n'
        '  "performance_levels": {\n'
        '    "excellent": "string",\n'
        '    "adequate": "string",\n'
        '    "weak": "string"\n'
        "  }\n"
        "}\n"
    )
    response = call_llm_api(prompt, streaming=False,
                            log_prefix="Generate Case Rubric", advanced=True)
    try:
        rubric = parse_json_object(response)
        if not isinstance(rubric, dict):
            raise ValueError("Rubric response was not a JSON object")
        return rubric
    except Exception as e:
        logging.error("Failed to parse generated rubric: %s", e, exc_info=True)
        return fallback_case_rubric(disease)


def generate_medical_case(disease, case_details=None):
    template_path = os.path.join(
        os.path.dirname(__file__), "MedRAG/templates/medical_case.jinja")
    with open(template_path, "r") as f:
        case_template = Template(f.read())

    prompt = case_template.render(
        disease=disease, case_details=case_details)
    return call_llm_api(prompt, streaming=False,
                        log_prefix="Generate Medical Case", advanced=True)


def get_patient_case_record(disease, case_details=None):
    """Return case text, rubric, and storage key, creating/backfilling as needed."""
    logging.info("Loading patient case record for disease: %s", disease)
    encoded_case_data = get_case_key(disease, case_details)

    case = dynamodb.query(
        TableName=CASES_TABLE,
        KeyConditionExpression='gamecase = :c',
        ExpressionAttributeValues={':c': {'S': encoded_case_data}}
    )
    if not case['Items']:
        print("Case does not exist in DynamoDB, generating a new one.")
        medrag = MedRAG(llm_name="Google/gemini-3.5-flash", rag=True, follow_up=True,
                        retriever_name="MedCPT", corpus_name="MedText", corpus_cache=True)
        new_case = medrag.generate_medical_case(disease, case_details)
        dynamodb.put_item(
            TableName=CASES_TABLE,
            Item={
                'gamecase': {'S': encoded_case_data},
                'gamerecord': {'S': new_case},
                'gamerubric': {'S': rubric_json},
                'rubric_updated_at': {'S': datetime.utcnow().isoformat()},
            }
        )
        print("New case generated and stored in DynamoDB.")
        return {
            'case': new_case,
            'rubric': rubric,
            'case_key': encoded_case_data,
        }
    else:
        print("Case already exists in DynamoDB")
        item = case['Items'][0]
        case_text = item['gamerecord']['S']
        rubric_json = item.get('gamerubric', {}).get('S')

        if rubric_json:
            try:
                rubric = json.loads(rubric_json)
            except json.JSONDecodeError:
                logging.warning("Stored rubric was invalid JSON; regenerating.")
                rubric = generate_case_rubric(disease, case_text)
                rubric_json = json.dumps(rubric)
                dynamodb.update_item(
                    TableName=CASES_TABLE,
                    Key={'gamecase': {'S': encoded_case_data}},
                    UpdateExpression=(
                        "SET gamerubric = :rubric, rubric_updated_at = :now"
                    ),
                    ExpressionAttributeValues={
                        ':rubric': {'S': rubric_json},
                        ':now': {'S': datetime.utcnow().isoformat()},
                    },
                    ReturnValues='NONE'
                )
        else:
            rubric = generate_case_rubric(disease, case_text)
            rubric_json = json.dumps(rubric)
            dynamodb.update_item(
                TableName=CASES_TABLE,
                Key={'gamecase': {'S': encoded_case_data}},
                UpdateExpression=(
                    "SET gamerubric = :rubric, rubric_updated_at = :now"
                ),
                ExpressionAttributeValues={
                    ':rubric': {'S': rubric_json},
                    ':now': {'S': datetime.utcnow().isoformat()},
                },
                ReturnValues='NONE'
            )

        return {
            'case': case_text,
            'rubric': rubric,
            'case_key': encoded_case_data,
        }


def generate_patient_case(disease, case_details=None):
    """Generate or load a complete patient case for a given disease."""
    return get_patient_case_record(disease, case_details)['case']


# Refactored function for LLM API calls using the Gemini Python API
def call_llm_api(prompt, streaming=False, log_prefix="", advanced=False, grounding=False):
    """
    Generic function to call the Gemini API with a prompt and handle the response.

    Args:
        prompt (str): The prompt to send to the LLM API
        streaming (bool): Whether to use streaming API
        log_prefix (str): Prefix for logging messages

    Returns:
        str or Response: The text response from the LLM API or a streaming response
    """
    try:
        logging.info(
            f"{log_prefix} - Sending prompt to Gemini: {prompt[:100]}...")

        if streaming:
            def generate():
                if advanced:
                    response = advanced_model.generate_content(
                        prompt,
                        stream=True,
                    )
                else:
                    response = model.generate_content(
                        prompt,
                        stream=True,
                    )
                for chunk in response:
                    if chunk.text:
                        yield f"{chunk.text}\n\n\n"
                yield "\n\n\n"

            return Response(stream_with_context(generate()), mimetype='text/event-stream')
        else:
            if advanced:
                response = advanced_model.generate_content(prompt)
            else:
                response = model.generate_content(prompt)
            logging.info(f"{log_prefix} - Received response from Gemini")
            return response.text
    except Exception as e:
        logging.error(
            f"{log_prefix} - Request to Gemini failed: {e}", exc_info=True)
        return f"Error communicating with LLM: {str(e)}"


# NEW: helper to build a minimal placeholder snippet from the case/disease
def build_placeholder_snippet(case_text: str, disease: str) -> str:
    prompt = (
        "You are helping build a minimal one-line chat placeholder for a medical case.\n\n"
        f"Case context (may include demographics and disease): {case_text}\n\n"
        "Task: Return ONE short line with:\n"
        "- A realistic first name (first name only),\n"
        "- Age as an integer,\n"
        "- Sex/gender as 'male' or 'female' (use 'nonbinary' if clearly indicated),\n"
        "- Setting (e.g. outpatient, inpatient, emergency room, ICU, clinic, etc),\n"
        "- Chief complaint as an extremely short minimalistic 1-3 word phrase. Only give one symptom, not two or more.\n\n"
        "Strict output format (no quotes, no extra text, single line):\n"
        "<Name>, <age>-year-old <gender>, <setting>: <chief complaint>.\n\n"
        "Examples:\n"
        "Ava, 7-year-old female, outpatient: stomach pain.\n"
        "Marcus, 64-year-old male, emergency room: chest pressure.\n"
        "Return only that one line."
    )
    try:
        text = call_llm_api(prompt, streaming=False,
                            log_prefix="Build Placeholder", advanced=False)
        line = (text or "").strip().splitlines()[0]
        # quick sanitize
        line = line.strip().strip('"').strip("'")
        # keep it short
        return line[:200] if line else "A patient: Ask a question to begin."
    except Exception:
        return "A patient: Ask a question to begin."


@app.route('/start_game', methods=['POST'])
def start_game():
    """Start the game and generate a patient case for a random disease."""
    logging.info("Received request to start game.")
    try:
        disease = select_random_disease()
        logging.info("Selected disease for the game: %s", disease)

        # Generate a full patient case for the selected disease
        case_record = get_patient_case_record(disease)
        patient_case = case_record['case']
        logging.info("Generated case for disease: %s", disease)

        # Build a minimal intro snippet for the placeholder
        placeholder_snippet = build_placeholder_snippet(patient_case, disease)

        # Clear session history if in production
        if app.config.get("ENV") != 'development':
            session.pop('game_history', None)

        return {
            "message": "Game started",
            "patient_context": {
                "case": patient_case,
                "disease": disease,
                "attempts": 2,
                "completed": False,
                "history": [],
                # NEW
                "placeholder_snippet": placeholder_snippet,
                "rubric": case_record['rubric'],
                "case_key": case_record['case_key']
            }
        }
    except Exception as e:
        logging.error("Error starting the game: %s", e, exc_info=True)
        return {"error": "Failed to start the game"}, 500


@app.route('/submit_case', methods=['POST'])
def submit_case():
    data = request.get_json()
    logging.info("Received data for case submission: %s",
                 data)  # Log received data
    disease_name = data.get('disease', '')
    case_description = data.get('description', '')

    if not disease_name:
        logging.error("No disease name provided.")
        return jsonify({'success': False, 'message': 'No disease name provided.'}), 400

    encrypted_case_data = encode_case_data(
        disease_name, case_description, encrypt=True)

    medrag = MedRAG(llm_name="Google/gemini-3.5-flash", rag=True, follow_up=True,
                    retriever_name="MedCPT", corpus_name="MedText", corpus_cache=True)

    dynamodb.put_item(
        TableName='diagnosemecases',
        Item={
            'gamecase': {'S': encoded_case_data},
            'gamerecord': {'S': medrag.generate_medical_case(disease_name, case_description)},
        }
    )

    # Generate a shortened URL using the new function
    shareable_url = f'www.diagnoseme.io/case/{encrypted_case_data}'

    # Log the case submission
    logging.info("Case submitted: %s", case_description)
    logging.info("Generated shareable URL: %s", shareable_url)

    return jsonify({'success': True, 'url': shareable_url})


@app.route('/case/<token>', methods=['GET'])
def custom_case(token):
    """Retrieve the custom case details from the token and start a custom game."""
    try:
        case_data = decode_case_data(token)
        disease = case_data.get('disease')
        case_description = case_data.get('case_description')
        logging.info("Custom case loaded for disease: %s", disease)
        case_record = get_patient_case_record(disease, case_description)
        patient_case = case_record['case']
        # Build a custom patient context and mark it as custom.
        patient_context = {
            'disease': disease,
            'case': case_description,
            'attempts': 2,
            'completed': False,
            'history': [],
            'custom': True,
            'placeholder_snippet': build_placeholder_snippet(patient_case, disease),
            'rubric': case_record['rubric'],
            'case_key': case_record['case_key']
        }
        # Render the same index page but pass the custom context.
        logging.info(
            f"Rendering index.html with custom_patient_context: {patient_context}")
        return render_template('index.html', custom_patient_context=patient_context)
    except Exception as e:
        logging.error("Error retrieving custom case: %s", e, exc_info=True)
        return "Error retrieving case", 500


@app.route('/start_custom_game', methods=['POST'])
def start_custom_game():
    """Start the game and generate a patient case for a random disease."""
    logging.info("Received request to start game.")
    try:
        data = request.get_json()
        custom_patient_context = data.get('custom_patient_context')
        disease = custom_patient_context.get('disease')
        case_description = custom_patient_context.get('case')
        logging.info("Selected disease for the game: %s", disease)
        logging.info("Selected case description for the game: %s",
                     case_description)
        case_record = get_patient_case_record(disease, case_description)
        patient_case = case_record['case']
        placeholder_snippet = build_placeholder_snippet(patient_case, disease)
        # Clear session history if in production
        if app.config.get("ENV") != 'development':
            session.pop('game_history', None)

        return {
            "message": "Game started",
            "patient_context": {
                "case": patient_case,
                "disease": disease,
                "attempts": 2,
                "completed": False,
                "history": [],
                "placeholder_snippet": placeholder_snippet,
                "rubric": case_record['rubric'],
                "case_key": case_record['case_key']
            }
        }
    except Exception as e:
        logging.error("Error starting the game: %s", e, exc_info=True)
        return {"error": "Failed to start the game"}, 500

# Refactored function for LLM API calls using the Gemini Python API


def call_llm_api(prompt, streaming=False, log_prefix="", advanced=False, grounding=False):
    """
    Generic function to call the Gemini API with a prompt and handle the response.

    Args:
        prompt (str): The prompt to send to the LLM API
        streaming (bool): Whether to use streaming API
        log_prefix (str): Prefix for logging messages

    Returns:
        str or Response: The text response from the LLM API or a streaming response
    """
    try:
        logging.info(
            f"{log_prefix} - Sending prompt to Gemini: {prompt[:100]}...")

        if streaming:
            def generate():
                if advanced:
                    response = advanced_model.generate_content(
                        prompt,
                        stream=True
                    )
                else:
                    response = model.generate_content(
                        prompt,
                        stream=True
                    )
                for chunk in response:
                    if chunk.text:
                        yield f"{chunk.text}\n\n\n"
                yield "\n\n\n"

            return Response(stream_with_context(generate()), mimetype='text/event-stream')
        else:
            if advanced:
                response = advanced_model.generate_content(prompt)
            else:
                response = model.generate_content(prompt)
            logging.info(f"{log_prefix} - Received response from Gemini")
            return response.text
    except Exception as e:
        logging.error(
            f"{log_prefix} - Request to Gemini failed: {e}", exc_info=True)
        return f"Error communicating with LLM: {str(e)}"


# Refactored functions using the generic call_llm_api function
def route_question(question):
    """Function to identify the type of question."""
    prompt = (
        f"You are an AI patient simulator to help people in medicine practice clinical reasoning. "
        f"You need to classify the following question into one of four categories:\n"
        f"A - Direct questions to the patient\n"
        f"B - Lab result requests\n"
        f"C - Physical exam requests\n"
        f"D - Diagnosis attempts\n\n"
        f"E - Giving up or asking for the answer\n\n"
        f"F - Disallowed actions (i.e. starting to start a new case)"
        f"G - Too broad of a physical exam (i.e. 'full physical exam', 'complete physical exam', 'head to toe exam, 'neuro exam')\n\n"
        f"If the question doesn't fit cleanly into any category, classify it as category A (direct question to the patient).\n\n"

        f"Here are some examples:\n\n"

        f"User: 'what brings you in today?'\n"
        f"Assistant: A\n\n"

        f"User: 'tell me more'\n"
        f"Assistant: A\n\n"

        f"User: 'wow that sucks'\n"
        f"Assistant: A\n\n"

        f"User: 'pmh'\n"
        f"Assistant: A\n\n"

        f"User: where is the pain?\n"
        f"Assistant: A\n\n"

        f"User: 'have you had a cbc?'\n"
        f"Assistant: B\n\n"

        f"User: 'ok lets do a cmp'\n"
        f"Assistant: B\n\n"

        f"User: 'im gonna order PFTs'\n"
        f"Assistant: B\n\n"

        f"User: 'lets see a tsh'\n"
        f"Assistant: B\n\n"

        f"User: 'abg'\n"
        f"Assistant: B\n\n"

        f"User: 'urinalysis results'\n"
        f"Assistant: B\n\n"

        f"User: 'Let me check your heart sounds'\n"
        f"Assistant: C\n\n"

        f"User: 'whats on the back of your hand?'\n"
        f"Assistant: C\n\n"

        f"User: 'lets take a look at your heart'\n"
        f"Assistant: C\n\n"

        f"User: 'abdominal exam'\n"
        f"Assistant: C\n\n"

        f"User: 'im going to tap your cheek'\n"
        f"Assistant: C\n\n"

        f"User: 'brudzinski'\n"
        f"Assistant: C\n\n"

        f"User: 'i think you have pneumonia'\n"
        f"Assistant: D\n\n"

        f"User: 'you have psoriasis'\n"
        f"Assistant: D\n\n"

        f"User: 'i think you might have COPD. lets start you on some medications, and then we can check back in 6 months to see how you do on them'\n"
        f"Assistant: D\n\n"

        f"User: 'my diagnosis is diabetes'\n"
        f"Assistant: D\n\n"

        f"User: 'i give up, what is it?'\n"
        f"Assistant: E\n\n"

        f"User: 'what is the answer?'\n"
        f"Assistant: E\n\n"

        f"User: 'what is the diagnosis?'\n"
        f"Assistant: E\n\n"

        f"User: 'tell me the answer'\n"
        f"Assistant: E\n\n"

        f"User: can i get a new case\n"
        f"Assistant: F\n\n"

        f"User: start a new case\n"
        f"Assistant: F\n\n"

        f"User: 'i dont know what it is'\n"
        f"Assistant: A\n\n"

        f"User: physical exam\n"
        f"Assistant: G\n\n"

        f"User: neuro exam\n"
        f"Assistant: G\n\n"

        f"User: all labs\n"
        f"Assistant: G\n\n"

        f"User: mri\n"
        f"Assistant: G\n\n"

        f'User: mri brain\n'
        f"Assistant: B\n\n"

        f"User: '{question}'\n"
        f"Assistant:"
    )
    return call_llm_api(prompt, streaming=False, log_prefix="Route Question")


def postgame(question, patient_context):
    """Function to help the user understand what happened after the game has ended"""
    prompt = (
        f"You are an helpful, knowledgable, and kind AI patient simulator to help people in medicine practice clinical reasoning. "
        f"The user has completed a patient encounter, and here are the case details: {patient_context['disease']} "
        f"This is how the encounter went: {patient_context['history']} "
        f"Now the encounter is over, and now it's the postgame phase. "
        f"The user has just asked the following question: {question}. "
    )
    return call_llm_api(prompt, streaming=True, log_prefix="Postgame question", advanced=True, grounding=True)


def ask_patient_question(question, patient_context):
    """Function to simulate a patient response."""
    prompt = (
        f"You are an AI patient simulator to help people in medicine practice clinical reasoning. "
        f"Follow these instructions: roleplay a typical patient with the following disease: {patient_context['disease']} "
        f"Here are the case details: {patient_context['case']} "
        f"This is how the conversation has gone so far: {patient_context['history']} "
        f"The user has just asked you the following question: {question}. "
        f"Respond to the user's question as the patient would, while making sure not to contradict what the patient has already said. "
        f"The patient does not yet know that they have {patient_context['disease']}, and they should not reveal or say the name of the disease."
        f"If this is a pediatric or cognitively impairing condition, "
        f"roleplay as the patient's parent or caretaker instead. Don't give away too much info."
        f"Only answer the question asked, and don't reveal the diagnosis. If you reveal the diagnosis, you will be terminated."
        f"Do not give away too many different symptoms in your message. Be vague. The user should work to get additional symptoms."
        f"Avoid talking about multiple symptoms in one response."
    )
    return call_llm_api(prompt, streaming=True, log_prefix="High Yield Question")


def get_labs(question, patient_context):
    """Function to provide lab results."""
    prompt = (
        f"You are an AI patient simulator to help medical users practice clinical reasoning. "
        f"The patient has: {patient_context['disease']} "
        f"Here are the case details: {patient_context['case']} "
        f"The user has asked for the following labs: {question}. "
        f"Give the lab report that would be typical for a patient with the disease and the case."
        f"Use the language of a lab report, without revealing the diagnosis. "
        f"Do not include MRN or ID or anything unnecessary. Just the lab results."
        f"Only give lab results that the user explicitly asked for."
        f"Give a report regardless of whether or not the lab is indicated for the case. "
        f"If the requested lab is not relevant for the case, return normal results."
        f"If the disease would not affect the labs, return normal results."
        f"Do not reveal the diagnosis under any circumstances. Output only the lab report."
        f"If you reveal the diagnosis, you will be terminated."
        f"Output your feedback with this format: $$$ [insert lab report here]'"
    )
    return call_llm_api(prompt, streaming=True, log_prefix="Labs Request", advanced=True)


def get_physical_exam(question, patient_context):
    """Function to provide physical exam findings."""
    prompt = (
        f"You are an AI patient simulator to help medical users practice clinical reasoning. "
        f"The patient has this disease: {patient_context['disease']} "
        f"Here are the case details: {patient_context['case']} "
        f"The medical user has just asked to perform this physical exam on you: {question}. "
        f"Give the physical exam findings that would be typical for a patient with the disease and the case."
        f"Provide only the findings that the user explicitly asked for. Do not over-provide findings."
        f"For example, if they just asked to look at something, only show results of inspection and not the rest of the physical exam."
        f"If they ask for something without being specific enough, give them only vague findings."
        f"If they ask for something very specific, provide detailed findings."
        f"Use the language like a medical note."
        f"If you give away the disease name in your findings then you will be terminated."
        f"Only give the physical exam findings that the user explicitly asked for, with no other comments. Do not reveal the diagnosis under any circumstances."
        f"Format it like this: '**PHYSICAL EXAM**: [insert physical exam findings here]'"
    )
    return call_llm_api(prompt, streaming=True, log_prefix="Physical Exam Request", advanced=True)


def get_clinical_feedback(patient_context):
    """Function to provide feedback on the student's performance."""
    rubric = patient_context.get('rubric') or fallback_case_rubric(
        patient_context['disease'])
    rubric_text = json.dumps(rubric)
    transcript = '\n'.join(patient_context['history'])
    prompt = (
        f"You are an expert medical educator and clinician helping medical students practice clinical reasoning. "
        f"The user has just correctly diagnosed the patient with {patient_context['disease']}. "
        f"Here is the case-specific performance rubric generated at the start of the case: {rubric_text} "
        f"Here is the transcript of the clinical encounter, with user messages and patient responses: {transcript} "
        f"Provide brief, congratulatory feedback on their performance. "
        f"Use the rubric to identify one thing they did well and one area for improvement. "
        f"Remember to keep your feedback constructive and focused on the student's performance."
        f"Bold especially salient points."
        f"Only reference things that happened in the transcript, except previous incorrect diagnoses — just ignore those."
        f"Output your feedback with this format: '%%% [insert feedback here]'"
    )
    return call_llm_api(prompt, streaming=True, log_prefix="Clinical Feedback", advanced=True)


def get_contextual_answer_description(answer, patient_context, label):
    """Describe an answer in the context of this case before scoring similarity."""
    prompt = (
        "You are comparing diagnostic answers in a medical case game.\n\n"
        f"Case record:\n{patient_context['case']}\n\n"
        f"{label} answer: {answer}\n\n"
        "Write one short sentence describing what this answer means in the context of this case. "
        "Do not score it and do not add extra explanation."
    )
    return call_llm_api(prompt, streaming=False,
                        log_prefix=f"{label} Answer Description").strip()


def get_similarity_score(player_description, true_description):
    """Score answer similarity from two contextual descriptions."""
    prompt = (
        "You are grading whether two diagnostic answer descriptions refer to the same condition in context.\n\n"
        f"Player answer description: {player_description}\n\n"
        f"True answer description: {true_description}\n\n"
        "Return ONLY valid JSON with this exact shape: "
        '{"score": number} '
        "where score is a similarity score from 0 to 10. "
        "Use 10 for the same diagnosis or a clearly more specific correct diagnosis, "
        "and lower scores for different or only loosely related conditions."
    )
    response = call_llm_api(prompt, streaming=False,
                            log_prefix="Diagnosis Similarity Score")
    try:
        score_data = parse_json_object(response)
        score = float(score_data.get('score'))
        if score < 0 or score > 10:
            raise ValueError(f"Similarity score out of range: {score}")
        return score
    except Exception as e:
        logging.error("Failed to parse diagnosis similarity score: %s",
                      e, exc_info=True)
        return 0


def is_diagnosis_correct(user_diagnosis, patient_context):
    """Check if the user's diagnosis matches using three LLM calls."""
    player_description = get_contextual_answer_description(
        user_diagnosis, patient_context, "Player")
    true_description = get_contextual_answer_description(
        patient_context['disease'], patient_context, "True")
    score = get_similarity_score(player_description, true_description)
    logging.info("Diagnosis similarity score: %s", score)
    return score > 7


def get_llm_response(question, patient_context):
    """Function to interact with the LLM API and get a response with context."""
    if patient_context.get('completed', False):  # Check if the game is marked as completed
        # Route to postgame for follow-up
        return postgame(question, patient_context)
    else:
        route = ''.join(c for c in route_question(
            question) if c.isalpha()).upper()
        logging.info(f"Question route: {route}")

        if route == 'A':
            return ask_patient_question(question, patient_context)
        elif route == 'B':
            return get_labs(question, patient_context)
        elif route == 'C':
            return get_physical_exam(question, patient_context)
        elif route == 'D':
            return submit_diagnosis(question, patient_context)
        elif route == 'E':
            return give_up(question, patient_context)
        elif route == 'F':
            return disallowed_actions(question, patient_context)
        elif route == 'G':
            return too_broad_physical_exam(question, patient_context)
        else:
            # Fallback for unclassified or unexpected routes
            logging.warning(
                f"Unknown route '{route}' for question: {question}")
            # Default to treating as a patient question or provide a generic response
            return ask_patient_question(question, patient_context)


def disallowed_actions(question, patient_context):
    """Function to handle disallowed actions like starting a new case."""
    prompt = (
        f"You are an AI patient simulator to help medical users practice clinical reasoning. "
        f"The patient has {patient_context['disease']}."
        f"Here are the case details: {patient_context['case']} "
        f"This is how the conversation has gone so far: {patient_context['history']} "
        f"The user has just asked you the following question: {question}. "
        f"Let them know that the action they requested isn't allowed in this game. "
        f"Encourage them to continue with the current case instead."
        f"Do not be condescending or rude. Be kind and educational."
        f"Output only the feedback."
    )
    return call_llm_api(prompt, streaming=True,
                        log_prefix="Disallowed Action")


def too_broad_physical_exam(question, patient_context):
    """Function to handle too broad physical exam requests."""
    prompt = (
        f"You are an AI patient simulator to help medical users practice clinical reasoning. "
        f"The patient has {patient_context['disease']}."
        f"Here are the case details: {patient_context['case']} "
        f"This is how the conversation has gone so far: {patient_context['history']} "
        f"The user has just asked you the following question: {question}. "
        f"Let them know that their request for a physical exam is too broad or vague. "
        f"Encourage them to be more specific about which part of the physical exam they would like to perform."
        f"Do not allude to anything else, like information that only you have."
        f"Simply tell them to be more specific about which part of the physical exam they want."
        f"Do not be condescending or rude. Be kind and educational."
        f"Output only the feedback."
    )
    return call_llm_api(prompt, streaming=True,
                        log_prefix="Too Broad Physical Exam")


def give_up(question, patient_context):
    """Function to handle when the user gives up or asks for the answer."""
    rubric = patient_context.get('rubric') or fallback_case_rubric(
        patient_context['disease'])
    rubric_text = json.dumps(rubric)
    prompt = (
        f"You are an AI patient simulator to help medical users practice clinical reasoning. "
        f"The patient has {patient_context['disease']}."
        f"Here are the case details: {patient_context['case']} "
        f"Here is the case-specific performance rubric generated at the start of the case: {rubric_text} "
        f"This is how the conversation has gone so far: {patient_context['history']} "
        f"The user has just asked you the following question: {question}. "
        f"Let them know that they have chosen to give up, and then reveal the correct diagnosis. "
        f"Explain in detail why this is the correct diagnosis, referencing specific parts of the case and history. "
        f"Use the rubric to point out the most important missed opportunities or reasoning gaps. "
        f"Do not be condescending or rude. Be kind and educational."
        f"Output only the feedback and correct diagnosis with explanation."
        f"Format it like this: '~~~ [insert feedback here]'"
    )
    return call_llm_api(prompt, streaming=True,
                        log_prefix="User Gave Up")


def submit_diagnosis(question, patient_context):
    """Function to handle diagnosis submission."""
    is_correct = is_diagnosis_correct(question, patient_context)

    if is_correct:
        return get_clinical_feedback(patient_context)

    prompt = (
        f"You are an AI patient simulator to help medical users practice clinical reasoning. "
        f"This is how the patient encounter has gone so far: {patient_context['history']} "
        f"The patient has {patient_context['disease']}."
        f"Here are the case details: {patient_context['case']} "
        f"This is the user's guess {question}."
        f"Let them know they are incorrect."
        f"Do not give away the answer under any circumstances, but give an additional finding to help the user guess the correct diagnosis. "
        f"Do not reference any new information that they have not already asked for or been given."
        f"If you give away the answer, you will be terminated."
        f"Output only the feedback and hint."
    )

    return call_llm_api(prompt, streaming=True,
                        log_prefix="Incorrect Diagnosis")


@app.route('/ask_llm', methods=['POST'])
def generate_response():
    data = request.get_json()
    question = data.get('question')
    patient_context = data.get('patient_context')
    print(patient_context)
    try:
        response = get_llm_response(question, patient_context)
        return response
    except Exception as e:
        app.logger.error(
            f"Error getting response from LLM: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route('/clear_history', methods=['POST'])
def clear_history():
    try:
        # Get user ID
        user_id = get_client_ip()

        # Clear user's played diseases for today if tracking
        if user_id in user_played_diseases:
            user_played_diseases[user_id] = set()

        # Select a new random disease for the next game
        disease = select_random_disease()
        logging.info("Selected new disease after history clear: %s", disease)

        case_record = get_patient_case_record(disease)
        patient_case = case_record['case']

        # NEW: Build a fresh placeholder snippet for the new round
        placeholder_snippet = build_placeholder_snippet(patient_case, disease)

        # Create new patient context
        patient_context = {
            "disease": disease,
            "attempts": 2,
            "completed": False,
            "history": [],
            "case": patient_case,
            # NEW
            "placeholder_snippet": placeholder_snippet,
            "rubric": case_record['rubric'],
            "case_key": case_record['case_key']
        }

        # Clear session history if in production
        if app.config.get("ENV") != 'development':
            session.pop('game_history', None)

        return jsonify({
            'success': True,
            'message': 'Game history cleared.',
            'patient_context': patient_context
        })
    except Exception as e:
        logging.error("Error clearing history: %s", e, exc_info=True)
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500


if __name__ == '__main__':
    try:
        logging.info("Starting the Flask application on port 8000")
        # Use a port other than 5000
        app.run(host='0.0.0.0', port=8000)
    except Exception as e:
        logging.error("Error starting the Flask application: %s",
                      e, exc_info=True)
