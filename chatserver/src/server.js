import { WebSocketServer } from 'ws';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'http';
import { randomUUID } from 'crypto';

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.MYDISCORD_AUTH_TOKEN_SECRET || process.env.JWT_SECRET || 'change-this-secret';
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://backend:8080';

// In-memory storage for active connections (rooms and clients)
const rooms = new Map(); // roomId -> { clients: Map<clientId, client>, messages: Array }
const clients = new Map(); // clientId -> { ws, userId, username, roomId }

// Express app for health checks
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, clients: clients.size });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Fetch username from backend API
async function fetchUsername(userId, token) {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch username for user ${userId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.username || null;
  } catch (error) {
    console.error(`Error fetching username for user ${userId}:`, error);
    return null;
  }
}

// Get or create room
function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Map(),
      messages: [], // Store messages in memory
    });
  }
  return rooms.get(roomId);
}

// Broadcast message to all clients in a room except sender
function broadcastToRoom(roomId, message, excludeClientId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const messageStr = JSON.stringify(message);
  room.clients.forEach((client, clientId) => {
    if (clientId !== excludeClientId && client.ws.readyState === 1) {
      client.ws.send(messageStr);
    }
  });
}

// Send chat history to a client
function sendChatHistory(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room || room.messages.length === 0) return;

  const historyMessage = {
    type: 'chat_history',
    room: roomId,
    messages: room.messages.slice(-100), // Send last 100 messages
  };
  ws.send(JSON.stringify(historyMessage));
}

wss.on('connection', async (ws, req) => {
  console.log('New WebSocket connection');

  // Extract token from query string
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const roomId = url.searchParams.get('room');
  const usernameParam = url.searchParams.get('username'); // Optional username parameter

  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }

  // Verify JWT token
  const decoded = verifyToken(token);
  if (!decoded) {
    ws.close(1008, 'Invalid token');
    return;
  }

  if (!roomId) {
    ws.close(1008, 'Room ID required');
    return;
  }

  const clientId = decoded.sub || decoded.user_id || `client_${Date.now()}`;
  const userId = decoded.user_id || decoded.sub;

  // Get username: prefer query parameter, then fetch from API, fallback to Anonymous
  let username = usernameParam || decoded.username || decoded.name;
  
  if (!username && userId) {
    // Fetch username from backend API
    username = await fetchUsername(userId, token);
  }
  
  if (!username) {
    username = 'Anonymous';
  }

  // Store client info
  const client = {
    ws,
    userId: decoded.user_id || decoded.sub,
    username,
    roomId,
    clientId,
  };
  clients.set(clientId, client);

  // Add client to room
  const room = getOrCreateRoom(roomId);
  room.clients.set(clientId, client);

  console.log(`Client ${clientId} (${username}) joined room ${roomId}`);

  // Send join confirmation
  ws.send(
    JSON.stringify({
      type: 'joined',
      room: roomId,
      clientId,
      userId,
      username,
      timestamp: new Date().toISOString(),
    })
  );

  // Send chat history
  sendChatHistory(ws, roomId);

  // Notify other clients
  broadcastToRoom(
    roomId,
    {
      type: 'user_joined',
      room: roomId,
      clientId,
      username,
      timestamp: new Date().toISOString(),
    },
    clientId
  );

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'chat_message':
          if (!message.text || !message.text.trim()) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message text is required',
              })
            );
            return;
          }

          const chatMessage = {
            type: 'chat_message',
            room: roomId,
            from: clientId,
            username,
            text: message.text.trim(),
            timestamp: new Date().toISOString(),
            id: randomUUID(), // Generate unique ID for message
            edited: false,
            reactions: {},
          };

          // Store message in memory
          const room = getOrCreateRoom(roomId);
          room.messages.push(chatMessage);
          // Keep only last 1000 messages per room
          if (room.messages.length > 1000) {
            room.messages.shift();
          }

          // Broadcast to all clients in room
          broadcastToRoom(roomId, chatMessage, null);
          break;

        case 'typing':
          broadcastToRoom(
            roomId,
            {
              type: 'typing',
              room: roomId,
              from: clientId,
              username,
              isTyping: message.isTyping !== false,
            },
            clientId
          );
          break;

        case 'edit_message': {
          if (!message.messageId) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message ID is required',
              })
            );
            return;
          }

          if (!message.text || !message.text.trim()) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message text is required',
              })
            );
            return;
          }

          // Find message in memory
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Room not found',
              })
            );
            return;
          }

          let messageToEdit = room.messages.find(m => m.id === message.messageId);
          
          // Fallback: try to find by from+timestamp pattern (for old messages without ID)
          if (!messageToEdit) {
            const fallbackKey = message.messageId;
            const firstDashIndex = fallbackKey.indexOf('-');
            if (firstDashIndex > 0) {
              const from = fallbackKey.substring(0, firstDashIndex);
              const timestamp = fallbackKey.substring(firstDashIndex + 1);
              messageToEdit = room.messages.find(m => 
                m.from === from && m.timestamp === timestamp
              );
            }
          }

          if (!messageToEdit) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message not found',
              })
            );
            return;
          }

          // Check if user owns the message
          if (messageToEdit.from !== clientId) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'You can only edit your own messages',
              })
            );
            return;
          }

          // Ensure message has an ID
          if (!messageToEdit.id) {
            messageToEdit.id = randomUUID();
          }

          // Update message in memory
          messageToEdit.text = message.text.trim();
          messageToEdit.edited = true;

          // Broadcast edit event to all clients in room
          const editEvent = {
            type: 'message_edited',
            room: roomId,
            messageId: messageToEdit.id,
            text: message.text.trim(),
            timestamp: new Date().toISOString(),
          };
          broadcastToRoom(roomId, editEvent, null);
          break;
        }

        case 'delete_message': {
          if (!message.messageId) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message ID is required',
              })
            );
            return;
          }

          // Find message in memory
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Room not found',
              })
            );
            return;
          }

          let messageIndex = room.messages.findIndex(m => m.id === message.messageId);
          
          // Fallback: try to find by from+timestamp pattern
          if (messageIndex === -1) {
            const fallbackKey = message.messageId;
            const firstDashIndex = fallbackKey.indexOf('-');
            if (firstDashIndex > 0) {
              const from = fallbackKey.substring(0, firstDashIndex);
              const timestamp = fallbackKey.substring(firstDashIndex + 1);
              messageIndex = room.messages.findIndex(m => 
                m.from === from && m.timestamp === timestamp
              );
            }
          }

          if (messageIndex === -1) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message not found',
              })
            );
            return;
          }

          const messageToDelete = room.messages[messageIndex];

          // Check if user owns the message
          if (messageToDelete.from !== clientId) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'You can only delete your own messages',
              })
            );
            return;
          }

          const messageIdToDelete = messageToDelete.id || message.messageId;

          // Delete message from memory
          room.messages.splice(messageIndex, 1);

          // Broadcast delete event to all clients in room
          const deleteEvent = {
            type: 'message_deleted',
            room: roomId,
            messageId: messageIdToDelete,
          };
          broadcastToRoom(roomId, deleteEvent, null);
          break;
        }

        case 'add_reaction': {
          if (!message.messageId || !message.emoji) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message ID and emoji are required',
              })
            );
            return;
          }

          // Find message in memory
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Room not found',
              })
            );
            return;
          }

          let messageToReact = room.messages.find(m => m.id === message.messageId);
          
          // Fallback for old messages
          if (!messageToReact) {
            const fallbackKey = message.messageId;
            const firstDashIndex = fallbackKey.indexOf('-');
            if (firstDashIndex > 0) {
              const from = fallbackKey.substring(0, firstDashIndex);
              const timestamp = fallbackKey.substring(firstDashIndex + 1);
              messageToReact = room.messages.find(m => 
                m.from === from && m.timestamp === timestamp
              );
            }
          }

          if (!messageToReact) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message not found',
              })
            );
            return;
          }

          const messageId = messageToReact.id || message.messageId;

          // Initialize reactions if needed
          if (!messageToReact.reactions) {
            messageToReact.reactions = {};
          }
          if (!messageToReact.reactions[message.emoji]) {
            messageToReact.reactions[message.emoji] = [];
          }

          // Add reaction if user hasn't already reacted
          if (!messageToReact.reactions[message.emoji].includes(userId)) {
            messageToReact.reactions[message.emoji].push(userId);
          }

          // Broadcast reaction update to all clients in room
          const reactionUpdate = {
            type: 'reaction_updated',
            room: roomId,
            messageId: messageId,
            emoji: message.emoji,
            reactions: messageToReact.reactions,
          };
          broadcastToRoom(roomId, reactionUpdate, null);
          break;
        }

        case 'remove_reaction': {
          if (!message.messageId || !message.emoji) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message ID and emoji are required',
              })
            );
            return;
          }

          // Find message in memory
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Room not found',
              })
            );
            return;
          }

          let messageToUnreact = room.messages.find(m => m.id === message.messageId);
          
          // Fallback for old messages
          if (!messageToUnreact) {
            const fallbackKey = message.messageId;
            const firstDashIndex = fallbackKey.indexOf('-');
            if (firstDashIndex > 0) {
              const from = fallbackKey.substring(0, firstDashIndex);
              const timestamp = fallbackKey.substring(firstDashIndex + 1);
              messageToUnreact = room.messages.find(m => 
                m.from === from && m.timestamp === timestamp
              );
            }
          }

          if (!messageToUnreact) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Message not found',
              })
            );
            return;
          }

          const messageId = messageToUnreact.id || message.messageId;

          // Initialize reactions if needed
          if (!messageToUnreact.reactions) {
            messageToUnreact.reactions = {};
          }
          if (!messageToUnreact.reactions[message.emoji]) {
            messageToUnreact.reactions[message.emoji] = [];
          }

          // Remove reaction
          messageToUnreact.reactions[message.emoji] = 
            messageToUnreact.reactions[message.emoji].filter(id => id !== userId);

          // Clean up empty reaction arrays
          if (messageToUnreact.reactions[message.emoji].length === 0) {
            delete messageToUnreact.reactions[message.emoji];
          }

          // Broadcast reaction update to all clients in room
          const unreactUpdate = {
            type: 'reaction_updated',
            room: roomId,
            messageId: messageId,
            emoji: message.emoji,
            reactions: messageToUnreact.reactions,
          };
          broadcastToRoom(roomId, unreactUpdate, null);
          break;
        }

        default:
          ws.send(
            JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${message.type}`,
            })
          );
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        })
      );
    }
  });

  // Handle connection close
  ws.on('close', () => {
    console.log(`Client ${clientId} disconnected`);

    // Remove client from room
    const room = rooms.get(roomId);
    if (room) {
      room.clients.delete(clientId);

      // Notify other clients
      broadcastToRoom(
        roomId,
        {
          type: 'user_left',
          room: roomId,
          clientId,
          username,
          timestamp: new Date().toISOString(),
        },
        clientId
      );

      // Clean up empty rooms (optional - you might want to keep them)
      if (room.clients.size === 0) {
        // Keep room for history, but could delete: rooms.delete(roomId);
      }
    }

    // Remove client
    clients.delete(clientId);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chat server listening on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  wss.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});
