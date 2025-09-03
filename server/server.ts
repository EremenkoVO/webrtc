// server.ts (Node.js + WSS)
import fs from 'fs';
import https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket, WebSocketServer } from 'ws';

interface ExtWebSocket extends WebSocket {
  id?: string;
}

interface SignalMessage {
  type: string;
  from?: string;
  to?: string;
  data?: any;
}

const server = https.createServer({
  key: fs.readFileSync('cert/key.pem'),
  cert: fs.readFileSync('cert/cert.pem'),
});

const wss = new WebSocketServer({ server });
const clients = new Map<string, ExtWebSocket>();

wss.on('connection', (ws: WebSocket) => {
  const client = ws as ExtWebSocket;
  client.id = uuidv4();
  clients.set(client.id, client);

  // Отправляем клиенту его ID
  client.send(JSON.stringify({ type: 'welcome', id: client.id }));

  // Отправляем всем обновленный список пользователей
  broadcastUserList();

  client.on('message', (msg) => {
    try {
      const message: SignalMessage = JSON.parse(msg.toString());

      // пересылка сообщения конкретному пользователю
      if (message.to && clients.has(message.to)) {
        const target = clients.get(message.to)!;
        target.send(JSON.stringify({ ...message, from: client.id }));
      }
    } catch (err) {
      console.error(err);
    }
  });

  client.on('close', () => {
    clients.delete(client.id!);
    broadcastUserList();
  });
});

// функция отправки списка всех пользователей
function broadcastUserList() {
  const userList = Array.from(clients.keys());
  clients.forEach((c) => {
    c.send(JSON.stringify({ type: 'user-list', users: userList }));
  });
}

server.listen(8080, '0.0.0.0', () => {
  console.log('WSS server running on https://0.0.0.0:8080');
});
