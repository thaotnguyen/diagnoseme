# disease_selector.py
import random
import logging
from datetime import datetime, timedelta, timezone


def select_random_disease():
    """Select a random disease from the USMLE curriculum."""
    today_date = datetime.now(
        timezone(timedelta(hours=-10))).strftime("%Y-%m-%d")
    random.seed(today_date)
    try:
        disease = random.choice(DISEASES)
        logging.info("Randomly selected disease: %s", disease)
        return disease
    except Exception as e:
        logging.error("Error selecting random disease: %s", e, exc_info=True)
        return None


# List of diseases from the USMLE Step 1 and 2 curriculum
DISEASES = [
    "Aortic stenosis",
    "Mitral regurgitation",
    "Prinzmetal angina/vasospastic angina",
    "Rheumatic fever",
    "Emphysema/COPD",
    "Asthma",
    "Tuberculosis",
    "Pulmonary embolism",
    "Poststreptococcal glomerulonephritis",
    "Goodpasture syndrome",
    "Minimal change disease",
    "Acute Interstitial nephritis",
    "Iron deficiency anemia",
    "Vitamin B12 deficiency",
    "Sickle cell anemia",
    "Acute myeloid leukemia",
    "Chronic lymphocytic leukemia",
    "Von Willebrand disease",
    "Multiple myeloma",
    "Hyperthyroidism",
    "Hypothyroidism",
    "Cushing’s syndrome",
    "Polycystic ovary syndrome",
    "Crohn’s disease",
    "Ulcerative colitis",
    "Hepatitis A",
    "Hepatitis B",
    "Acute pancreatitis",
    "Chronic mesenteric ischemia",
    "Appendicitis",
    "Ectopic pregnancy",
    "Rheumatoid arthritis",
    "Ankylosing spondylitis",
    "Guillain-Barré syndrome",
    "Lyme disease",
    "Rheumatic fever",
    "Septic arthritis",
    "Systemic lupus erythematosus",
    "Multiple sclerosis",
    "Parkinson’s disease",
    "Essential tremor",
    "Myasthenia gravis",
    "Amyotrophic lateral sclerosis",
    "CREST syndrome/limited scleroderma",
    "Schizophrenia",
    "Cystic fibrosis",
    "Huntington’s disease",
    "Meningitis (bacterial/Neisseria meningitidis)",
    "Meningitis (fungal/Cryptococcus)",
    "Syphilis",
    "Gonorrhea",
    "Chlamydia",
    "Trichomoniasis",
    "Malaria",
    "Tetrology of Fallot",
    "Hemochromatosis",
    "Sarcoidosis",
    "Diabetic ketoacidosis",
    "Hyperosmolar hyperglycemic state",
    "Lymphogranuloma venereum",
    "Chancroid",
    "Normal pressure hydrocephalus",
    "Subarachnoid hemorrhage",
    "Epidural hematoma",
    "Subdural hematoma",
    "Measles",
    "Syringomyelia",
    "Sciatica",
    "Temporal arteritis/giant cell arteritis",
    "Takayasu arteritis",
    "Polyarteritis nodosa",
    "Kawasaki disease",
    "Henoch-Schönlein purpura",
    "Granulomatosis with polyangiitis (Wegener’s)",
    "Eosinophilic granulomatosis with polyangiitis (Churg-Strauss)",
    "Scarlet fever",
    "Mycoplasma pneumonia (walking pneumonia/pneumonia)",
    "Legionella (Legionnaires’ disease)",
    "Paget disease",
    "Avascular necrosis of the femoral head",
    "Posterior hip dislocation",
    "Anterior shoulder dislocation",
    "DRESS syndrome",
    "Serotonin syndrome",
    "Neuroleptic malignant syndrome",
    "Malignant hyperthermia",
    "Clostridium difficile",
]
