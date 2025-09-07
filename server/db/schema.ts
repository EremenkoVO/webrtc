export const createTables = (db: any) => {
  // Create users table
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  ).run();

  // Create channels table
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('text', 'voice')) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  ).run();

  // Create messages table
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `,
  ).run();

  // Insert default channels if they don't exist
  const existingChannels = db
    .prepare('SELECT COUNT(*) as count FROM channels')
    .get() as { count: number };
  if (existingChannels.count === 0) {
    db.prepare('INSERT INTO channels (name, type) VALUES (?, ?)').run(
      'general',
      'text',
    );
    db.prepare('INSERT INTO channels (name, type) VALUES (?, ?)').run(
      'voice-chat',
      'voice',
    );
  }
};
