import asyncio
import logging
import ssl
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import config
from database import db
from websocket_manager import manager
from routes.auth_routes import router as auth_router
from routes.channel_routes import router as channel_router
from routes.message_routes import router as message_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db.init_db()
    logger.info("Database initialized")
    yield
    # Shutdown
    logger.info("Server shutting down")

# Create FastAPI app
app = FastAPI(
    title="WebRTC Signaling Server",
    description="Python WebRTC signaling server with WebSocket support",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Include routers
app.include_router(auth_router)
app.include_router(channel_router)
app.include_router(message_router)

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": "2024-01-01T00:00:00.000Z"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    """WebSocket endpoint for real-time communication"""
    connected = await manager.connect(websocket, token)
    if not connected:
        return

    try:
        while True:
            data = await websocket.receive_text()
            await manager.handle_message(websocket, data)
    except WebSocketDisconnect:
        user_id = manager.disconnect(websocket)
        if user_id:
            # Notify all clients about user leaving
            await manager.broadcast_message({
                'type': 'user_left',
                'userId': user_id
            })
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        user_id = manager.disconnect(websocket)
        if user_id:
            await manager.broadcast_message({
                'type': 'user_left',
                'userId': user_id
            })

if __name__ == "__main__":
    import uvicorn

    # SSL context for HTTPS
    try:
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(config.SSL_CERTFILE, config.SSL_KEYFILE)

        uvicorn.run(
            "main:app",
            host=config.HOST,
            port=config.PORT,
            ssl_keyfile=config.SSL_KEYFILE,
            ssl_certfile=config.SSL_CERTFILE,
            reload=False
        )
    except FileNotFoundError:
        logger.warning("SSL certificates not found, running without HTTPS")
        uvicorn.run(
            "main:app",
            host=config.HOST,
            port=config.PORT,
            reload=False
        )