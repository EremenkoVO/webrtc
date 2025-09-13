import bcrypt from 'bcrypt';
import { Router } from 'express';
import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { config } from '../config/index';
import { UserRow } from '../types';
import { signToken, verifyToken } from './utils';

const router = Router();

// Открываем базу через sqlite (async/await)
let db: Database<sqlite3.Database, sqlite3.Statement>;

(async () => {
  db = await open({
    filename: config.database.filename,
    driver: sqlite3.Database,
  });

  // Создаём таблицу, если ещё нет
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `);
})();

// Registration
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res
        .status(400)
        .json({ success: false, message: 'Username and password required' });
    if (username.length < 3 || username.length > 20)
      return res
        .status(400)
        .json({ success: false, message: 'Username must be 3-20 chars' });
    if (password.length < 6)
      return res
        .status(400)
        .json({ success: false, message: 'Password at least 6 chars' });

    const hash = await bcrypt.hash(password, 10);

    try {
      const result = await db.run(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        username,
        hash,
      );

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        userId: result.lastID,
      });
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res
          .status(400)
          .json({ success: false, message: 'Username already exists' });
      }
      throw err;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res
        .status(400)
        .json({ success: false, message: 'Username and password required' });

    const row = await db.get<UserRow>(
      'SELECT * FROM users WHERE username = ?',
      username,
    );

    if (!row)
      return res
        .status(400)
        .json({ success: false, message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, row.password);
    if (!match)
      return res
        .status(400)
        .json({ success: false, message: 'Invalid credentials' });

    const token = signToken({ id: row.id, username: row.username });

    res.json({
      success: true,
      token,
      user: { id: row.id, username: row.username },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get current user
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ loggedIn: false });

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ loggedIn: false });

  res.json({ loggedIn: true, user: payload });
});

export default router;
