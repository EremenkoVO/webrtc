from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, List

from auth import get_current_user_from_token
from database import db

router = APIRouter(prefix="/api/messages", tags=["messages"])

class MessageCreate(BaseModel):
    channel_id: int
    content: str

class MessageResponse(BaseModel):
    id: int
    channel_id: int
    user_id: int
    username: str
    content: str
    created_at: str

def get_current_user_from_header(authorization: Optional[str] = Header(None)):
    """Extract and verify user from Authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    token = authorization.split(" ")[1]
    return get_current_user_from_token(token)

@router.get("/channel/{channel_id}")
async def get_messages(
    channel_id: int,
    limit: int = 100,
    current_user: dict = Depends(get_current_user_from_header)
):
    """Get messages for a specific channel"""
    try:
        messages = await db.get_messages(channel_id, limit)
        return {"success": True, "messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/")
async def create_message(
    message_data: MessageCreate,
    current_user: dict = Depends(get_current_user_from_header)
):
    """Create a new message"""
    try:
        user_id = current_user['id']
        message_id = await db.create_message(
            message_data.channel_id,
            user_id,
            message_data.content
        )

        return {
            "success": True,
            "message": "Message created successfully",
            "messageId": message_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")