"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeWebSocket = exports.clients = void 0;
const ws_1 = require("ws");
const utils_1 = require("../auth/utils");
const handlers_1 = require("./handlers");
exports.clients = new Map();
const initializeWebSocket = (server) => {
    const wss = new ws_1.WebSocketServer({ server });
    wss.on('connection', (ws, req) => {
        // Read token from query
        const url = new URL(req.url, `https://${req.headers.host}`);
        const token = url.searchParams.get('token');
        const payload = token ? (0, utils_1.verifyToken)(token) : null;
        if (!payload) {
            ws.close();
            return;
        }
        ws.userId = payload.id;
        ws.username = payload.username;
        exports.clients.set(ws.userId, ws);
        // Send list of all connected users to new client
        const userList = Array.from(exports.clients.values())
            .filter((client) => client.userId !== undefined)
            .map((client) => ({
            userId: client.userId,
            username: client.username,
        }));
        ws.send(JSON.stringify({
            type: 'user_list',
            users: userList,
        }));
        // Notify all clients about new user
        exports.clients.forEach((client) => {
            if (client.userId !== ws.userId && client.readyState === ws_1.WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'user_joined',
                    user: {
                        userId: ws.userId,
                        username: ws.username,
                    },
                }));
            }
        });
        ws.on('message', (message) => {
            (0, handlers_1.handleWebSocketMessage)(ws, message);
        });
        ws.on('close', () => {
            if (ws.userId) {
                exports.clients.delete(ws.userId);
                // Notify all clients about user leaving
                exports.clients.forEach((client) => {
                    if (client.readyState === ws_1.WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'user_left',
                            userId: ws.userId,
                        }));
                    }
                });
            }
        });
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            if (ws.userId) {
                exports.clients.delete(ws.userId);
            }
        });
    });
    return wss;
};
exports.initializeWebSocket = initializeWebSocket;
//# sourceMappingURL=index.js.map