import https from 'https';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from '../auth/utils';
import { WSClient } from '../types';
import { handleWebSocketMessage } from './handlers';

export const clients: Map<number, WSClient> = new Map();

export const initializeWebSocket = (server: https.Server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WSClient, req) => {
    // Read token from query
    const url = new URL(req.url!, `https://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      ws.close();
      return;
    }

    ws.userId = payload.id;
    ws.username = payload.username;
    clients.set(ws.userId, ws);

    // Send list of all connected users to new client
    const userList = Array.from(clients.values())
      .filter((client) => client.userId !== undefined)
      .map((client) => ({
        userId: client.userId,
        username: client.username,
      }));

    ws.send(
      JSON.stringify({
        type: 'user_list',
        users: userList,
      }),
    );

    // Notify all clients about new user
    clients.forEach((client) => {
      if (client.userId !== ws.userId && client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: 'user_joined',
            user: {
              userId: ws.userId,
              username: ws.username,
            },
          }),
        );
      }
    });

    ws.on('message', (message: string | Buffer) => {
      handleWebSocketMessage(ws, message);
    });

    ws.on('close', () => {
      if (ws.userId) {
        clients.delete(ws.userId);
        // Notify all clients about user leaving
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: 'user_left',
                userId: ws.userId,
              }),
            );
          }
        });
      }
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      if (ws.userId) {
        clients.delete(ws.userId);
      }
    });
  });

  return wss;
};
