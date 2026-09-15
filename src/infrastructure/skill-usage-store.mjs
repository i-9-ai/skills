import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sql = `CREATE TABLE usage_reads (event_id TEXT PRIMARY KEY, collection TEXT NOT NULL, skill TEXT NOT NULL, revision TEXT NOT NULL, session TEXT NOT NULL, occurred_at TEXT NOT NULL);
CREATE INDEX usage_period ON usage_reads(occurred_at, collection, skill);`;
const checksum = createHash('sha256').update(sql).digest('hex');
const keys = ['event_id', 'collection', 'skill', 'revision', 'session', 'occurred_at'];
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Expected canonical UTC timestamp');
  return value;
}
export function openUsageStore(filename) {
  if (!path.isAbsolute(filename)) throw new Error('Database path must be absolute');
  const parent = fs.realpathSync(path.dirname(filename));
  if (parent !== path.dirname(filename)) throw new Error('Database parent must be canonical');
  if (fs.existsSync(filename) && (!fs.lstatSync(filename).isFile() || fs.lstatSync(filename).isSymbolicLink())) throw new Error('Expected regular database file');
  const fresh = !fs.existsSync(filename);
  if (fresh) {
    try { fs.closeSync(fs.openSync(filename, 'wx', 0o600)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!fs.lstatSync(filename).isFile() || fs.lstatSync(filename).isSymbolicLink()) throw new Error('Expected regular database file');
  }
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x => x.name);
    if (tables.some(name => !['usage_migrations', 'usage_reads'].includes(name))) throw new Error('Dedicated usage database required; catalog databases are not supported');
    db.exec('CREATE TABLE IF NOT EXISTS usage_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)');
    const migrations = db.prepare('SELECT * FROM usage_migrations ORDER BY version').all();
    if (!migrations.length) {
      if (tables.includes('usage_reads')) throw new Error('Untracked usage schema');
      db.exec(sql);
      db.prepare('INSERT INTO usage_migrations VALUES(1, ?)').run(checksum);
    } else if (migrations.length !== 1 || migrations[0].version !== 1 || migrations[0].checksum !== checksum) throw new Error('Unsupported or altered usage migration');
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} db.close(); throw error; }
  return {
    close: () => db.close(),
    record(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Expected only the documented read event fields');
      for (const key of keys.filter(k => k !== 'occurred_at')) if (typeof value[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value[key])) throw new Error('Expected bounded logical identifiers');
      timestamp(value.occurred_at);
      db.exec('BEGIN IMMEDIATE');
      try {
        const old = db.prepare('SELECT * FROM usage_reads WHERE event_id=?').get(value.event_id);
        if (old && keys.some(key => old[key] !== value[key])) throw new Error('Event ID already has different evidence');
        if (!old) db.prepare('INSERT INTO usage_reads VALUES (?, ?, ?, ?, ?, ?)').run(...keys.map(k => value[k]));
        db.exec('COMMIT');
        return { recorded: !old, event_type: 'read' };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    rank(value = {}) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['from', 'until', 'limit'].includes(k))) throw new Error('Unknown ranking fields');
      const from = timestamp(value.from ?? '1970-01-01T00:00:00.000Z');
      const until = timestamp(value.until ?? '9999-12-31T23:59:59.999Z');
      const limit = value.limit ?? 20;
      if (from >= until || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid ranking period or limit');
      return { event_type: 'read', from, until, rows: db.prepare('SELECT collection, skill, COUNT(*) AS reads, COUNT(DISTINCT session) AS sessions FROM usage_reads WHERE occurred_at>=? AND occurred_at<? GROUP BY collection,skill ORDER BY reads DESC,collection,skill LIMIT ?').all(from, until, limit) };
    }
  };
}
