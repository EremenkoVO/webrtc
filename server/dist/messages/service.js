"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageService = void 0;
const db_1 = require("../db");
exports.messageService = {
    getMessagesByChannel: (channelId) => {
        return db_1.db
            .prepare(`
      SELECT m.*, u.username
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC
      LIMIT 50
    `)
            .all(channelId);
    },
    createMessage: (channelId, userId, content) => {
        try {
            const result = db_1.db
                .prepare('INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)')
                .run(channelId, userId, content);
            return db_1.db
                .prepare(`
        SELECT m.*, u.username
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.id = ?
      `)
                .get(result.lastInsertRowid);
        }
        catch (error) {
            console.error('Create message error:', error);
            return null;
        }
    },
};
//# sourceMappingURL=service.js.map