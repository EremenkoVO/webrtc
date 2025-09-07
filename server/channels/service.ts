import { db } from '../db';
import { Channel } from '../types';

export const channelService = {
  getAllChannels: (): Channel[] => {
    return db.prepare('SELECT * FROM channels ORDER BY id').all() as Channel[];
  },

  createChannel: (name: string, type: 'text' | 'voice'): Channel | null => {
    try {
      const result = db
        .prepare('INSERT INTO channels (name, type) VALUES (?, ?)')
        .run(name, type);

      return db
        .prepare('SELECT * FROM channels WHERE id = ?')
        .get((result as any).lastInsertRowid) as Channel;
    } catch (error) {
      console.error('Create channel error:', error);
      return null;
    }
  },

  deleteChannel: (channelId: number): boolean => {
    try {
      // Prevent deletion of default channels
      if (channelId <= 2) {
        return false;
      }

      db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);

      const result = db
        .prepare('DELETE FROM channels WHERE id = ?')
        .run(channelId);
      return (result as any).changes > 0;
    } catch (error) {
      console.error('Delete channel error:', error);
      return false;
    }
  },
};
