"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebSocketMessage = void 0;
const ws_1 = require("ws");
const index_1 = require("./index");
const handleWebSocketMessage = (ws, message) => {
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
                if (data.to && index_1.clients.has(data.to)) {
                    const targetClient = index_1.clients.get(data.to);
                    if (targetClient && targetClient.readyState === ws_1.WebSocket.OPEN) {
                        console.dir(ws.username);
                        targetClient.send(JSON.stringify({
                            ...data,
                            from: ws.userId,
                            username: ws.username,
                        }));
                    }
                }
                break;
        }
    }
    catch (error) {
        console.error('WebSocket message parsing error:', error);
    }
};
exports.handleWebSocketMessage = handleWebSocketMessage;
const handleJoinChannel = (ws, data) => {
    // Handle user joining a channel
    console.log(`User ${ws.userId} joined channel ${data.channelId}`);
};
const handleLeaveChannel = (ws, data) => {
    // Handle user leaving a channel
    console.log(`User ${ws.userId} left channel ${data.channelId}`);
};
const handleWebRTCSignal = (ws, data) => {
    // Handle WebRTC signaling
    if (data.to && index_1.clients.has(data.to)) {
        const targetClient = index_1.clients.get(data.to);
        if (targetClient && targetClient.readyState === ws_1.WebSocket.OPEN) {
            targetClient.send(JSON.stringify({
                type: 'webrtc_signal',
                from: ws.userId,
                username: ws.username,
                signal: data.signal,
            }));
        }
    }
};
const handleJoinCall = (ws, data) => {
    // Handle user joining a voice call
    console.log(`User ${ws.userId} joined call`);
    // Broadcast to all other connected clients that this user joined the call
    index_1.clients.forEach((client) => {
        if (client.userId !== ws.userId && client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'join_call',
                userId: ws.userId,
                username: ws.username || data.username,
            }));
        }
    });
};
const handleLeaveCall = (ws, data) => {
    // Handle user leaving a voice call
    console.log(`User ${ws.userId} left call`);
    // Broadcast to all other connected clients that this user left the call
    index_1.clients.forEach((client) => {
        if (client.userId !== ws.userId && client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'leave_call',
                userId: ws.userId,
            }));
        }
    });
};
//# sourceMappingURL=handlers.js.map