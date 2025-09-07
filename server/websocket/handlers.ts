import { WebSocket } from 'ws';
import { WSClient } from '../types';
import { clients } from './index';

export const handleWebSocketMessage = (
  ws: WSClient,
  message: string | Buffer,
) => {
  try {
    const data = JSON.parse(message.toString());

    switch (data.type) {
      case 'join_channel':
        handleJoinChannel(ws, data);
        break;
      case 'leave_channel':
        handleLeaveChannel(ws, data);
        break;
      case 'webrtc_signal':
        handleWebRTCSignal(ws, data);
        break;
      case 'join_call':
        handleJoinCall(ws, data);
        break;
      case 'leave_call':
        handleLeaveCall(ws, data);
        break;
      default:
        // Forward to specific user if 'to' field is present
        if (data.to && clients.has(data.to)) {
          const targetClient = clients.get(data.to);
          if (targetClient && targetClient.readyState === WebSocket.OPEN) {
            targetClient.send(
              JSON.stringify({
                ...data,
                from: ws.userId,
                username: ws.username,
              }),
            );
          }
        }
        break;
    }
  } catch (error) {
    console.error('WebSocket message parsing error:', error);
  }
};

const handleJoinChannel = (ws: WSClient, data: any) => {
  // Handle user joining a channel
  console.log(`User ${ws.userId} joined channel ${data.channelId}`);
};

const handleLeaveChannel = (ws: WSClient, data: any) => {
  // Handle user leaving a channel
  console.log(`User ${ws.userId} left channel ${data.channelId}`);
};

const handleWebRTCSignal = (ws: WSClient, data: any) => {
  // Handle WebRTC signaling
  if (data.to && clients.has(data.to)) {
    const targetClient = clients.get(data.to);
    if (targetClient && targetClient.readyState === WebSocket.OPEN) {
      targetClient.send(
        JSON.stringify({
          type: 'webrtc_signal',
          from: ws.userId,
          username: ws.username,
          signal: data.signal,
        }),
      );
    }
  }
};

const handleJoinCall = (ws: WSClient, data: any) => {
  // Handle user joining a voice call
  console.log(`User ${ws.userId} joined call`);

  // Broadcast to all other connected clients that this user joined the call
  clients.forEach((client) => {
    if (client.userId !== ws.userId && client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'join_call',
          userId: ws.userId,
          username: ws.username || data.username,
        }),
      );
    }
  });
};

const handleLeaveCall = (ws: WSClient, data: any) => {
  // Handle user leaving a voice call
  console.log(`User ${ws.userId} left call`);

  // Broadcast to all other connected clients that this user left the call
  clients.forEach((client) => {
    if (client.userId !== ws.userId && client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'leave_call',
          userId: ws.userId,
        }),
      );
    }
  });
};
