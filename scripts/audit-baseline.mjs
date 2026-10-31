import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const dbPath = path.resolve('storage', 'studio.db');
const db = new DatabaseSync(dbPath);
const schemaVer = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get()?.v;
const migrations = db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC').all();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
const integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check;
const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
db.close();

// Filesystem and storage stats
const dbStat = fs.existsSync(dbPath) ? fs.statSync(dbPath) : { size: 0 };
const walPath = `${dbPath}-wal`;
const walStat = fs.existsSync(walPath) ? fs.statSync(walPath) : { size: 0 };

const calculateDirSize = (dir) => {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += calculateDirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
};

const artifactSize = calculateDirSize(path.resolve('storage', 'collaboration_artifacts'));
const backupsSize = calculateDirSize(path.resolve('storage', 'backups'));

const statfs = fs.statfsSync(path.parse(process.cwd()).root);
const diskTotal = statfs.blocks * statfs.bsize;
const diskFree = statfs.bfree * statfs.bsize;

console.log(JSON.stringify({
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  schemaVersion: schemaVer,
  migrationCount: migrations.length,
  tableCount: tables.length,
  tables,
  integrity,
  fkViolations: fkCheck.length,
  sqliteDbSizeBytes: dbStat.size,
  sqliteWalSizeBytes: walStat.size,
  artifactSizeBytes: artifactSize,
  backupsSizeBytes: backupsSize,
  diskTotalBytes: diskTotal,
  diskFreeBytes: diskFree,
  diskFreeGb: (diskFree / (1024 * 1024 * 1024)).toFixed(2)
}, null, 2));

