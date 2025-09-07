import { Router } from 'express';
import { authenticateToken } from '../auth/middleware';
import { CustomRequest } from '../types';
import { broadcastToAll } from '../websocket/broadcast';
import { channelService } from './service';

const router = Router();

// Get all channels
router.get('/', authenticateToken, (req: CustomRequest, res) => {
  try {
    const channels = channelService.getAllChannels();
    res.json({ success: true, channels });
  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch channels',
    });
  }
});

// Create channel
router.post('/', authenticateToken, (req: CustomRequest, res) => {
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

    const newChannel = channelService.createChannel(
      name,
      type as 'text' | 'voice',
    );

    if (!newChannel) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create channel',
      });
    }

    // Notify all connected clients about new channel
    broadcastToAll({
      type: 'channel_created',
      channel: newChannel,
    });

    res.status(201).json({
      success: true,
      channel: newChannel,
    });
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create channel',
    });
  }
});

// Delete channel
router.delete('/:id', authenticateToken, (req: CustomRequest, res) => {
  try {
    const channelId = parseInt(req.params.id);

    if (isNaN(channelId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid channel ID',
      });
    }

    const success = channelService.deleteChannel(channelId);

    if (!success) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete default channels or channel not found',
      });
    }

    // Notify all connected clients about deleted channel
    broadcastToAll({
      type: 'channel_deleted',
      channelId,
    });

    res.json({
      success: true,
      message: 'Channel deleted successfully',
    });
  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete channel',
    });
  }
});

export default router;
