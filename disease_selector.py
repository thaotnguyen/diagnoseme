# disease_selector.py
import random
import logging
from datetime import datetime, timedelta, timezone


def select_random_disease(case_of_the_day=True):
    """Select a random disease from the USMLE curriculum."""
    if case_of_the_day:
        today_date = datetime.now(
            timezone(timedelta(hours=-10))).strftime("%Y-%m-%d")
        random.seed(today_date)
    else:
        random.seed()
    try:
        disease = random.choice(DISEASES)
        logging.info("Randomly selected disease: %s", disease)
        return disease
    except Exception as e:
        logging.error("Error selecting random disease: %s", e, exc_info=True)
        return None


def select_disease_by_criteria(chief_complaint, specialty):
    """Generate a disease using AI based on chief complaint and specialty criteria."""
    try:
        # Build the prompt for AI disease generation
        prompt_parts = []

        if chief_complaint and specialty:
            prompt = (
                f"Generate a single medical disease/condition that would present with or as '{chief_complaint}' "
                f"and would typically be managed by {specialty}. "
                f"Return only the disease name, nothing else. "
                f"Make it a realistic, well-known condition that medical students should learn about. "
                f"It should be a disease that is tested on the USMLE Step 1 or Step 2 exam. "
                f"Pick something not too obscure, but also not too common. It should be something that a medical student would think is nontrivial to diagnose, something that is a fun challenge."
                f"Return only the disease name, nothing else."
            )
        elif chief_complaint:
            prompt = (
                f"Generate a single medical disease/condition that would typically present with '{chief_complaint}'. "
                f"Return only the disease name, nothing else. "
                f"It should be a disease that is tested on the USMLE Step 1 or Step 2 exam. "
                f"Pick something not too obscure, but also not too common. It should be something that a medical student would think is nontrivial to diagnose, something that is a fun challenge."
                f"Return only the disease name, nothing else."
            )
        elif specialty:
            prompt = (
                f"Generate a single medical disease/condition that would typically be seen by {specialty}. "
                f"Return only the disease name, nothing else. "
                f"It should be a disease that is tested on the USMLE Step 1 or Step 2 exam. "
                f"Pick something not too obscure, but also not too common. It should be something that a medical student would think is nontrivial to diagnose, something that is a fun challenge."
                f"Return only the disease name, nothing else."
            )
        else:
            prompt = (
                f"Generate a single medical disease/condition that would be appropriate for medical student learning. "
                f"Return only the disease name, nothing else. "
                f"Make it a realistic, well-known condition from any medical specialty. "
                f"It should be a disease that is tested on the USMLE Step 1 or Step 2 exam. "
                f"Pick something not too obscure, but also not too common. It should be something that a medical student would think is nontrivial to diagnose, something that is a fun challenge."
                f"Return only the disease name, nothing else."
            )

        # Import here to avoid circular imports
        import google.generativeai as genai
        import os
        from dotenv import load_dotenv

        # Load environment variables
        project_folder = os.path.expanduser('~/Development/diagnoseme')
        load_dotenv(os.path.join(project_folder, '.env'))

        # Configure Gemini API
        API_KEY = os.getenv('GOOGLE_API_KEY')
        if not API_KEY:
            logging.error("Google API key not found")
            return random.choice(DISEASES)

        genai.configure(api_key=API_KEY)
        model = genai.GenerativeModel('gemini-2.5-flash-lite')

        # Generate the disease
        response = model.generate_content(prompt)
        generated_disease = response.text.strip()

        # Clean up the response (remove quotes, extra text, etc.)
        generated_disease = generated_disease.strip('"').strip("'").strip()

        # Validate the response is reasonable
        if len(generated_disease) > 100 or len(generated_disease.split()) > 8:
            logging.warning(
                "Generated disease name seems too long, using fallback")
            return random.choice(DISEASES)

        logging.info(f"AI generated disease: {generated_disease}")
        return generated_disease

    except Exception as e:
        logging.error(f"Error generating disease with AI: {e}", exc_info=True)
        # Fallback to random selection from existing list
        return random.choice(DISEASES)


# List of diseases from the USMLE Step 1 and 2 curriculum
DISEASES = [
    "Rheumatic fever",
    "Emphysema/COPD",
    "Asthma",
    "Tuberculosis",
    "Pulmonary embolism",
    "Poststreptococcal glomerulonephritis/PSGN",
    "Goodpasture syndrome",
    "Minimal change disease",
    "Acute interstitial nephritis",
    "Vitamin B12 deficiency",
    "Sickle cell anemia (dactylitis)",
    "Acute myeloid leukemia",
    "Chronic lymphocytic leukemia",
    "Hodgkin's lymphoma",
    "Non-Hodgkin's lymphoma",
    "Disseminated intravascular coagulation/DIC",
    "Hemolytic uremic syndrome/HUS",
    "Idiopathic thrombocytopenic purpura/ITP",
    "Thrombotic thrombocytopenic purpura/TTP",
    "Glucagonoma",
    "Carcinoid syndrome",
    "VIPoma",
    "MEN 1",
    "MEN 2A",
    "Von Willebrand disease",
    "Multiple myeloma",
    "Graves disease",
    "Hashimotos thyroiditis",
    "Polycystic ovary syndrome",
    "Prolactinoma (no vision changes or lactation)",
    "21-hydroxylase deficiency (congenital adrenal hyperplasia)",
    "DiGeorge syndrome",
    "Hypercalcemia (of malignancy)",
    "Crohn’s disease",
    "Ulcerative colitis",
    "Acute pancreatitis (gallstone)",
    "Chronic mesenteric ischemia",
    "Ectopic pregnancy (ruptured, RLQ)",
    "HELLP syndrome",
    "Preeclampsia",
    "Ankylosing spondylitis",
    "Guillain-Barré syndrome",
    "Reactive arthritis",
    "Systemic lupus erythematosus",
    "Multiple sclerosis",
    "Parkinson’s disease",
    "Myasthenia gravis",
    "Amyotrophic lateral sclerosis",
    "CREST syndrome/limited scleroderma",
    "Schizophrenia",
    "Schizoaffective disorder",
    "Cystic fibrosis",
    "Huntington’s disease",
    "Wilson's disease",
    "Lithium toxicity",
    "Acetaminophen toxicity",
    "Salicylate toxicity",
    "Lead poisoning",
    "Carbon monoxide poisoning",
    "Meningitis (bacterial/Neisseria meningitidis)",
    "Meningitis (fungal/Cryptococcus)",
    "Encephalitis (viral/HSV-1)",
    "Syphilis (secondary)",
    "Malaria",
    "Tetralogy of Fallot",
    "Eisenmenger syndrome",
    "Hemochromatosis",
    "Sarcoidosis",
    "Diabetic ketoacidosis",
    "Hyperosmolar hyperglycemic state",
    "(Chronic) subdural hematoma",
    "Measles",
    "Syringomyelia",
    "Cauda equina syndrome (acute)",
    "Cervical myelopathy",
    "Temporal arteritis/giant cell arteritis",
    "Takayasu arteritis",
    "Polyarteritis nodosa",
    "Kawasaki disease",
    "IgA vasculitis/Henoch-Schönlein purpura (Berger's disease)",
    "Granulomatosis with polyangiitis (Wegener’s)",
    "Eosinophilic granulomatosis with polyangiitis (Churg-Strauss)",
    "Scarlet fever",
    "Mycoplasma pneumonia (walking pneumonia/pneumonia)",
    "Legionella (Legionnaires’ disease)",
    "Paget disease",
    "DRESS syndrome",
    "C6 radiculopathy",
    "L5 radiculopathy",
    "Ulnar neuropathy",
    "Severe combined immunodeficiency/SCID",
    "Cardiac tamponade",
    "Aortic dissection",
    "Spinal epidural abscess",
    "Tardive dyskinesia",
    "Common variable immunodeficiency/CVID",
    "Toxic megacolon",
    "Compartment syndrome",
    "Pulmonary embolism (no concurrent DVT)",
    "Acute respiratory distress syndrome/ARDS",
    "Neonatal respiratory distress syndrome/NRDS",
    "Polymyositis"
]
