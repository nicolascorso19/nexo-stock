import crypto from 'node:crypto';

const migrations = [
  {
    version: 2,
    name: 'commerce-extensions',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS customer_addresses (
          id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          label TEXT NOT NULL DEFAULT 'Principal', street TEXT NOT NULL, number TEXT NOT NULL, floor TEXT NOT NULL DEFAULT '', apartment TEXT NOT NULL DEFAULT '',
          locality TEXT NOT NULL, province TEXT NOT NULL, postal_code TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id, is_default DESC);
        CREATE TABLE IF NOT EXISTS merchandising_products (
          inventory_product_id TEXT PRIMARY KEY, featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)), trending INTEGER NOT NULL DEFAULT 0 CHECK (trending IN (0,1)),
          sort_order INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ) STRICT;
        CREATE TABLE IF NOT EXISTS error_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT, level TEXT NOT NULL CHECK (level IN ('WARN','ERROR','FATAL')), code TEXT, message TEXT NOT NULL,
          method TEXT, path TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
      `);
    }
  },
  {
    version: 3,
    name: 'error-logs',
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT, level TEXT NOT NULL CHECK (level IN ('WARN','ERROR','FATAL')), code TEXT, message TEXT NOT NULL,
        method TEXT, path TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);`);
    }
  },
  {
    version: 4,
    name: 'analytics-ids',
    up(db) {
      // Identificadores públicos de Google Analytics 4 y Meta Pixel. Se guardan
      // acá, y no en variables de entorno, para poder cambiarlos desde el panel
      // sin reiniciar. No son secretos.
      const columns = db.prepare('PRAGMA table_info(store_config)').all();
      for (const column of ['ga_measurement_id', 'meta_pixel_id']) {
        if (!columns.some((field) => field.name === column)) {
          db.exec(`ALTER TABLE store_config ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
        }
      }
    }
  },
  {
    version: 5,
    name: 'analytics-out-of-stock',
    up(db) {
      // El evento de producto agotado entra en la lista de estados permitidos.
      // SQLite no admite agregar valores a un CHECK existente, así que la
      // tabla se reconstruye con la lista completa y se copian los eventos.
      const current = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'analytics_events'").get()?.sql || '';
      if (current.includes('OUT_OF_STOCK')) return;
      const events = [
        'VISIT', 'PRODUCT_VIEW', 'SEARCH', 'ADD_TO_CART', 'REMOVE_FROM_CART',
        'CHECKOUT_STARTED', 'CHECKOUT_ABANDONED', 'ORDER_COMPLETED', 'COUPON_APPLIED',
        'WISHLIST_ADDED', 'OUT_OF_STOCK'
      ];
      db.prepare('DROP TABLE IF EXISTS analytics_events_new').run();
      db.exec(`
        CREATE TABLE analytics_events_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_name TEXT NOT NULL CHECK (event_name IN (${events.map((value) => `'${value}'`).join(', ')})),
          anonymous_id TEXT,
          customer_id INTEGER REFERENCES customers(id),
          session_id TEXT,
          inventory_product_id TEXT,
          inventory_variant_id TEXT,
          order_id INTEGER REFERENCES orders(id),
          metadata_json TEXT NOT NULL DEFAULT '{}',
          occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ) STRICT;
        INSERT INTO analytics_events_new
          SELECT id, event_name, anonymous_id, customer_id, session_id,
                 inventory_product_id, inventory_variant_id, order_id, metadata_json, occurred_at
          FROM analytics_events;
        DROP TABLE analytics_events;
        ALTER TABLE analytics_events_new RENAME TO analytics_events;
        CREATE INDEX IF NOT EXISTS idx_analytics_name_date ON analytics_events(event_name, occurred_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analytics_product ON analytics_events(inventory_product_id, event_name);
      `);
    }
  }
];

/** Versión máxima que el código sabe aplicar. */
export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1].version;

export function runMigrations(db) {
  const current = Number(db.pragma('user_version', { simple: true }) || 0);
  if (current > LATEST_SCHEMA_VERSION) throw new Error(`Base e-commerce versión ${current} no soportada.`);
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT OR REPLACE INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)').run(migration.version, migration.name, crypto.createHash('sha256').update(migration.name).digest('hex'));
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
  return { from: current, to: Number(db.pragma('user_version', { simple: true })) };
}
