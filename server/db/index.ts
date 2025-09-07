import Database from 'better-sqlite3';
import { config } from '../config/index';
import { createTables } from './schema';

export const db: Database.Database = new Database(config.database.filename);

// Initialize database
try {
  createTables(db);
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Database initialization error:', error);
  process.exit(1);
}
