"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const middleware_1 = require("../auth/middleware");
const broadcast_1 = require("../websocket/broadcast");
const service_1 = require("./service");
const router = (0, express_1.Router)();
// Get all channels
router.get('/', middleware_1.authenticateToken, (req, res) => {
    try {
        const channels = service_1.channelService.getAllChannels();
        res.json({ success: true, channels });
    }
    catch (error) {
        console.error('Get channels error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch channels',
        });
    }
});
// Create channel
router.post('/', middleware_1.authenticateToken, (req, res) => {
    try {
        const { name, type } = req.body;
        if (!name || !type || !['text', 'voice'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid channel data',
            });
        }
        if (name.length < 1 || name.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Channel name must be between 1 and 50 characters',
            });
        }
        const newChannel = service_1.channelService.createChannel(name, type);
        if (!newChannel) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create channel',
            });
        }
        // Notify all connected clients about new channel
        (0, broadcast_1.broadcastToAll)({
            type: 'channel_created',
            channel: newChannel,
        });
        res.status(201).json({
            success: true,
            channel: newChannel,
        });
    }
    catch (error) {
        console.error('Create channel error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create channel',
        });
    }
});
// Delete channel
router.delete('/:id', middleware_1.authenticateToken, (req, res) => {
    try {
        const channelId = parseInt(req.params.id);
        if (isNaN(channelId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid channel ID',
            });
        }
        const success = service_1.channelService.deleteChannel(channelId);
        if (!success) {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete default channels or channel not found',
            });
        }
        // Notify all connected clients about deleted channel
        (0, broadcast_1.broadcastToAll)({
            type: 'channel_deleted',
            channelId,
        });
        res.json({
            success: true,
            message: 'Channel deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete channel error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete channel',
        });
    }
});
exports.default = router;
//# sourceMappingURL=routes.js.map