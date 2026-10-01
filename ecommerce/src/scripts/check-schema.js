/**
 * Comprobación de la base del e-commerce.
 *
 * `npm run db:verify` informa el esquema, las migraciones aplicadas y el
 * resultado de las integridad y claves foráneas. Es de sólo lectura: sirve
 * para confirmar que un despliegue quedó bien antes de abrir la tienda.
 */
import fs from 'node:fs';
import { getConfig } from '../config.js';
import { openDatabase, closeDatabase } from '../db/database.js';
import { LATEST_SCHEMA_VERSION } from '../db/migrations.js';

const config = getConfig();
if (!fs.existsSync(config.dbPath)) {
  console.error(`La base no existe: ${config.dbPath}`);
  process.exit(1);
}

const db = openDatabase(config);
const version = Number(db.pragma('user_version', { simple: true }));
const migrations = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
const integrity = db.pragma('integrity_check', { simple: true });
const foreignKeys = db.pragma('foreign_key_check');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);

// El e-commerce no debe tener su propia copia del inventario: el stock vive
// únicamente en el sistema privado.
const stockTables = ['products', 'product_variants', 'inventory', 'inventory_units', 'purchases', 'suppliers', 'imeis'];
const leaked = stockTables.filter((name) => tables.includes(name));

console.log(`Base:            ${config.dbPath}`);
console.log(`Esquema:         v${version} (el código aplica hasta v${LATEST_SCHEMA_VERSION})`);
console.log(`Migraciones:     ${migrations.map((row) => `v${row.version} ${row.name}`).join(', ') || 'ninguna'}`);
console.log(`Tablas:          ${tables.length}`);
console.log(`Integridad:      ${integrity}`);
console.log(`Claves foráneas: ${foreignKeys.length ? JSON.stringify(foreignKeys) : 'ok'}`);
console.log(`Stock duplicado: ${leaked.length ? leaked.join(', ') : 'ninguno'}`);

const problems = [];
if (version < LATEST_SCHEMA_VERSION) problems.push(`el esquema está en v${version} y el código espera v${LATEST_SCHEMA_VERSION}`);
if (integrity !== 'ok') problems.push('la integridad de la base no es correcta');
if (foreignKeys.length) problems.push('hay claves foráneas rotas');
if (leaked.length) problems.push(`el e-commerce tiene tablas de stock propias: ${leaked.join(', ')}`);

closeDatabase();

if (problems.length) {
  console.error(`\nProblemas: ${problems.join('; ')}`);
  process.exit(1);
}
console.log('\nTodo correcto.');
