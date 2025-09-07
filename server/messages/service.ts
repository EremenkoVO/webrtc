import { db } from '../db';
import { Message } from '../types';

export const messageService = {
  getMessagesByChannel: (channelId: number): Message[] => {
    return db
      .prepare(
        `
      SELECT m.*, u.username
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC
      LIMIT 50
    `,
      )
      .all(channelId) as Message[];
  },

  createMessage: (
    channelId: number,
    userId: number,
    content: string,
  ): Message | null => {
    try {
      const result = db
        .prepare(
          'INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)',
        )
        .run(channelId, userId, content);

      return db
        .prepare(
          `
        SELECT m.*, u.username
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.id = ?
      `,
        )
        .get((result as any).lastInsertRowid) as Message;
    } catch (error) {
      console.error('Create message error:', error);
      return null;
    }
  },
};
