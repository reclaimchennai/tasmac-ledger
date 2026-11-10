import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.TASMAC_DB ?? join(here, '..', '..', 'data', 'tasmac.db');

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const d = new Database(DB_PATH);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  // The harvester and the analytics builder both write; wait out each other's
  // per-day transactions rather than failing on the first SQLITE_BUSY.
  d.pragma('busy_timeout = 30000');
  d.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  _db = d;
  return d;
}

/** Read-only handle for the web app — never migrates, never writes. */
export function readDb(): Database.Database {
  if (_db) return _db;
  const d = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  d.pragma('foreign_keys = ON');
  _db = d;
  return d;
}

export function getMeta(key: string): string | null {
  const r = db().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setMeta(key: string, value: string) {
  db().prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}
