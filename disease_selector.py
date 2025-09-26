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
    """Generate a disease list via AI that meets criteria, then randomly pick one."""
    try:
        # Build prompt that asks for a list with strict output format
        criteria_lines = []
        if chief_complaint:
            criteria_lines.append(f"Presents with: '{chief_complaint}'.")
        if specialty:
            criteria_lines.append(f"Typically managed by: {specialty}.")

        criteria_text = "\n".join(
            f"- {line}" for line in criteria_lines) if criteria_lines else "- Appropriate for medical student learning."

        prompt = (
            "Return a newline-separated list of high-yield distinct medical diseases/conditions that meet ALL of the following:\n"
            "- Tested on USMLE Step 1 or Step 2.\n"
            "- Realistic, well-known."
            "Criteria:\n"
            f"{criteria_text}\n\n"
            "Output format rules (must follow exactly):\n"
            "- Output ONLY the disease names.\n"
            "- One disease per line.\n"
            "- No numbering, no bullets, no extra text, no explanations.\n"
            "- No quotes. Avoid parenthetical clarifications.\n"
            "- No duplicates.\n\n"
            "Example format:\n"
            "Myasthenia gravis\n"
            "Guillain-Barré syndrome\n"
            "Sarcoidosis"
        )

        # Import here to avoid circular imports
        import google.generativeai as genai
        import os
        import re
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

        # Generate the list
        response = model.generate_content(prompt)
        raw_text = (getattr(response, "text", None) or "").strip()
        if not raw_text:
            logging.warning("Empty AI response; using fallback")
            return random.choice(DISEASES)

        # Parse newline-delimited diseases
        lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]

        # Cleanup each line: remove leading bullets/numbering if any slipped in, quotes, and parenthetical tails
        cleaned = []
        for ln in lines:
            # remove leading bullets/numbering like "1) ", "1. ", "- ", "* ", "• "
            ln = re.sub(r'^\s*(?:[-*•]|\d+[.)])\s*', '', ln)
            # strip surrounding quotes
            ln = ln.strip().strip('"').strip("'")
            # drop parenthetical clarifications at end
            ln = re.sub(r'\s*\([^)]*\)\s*$', '', ln).strip()
            # sanity checks
            if not ln:
                continue
            if len(ln) > 100 or len(ln.split()) > 8:
                continue
            cleaned.append(ln)

        # Deduplicate while preserving order
        seen = set()
        candidates = []
        for d in cleaned:
            if d.lower() in seen:
                continue
            seen.add(d.lower())
            candidates.append(d)

        # If AI list is too small, fall back
        if len(candidates) < 5:
            logging.warning(
                "AI produced too few valid candidates; using fallback list")
            return random.choice(DISEASES)

        # Pick randomly from AI-generated list
        choice = random.choice(candidates)
        logging.info("AI-generated candidate count: %d; selected: %s",
                     len(candidates), choice)
        return choice

    except Exception as e:
        logging.error("Error generating disease with AI: %s", e, exc_info=True)
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
    "Kawasaki disease",
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
