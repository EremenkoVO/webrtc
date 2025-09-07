"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const express_1 = require("express");
const db_1 = require("../db");
const utils_1 = require("./utils");
const router = (0, express_1.Router)();
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
        const hash = await bcrypt_1.default.hash(password, 10);
        const result = db_1.db
            .prepare('INSERT INTO users (username, password) VALUES (?, ?)')
            .run(username, hash);
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            userId: result.lastInsertRowid,
        });
    }
    catch (error) {
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
        const row = db_1.db
            .prepare('SELECT * FROM users WHERE username = ?')
            .get(username);
        if (!row) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credentials',
            });
        }
        const match = await bcrypt_1.default.compare(password, row.password);
        if (!match) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credentials',
            });
        }
        const token = (0, utils_1.signToken)({ id: row.id, username: row.username });
        res.json({
            success: true,
            token,
            user: { id: row.id, username: row.username },
        });
    }
    catch (error) {
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
    const payload = (0, utils_1.verifyToken)(token);
    if (!payload) {
        return res.status(401).json({ loggedIn: false });
    }
    res.json({
        loggedIn: true,
        user: payload,
    });
});
exports.default = router;
//# sourceMappingURL=routes.js.map