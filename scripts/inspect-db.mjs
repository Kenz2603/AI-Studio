import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'storage', 'studio.db');
const db = new DatabaseSync(dbPath);

console.log('--- TABLES ---');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.table(tables);

console.log('--- AGENTS TABLE INFO ---');
console.table(db.prepare("PRAGMA table_info(agents)").all());

db.close();
