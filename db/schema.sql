-- NEXO Stock · SQLite schema v3
-- La API usa nombres en español; esta capa conserva valores canónicos.
-- El precio y el costo usan 0 como sentinel únicamente cuando el registro
-- correspondiente no está cargado. Los flags indicadores permiten distinguirtent distinguir
-- "sin registrar" de un costo real igual a cero.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(email)) > 3),
  password_hash TEXT NOT NULL CHECK (length(password_hash) >= 20),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS options (
  id TEXT PRIMARY KEY,
  option_type TEXT NOT NULL CHECK (option_type IN (
    'payment_method', 'condition', 'physical_state', 'movement_type',
    'warranty_status', 'location', 'category', 'capacity', 'color',
    'brand', 'product_model'
  )),
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (option_type, value)
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_models (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) > 0),
  availability_status TEXT NOT NULL DEFAULT 'CURRENT' CHECK (availability_status IN ('CURRENT', 'DISCONTINUED', 'OWN_STOCK')),
  official_url TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (brand_id, name)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capacities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS colors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  company TEXT,
  tax_id TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  first_name TEXT,
  last_name TEXT,
  tax_id TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  notes TEXT,
  public_slug TEXT,
  public_description TEXT,
  public_images_json TEXT NOT NULL DEFAULT '[]',
  public_highlights_json TEXT NOT NULL DEFAULT '[]',
  public_specs_json TEXT NOT NULL DEFAULT '{}',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  is_trending INTEGER NOT NULL DEFAULT 0 CHECK (is_trending IN (0, 1)),
  published_at TEXT,
  is_fictional INTEGER NOT NULL DEFAULT 0 CHECK (is_fictional IN (0, 1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  capacity_id TEXT REFERENCES capacities(id) ON DELETE RESTRICT,
  color_id TEXT REFERENCES colors(id) ON DELETE RESTRICT,
  variant_name TEXT NOT NULL CHECK (length(trim(variant_name)) > 0),
  sku TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(sku)) > 0),
  barcode TEXT COLLATE NOCASE,
  ram TEXT,
  condition TEXT NOT NULL DEFAULT 'Nuevo',
  physical_state TEXT NOT NULL DEFAULT '10/10',
  requires_imei INTEGER NOT NULL DEFAULT 1 CHECK (requires_imei IN (0, 1)),
  cost NUMERIC NOT NULL DEFAULT 0 CHECK (cost >= 0),
  cost_registered INTEGER NOT NULL DEFAULT 0 CHECK (cost_registered IN (0, 1)),
  sale_price NUMERIC NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  sale_price_registered INTEGER NOT NULL DEFAULT 0 CHECK (sale_price_registered IN (0, 1)),
  promo_price NUMERIC CHECK (promo_price IS NULL OR promo_price > 0),
  apple_official_price_usd NUMERIC CHECK (apple_official_price_usd IS NULL OR apple_official_price_usd >= 0),
  apple_price_source TEXT,
  apple_price_updated_at TEXT,
  apple_price_updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE RESTRICT,
  location_id TEXT REFERENCES locations(id) ON DELETE RESTRICT,
  purchase_date TEXT,
  warranty TEXT,
  notes TEXT,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  public_images_json TEXT NOT NULL DEFAULT '[]',
  previous_price NUMERIC CHECK (previous_price IS NULL OR previous_price > 0),
  promo_starts_at TEXT,
  promo_ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  is_fictional INTEGER NOT NULL DEFAULT 0 CHECK (is_fictional IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (cost_registered = 1 OR cost = 0),
  CHECK (sale_price_registered = 1 AND sale_price > 0 OR sale_price_registered = 0 AND sale_price = 0),
  CHECK (promo_price IS NULL OR promo_price < sale_price OR promo_price = sale_price)
);

CREATE TABLE IF NOT EXISTS inventory (
  variant_id TEXT PRIMARY KEY REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purchase_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID', 'PARTIAL', 'PENDING', 'REFUNDED')),
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total NUMERIC NOT NULL CHECK (total >= 0),
  cost_total NUMERIC NOT NULL CHECK (cost_total >= 0),
  notes TEXT,
  idempotency_key TEXT,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
  line_total NUMERIC NOT NULL CHECK (line_total >= 0),
  CHECK (line_total = quantity * unit_cost)
);

CREATE TABLE IF NOT EXISTS inventory_units (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  purchase_item_id TEXT REFERENCES purchase_items(id) ON DELETE SET NULL,
  imei TEXT COLLATE NOCASE,
  imei_2 TEXT COLLATE NOCASE,
  serial_number TEXT,
  unit_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (unit_status IN (
    'AVAILABLE', 'RESERVED', 'SOLD', 'REPAIR', 'RETURNED', 'LOST', 'RETIRED'
  )),
  condition TEXT,
  physical_state TEXT,
  cost NUMERIC NOT NULL DEFAULT 0 CHECK (cost >= 0),
  cost_registered INTEGER NOT NULL DEFAULT 0 CHECK (cost_registered IN (0, 1)),
  sale_price NUMERIC NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  sale_price_registered INTEGER NOT NULL DEFAULT 0 CHECK (sale_price_registered IN (0, 1)),
  entry_date TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE RESTRICT,
  location_id TEXT REFERENCES locations(id) ON DELETE RESTRICT,
  notes TEXT,
  is_fictional INTEGER NOT NULL DEFAULT 0 CHECK (is_fictional IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (cost_registered = 1 OR cost = 0),
  CHECK (sale_price_registered = 1 AND sale_price > 0 OR sale_price_registered = 0 AND sale_price = 0),
  CHECK (imei IS NULL OR (length(imei) = 15 AND imei NOT GLOB '*[^0-9]*')),
  CHECK (imei_2 IS NULL OR (length(imei_2) = 15 AND imei_2 NOT GLOB '*[^0-9]*'))
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sale_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID', 'PARTIAL', 'PENDING', 'REFUNDED')),
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total NUMERIC NOT NULL CHECK (total > 0),
  cost_total NUMERIC NOT NULL DEFAULT 0 CHECK (cost_total >= 0),
  profit_total NUMERIC NOT NULL DEFAULT 0,
  profit_known INTEGER NOT NULL DEFAULT 1 CHECK (profit_known IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ANNULLED')),
  notes TEXT,
  idempotency_key TEXT,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  annul_reason TEXT,
  annulled_at TEXT,
  annulled_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CHECK (total = subtotal - discount)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  inventory_unit_id TEXT REFERENCES inventory_units(id) ON DELETE RESTRICT,
  serialized INTEGER NOT NULL DEFAULT 0 CHECK (serialized IN (0, 1)),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price > 0),
  discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0),
  unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  cost_registered INTEGER NOT NULL DEFAULT 0 CHECK (cost_registered IN (0, 1)),
  line_total NUMERIC NOT NULL CHECK (line_total >= 0),
  CHECK (line_total = quantity * unit_price - discount),
  CHECK (
    (serialized = 0 AND inventory_unit_id IS NULL)
    OR (serialized = 1 AND quantity = 1 AND inventory_unit_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  return_date TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PARTIAL')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE RESTRICT,
  sale_item_id TEXT NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  inventory_unit_id TEXT REFERENCES inventory_units(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price > 0),
  unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  cost_registered INTEGER NOT NULL DEFAULT 0 CHECK (cost_registered IN (0, 1)),
  line_total NUMERIC NOT NULL CHECK (line_total >= 0),
  restocked INTEGER NOT NULL DEFAULT 1 CHECK (restocked IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (return_id, sale_item_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT REFERENCES sales(id) ON DELETE RESTRICT,
  purchase_id TEXT REFERENCES purchases(id) ON DELETE RESTRICT,
  payment_method TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID', 'PARTIAL', 'PENDING', 'REFUNDED')),
  reference TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  CHECK ((sale_id IS NOT NULL AND purchase_id IS NULL) OR (sale_id IS NULL AND purchase_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  inventory_unit_id TEXT REFERENCES inventory_units(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'INITIAL_IMPORT', 'PURCHASE', 'SALE', 'MANUAL_IN', 'MANUAL_OUT',
    'RETURN', 'ADJUSTMENT', 'TRANSFER', 'LOSS', 'REPAIR', 'SALE_ANNULMENT'
  )),
  quantity INTEGER NOT NULL CHECK (quantity <> 0),
  stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
  stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
  cost NUMERIC CHECK (cost IS NULL OR cost >= 0),
  price NUMERIC CHECK (price IS NULL OR price > 0),
  reason TEXT,
  notes TEXT,
  reference_type TEXT,
  reference_id TEXT,
  created_at TEXT NOT NULL,
  CHECK (stock_after = stock_before + quantity)
);

CREATE TABLE IF NOT EXISTS service_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce_nonces (
  client_id TEXT NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (client_id, nonce)
);

CREATE TABLE IF NOT EXISTS commerce_holds (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES service_clients(id) ON DELETE RESTRICT,
  external_order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONFIRMING', 'CONFIRMED', 'RELEASED', 'EXPIRED', 'FAILED')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total NUMERIC NOT NULL CHECK (total > 0),
  expires_at TEXT NOT NULL,
  confirmed_sale_id TEXT REFERENCES sales(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (client_id, idempotency_key),
  UNIQUE (client_id, external_order_id)
);

CREATE TABLE IF NOT EXISTS commerce_hold_items (
  id TEXT PRIMARY KEY,
  hold_id TEXT NOT NULL REFERENCES commerce_holds(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_id TEXT REFERENCES inventory_units(id) ON DELETE RESTRICT,
  unit_price NUMERIC NOT NULL CHECK (unit_price > 0),
  line_total NUMERIC NOT NULL CHECK (line_total >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce_events (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES service_clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  delivered_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commerce_hold_events (
  id TEXT PRIMARY KEY,
  hold_id TEXT NOT NULL REFERENCES commerce_holds(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (hold_id, operation)
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  inventory_unit_id TEXT NOT NULL REFERENCES inventory_units(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reserved_at TEXT NOT NULL,
  expires_at TEXT,
  deposit NUMERIC NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED', 'CONVERTED', 'EXPIRED')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warranty_claims (
  id TEXT PRIMARY KEY,
  inventory_unit_id TEXT NOT NULL REFERENCES inventory_units(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  received_at TEXT NOT NULL,
  expires_at TEXT,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  status TEXT NOT NULL CHECK (status IN ('IN_WARRANTY', 'OUT_OF_WARRANTY', 'IN_REVIEW', 'RESOLVED')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('EXPORT', 'RESTORE', 'RESET_EMPTY')),
  format_version INTEGER NOT NULL CHECK (format_version > 0),
  filename TEXT,
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  byte_count INTEGER NOT NULL DEFAULT 0 CHECK (byte_count >= 0),
  checksum_sha256 TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'ERROR' CHECK (level IN ('WARN', 'ERROR', 'FATAL')),
  code TEXT,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  request_id TEXT,
  stack TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_reconciliations (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_stock INTEGER NOT NULL CHECK (recorded_stock >= 0),
  physical_stock INTEGER NOT NULL CHECK (physical_stock >= 0),
  difference INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_units_imei
  ON inventory_units(imei) WHERE imei IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_units_imei_2
  ON inventory_units(imei_2) WHERE imei_2 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_items_inventory_unit
  ON sale_items(inventory_unit_id) WHERE inventory_unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_active_unit
  ON reservations(inventory_unit_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_idempotency
  ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_idempotency
  ON purchases(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_barcode
  ON product_variants(barcode) WHERE barcode IS NOT NULL AND trim(barcode) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_definition
  ON product_variants(product_id, IFNULL(capacity_id, ''), IFNULL(color_id, ''), IFNULL(ram, ''), variant_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tax_id
  ON customers(REPLACE(REPLACE(REPLACE(trim(COALESCE(tax_id, '')), '.', ''), '-', ''), ' ', ''))
  WHERE tax_id IS NOT NULL AND trim(tax_id) <> '';

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role_id, active);
CREATE INDEX IF NOT EXISTS idx_models_brand_active ON product_models(brand_id, active);
CREATE INDEX IF NOT EXISTS idx_products_model ON products(model_id, archived);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, archived);
CREATE INDEX IF NOT EXISTS idx_variants_product_active ON product_variants(product_id, active);
CREATE INDEX IF NOT EXISTS idx_variants_supplier ON product_variants(supplier_id);
CREATE INDEX IF NOT EXISTS idx_variants_location ON product_variants(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_updated ON inventory(updated_at);
CREATE INDEX IF NOT EXISTS idx_units_variant_status ON inventory_units(variant_id, unit_status);
CREATE INDEX IF NOT EXISTS idx_units_purchase_item ON inventory_units(purchase_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_user_date ON sales(user_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant ON sale_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_purchase ON payments(purchase_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_variant ON stock_movements(variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_status_expiry ON reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_commerce_holds_expiry ON commerce_holds(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_commerce_hold_items_variant ON commerce_hold_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_commerce_events_delivery ON commerce_events(delivered_at, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_warranty_status ON warranty_claims(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_date ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_date ON backup_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_date ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON sale_returns(sale_id, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item ON sale_return_items(sale_item_id);

CREATE TRIGGER IF NOT EXISTS trg_inventory_unit_imei_insert
BEFORE INSERT ON inventory_units
WHEN NEW.imei IS NOT NULL OR NEW.imei_2 IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    (NEW.imei IS NOT NULL AND EXISTS (
      SELECT 1 FROM inventory_units
      WHERE imei = NEW.imei COLLATE NOCASE OR imei_2 = NEW.imei COLLATE NOCASE
    ))
    OR
    (NEW.imei_2 IS NOT NULL AND EXISTS (
      SELECT 1 FROM inventory_units
      WHERE imei = NEW.imei_2 COLLATE NOCASE OR imei_2 = NEW.imei_2 COLLATE NOCASE
    ))
  ) THEN RAISE(ABORT, 'duplicate_imei') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_unit_imei_update
BEFORE UPDATE OF imei, imei_2 ON inventory_units
WHEN NEW.imei IS NOT NULL OR NEW.imei_2 IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    (NEW.imei IS NOT NULL AND EXISTS (
      SELECT 1 FROM inventory_units
      WHERE id <> OLD.id
        AND (imei = NEW.imei COLLATE NOCASE OR imei_2 = NEW.imei COLLATE NOCASE)
    ))
    OR
    (NEW.imei_2 IS NOT NULL AND EXISTS (
      SELECT 1 FROM inventory_units
      WHERE id <> OLD.id
        AND (imei = NEW.imei_2 COLLATE NOCASE OR imei_2 = NEW.imei_2 COLLATE NOCASE)
    ))
  ) THEN RAISE(ABORT, 'duplicate_imei') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_item_serialized_unit_insert
BEFORE INSERT ON sale_items
WHEN NEW.inventory_unit_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
      FROM inventory_units
      WHERE id = NEW.inventory_unit_id
        AND variant_id = NEW.variant_id
        AND unit_status = 'AVAILABLE'
    ) THEN RAISE(ABORT, 'inventory_unit_not_available')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_unit_sold_once
BEFORE UPDATE OF unit_status ON inventory_units
WHEN OLD.unit_status = 'SOLD' AND NEW.unit_status = 'SOLD'
BEGIN
  SELECT RAISE(ABORT, 'inventory_unit_already_sold');
END;

PRAGMA user_version = 3;
