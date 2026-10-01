PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS store_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  brand_name TEXT NOT NULL DEFAULT 'NEXO Tech',
  legal_name TEXT NOT NULL DEFAULT '',
  support_email TEXT NOT NULL DEFAULT '',
  support_phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  address_street TEXT NOT NULL DEFAULT '',
  address_number TEXT NOT NULL DEFAULT '',
  address_locality TEXT NOT NULL DEFAULT 'Córdoba Capital',
  address_province TEXT NOT NULL DEFAULT 'Córdoba',
  address_country TEXT NOT NULL DEFAULT 'Argentina',
  address_postal_code TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Cordoba',
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  low_stock_threshold INTEGER NOT NULL DEFAULT 1 CHECK (low_stock_threshold >= 0),
  reservation_minutes INTEGER NOT NULL DEFAULT 10 CHECK (reservation_minutes BETWEEN 2 AND 60),
  shipping_flat_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_flat_cents >= 0),
  free_shipping_threshold_cents INTEGER NOT NULL DEFAULT 0 CHECK (free_shipping_threshold_cents >= 0),
  pickup_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pickup_enabled IN (0, 1)),
  shipping_enabled INTEGER NOT NULL DEFAULT 0 CHECK (shipping_enabled IN (0, 1)),
  cash_enabled INTEGER NOT NULL DEFAULT 0 CHECK (cash_enabled IN (0, 1)),
  transfer_enabled INTEGER NOT NULL DEFAULT 0 CHECK (transfer_enabled IN (0, 1)),
  card_enabled INTEGER NOT NULL DEFAULT 0 CHECK (card_enabled IN (0, 1)),
  bank_name TEXT NOT NULL DEFAULT '',
  bank_cbu TEXT NOT NULL DEFAULT '',
  bank_alias TEXT NOT NULL DEFAULT '',
  bank_holder TEXT NOT NULL DEFAULT '',
  bank_tax_id TEXT NOT NULL DEFAULT '',
  public_catalog_enabled INTEGER NOT NULL DEFAULT 1 CHECK (public_catalog_enabled IN (0, 1)),
  seo_title TEXT NOT NULL DEFAULT 'NEXO Tech',
  seo_description TEXT NOT NULL DEFAULT 'Celulares, iPhone, Apple y accesorios seleccionados.',
  ga_measurement_id TEXT NOT NULL DEFAULT '',
  meta_pixel_id TEXT NOT NULL DEFAULT '',
  theme_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT OR IGNORE INTO store_config (id) VALUES (1);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'ORDER_MANAGER', 'CONTENT_MANAGER')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_users_email ON admin_users(email);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'DNI' CHECK (document_type IN ('DNI', 'CUIT', 'CUIL', 'PASSPORT', 'OTHER')),
  document_number TEXT NOT NULL,
  document_number_normalized TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  accepts_marketing INTEGER NOT NULL DEFAULT 0 CHECK (accepts_marketing IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_document ON customers(document_number_normalized) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email ON customers(email) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_search ON customers(last_name, first_name, document_number_normalized, phone, whatsapp);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Principal',
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  floor TEXT NOT NULL DEFAULT '',
  apartment TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL,
  province TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id, is_default DESC);

CREATE TABLE IF NOT EXISTS merchandising_products (
  inventory_product_id TEXT PRIMARY KEY,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  trending INTEGER NOT NULL DEFAULT 0 CHECK (trending IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS customer_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id, expires_at);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id),
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id, expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_password_resets_customer ON password_resets(customer_id, expires_at);

CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED')),
  expires_at TEXT NOT NULL,
  converted_order_id INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_carts_customer ON carts(customer_id, status, updated_at);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  inventory_variant_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (cart_id, inventory_variant_id)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

CREATE TABLE IF NOT EXISTS wishlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  inventory_product_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (customer_id, inventory_product_id)
) STRICT;

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  minimum_subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (minimum_subtotal_cents >= 0),
  maximum_discount_cents INTEGER CHECK (maximum_discount_cents IS NULL OR maximum_discount_cents > 0),
  starts_at TEXT,
  ends_at TEXT,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  max_uses_per_customer INTEGER CHECK (max_uses_per_customer IS NULL OR max_uses_per_customer > 0),
  applies_to_all INTEGER NOT NULL DEFAULT 1 CHECK (applies_to_all IN (0, 1)),
  stackable INTEGER NOT NULL DEFAULT 0 CHECK (stackable IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active_dates ON coupons(active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS coupon_products (
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  inventory_product_id TEXT NOT NULL,
  PRIMARY KEY (coupon_id, inventory_product_id)
) STRICT;

CREATE TABLE IF NOT EXISTS coupon_categories (
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  PRIMARY KEY (coupon_id, category_id)
) STRICT;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id),
  order_id INTEGER NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id, customer_id);

CREATE TABLE IF NOT EXISTS automatic_discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  minimum_subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (minimum_subtotal_cents >= 0),
  maximum_discount_cents INTEGER CHECK (maximum_discount_cents IS NULL OR maximum_discount_cents > 0),
  starts_at TEXT,
  ends_at TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS automatic_discount_products (
  discount_id INTEGER NOT NULL REFERENCES automatic_discounts(id) ON DELETE CASCADE,
  inventory_product_id TEXT NOT NULL,
  PRIMARY KEY (discount_id, inventory_product_id)
) STRICT;

CREATE TABLE IF NOT EXISTS automatic_discount_categories (
  discount_id INTEGER NOT NULL REFERENCES automatic_discounts(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  PRIMARY KEY (discount_id, category_id)
) STRICT;

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  public_token_hash TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'DNI',
  document_number TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  fulfillment_method TEXT NOT NULL CHECK (fulfillment_method IN ('PICKUP', 'SHIPPING')),
  shipping_address_json TEXT NOT NULL DEFAULT '{}',
  shipping_zone_id INTEGER,
  shipping_method TEXT NOT NULL DEFAULT '',
  estimated_delivery TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT', 'PAYMENT_APPROVED', 'PREPARING', 'READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'FULFILLMENT_REVIEW')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  stock_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (stock_status IN ('PENDING', 'RESERVED', 'CONFIRMING', 'CONFIRMED', 'RELEASED', 'REVIEW')),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  automatic_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (automatic_discount_cents >= 0),
  coupon_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (coupon_discount_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  coupon_id INTEGER REFERENCES coupons(id),
  coupon_code TEXT,
  customer_note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  cancellation_reason TEXT NOT NULL DEFAULT '',
  quote_token_hash TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  reservation_expires_at TEXT,
  confirmed_at TEXT,
  cancelled_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_document ON orders(document_number, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_coupon_redemption ON orders(coupon_id) WHERE coupon_id IS NOT NULL AND status NOT IN ('CANCELLED', 'EXPIRED');

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  inventory_product_id TEXT NOT NULL,
  inventory_variant_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  capacity TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  condition TEXT NOT NULL DEFAULT 'NEW',
  image_url TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  automatic_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (automatic_discount_cents >= 0),
  coupon_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (coupon_discount_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_external_variant ON order_items(inventory_variant_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor_type TEXT NOT NULL CHECK (actor_type IN ('SYSTEM', 'CUSTOMER', 'ADMIN', 'PAYMENT_PROVIDER')),
  actor_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id, created_at);

CREATE TABLE IF NOT EXISTS stock_reservation_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  external_reservation_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('RESERVED', 'CONFIRMING', 'CONFIRMED', 'RELEASING', 'RELEASED', 'EXPIRED', 'FAILED')),
  requested_payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_message TEXT,
  confirmed_at TEXT,
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_reservation_refs_state ON stock_reservation_refs(state, expires_at);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL CHECK (provider IN ('mercadopago', 'cash', 'bank_transfer', 'manual')),
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ERROR')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  external_id TEXT,
  external_reference TEXT,
  checkout_url TEXT,
  idempotency_key TEXT NOT NULL,
  failure_code TEXT,
  failure_message TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (provider, idempotency_key)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_external ON payments(provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id, created_at);

CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER REFERENCES payments(id),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (provider, event_id)
) STRICT;

CREATE TABLE IF NOT EXISTS refund_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  payment_id INTEGER REFERENCES payments(id),
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'REJECTED', 'COMPLETED', 'CANCELLED')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  provider_refund_id TEXT,
  stock_action TEXT NOT NULL DEFAULT 'PENDING' CHECK (stock_action IN ('PENDING', 'RETURN_STOCK', 'KEEP_STOCK', 'CANCEL_SALE', 'COMPLETED')),
  requested_by_type TEXT NOT NULL CHECK (requested_by_type IN ('CUSTOMER', 'ADMIN')),
  requested_by_id INTEGER,
  provider_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_refund_requests_order ON refund_requests(order_id, status);

CREATE TABLE IF NOT EXISTS shipping_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  province TEXT NOT NULL DEFAULT '',
  postal_codes_json TEXT NOT NULL DEFAULT '[]',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  estimated_days_min INTEGER NOT NULL DEFAULT 1 CHECK (estimated_days_min > 0),
  estimated_days_max INTEGER NOT NULL DEFAULT 1 CHECK (estimated_days_max >= estimated_days_min),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS content_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_key TEXT NOT NULL UNIQUE,
  block_type TEXT NOT NULL CHECK (block_type IN ('HERO', 'BANNER', 'ANNOUNCEMENT', 'TRUST', 'SEO', 'HOME_SECTION')),
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  starts_at TEXT,
  ends_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS back_in_stock_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_variant_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  customer_id INTEGER REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'NOTIFIED', 'UNSUBSCRIBED')),
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (inventory_variant_id, email)
) STRICT;

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL CHECK (event_name IN ('VISIT', 'PRODUCT_VIEW', 'SEARCH', 'ADD_TO_CART', 'REMOVE_FROM_CART', 'CHECKOUT_STARTED', 'CHECKOUT_ABANDONED', 'ORDER_COMPLETED', 'COUPON_APPLIED', 'WISHLIST_ADDED', 'OUT_OF_STOCK')),
  anonymous_id TEXT,
  customer_id INTEGER REFERENCES customers(id),
  session_id TEXT,
  inventory_product_id TEXT,
  inventory_variant_id TEXT,
  order_id INTEGER REFERENCES orders(id),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_analytics_name_date ON analytics_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_product ON analytics_events(inventory_product_id, event_name);

CREATE TABLE IF NOT EXISTS webhook_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (provider, event_id)
) STRICT;

CREATE TABLE IF NOT EXISTS idempotency_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_json TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (scope, idempotency_key)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_records(expires_at);

CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template TEXT NOT NULL,
  recipient TEXT NOT NULL COLLATE NOCASE,
  subject TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'NOT_CONFIGURED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS integration_state (
  provider TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_attempt_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT,
  level TEXT NOT NULL CHECK (level IN ('WARN', 'ERROR', 'FATAL')),
  code TEXT,
  message TEXT NOT NULL,
  method TEXT,
  path TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  request_id TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at DESC);

INSERT OR IGNORE INTO content_blocks
  (block_key, block_type, title, subtitle, body, content_json, sort_order)
VALUES
  ('home-hero', 'HERO', 'Encontrá tu próximo smartphone', 'Equipos seleccionados. Compra segura. Atención personalizada.', '', '{"primaryLabel":"Ver celulares","secondaryLabel":"Ver ofertas"}', 10);

PRAGMA user_version = 1;
