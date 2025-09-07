import { Router } from 'express';
import { authenticateToken } from '../auth/middleware';
import { CustomRequest } from '../types';
import { broadcastToAll } from '../websocket/broadcast';
import { messageService } from './service';

const router = Router();

// Get messages for channel
router.get('/:id', authenticateToken, (req: CustomRequest, res) => {
  try {
    const channelId = parseInt(req.params.id);

    if (isNaN(channelId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid channel ID',
      });
    }

    const messages = messageService.getMessagesByChannel(channelId);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
    });
  }
});

// Create message
router.post('/', authenticateToken, (req: CustomRequest, res) => {
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

    const newMessage = messageService.createMessage(channelId, userId, content);

    if (!newMessage) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create message',
      });
    }

    // Notify all users about new message
    broadcastToAll({
      type: 'new_message',
      message: newMessage,
    });

    res.status(201).json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create message',
    });
  }
});

export default router;
