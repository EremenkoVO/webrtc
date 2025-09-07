"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const middleware_1 = require("../auth/middleware");
const broadcast_1 = require("../websocket/broadcast");
const service_1 = require("./service");
const router = (0, express_1.Router)();
// Get messages for channel
router.get('/:id', middleware_1.authenticateToken, (req, res) => {
    try {
        const channelId = parseInt(req.params.id);
        if (isNaN(channelId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid channel ID',
            });
        }
        const messages = service_1.messageService.getMessagesByChannel(channelId);
        res.json({ success: true, messages });
    }
    catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages',
        });
    }
});
// Create message
router.post('/', middleware_1.authenticateToken, (req, res) => {
    try {
        const { channelId, content } = req.body;
        const userId = req.user?.id;
        if (!channelId || !content || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Channel ID, content, and user ID are required',
            });
        }
        if (content.length > 2000) {
            return res.status(400).json({
                success: false,
                message: 'Message too long (max 2000 characters)',
            });
        }
        const newMessage = service_1.messageService.createMessage(channelId, userId, content);
        if (!newMessage) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create message',
            });
        }
        // Notify all users about new message
        (0, broadcast_1.broadcastToAll)({
            type: 'new_message',
            message: newMessage,
        });
        res.status(201).json({
            success: true,
            message: newMessage,
        });
    }
    catch (error) {
        console.error('Create message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create message',
        });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map