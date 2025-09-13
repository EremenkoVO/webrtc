import sqlite3 from 'sqlite3';
import { config } from '../config/index';
import { createTables } from './schema';

export const db = new sqlite3.Database(config.database.filename);

// Initialize database
try {
  createTables(db);
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Database initialization error:', error);
  process.exit(1);
}
