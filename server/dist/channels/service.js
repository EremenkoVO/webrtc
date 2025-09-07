"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.channelService = void 0;
const db_1 = require("../db");
exports.channelService = {
    getAllChannels: () => {
        return db_1.db.prepare('SELECT * FROM channels ORDER BY id').all();
    },
    createChannel: (name, type) => {
        try {
            const result = db_1.db
                .prepare('INSERT INTO channels (name, type) VALUES (?, ?)')
                .run(name, type);
            return db_1.db
                .prepare('SELECT * FROM channels WHERE id = ?')
                .get(result.lastInsertRowid);
        }
        catch (error) {
            console.error('Create channel error:', error);
            return null;
        }
    },
    deleteChannel: (channelId) => {
        try {
            // Prevent deletion of default channels
            if (channelId <= 2) {
                return false;
            }
            db_1.db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
            const result = db_1.db
                .prepare('DELETE FROM channels WHERE id = ?')
                .run(channelId);
            return result.changes > 0;
        }
        catch (error) {
            console.error('Delete channel error:', error);
            return false;
        }
    },
};
//# sourceMappingURL=service.js.map