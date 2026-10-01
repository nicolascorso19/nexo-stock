import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { seedDatabase } from './seed.js';
import { migrateDatabase } from './migrations.js';
import { nowIso } from '../utils.js';

const schemaPath = fileURLToPath(new URL('../../db/schema.sql', import.meta.url));

export function createDatabase(databasePath, options = {}) {
  if (!databasePath) throw new Error('createDatabase() requiere una ruta de base de datos.');
  const { seed = false, readonly = false, fileMustExist = false, bootstrap = true } = options;

  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }

  const db = new Database(databasePath, { readonly, fileMustExist });
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  if (!readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }

  if (!readonly) {
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
    migrateDatabase(db);
    if (seed) seedDatabase(db);
    else if (bootstrap) bootstrapSystemMetadata(db);
  }

  return db;
}

function bootstrapSystemMetadata(db) {
  const now = nowIso();
  const roleCount = db.prepare('SELECT COUNT(*) AS count FROM roles').get().count;
  if (roleCount === 0) {
    const insertRole = db.prepare('INSERT INTO roles (id, name, permissions_json, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)');
    insertRole.run('admin', 'Administrador', JSON.stringify(['*']), now, now);
    insertRole.run('seller', 'Vendedor', JSON.stringify(['bootstrap:read', 'product:read', 'sale:read', 'sale:create', 'customer:read', 'customer:create', 'reservation:read', 'reservation:manage']), now, now);
    insertRole.run('inventory', 'Inventario', JSON.stringify(['bootstrap:read', 'product:read', 'product:write', 'product:archive', 'stock:adjust', 'purchase:read', 'purchase:create', 'supplier:read', 'supplier:create', 'reservation:read', 'reservation:manage']), now, now);
  }
  const defaults = {
    businessName: 'NEXO', locationName: 'Córdoba Capital', currency: 'USD', locale: 'es-AR',
    valuationMethod: 'AVERAGE', minMargin: 0, defaultMinStock: 1, lastUnitThreshold: 1,
    allowNegativeStock: false, taxRate: 0, logoText: 'N', lowStockNotifications: true,
    publicShowApplePrice: false
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)');
  for (const [key, value] of Object.entries(defaults)) insertSetting.run(key, JSON.stringify(value), now);
}

export function databaseHealth(db) {
  const result = db.prepare('SELECT 1 AS ok').get();
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  return result?.ok === 1 && foreignKeys === 1;
}

export function closeDatabase(db) {
  if (db?.open) db.close();
}
