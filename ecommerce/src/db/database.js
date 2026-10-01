import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations, LATEST_SCHEMA_VERSION } from './migrations.js';

let connection;

export function openDatabase(config, { applySchema = true } = {}) {
  if (connection) return connection;
  if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  if (applySchema) migrateDatabase(db);
  connection = db;
  return db;
}

export function getDatabase() {
  if (!connection) throw new Error('La base de datos no está inicializada.');
  return connection;
}

export function migrateDatabase(db = getDatabase()) {
  const current = Number(db.pragma('user_version', { simple: true }));
  if (current > LATEST_SCHEMA_VERSION) throw new Error(`Base de datos versión ${current}: el código sólo sabe aplicar hasta la versión ${LATEST_SCHEMA_VERSION}.`);
  if (current === 0) applyInitialSchema(db);
  ensureMinimumSchema(db);
  const migrated = runMigrations(db);
  return { from: current, to: migrated.to };
}

function applyInitialSchema(db) {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
  if (!fs.existsSync(schemaPath)) throw new Error(`No se encontró el esquema baseline: ${schemaPath}`);
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(schema).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(schema);
    db.prepare(`
      INSERT INTO schema_migrations (version, name, checksum)
      VALUES (1, 'baseline', ?)
    `).run(checksum);
    db.pragma('user_version = 1');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function ensureMinimumSchema(db) {
  const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!hasTable) applyInitialSchema(db);
}

export function transaction(work, { immediate = true } = {}) {
  const db = getDatabase();
  const wrapped = db.transaction(immediate ? work : () => work(db));
  return wrapped();
}

export function closeDatabase() {
  if (!connection) return;
  connection.close();
  connection = undefined;
}
