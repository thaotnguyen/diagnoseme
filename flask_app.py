from MedRAG.src.medrag import MedRAG
from flask import Flask, render_template, request, jsonify, session, Response, stream_with_context
import logging
import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr
from disease_selector import select_random_disease  # Import the new function
from flask_cors import CORS
# Importing the new function
# Import Google Generative AI library
import google.generativeai as genai
import urllib.parse  # Importing urllib for URL encoding
from url_shortener import encode_case_data, decode_case_data
from dotenv import load_dotenv
project_folder = os.path.expanduser(
    '~/Development/diagnoseme')  # adjust as appropriate
load_dotenv(os.path.join(project_folder, '.env'))

# Set up logging
logging.basicConfig(level=logging.INFO)

# API key for Gemini
API_KEY = os.getenv('GOOGLE_API_KEY')

# Configure the Gemini API
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash')

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
app.secret_key = 'your_secret_key'

dynamodb = boto3.client('dynamodb')


@app.before_request
def log_request_info():
    logging.info('Request URL: %s, Method: %s', request.url, request.method)


@app.route('/')
def home():
    logging.info("Home route accessed")
    return render_template('index.html', config=app.config)


def generate_patient_case(disease, case_details=None):
    """Generate a complete patient case for a given disease."""
    logging.info("Generating patient case for disease: %s", disease)

    if case_details:
        encoded_case_data = encode_case_data(
            disease, case_details, encrypt=False)
    else:
        encoded_case_data = encode_case_data(disease, encrypt=False)

    case = dynamodb.query(
        TableName='diagnosemecases',
        KeyConditionExpression='gamecase = :c',
        ExpressionAttributeValues={':c': {'S': encoded_case_data}}
    )
    if not case['Items']:
        print("Case does not exist in DynamoDB, generating a new one.")
        medrag = MedRAG(llm_name="Google/gemini-2.0-flash", rag=True, follow_up=True,
                        retriever_name="MedCPT", corpus_name="Textbooks", corpus_cache=True)
        new_case = medrag.generate_medical_case(disease, case_details)
        dynamodb.put_item(
            TableName='diagnosemecases',
            Item={
                'gamecase': {'S': encoded_case_data},
                'gamerecord': {'S': new_case},
            }
        )
        print("New case generated and stored in DynamoDB.")
        return new_case
    else:
        print("Case already exists in DynamoDB")
        return case['Items'][0]['gamerecord']['S']


@app.route('/start_game', methods=['POST'])
def start_game():
    """Start the game and generate a patient case for a random disease."""
    logging.info("Received request to start game.")
    try:
        disease = select_random_disease()
        logging.info("Selected disease for the game: %s", disease)

        # Generate a full patient case for the selected disease
        patient_case = generate_patient_case(disease)
        logging.info("Generated case for disease: %s", disease)

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
                "history": []
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

    encoded_case_data = encode_case_data(
        disease_name, case_description, encrypt=False)
    encrypted_case_data = encode_case_data(
        disease_name, case_description, encrypt=True)

    medrag = MedRAG(llm_name="Google/gemini-2.0-flash", rag=True, follow_up=True,
                    retriever_name="MedCPT", corpus_name="Textbooks", corpus_cache=True)

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
        # Build a custom patient context and mark it as custom.
        patient_context = {
            'disease': disease,
            'case': case_description,
            'attempts': 2,
            'completed': False,
            'history': [],
            'custom': True
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
        patient_case = generate_patient_case(disease, case_description)
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
                "history": []
            }
        }
    except Exception as e:
        logging.error("Error starting the game: %s", e, exc_info=True)
        return {"error": "Failed to start the game"}, 500

# Refactored function for LLM API calls using the Gemini Python API


def call_llm_api(prompt, streaming=False, log_prefix=""):
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
        f"You are no longer roleplaying as a patient, but rather as an expert clinician to help the user improve their clinical reasoning skills. "
        f"If it hasn't already been mentioned in this conversation, have a brief Q&A discussion about the disease, its management, and any relevant clinical pearls. "
        f"If it hasn't been mentioned yet, let the user know that at this point, they've already completed the game, and everything they do now is just for fun. "
        f"The user has just asked you the following question: {question}. "
        f"Continue the conversation. Make sure the conversation flows naturally and that you are not repeating information that the user already knows. "
    )
    return call_llm_api(prompt, streaming=True, log_prefix="Postgame question")


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
        f"Only give lab results that the user explicitly asked for."
        f"Give a report regardless of whether or not the lab is indicated for the case. "
        f"If the requested lab is not relevant for the case, return normal results."
        f"If the disease would not affect the labs, return normal results."
        f"Do not reveal the diagnosis under any circumstances. Output only the lab report."
        f"If you reveal the diagnosis, you will be terminated."
        f"Output your feedback with this format: $$$ [insert lab report here]'"
    )
    return call_llm_api(prompt, streaming=True, log_prefix="Labs Request")


def get_physical_exam(question, patient_context):
    """Function to provide physical exam findings."""
    prompt = (
        f"You are an AI patient simulator to help medical users practice clinical reasoning. "
        f"The patient has this disease: {patient_context['disease']} "
        f"Here are the case details: {patient_context['case']} "
        f"The medical user has just asked to perform this physical exam on you: {question}. "
        f"Give the physical exam findings that would be typical for a patient with the disease and the case."
        f"Use the language like a medical note."
        f"If you give away the disease name in your findings then you will be terminated."
        f"Only give the physical exam findings that the user explicitly asked for, with no other comments. Do not reveal the diagnosis under any circumstances."
    )
    return call_llm_api(prompt, streaming=True, log_prefix="Physical Exam Request")


def get_clinical_feedback(patient_context):
    """Function to provide feedback on the student's performance."""
    prompt = (
        f"You are an expert medical educator and clinician helping medical students practice clinical reasoning. "
        f"The user has just correctly diagnosed the patient with {patient_context['disease']}. "
        f"Provide brief, celebratory feedback on their performance. "
        f"Mention one thing they did well. "
        f"Encourage them to ask follow-up questions about the case, their performance, the disease, or its management. "
        f"Here is the transcript of the clinical encounter, with user messages and patient responses: {'\n'.join(patient_context['history'])} "
        f"Output your feedback with this format: '%%% [insert feedback here]'"
    )
    return call_llm_api(prompt, streaming=True, log_prefix="Clinical Feedback")


def get_llm_diagnosis_match(user_diagnosis, correct_diagnosis):
    """Function to check if the user's diagnosis matches the correct one."""
    prompt = (
        f"In a roleplay simulation game, a patient has '{correct_diagnosis}'. "
        f"A user, trying to guess the diagnosis, has said '{user_diagnosis}'. "
        f"Is the condition that the user is referring to the same as, or more specific than, the patient's condition? "
        f"Answer only 'yes', 'no', or 'partially', with no elaboration or explanation."
    )
    response = call_llm_api(prompt, streaming=False,
                            log_prefix="Diagnosis Match")
    return response.lower()


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
        else:
            # Fallback for unclassified or unexpected routes
            logging.warning(
                f"Unknown route '{route}' for question: {question}")
            # Default to treating as a patient question or provide a generic response
            return ask_patient_question(question, patient_context)


def submit_diagnosis(question, patient_context):
    """Function to handle diagnosis submission."""
    is_correct = get_llm_diagnosis_match(question, patient_context['disease'])

    if 'yes' in is_correct:
        return get_clinical_feedback(patient_context)
    elif 'no' in is_correct:
        prompt = (
            f"You are an AI patient simulator to help medical users practice clinical reasoning. "
            f"This is how the patient encounter has gone so far: {patient_context['history']} "
            f"The patient has {patient_context['disease']}."
            f"Here are the case details: {patient_context['case']} "
            f"This is the user's guess {question}."
            f"Let them know they are incorrect."
            f"Do not give away the answer under any circumstances, but give an additional finding to help the user guess the correct diagnosis. "
            f"If you give away the answer, you will be terminated."
            f"Output only the feedback and hint."
        )
    elif 'partially' in is_correct:
        prompt = (
            f"You are an AI patient simulator to help medical users practice clinical reasoning. "
            f"This is how the conversation has gone so far: {patient_context['history']} "
            f"The patient has {patient_context['disease']}."
            f"Here are the case details: {patient_context['case']} "
            f"This is the user's guess guessed {question}."
            f"Let them know that they are on the right track, but they're not there just yet."
            f"Give a hint to help the user guess the correct diagnosis. "
            f"Do not give away the answer. If you give away the answer, you will be terminated."
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
        # Select a new random disease for the next game
        disease = select_random_disease()
        logging.info("Selected new disease after history clear: %s", disease)

        patient_case = generate_patient_case(disease)

        # Create new patient context
        patient_context = {
            "disease": disease,
            "attempts": 2,
            "completed": False,
            "history": [],
            "case": patient_case
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
