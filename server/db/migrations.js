import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nowIso } from '../utils.js';

const schemaSql = fs.readFileSync(fileURLToPath(new URL('../../db/schema.sql', import.meta.url)), 'utf8');

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
}

function hasTable(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function addColumn(db, table, definition) {
  const column = definition.trim().split(/\s+/)[0];
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function tableDefinition(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = schemaSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${escaped} \\([\\s\\S]*?\\n\\);`));
  if (!match) throw new Error(`No se encontró la definición de ${name} en schema.sql.`);
  return match[0];
}

function columnExpression(db, table, column, fallback) {
  return hasColumn(db, table, column) ? `COALESCE(${column}, ${fallback})` : fallback;
}

function rebuildTable(db, table, expressions) {
  const temporary = `${table}__v3_rebuild`;
  const definition = tableDefinition(table).replace(`CREATE TABLE IF NOT EXISTS ${table}`, `CREATE TABLE IF NOT EXISTS ${temporary}`);
  db.exec(`DROP TABLE IF EXISTS ${temporary}`);
  db.exec(definition);
  const columns = expressions.map(item => item.column);
  db.exec(`INSERT INTO ${temporary} (${columns.join(', ')}) SELECT ${expressions.map(item => item.expression).join(', ')} FROM ${table}`);
  db.exec(`DROP TABLE ${table}`);
  db.exec(`ALTER TABLE ${temporary} RENAME TO ${table}`);
}

function addIndexIfMissing(db, name, sql) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(name);
  if (!exists) db.exec(sql);
}

/**
 * Las instalaciones v1 tenían checks que obligaban a registrar precios y
 * costos mayores que cero. SQLite no puede eliminar esos checks con ALTER
 * TABLE, por lo que se reconstruyen las tablas afectadas conservando sus
 * datos antes de continuar con las columnas nuevas.
 */
function repairLegacyChecks(db) {
  const variantSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'product_variants'").get()?.sql || '';
  const unitSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inventory_units'").get()?.sql || '';
  const inventorySql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inventory'").get()?.sql || '';
  const needsVariants = /sale_price\s+NUMERIC\s+NOT NULL\s+CHECK\s*\(sale_price\s*>\s*0\)/i.test(variantSql);
  const needsUnits = /sale_price\s+NUMERIC\s+CHECK/i.test(unitSql);
  const needsInventory = !/reserved_quantity\s*>=\s*0\s+AND\s+reserved_quantity\s*<=\s*quantity/i.test(inventorySql);
  if (!needsVariants && !needsUnits && !needsInventory) return false;

  const previousForeignKeys = Number(db.pragma('foreign_keys', { simple: true })) === 1;
  if (previousForeignKeys) db.pragma('foreign_keys = OFF');
  try {
    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all();
    for (const trigger of triggers) db.exec(`DROP TRIGGER IF EXISTS ${trigger.name}`);
    db.transaction(() => {
      if (needsVariants) {
        const columns = [
          'id', 'product_id', 'capacity_id', 'color_id', 'variant_name', 'sku', 'barcode', 'ram',
          'condition', 'physical_state', 'requires_imei', 'cost', 'cost_registered', 'sale_price',
          'sale_price_registered', 'promo_price', 'apple_official_price_usd', 'apple_price_source',
          'apple_price_updated_at', 'apple_price_updated_by', 'min_stock', 'supplier_id', 'location_id',
          'purchase_date', 'warranty', 'notes', 'published', 'public_images_json', 'previous_price',
          'promo_starts_at', 'promo_ends_at', 'active', 'is_fictional', 'created_at', 'updated_at'
        ];
        rebuildTable(db, 'product_variants', columns.map(column => ({
          column,
          expression: column === 'cost_registered'
            ? `CASE WHEN COALESCE(cost, 0) > 0 THEN 1 ELSE ${columnExpression(db, 'product_variants', column, '0')} END`
            : column === 'sale_price_registered'
              ? `CASE WHEN COALESCE(sale_price, 0) > 0 THEN 1 ELSE ${columnExpression(db, 'product_variants', column, '0')} END`
              : column === 'sale_price'
                ? columnExpression(db, 'product_variants', column, '0')
                : column === 'public_images_json'
                  ? columnExpression(db, 'product_variants', column, "'[]'")
                  : ['published', 'is_fictional'].includes(column)
                    ? columnExpression(db, 'product_variants', column, '0')
                    : column === 'active'
                      ? columnExpression(db, 'product_variants', column, '1')
                      : column === 'created_at' || column === 'updated_at'
                        ? columnExpression(db, 'product_variants', column, 'CURRENT_TIMESTAMP')
                        : columnExpression(db, 'product_variants', column, 'NULL')
        })));
      }
      if (needsUnits) {
        const columns = [
          'id', 'variant_id', 'purchase_item_id', 'imei', 'imei_2', 'serial_number', 'unit_status',
          'condition', 'physical_state', 'cost', 'cost_registered', 'sale_price', 'sale_price_registered',
          'entry_date', 'supplier_id', 'location_id', 'notes', 'is_fictional', 'created_at', 'updated_at'
        ];
        rebuildTable(db, 'inventory_units', columns.map(column => ({
          column,
          expression: column === 'cost_registered'
            ? `CASE WHEN COALESCE(cost, 0) > 0 THEN 1 ELSE ${columnExpression(db, 'inventory_units', column, '0')} END`
            : column === 'sale_price_registered'
              ? `CASE WHEN COALESCE(sale_price, 0) > 0 THEN 1 ELSE ${columnExpression(db, 'inventory_units', column, '0')} END`
              : column === 'sale_price'
                ? columnExpression(db, 'inventory_units', column, '0')
                : ['cost', 'cost_registered', 'sale_price_registered', 'is_fictional'].includes(column)
                  ? columnExpression(db, 'inventory_units', column, '0')
                  : column === 'unit_status'
                    ? columnExpression(db, 'inventory_units', column, "'AVAILABLE'")
                    : column === 'entry_date'
                      ? columnExpression(db, 'inventory_units', column, 'CURRENT_DATE')
                      : column === 'created_at' || column === 'updated_at'
                        ? columnExpression(db, 'inventory_units', column, 'CURRENT_TIMESTAMP')
                        : columnExpression(db, 'inventory_units', column, 'NULL')
        })));
      }
      if (needsInventory) {
        const columns = ['variant_id', 'quantity', 'reserved_quantity', 'updated_at'];
        rebuildTable(db, 'inventory', columns.map(column => ({
          column,
          expression: column === 'reserved_quantity'
            ? `MIN(COALESCE(quantity, 0), COALESCE(${columnExpression(db, 'inventory', column, '0')}, 0))`
            : column === 'quantity'
              ? columnExpression(db, 'inventory', column, '0')
              : columnExpression(db, 'inventory', column, 'CURRENT_TIMESTAMP')
        })));
      }
    }).immediate();
    // Recrea índices y triggers definidos por el esquema actual.
    db.exec(schemaSql);
  } finally {
    if (previousForeignKeys) db.pragma('foreign_keys = ON');
  }
  return true;
}

/**
 * La base v1 sólo conservaba precio/costo y no tenía estados de venta,
 * devoluciones, precios de referencia ni auditoría de errores. Esta migración
 * agrega las columnas sin borrar datos. Las instalaciones nuevas nacen con
 * schema.sql v3; una base legacy conserva sus operaciones y debe respaldarse
 * antes de una migración destructiva.
 */
export function migrateDatabase(db) {
  repairLegacyChecks(db);
  const version = Number(db.pragma('user_version', { simple: true }) || 0);
  const requiredColumns = {
    product_models: ['availability_status'],
    customers: ['first_name'],
    product_variants: ['cost_registered', 'sale_price_registered', 'apple_official_price_usd', 'published'],
    products: ['published', 'public_slug'],
    inventory: ['reserved_quantity'],
    inventory_units: ['cost_registered', 'sale_price_registered'],
    sales: ['profit_known', 'status', 'annul_reason'],
    sale_items: ['cost_registered']
  };
  const missing = Object.entries(requiredColumns).some(([table, columns]) => columns.some(column => !hasColumn(db, table, column)));
  const commerceTables = ['service_clients', 'commerce_nonces', 'commerce_holds', 'commerce_hold_items', 'commerce_events', 'commerce_hold_events'];
  if (version >= 3 && !missing && commerceTables.every(table => hasTable(db, table))) return { from: version, to: 3, changed: false };

  addColumn(db, 'product_models', "availability_status TEXT NOT NULL DEFAULT 'CURRENT'");
  addColumn(db, 'product_models', 'official_url TEXT');
  addColumn(db, 'customers', 'first_name TEXT');
  addColumn(db, 'customers', 'last_name TEXT');
  addColumn(db, 'product_variants', 'cost_registered INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'product_variants', 'sale_price_registered INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'product_variants', 'apple_official_price_usd NUMERIC');
  addColumn(db, 'product_variants', 'apple_price_source TEXT');
  addColumn(db, 'product_variants', 'apple_price_updated_at TEXT');
  addColumn(db, 'product_variants', 'apple_price_updated_by TEXT REFERENCES users(id) ON DELETE SET NULL');
  addColumn(db, 'inventory_units', 'cost_registered INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'inventory_units', 'sale_price_registered INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'sales', 'profit_known INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'sales', "status TEXT NOT NULL DEFAULT 'ACTIVE'");
  addColumn(db, 'sales', 'annul_reason TEXT');
  addColumn(db, 'sales', 'annulled_at TEXT');
  addColumn(db, 'sales', 'annulled_by TEXT REFERENCES users(id) ON DELETE SET NULL');
  addColumn(db, 'sale_items', 'cost_registered INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'products', 'public_slug TEXT');
  addColumn(db, 'products', 'public_description TEXT');
  addColumn(db, 'products', "public_images_json TEXT NOT NULL DEFAULT '[]'");
  addColumn(db, 'products', "public_highlights_json TEXT NOT NULL DEFAULT '[]'");
  addColumn(db, 'products', "public_specs_json TEXT NOT NULL DEFAULT '{}'");
  addColumn(db, 'products', 'published INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'products', 'is_trending INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'products', 'published_at TEXT');
  addColumn(db, 'product_variants', 'published INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'product_variants', "public_images_json TEXT NOT NULL DEFAULT '[]'");
  addColumn(db, 'product_variants', 'previous_price NUMERIC');
  addColumn(db, 'product_variants', 'promo_starts_at TEXT');
  addColumn(db, 'product_variants', 'promo_ends_at TEXT');
  addColumn(db, 'inventory', 'reserved_quantity INTEGER NOT NULL DEFAULT 0');

  const now = nowIso();
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_clients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, key_id TEXT NOT NULL UNIQUE,
      secret_hash TEXT NOT NULL, scopes_json TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commerce_nonces (
      client_id TEXT NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
      nonce TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY (client_id, nonce)
    );
    CREATE TABLE IF NOT EXISTS commerce_holds (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES service_clients(id) ON DELETE RESTRICT,
      external_order_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CONFIRMING','CONFIRMED','RELEASED','EXPIRED','FAILED')),
      idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
      subtotal NUMERIC NOT NULL CHECK (subtotal >= 0), discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0), total NUMERIC NOT NULL CHECK (total > 0),
      expires_at TEXT NOT NULL, confirmed_sale_id TEXT REFERENCES sales(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (client_id, idempotency_key), UNIQUE (client_id, external_order_id)
    );
    CREATE TABLE IF NOT EXISTS commerce_hold_items (
      id TEXT PRIMARY KEY, hold_id TEXT NOT NULL REFERENCES commerce_holds(id) ON DELETE CASCADE,
      variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT, quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_id TEXT REFERENCES inventory_units(id) ON DELETE RESTRICT, unit_price NUMERIC NOT NULL CHECK (unit_price > 0),
      line_total NUMERIC NOT NULL CHECK (line_total >= 0), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commerce_events (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, payload_json TEXT NOT NULL,
      delivered_at TEXT, attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0), next_attempt_at TEXT, last_error TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commerce_hold_events (
      id TEXT PRIMARY KEY, hold_id TEXT NOT NULL REFERENCES commerce_holds(id) ON DELETE CASCADE,
      operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT, created_at TEXT NOT NULL,
      UNIQUE (hold_id, operation)
    );
    CREATE INDEX IF NOT EXISTS idx_commerce_holds_expiry ON commerce_holds(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_commerce_hold_items_variant ON commerce_hold_items(variant_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_events_delivery ON commerce_events(delivered_at, next_attempt_at);
  `);
  db.prepare('UPDATE product_models SET availability_status = COALESCE(NULLIF(availability_status, \'\'), \'CURRENT\') WHERE availability_status IS NULL OR trim(availability_status) = \'\'').run();
  db.prepare('UPDATE product_variants SET cost_registered = CASE WHEN cost > 0 THEN 1 ELSE cost_registered END').run();
  db.prepare('UPDATE product_variants SET sale_price_registered = CASE WHEN sale_price > 0 THEN 1 ELSE sale_price_registered END').run();
  db.prepare('UPDATE inventory_units SET cost_registered = CASE WHEN cost > 0 THEN 1 ELSE cost_registered END').run();
  db.prepare('UPDATE inventory_units SET sale_price_registered = CASE WHEN sale_price > 0 THEN 1 ELSE sale_price_registered END').run();
  db.prepare('UPDATE sale_items SET cost_registered = CASE WHEN unit_cost > 0 THEN 1 ELSE cost_registered END').run();
  db.prepare("UPDATE sales SET status = 'ACTIVE' WHERE status IS NULL OR trim(status) = ''").run();
  db.prepare('UPDATE sales SET profit_known = CASE WHEN cost_total > 0 OR profit_total <> 0 THEN 1 ELSE profit_known END').run();
  db.prepare("UPDATE product_variants SET apple_price_updated_at = ? WHERE apple_price_updated_at IS NULL AND apple_official_price_usd IS NOT NULL").run(now);
  db.prepare(`UPDATE inventory SET reserved_quantity = MIN(quantity, COALESCE((SELECT COUNT(*) FROM inventory_units iu WHERE iu.variant_id = inventory.variant_id AND iu.unit_status = 'RESERVED'), 0))`).run();

  addIndexIfMissing(db, 'idx_customers_tax_id', "CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tax_id ON customers(REPLACE(REPLACE(REPLACE(trim(COALESCE(tax_id, '')), '.', ''), '-', ''), ' ', '')) WHERE tax_id IS NOT NULL AND trim(tax_id) <> ''");
  addIndexIfMissing(db, 'idx_error_logs_date', 'CREATE INDEX IF NOT EXISTS idx_error_logs_date ON error_logs(created_at DESC)');
  addIndexIfMissing(db, 'idx_returns_sale', 'CREATE INDEX IF NOT EXISTS idx_returns_sale ON sale_returns(sale_id, return_date DESC)');
  addIndexIfMissing(db, 'idx_return_items_sale_item', 'CREATE INDEX IF NOT EXISTS idx_return_items_sale_item ON sale_return_items(sale_item_id)');

  db.pragma('user_version = 3');
  return { from: version, to: 3, changed: true };
}
