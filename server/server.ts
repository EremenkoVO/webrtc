import cors from 'cors';
import express from 'express';
import fs from 'fs';
import https from 'https';
import authRoutes from './auth/routes';
import channelRoutes from './channels/routes';
import { config } from './config';
import messageRoutes from './messages/routes';
import { initializeWebSocket } from './websocket';

const app = express();

// CORS configuration
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes with /api prefix
app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// HTTPS server
const server = https.createServer(
  {
    key: fs.readFileSync('cert/key.pem'),
    cert: fs.readFileSync('cert/cert.pem'),
  },
  app,
);

// Initialize WebSocket
const wss = initializeWebSocket(server);

server.listen(config.port, () => {
  console.log(`Server running on https://${config.host}:${config.port}`);
});

export { server, wss };
