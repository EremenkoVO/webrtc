from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status
from config import config

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    """Create JWT access token"""
    to_encode = data.copy()

    # Handle JWT_EXPIRES_IN format (e.g., "24h", "1d")
    expires_in = config.JWT_EXPIRES_IN
    if expires_in.endswith('h'):
        hours = int(expires_in[:-1])
        expire = datetime.utcnow() + timedelta(hours=hours)
    elif expires_in.endswith('d'):
        days = int(expires_in[:-1])
        expire = datetime.utcnow() + timedelta(days=days)
    else:
        # Default to 24 hours
        expire = datetime.utcnow() + timedelta(hours=24)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, config.SECRET_KEY, algorithm="HS256")
    return encoded_jwt

def verify_token(token: str) -> Optional[dict]:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
        return payload
    except JWTError:
        return None

def get_current_user_from_token(token: str) -> dict:
    """Get current user from JWT token, raise exception if invalid"""
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload