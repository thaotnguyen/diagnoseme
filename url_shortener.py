# url_shortener.py
import os
import json
import base64
import hashlib
from cryptography.fernet import Fernet
from dotenv import load_dotenv
project_folder = os.path.expanduser('~/Development/diagnoseme')  # adjust as appropriate
load_dotenv(os.path.join(project_folder, '.env'))

# Get the raw secret from an environment variable.
raw_key = 'cZIRRuUr5b72dq4szDENrDBIjj4ErsY0'
if raw_key is None:
   raise ValueError("Environment variable FERNET_SECRET_KEY is not set")

# Generate a valid 32-byte key using SHA-256 and then Base64-encode it.
hashed_key = hashlib.sha256(raw_key.encode()).digest()
fernet_key = base64.urlsafe_b64encode(hashed_key)

fernet = Fernet(fernet_key)


def encode_case_data(disease, case_description=None, encrypt=True):
    """Combine disease and case_description, then encrypt and return a URL-safe token."""
    if case_description is None:
        data = {'disease': disease}
    else:
        data = {'disease': disease, 'case_description': case_description}
    serialized = json.dumps(data)
    if encrypt:
        serialized = base64.urlsafe_b64encode(serialized.encode()).decode()
        token = fernet.encrypt(serialized.encode())
        return token.decode()
    else:
        return serialized


def decode_case_data(token, encrypt=True):
    """Decrypt a token and return the disease and case_description."""
    if not encrypt:
        return json.loads(token)
    decrypted = fernet.decrypt(token.encode()).decode()
    decoded_json = base64.urlsafe_b64decode(decrypted.encode()).decode()
    data = json.loads(decoded_json)
    print(f"Decoded JSON: {data}")
    if 'case_description' not in data:
        data['case_description'] = None
    return data
