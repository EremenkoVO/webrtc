import bcrypt from 'bcrypt';
import { Router } from 'express';
import { db } from '../db';
import { UserRow } from '../types';
import { signToken, verifyToken } from './utils';

const router = Router();

// Registration endpoint
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        success: false,
        message: 'Username must be between 3 and 20 characters',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = db
      .prepare('INSERT INTO users (username, password) VALUES (?, ?)')
      .run(username, hash);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      userId: (result as any).lastInsertRowid,
    });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({
        success: false,
        message: 'Username already exists',
      });
    }

    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    const row = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;

    if (!row) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const match = await bcrypt.compare(password, row.password);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = signToken({ id: row.id, username: row.username });

    res.json({
      success: true,
      token,
      user: { id: row.id, username: row.username },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

// Get current user
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ loggedIn: false });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ loggedIn: false });
  }

  res.json({
    loggedIn: true,
    user: payload,
  });
});

export default router;
