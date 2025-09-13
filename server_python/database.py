import aiosqlite
from typing import Optional, Dict, Any
from config import config

class Database:
    def __init__(self):
        self.db_path = config.DATABASE_FILENAME

    async def init_db(self):
        """Initialize database and create tables"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE,
                    password TEXT
                )
            ''')

            await db.execute('''
                CREATE TABLE IF NOT EXISTS channels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    created_by INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users (id)
                )
            ''')

            await db.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    channel_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (channel_id) REFERENCES channels (id),
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')

            await db.commit()

    async def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Get user by username"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                'SELECT * FROM users WHERE username = ?',
                (username,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def create_user(self, username: str, password_hash: str) -> int:
        """Create new user"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                'INSERT INTO users (username, password) VALUES (?, ?)',
                (username, password_hash)
            )
            await db.commit()
            return cursor.lastrowid

    async def get_channels(self) -> list:
        """Get all channels"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute('''
                SELECT c.*, u.username as creator_username
                FROM channels c
                JOIN users u ON c.created_by = u.id
                ORDER BY c.created_at DESC
            ''')
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def create_channel(self, name: str, created_by: int) -> int:
        """Create new channel"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                'INSERT INTO channels (name, created_by) VALUES (?, ?)',
                (name, created_by)
            )
            await db.commit()
            return cursor.lastrowid

    async def get_messages(self, channel_id: int, limit: int = 100) -> list:
        """Get messages for a channel"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute('''
                SELECT m.*, u.username
                FROM messages m
                JOIN users u ON m.user_id = u.id
                WHERE m.channel_id = ?
                ORDER BY m.created_at DESC
                LIMIT ?
            ''', (channel_id, limit))
            rows = await cursor.fetchall()
            return [dict(row) for row in reversed(rows)]

    async def create_message(self, channel_id: int, user_id: int, content: str) -> int:
        """Create new message"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                'INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)',
                (channel_id, user_id, content)
            )
            await db.commit()
            return cursor.lastrowid

# Global database instance
db = Database()