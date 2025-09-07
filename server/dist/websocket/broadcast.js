"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToUser = exports.broadcastToChannel = exports.broadcastToAll = void 0;
const ws_1 = require("ws");
const index_1 = require("./index");
const broadcastToAll = (message) => {
    const messageString = JSON.stringify(message);
    index_1.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(messageString);
        }
    });
};
exports.broadcastToAll = broadcastToAll;
const broadcastToChannel = (channelId, message) => {
    // In a real implementation, you would track which users are in which channels
    // For now, broadcast to all connected users
    (0, exports.broadcastToAll)(message);
};
exports.broadcastToChannel = broadcastToChannel;
const sendToUser = (userId, message) => {
    const client = index_1.clients.get(userId);
    if (client && client.readyState === ws_1.WebSocket.OPEN) {
        client.send(JSON.stringify(message));
    }
};
exports.sendToUser = sendToUser;
//# sourceMappingURL=broadcast.js.map