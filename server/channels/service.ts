import sqlite3 from 'sqlite3';
import { config } from '../config/index';
import { Channel } from '../types';

// открываем базу
const db = new sqlite3.Database(config.database.filename);

// Обёртки для async/await
function runAsync(
  sql: string,
  ...params: any[]
): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getAsync<T = any>(
  sql: string,
  ...params: any[]
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row as T);
    });
  });
}

function allAsync<T = any>(sql: string, ...params: any[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows as T[]);
    });
  });
}

// Сервис каналов
export const channelService = {
  getAllChannels: async (): Promise<Channel[]> => {
    return allAsync<Channel>('SELECT * FROM channels ORDER BY id');
  },

  createChannel: async (
    name: string,
    type: 'text' | 'voice',
  ): Promise<Channel | null> => {
    try {
      const result = await runAsync(
        'INSERT INTO channels (name, type) VALUES (?, ?)',
        name,
        type,
      );
      const channel = await getAsync<Channel>(
        'SELECT * FROM channels WHERE id = ?',
        result.lastID,
      );
      return channel ?? null; // если undefined → вернём null
    } catch (error) {
      console.error('Create channel error:', error);
      return null;
    }
  },

  deleteChannel: async (channelId: number): Promise<boolean> => {
    try {
      if (channelId <= 2) return false; // защита от удаления дефолтных каналов

      await runAsync('DELETE FROM messages WHERE channel_id = ?', channelId);
      const result = await runAsync(
        'DELETE FROM channels WHERE id = ?',
        channelId,
      );
      return result.changes > 0;
    } catch (error) {
      console.error('Delete channel error:', error);
      return false;
    }
  },
};
