from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, List

from auth import get_current_user_from_token
from database import db

router = APIRouter(prefix="/api/channels", tags=["channels"])

class ChannelCreate(BaseModel):
    name: str

class ChannelResponse(BaseModel):
    id: int
    name: str
    created_by: int
    creator_username: str
    created_at: str

def get_current_user_from_header(authorization: Optional[str] = Header(None)):
    """Extract and verify user from Authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    token = authorization.split(" ")[1]
    return get_current_user_from_token(token)

@router.get("/")
async def get_channels(current_user: dict = Depends(get_current_user_from_header)):
    """Get all channels"""
    try:
        channels = await db.get_channels()
        return {"success": True, "channels": channels}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/")
async def create_channel(
    channel_data: ChannelCreate,
    current_user: dict = Depends(get_current_user_from_header)
):
    """Create a new channel"""
    name = channel_data.name.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Channel name required")

    if len(name) < 3 or len(name) > 50:
        raise HTTPException(status_code=400, detail="Channel name must be 3-50 characters")

    try:
        user_id = current_user['id']
        channel_id = await db.create_channel(name, user_id)

        return {
            "success": True,
            "message": "Channel created successfully",
            "channelId": channel_id
        }
    except Exception as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=400, detail="Channel name already exists")
        raise HTTPException(status_code=500, detail="Internal server error")