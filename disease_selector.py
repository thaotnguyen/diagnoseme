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
    "Acute pancreatitis",
    "Chronic mesenteric ischemia",
    "Ectopic pregnancy (ruptured, RLQ)",
    "HELLP syndrome",
    "Preeclampsia",
    "Ankylosing spondylitis",
    "Guillain-Barré syndrome",
    "Rheumatic fever",
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
]
