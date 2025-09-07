import { WebSocket } from 'ws';
import { clients } from './index';

export const broadcastToAll = (message: any) => {
  const messageString = JSON.stringify(message);

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
};

export const broadcastToChannel = (channelId: number, message: any) => {
  // In a real implementation, you would track which users are in which channels
  // For now, broadcast to all connected users
  broadcastToAll(message);
};

export const sendToUser = (userId: number, message: any) => {
  const client = clients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
};
