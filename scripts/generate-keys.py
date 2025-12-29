#!/usr/bin/env python3
"""
Generate JWT keys for Supabase self-hosted deployment
"""
import json
import base64
import hmac
import hashlib
import time
import secrets

def base64url_encode(data):
    """Base64URL encode without padding"""
    return base64.b64encode(data).decode('utf-8').replace('+', '-').replace('/', '_').rstrip('=')

def create_jwt(role, jwt_secret):
    """Create a JWT token for the given role"""
    # Header
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = base64url_encode(json.dumps(header, separators=(',', ':')).encode())
    
    # Payload
    now = int(time.time())
    payload = {
        "role": role,
        "iss": "supabase",
        "iat": now,
        "exp": now + 315360000  # 10 years
    }
    payload_b64 = base64url_encode(json.dumps(payload, separators=(',', ':')).encode())
    
    # Signature
    message = f"{header_b64}.{payload_b64}".encode()
    signature = hmac.new(jwt_secret.encode(), message, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)
    
    return f"{header_b64}.{payload_b64}.{signature_b64}"

# Generate secrets
jwt_secret = base64.b64encode(secrets.token_bytes(32)).decode('utf-8')
secret_key_base = base64.b64encode(secrets.token_bytes(32)).decode('utf-8')

# Generate JWT keys
anon_key = create_jwt("anon", jwt_secret)
service_role_key = create_jwt("service_role", jwt_secret)

# Output
print(f"JWT_SECRET={jwt_secret}")
print(f"ANON_KEY={anon_key}")
print(f"SERVICE_ROLE_KEY={service_role_key}")
print(f"SECRET_KEY_BASE={secret_key_base}")

