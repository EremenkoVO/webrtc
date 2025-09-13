import json
import logging
from typing import Dict, Set, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect
from auth import verify_token

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Map of user_id to WebSocket connection
        self.active_connections: Dict[int, WebSocket] = {}
        # Map of WebSocket to user info
        self.connection_info: Dict[WebSocket, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, token: str):
        """Connect a new WebSocket client"""
        await websocket.accept()

        # Verify token
        payload = verify_token(token)
        if not payload:
            await websocket.close(code=1008, reason="Invalid token")
            return False

        user_id = payload.get('id')
        username = payload.get('username')

        if not user_id or not username:
            await websocket.close(code=1008, reason="Invalid token payload")
            return False

        # Store connection
        self.active_connections[user_id] = websocket
        self.connection_info[websocket] = {
            'user_id': user_id,
            'username': username
        }

        # Send user list to new client
        user_list = [
            {'userId': uid, 'username': info['username']}
            for uid, ws in self.active_connections.items()
            if ws != websocket and uid in [self.connection_info.get(ws, {}).get('user_id')]
        ]

        await self.send_personal_message({
            'type': 'user_list',
            'users': user_list
        }, websocket)

        # Notify all other clients about new user
        await self.broadcast_message({
            'type': 'user_joined',
            'user': {
                'userId': user_id,
                'username': username
            }
        }, exclude=websocket)

        logger.info(f"User {username} ({user_id}) connected")
        return True

    def disconnect(self, websocket: WebSocket):
        """Disconnect a WebSocket client"""
        if websocket in self.connection_info:
            user_info = self.connection_info[websocket]
            user_id = user_info['user_id']
            username = user_info['username']

            # Remove from active connections
            if user_id in self.active_connections:
                del self.active_connections[user_id]
            del self.connection_info[websocket]

            logger.info(f"User {username} ({user_id}) disconnected")
            return user_id
        return None

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send message to a specific WebSocket"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Error sending message to WebSocket: {e}")

    async def send_to_user(self, message: dict, user_id: int):
        """Send message to a specific user by user_id"""
        if user_id in self.active_connections:
            await self.send_personal_message(message, self.active_connections[user_id])

    async def broadcast_message(self, message: dict, exclude: Optional[WebSocket] = None):
        """Broadcast message to all connected clients"""
        disconnected = []
        for websocket in self.connection_info.keys():
            if websocket != exclude:
                try:
                    await self.send_personal_message(message, websocket)
                except Exception as e:
                    logger.error(f"Error broadcasting to WebSocket: {e}")
                    disconnected.append(websocket)

        # Clean up disconnected WebSockets
        for websocket in disconnected:
            self.disconnect(websocket)

    async def handle_message(self, websocket: WebSocket, message: str):
        """Handle incoming WebSocket message"""
        try:
            data = json.loads(message)
            message_type = data.get('type')

            if websocket not in self.connection_info:
                return

            sender_info = self.connection_info[websocket]
            sender_id = sender_info['user_id']
            sender_username = sender_info['username']

            if message_type == 'webrtc_offer':
                target_user_id = data.get('targetUserId')
                if target_user_id and target_user_id in self.active_connections:
                    await self.send_to_user({
                        'type': 'webrtc_offer',
                        'offer': data.get('offer'),
                        'fromUserId': sender_id,
                        'fromUsername': sender_username
                    }, target_user_id)

            elif message_type == 'webrtc_answer':
                target_user_id = data.get('targetUserId')
                if target_user_id and target_user_id in self.active_connections:
                    await self.send_to_user({
                        'type': 'webrtc_answer',
                        'answer': data.get('answer'),
                        'fromUserId': sender_id,
                        'fromUsername': sender_username
                    }, target_user_id)

            elif message_type == 'webrtc_ice_candidate':
                target_user_id = data.get('targetUserId')
                if target_user_id and target_user_id in self.active_connections:
                    await self.send_to_user({
                        'type': 'webrtc_ice_candidate',
                        'candidate': data.get('candidate'),
                        'fromUserId': sender_id,
                        'fromUsername': sender_username
                    }, target_user_id)

            elif message_type == 'chat_message':
                # Broadcast chat message to all users
                await self.broadcast_message({
                    'type': 'chat_message',
                    'message': data.get('message'),
                    'fromUserId': sender_id,
                    'fromUsername': sender_username,
                    'timestamp': data.get('timestamp')
                })

            else:
                logger.warning(f"Unknown message type: {message_type}")

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON message: {e}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")

# Global connection manager
manager = ConnectionManager()