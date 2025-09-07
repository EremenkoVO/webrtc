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
            case 'webrtc_offer':
            case 'webrtc_answer':
            case 'webrtc_ice_candidate':
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
    // Handle WebRTC signaling (offer, answer, candidate)
    if (data.to && index_1.clients.has(data.to)) {
        const targetClient = index_1.clients.get(data.to);
        if (targetClient && targetClient.readyState === ws_1.WebSocket.OPEN) {
            // Forward the exact message with from field
            const message = {
                ...data,
                from: ws.userId,
                username: ws.username,
            };
            targetClient.send(JSON.stringify(message));
            console.log(`WebRTC signal '${data.type}' forwarded from ${ws.userId} to ${data.to}`);
        }
        else {
            console.log(`Target client ${data.to} not found or not connected`);
        }
    }
    else {
        console.log(`Invalid WebRTC signal data:`, data);
    }
};
const handleJoinCall = (ws, data) => {
    // Handle user joining a voice call
    console.log(`User ${ws.userId} (${ws.username}) joined call`);
    // Broadcast to all other connected clients that this user joined the call
    index_1.clients.forEach((client) => {
        if (client.userId !== ws.userId && client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'user_joined_call',
                userId: ws.userId,
                username: ws.username || `User ${ws.userId}`,
            }));
        }
    });
    // Send current call participants to the new user
    const callParticipants = [];
    index_1.clients.forEach((client) => {
        if (client.userId !== ws.userId && client.readyState === ws_1.WebSocket.OPEN) {
            callParticipants.push({
                userId: client.userId,
                username: client.username || `User ${client.userId}`,
            });
        }
    });
    if (callParticipants.length > 0) {
        ws.send(JSON.stringify({
            type: 'existing_participants',
            participants: callParticipants,
        }));
    }
};
const handleLeaveCall = (ws, data) => {
    // Handle user leaving a voice call
    console.log(`User ${ws.userId} (${ws.username}) left call`);
    // Broadcast to all other connected clients that this user left the call
    index_1.clients.forEach((client) => {
        if (client.userId !== ws.userId && client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'user_left_call',
                userId: ws.userId,
            }));
        }
    });
};
//# sourceMappingURL=handlers.js.map