import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const sourcePath = process.env.DATABASE_PATH || '/data/spmt.db';
const backupDirectory = path.join(path.dirname(sourcePath), 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = process.argv[2] || path.join(backupDirectory, `spmt-${stamp}.db`);
const restorePath = path.join(os.tmpdir(), `spmt-restore-rehearsal-${process.pid}.db`);

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
if (fs.existsSync(backupPath)) {
  throw new Error(`Refusing to overwrite existing backup: ${backupPath}`);
}

const source = new Database(sourcePath, { fileMustExist: true });
await source.backup(backupPath);
source.close();

fs.copyFileSync(backupPath, restorePath);
const restored = new Database(restorePath, { readonly: true, fileMustExist: true });
const integrity = String(restored.pragma('quick_check', { simple: true }) || 'unknown').toLowerCase();
const tableCount = restored.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count;
const counts = {
  users: restored.prepare('SELECT COUNT(*) AS count FROM users').get().count,
  messages: restored.prepare('SELECT COUNT(*) AS count FROM messages').get().count,
  notifications: restored.prepare('SELECT COUNT(*) AS count FROM notifications').get().count,
};
restored.close();

const bytes = fs.statSync(backupPath).size;
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
fs.rmSync(restorePath, { force: true });

if (integrity !== 'ok') {
  throw new Error(`Backup restore rehearsal failed integrity check: ${integrity}`);
}

console.log(JSON.stringify({
  status: 'verified',
  source: sourcePath,
  backup: backupPath,
  bytes,
  sha256,
  integrity,
  tableCount,
  counts,
  restoreFixtureRemoved: true,
}));
