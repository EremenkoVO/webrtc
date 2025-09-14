from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import sqlite3

from auth import hash_password, verify_password, create_access_token, get_current_user_from_token
from database import db

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()

class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

@router.post("/register")
async def register(user_data: UserRegister):
    """Register a new user"""
    username = user_data.username.strip()
    password = user_data.password

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    if len(username) < 3 or len(username) > 20:
        raise HTTPException(status_code=400, detail="Username must be 3-20 chars")

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password at least 6 chars")

    # Check if user already exists
    existing_user = await db.get_user_by_username(username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Hash password and create user
    password_hash = hash_password(password)
    try:
        user_id = await db.create_user(username, password_hash)
        return {
            "success": True,
            "message": "User registered successfully",
            "token": create_access_token({"id": user_id, "username": username}),
            "user": {"id": user_id, "username": username}
        }
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Username already exists")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/login")
async def login(user_data: UserLogin):
    """Login user and return JWT token"""
    username = user_data.username.strip()
    password = user_data.password

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    # Get user from database
    user = await db.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid credentials")

    # Verify password
    if not verify_password(password, user['password']):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    # Create JWT token
    token_data = {"id": user['id'], "username": user['username']}
    token = create_access_token(token_data)

    return {
        "success": True,
        "token": token,
        "user": {"id": user['id'], "username": user['username']}
    }

@router.get("/me")
async def get_current_user(authorization: Optional[str] = Header(None)):
    """Get current user information"""
    if not authorization:
        return {"loggedIn": False}

    try:
        # Extract token from "Bearer <token>"
        if not authorization.startswith("Bearer "):
            return {"loggedIn": False}

        token = authorization.split(" ")[1]
        user_payload = get_current_user_from_token(token)

        return {
            "loggedIn": True,
            "user": user_payload
        }
    except HTTPException:
        return {"loggedIn": False}