import sqlite3 from 'sqlite3';
import { config } from '../config/index';
import { Message } from '../types';

// открываем базу
const db = new sqlite3.Database(config.database.filename);

// Async-обёртки для методов
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
      resolve(row as T | undefined);
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

// Message Service
export const messageService = {
  getMessagesByChannel: async (channelId: number): Promise<Message[]> => {
    const rows = await allAsync<Message>(
      `
      SELECT m.*, u.username
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC
      LIMIT 50
      `,
      channelId,
    );
    return rows;
  },

  createMessage: async (
    channelId: number,
    userId: number,
    content: string,
  ): Promise<Message | null> => {
    try {
      const result = await runAsync(
        'INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)',
        channelId,
        userId,
        content,
      );

      const message = await getAsync<Message>(
        `
        SELECT m.*, u.username
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.id = ?
        `,
        result.lastID,
      );

      return message ?? null; // если undefined → вернём null
    } catch (error) {
      console.error('Create message error:', error);
      return null;
    }
  },
};
