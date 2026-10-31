import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'storage', 'studio.db');
const db = new DatabaseSync(dbPath);

try {
  db.exec("ALTER TABLE accounts ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free'");
  console.log('Successfully added subscription_tier column to accounts table.');
} catch (err) {
  console.log('Column note:', err.message);
}

console.log('\n--- ACCOUNTS TABLE SCHEMA ---');
console.table(db.prepare('PRAGMA table_info(accounts)').all());

db.close();
