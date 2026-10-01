import { getSettings } from '../services/settings.js';
import { parseJson } from '../utils.js';

export const PRODUCT_SELECT = `
  SELECT
    pv.id,
    p.id AS internal_product_id,
    b.name AS brand,
    pm.name AS model,
    pv.variant_name,
    COALESCE(cp.name, '') AS capacity,
    COALESCE(cl.name, '') AS color,
    COALESCE(pv.ram, '') AS ram,
    pv.condition,
    COALESCE(pv.physical_state, '') AS physical_state,
    pv.requires_imei,
    pv.cost,
    pv.cost_registered,
    pv.sale_price,
    pv.sale_price_registered,
    pv.promo_price,
    pv.apple_official_price_usd,
    pv.apple_price_source,
    pv.apple_price_updated_at,
    pv.apple_price_updated_by,
    COALESCE(i.quantity, 0) AS stock,
    COALESCE(i.reserved_quantity, 0) AS reserved_stock,
    COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0) AS available_stock,
    pv.min_stock,
    COALESCE(pv.supplier_id, '') AS supplier_id,
    COALESCE(l.name, '') AS location,
    COALESCE(pv.purchase_date, '') AS purchase_date,
    COALESCE(pv.warranty, '') AS warranty,
    p.public_slug,
    p.public_description,
    p.public_images_json,
    p.public_highlights_json,
    p.public_specs_json,
    p.published,
    p.is_trending,
    p.published_at,
    pv.published AS variant_published,
    pv.public_images_json AS variant_images_json,
    pv.previous_price,
    pv.promo_starts_at,
    pv.promo_ends_at,
    CASE WHEN p.archived = 1 OR pv.active = 0 THEN 'Archivado' ELSE 'Activo' END AS status,
    COALESCE(pv.notes, p.notes, '') AS notes,
    cat.name AS category,
    COALESCE(pv.barcode, '') AS barcode,
    pv.sku,
    CASE WHEN p.is_fictional = 1 OR pv.is_fictional = 1 THEN 1 ELSE 0 END AS is_fictional,
    p.created_at,
    pv.updated_at
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  JOIN product_models pm ON pm.id = p.model_id
  JOIN brands b ON b.id = pm.brand_id
  JOIN categories cat ON cat.id = p.category_id
  LEFT JOIN capacities cp ON cp.id = pv.capacity_id
  LEFT JOIN colors cl ON cl.id = pv.color_id
  LEFT JOIN inventory i ON i.variant_id = pv.id
  LEFT JOIN locations l ON l.id = pv.location_id
`;

export function mapProductRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    variantId: row.id,
    productId: row.internal_product_id,
    brand: row.brand,
    model: row.model,
    variant: row.variant_name,
    capacity: row.capacity,
    color: row.color,
    ram: row.ram,
    condition: row.condition,
    physicalState: row.physical_state,
    requiresImei: row.requires_imei === 1,
    costKnown: row.cost_registered === 1 || Number(row.cost || 0) > 0,
    salePriceKnown: row.sale_price_registered === 1 || Number(row.sale_price || 0) > 0,
    cost: row.cost_registered === 1 || Number(row.cost || 0) > 0 ? Number(row.cost) : null,
    price: row.sale_price_registered === 1 || Number(row.sale_price || 0) > 0 ? Number(row.sale_price) : null,
    promoPrice: row.promo_price === null ? null : Number(row.promo_price),
    appleOfficialPriceUsd: row.apple_official_price_usd === null || row.apple_official_price_usd === undefined ? null : Number(row.apple_official_price_usd),
    applePriceSource: row.apple_price_source || '',
    applePriceUpdatedAt: row.apple_price_updated_at || '',
    applePriceUpdatedBy: row.apple_price_updated_by || '',
    stock: Number(row.stock),
    reservedStock: Number(row.reserved_stock || 0),
    availableStock: Number(row.available_stock ?? Math.max(0, Number(row.stock || 0) - Number(row.reserved_stock || 0))),
    minStock: Number(row.min_stock),
    supplierId: row.supplier_id,
    location: row.location,
    purchaseDate: row.purchase_date,
    warranty: row.warranty,
    publicSlug: row.public_slug || '',
    publicDescription: row.public_description || '',
    publicImages: parseJson(row.public_images_json, []),
    publicHighlights: parseJson(row.public_highlights_json, []),
    publicSpecifications: parseJson(row.public_specs_json, {}),
    published: row.published === 1,
    isTrending: row.is_trending === 1,
    publishedAt: row.published_at || '',
    variantPublished: row.variant_published === 1,
    variantImages: parseJson(row.variant_images_json, []),
    previousPrice: row.previous_price === null || row.previous_price === undefined ? null : Number(row.previous_price),
    promoStartsAt: row.promo_starts_at || '',
    promoEndsAt: row.promo_ends_at || '',
    status: row.status,
    stockStatus: Number(row.available_stock ?? Math.max(0, Number(row.stock || 0) - Number(row.reserved_stock || 0))) === 0 ? 'AGOTADO' : Number(row.available_stock ?? Math.max(0, Number(row.stock || 0) - Number(row.reserved_stock || 0))) <= 1 ? 'ÚLTIMA UNIDAD' : 'DISPONIBLE',
    notes: row.notes,
    category: row.category,
    barcode: row.barcode,
    sku: row.sku,
    isFictional: row.is_fictional === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getProducts(db) {
  return db.prepare(`${PRODUCT_SELECT} ORDER BY p.created_at DESC, pv.created_at DESC`).all().map(mapProductRow);
}

export function getProductById(db, id) {
  return mapProductRow(db.prepare(`${PRODUCT_SELECT} WHERE pv.id = ?`).get(id));
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active === 1,
    lastLogin: row.last_login_at || '',
    avatar: row.avatar || row.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getUsers(db) {
  return db.prepare(`
    SELECT u.*, r.name AS role
    FROM users u
    JOIN roles r ON r.id = u.role_id
    ORDER BY u.created_at DESC
  `).all().map(mapUser);
}

function getSuppliers(db) {
  return db.prepare(`
    SELECT id, name, company, tax_id, phone, whatsapp, email, address, notes,
           active, created_at, updated_at
    FROM suppliers ORDER BY created_at DESC
  `).all().map(row => ({
    id: row.id,
    name: row.name,
    company: row.company || '',
    taxId: row.tax_id || '',
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    address: row.address || '',
    notes: row.notes || '',
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function getCustomers(db) {
  return db.prepare(`
    SELECT id, name, first_name, last_name, tax_id, phone, whatsapp, email, address, notes,
           active, created_at, updated_at
    FROM customers ORDER BY created_at DESC
  `).all().map(row => ({
    id: row.id,
    name: row.name,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    taxId: row.tax_id || '',
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    address: row.address || '',
    notes: row.notes || '',
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

const unitStatusLabels = {
  AVAILABLE: 'Disponible',
  RESERVED: 'Reservado',
  SOLD: 'Vendido',
  REPAIR: 'En reparación',
  RETURNED: 'Devuelto',
  LOST: 'Perdido',
  RETIRED: 'Retirado'
};

export function normalizeUnitStatus(value) {
  const direct = String(value || '').toUpperCase().replace(/[\s-]+/g, '_');
  const aliases = {
    DISPONIBLE: 'AVAILABLE',
    RESERVADO: 'RESERVED',
    VENDIDO: 'SOLD',
    EN_REPARACION: 'REPAIR',
    REPARACION: 'REPAIR',
    DEVUELTO: 'RETURNED',
    DEVOLUCION: 'RETURNED',
    PERDIDO: 'LOST',
    PERDIDA: 'LOST',
    RETIRADO: 'RETIRED'
  };
  return aliases[direct] || direct;
}

export function unitStatusLabel(value) {
  return unitStatusLabels[value] || 'Disponible';
}

function getUnits(db) {
  return db.prepare(`
    SELECT iu.*, COALESCE(l.name, '') AS location
    FROM inventory_units iu
    LEFT JOIN locations l ON l.id = iu.location_id
    ORDER BY iu.created_at DESC
  `).all().map(row => ({
    id: row.id,
    productId: row.variant_id,
    imei: row.imei || '',
    imei2: row.imei_2 || '',
    serialNumber: row.serial_number || '',
    status: unitStatusLabel(row.unit_status),
    condition: row.condition || '',
    physicalState: row.physical_state || '',
    costKnown: row.cost_registered === 1 || Number(row.cost || 0) > 0,
    salePriceKnown: row.sale_price_registered === 1 || Number(row.sale_price || 0) > 0,
    cost: row.cost_registered === 1 || Number(row.cost || 0) > 0 ? Number(row.cost) : null,
    salePrice: row.sale_price_registered === 1 || Number(row.sale_price || 0) > 0 ? Number(row.sale_price) : null,
    entryDate: row.entry_date,
    supplierId: row.supplier_id || '',
    location: row.location,
    notes: row.notes || '',
    isFictional: row.is_fictional === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function getSales(db) {
  const sales = db.prepare(`
    SELECT s.*, COALESCE(c.name, 'Cliente mostrador') AS customer_name,
           COALESCE(u.name, 'Sistema') AS user_name
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.sale_date DESC, s.created_at DESC
  `).all();
  const itemRows = db.prepare(`
    SELECT si.*, COALESCE(iu.imei, '') AS imei,
           b.name AS brand, pm.name AS model, pv.variant_name
    FROM sale_items si
    JOIN product_variants pv ON pv.id = si.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    LEFT JOIN inventory_units iu ON iu.id = si.inventory_unit_id
    ORDER BY si.rowid
  `).all();
  const grouped = new Map();
  for (const row of itemRows) {
    if (!grouped.has(row.sale_id)) grouped.set(row.sale_id, []);
    grouped.get(row.sale_id).push({
      id: row.id,
      productId: row.variant_id,
      productName: `${row.brand} ${row.model}`,
      brand: row.brand,
      model: row.model,
      variant: row.variant_name,
      quantity: Number(row.quantity),
      unitId: row.inventory_unit_id || '',
      imei: row.imei,
      price: Number(row.unit_price),
      discount: Number(row.discount),
      total: Number(row.line_total),
      cost: row.cost_registered === 1 || Number(row.unit_cost || 0) > 0 ? Number(row.unit_cost) : null,
      costKnown: row.cost_registered === 1 || Number(row.unit_cost || 0) > 0
    });
  }

  return sales.map(row => ({
    id: row.id,
    date: row.sale_date,
    customerId: row.customer_id || '',
    customerName: row.customer_name,
    items: grouped.get(row.id) || [],
    total: Number(row.total),
    cost: row.profit_known === 1 ? Number(row.cost_total) : null,
    profit: row.profit_known === 1 ? Number(row.profit_total) : null,
    profitKnown: row.profit_known === 1,
    status: row.status === 'ANNULLED' ? 'ANULADA' : 'ACTIVA',
    statusCode: row.status || 'ACTIVE',
    annulReason: row.annul_reason || '',
    annulledAt: row.annulled_at || '',
    annulledBy: row.annulled_by || '',
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status === 'PAID' ? 'Pagada' : row.payment_status === 'PARTIAL' ? 'Parcial' : row.payment_status === 'PENDING' ? 'Pendiente' : 'Reembolsada',
    userId: row.user_id,
    userName: row.user_name,
    notes: row.notes || '',
    discount: Number(row.discount),
    idempotencyKey: row.idempotency_key || null,
    requestHash: row.request_hash,
    createdAt: row.created_at
  }));
}

function getReturns(db) {
  const returns = db.prepare(`
    SELECT sr.*, COALESCE(c.name, 'Cliente mostrador') AS customer_name,
           COALESCE(u.name, 'Sistema') AS user_name
    FROM sale_returns sr
    LEFT JOIN customers c ON c.id = sr.customer_id
    LEFT JOIN users u ON u.id = sr.user_id
    ORDER BY sr.return_date DESC, sr.created_at DESC
  `).all();
  const itemRows = db.prepare(`
    SELECT sri.*, b.name AS brand, pm.name AS model, pv.variant_name,
           COALESCE(iu.imei, '') AS imei
    FROM sale_return_items sri
    JOIN product_variants pv ON pv.id = sri.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    LEFT JOIN inventory_units iu ON iu.id = sri.inventory_unit_id
    ORDER BY sri.rowid
  `).all();
  const grouped = new Map();
  for (const row of itemRows) {
    if (!grouped.has(row.return_id)) grouped.set(row.return_id, []);
    grouped.get(row.return_id).push({
      id: row.id,
      saleItemId: row.sale_item_id,
      productId: row.variant_id,
      productName: `${row.brand} ${row.model}`,
      variant: row.variant_name,
      unitId: row.inventory_unit_id || '',
      imei: row.imei,
      quantity: Number(row.quantity),
      price: Number(row.unit_price),
      cost: row.cost_registered === 1 || Number(row.unit_cost || 0) > 0 ? Number(row.unit_cost) : null,
      total: Number(row.line_total),
      restocked: row.restocked === 1
    });
  }
  return returns.map(row => ({
    id: row.id,
    saleId: row.sale_id,
    customerId: row.customer_id || '',
    customerName: row.customer_name,
    userId: row.user_id,
    userName: row.user_name,
    date: row.return_date,
    reason: row.reason,
    status: row.status === 'PARTIAL' ? 'Parcial' : 'Completada',
    items: grouped.get(row.id) || [],
    createdAt: row.created_at
  }));
}

function getPurchases(db) {
  const purchases = db.prepare(`
    SELECT p.*, s.name AS supplier_name, COALESCE(u.name, 'Sistema') AS user_name
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.purchase_date DESC, p.created_at DESC
  `).all();
  const items = db.prepare(`
    SELECT pi.*, b.name AS brand, pm.name AS model, pv.variant_name
    FROM purchase_items pi
    JOIN product_variants pv ON pv.id = pi.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    ORDER BY pi.rowid
  `).all();
  const imeis = db.prepare(`
    SELECT purchase_item_id, imei
    FROM inventory_units
    WHERE purchase_item_id IS NOT NULL AND imei IS NOT NULL
    ORDER BY created_at
  `).all();
  const grouped = new Map();
  for (const row of items) {
    if (!grouped.has(row.purchase_id)) grouped.set(row.purchase_id, []);
    grouped.get(row.purchase_id).push({
      id: row.id,
      productId: row.variant_id,
      productName: `${row.brand} ${row.model}`,
      brand: row.brand,
      model: row.model,
      variant: row.variant_name,
      quantity: Number(row.quantity),
      unitCost: Number(row.unit_cost),
      total: Number(row.line_total),
      imeis: []
    });
  }
  for (const row of imeis) {
    const purchaseItems = grouped.get(
      db.prepare('SELECT purchase_id FROM purchase_items WHERE id = ?').get(row.purchase_item_id)?.purchase_id
    );
    const item = purchaseItems?.find(candidate => candidate.id === row.purchase_item_id);
    if (item) item.imeis.push(row.imei);
  }

  return purchases.map(row => ({
    id: row.id,
    date: row.purchase_date,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    items: grouped.get(row.id) || [],
    total: Number(row.total),
    cost: Number(row.cost_total),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status === 'PAID' ? 'Pagada' : row.payment_status === 'PARTIAL' ? 'Parcial' : row.payment_status === 'PENDING' ? 'Pendiente' : 'Reembolsada',
    notes: row.notes || '',
    userId: row.user_id,
    userName: row.user_name,
    idempotencyKey: row.idempotency_key || null,
    requestHash: row.request_hash,
    createdAt: row.created_at
  }));
}

const movementLabels = {
  INITIAL_IMPORT: 'Entrada',
  PURCHASE: 'Entrada',
  SALE: 'Venta',
  MANUAL_IN: 'Entrada',
  MANUAL_OUT: 'Salida manual',
  RETURN: 'Devolución',
  ADJUSTMENT: 'Ajuste',
  TRANSFER: 'Transferencia',
  LOSS: 'Pérdida',
  REPAIR: 'Reparación',
  SALE_ANNULMENT: 'Anulación de venta'
};

export function movementTypeFromLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    entrada: 'MANUAL_IN',
    'entrada manual': 'MANUAL_IN',
    venta: 'SALE',
    'salida manual': 'MANUAL_OUT',
    salida: 'MANUAL_OUT',
    devolución: 'RETURN',
    devolucion: 'RETURN',
    ajuste: 'ADJUSTMENT',
    transferencia: 'TRANSFER',
    pérdida: 'LOSS',
    perdida: 'LOSS',
    reparación: 'REPAIR',
    reparacion: 'REPAIR'
  };
  return aliases[normalized] || null;
}

function getMovements(db) {
  return db.prepare(`
    SELECT sm.*, COALESCE(iu.imei, '') AS imei,
           b.name AS brand, pm.name AS model,
           COALESCE(u.name, 'Sistema') AS user_name
    FROM stock_movements sm
    JOIN product_variants pv ON pv.id = sm.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    LEFT JOIN inventory_units iu ON iu.id = sm.inventory_unit_id
    LEFT JOIN users u ON u.id = sm.user_id
    ORDER BY sm.created_at DESC, sm.rowid DESC
  `).all().map(row => ({
    id: row.id,
    date: row.created_at,
    userId: row.user_id,
    userName: row.user_name,
    productId: row.variant_id,
    productName: `${row.brand} ${row.model}`,
    unitId: row.inventory_unit_id || '',
    imei: row.imei,
    type: movementLabels[row.movement_type] || row.movement_type,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    stockBefore: Number(row.stock_before),
    stockAfter: Number(row.stock_after),
    cost: row.cost === null ? null : Number(row.cost),
    price: row.price === null ? null : Number(row.price),
    reason: row.reason || '',
    notes: row.notes || '',
    referenceType: row.reference_type || '',
    referenceId: row.reference_id || '',
    createdAt: row.created_at
  }));
}

function getReservations(db) {
  return db.prepare(`
    SELECT r.*, c.name AS customer_name, iu.imei, iu.variant_id,
           b.name AS brand, pm.name AS model
    FROM reservations r
    JOIN customers c ON c.id = r.customer_id
    JOIN inventory_units iu ON iu.id = r.inventory_unit_id
    JOIN product_variants pv ON pv.id = iu.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN product_models pm ON pm.id = p.model_id
    JOIN brands b ON b.id = pm.brand_id
    ORDER BY r.created_at DESC
  `).all().map(row => ({
    id: row.id,
    productId: row.variant_id,
    productName: `${row.brand} ${row.model}`,
    unitId: row.inventory_unit_id,
    imei: row.imei || '',
    customerId: row.customer_id,
    customerName: row.customer_name,
    createdAt: row.reserved_at,
    expiresAt: row.expires_at || '',
    deposit: Number(row.deposit),
    status: row.status === 'ACTIVE' ? 'Activa' : row.status === 'CANCELLED' ? 'Cancelada' : row.status === 'CONVERTED' ? 'Convertida' : 'Expirada',
    notes: row.notes || ''
  }));
}

function getWarrantyClaims(db) {
  return db.prepare(`
    SELECT wc.*, iu.imei, iu.variant_id, COALESCE(c.name, 'Cliente mostrador') AS customer_name
    FROM warranty_claims wc
    JOIN inventory_units iu ON iu.id = wc.inventory_unit_id
    LEFT JOIN customers c ON c.id = wc.customer_id
    ORDER BY wc.received_at DESC
  `).all().map(row => ({
    id: row.id,
    unitId: row.inventory_unit_id,
    productId: row.variant_id,
    imei: row.imei || '',
    customerId: row.customer_id || '',
    customerName: row.customer_name,
    receivedAt: row.received_at,
    expiresAt: row.expires_at || '',
    reason: row.reason,
    status: row.status === 'IN_WARRANTY' ? 'En garantía' : row.status === 'OUT_OF_WARRANTY' ? 'Fuera de garantía' : row.status === 'IN_REVIEW' ? 'En revisión' : 'Resuelto',
    notes: row.notes || ''
  }));
}

function getErrorLogs(db) {
  return db.prepare(`
    SELECT el.*, COALESCE(u.name, 'Sistema') AS user_name
    FROM error_logs el
    LEFT JOIN users u ON u.id = el.user_id
    ORDER BY el.created_at DESC, el.rowid DESC
    LIMIT 200
  `).all().map(row => ({
    id: row.id,
    userId: row.user_id || '',
    userName: row.user_name,
    level: row.level,
    code: row.code || '',
    message: row.message,
    entityType: row.entity_type || '',
    entityId: row.entity_id || '',
    requestId: row.request_id || '',
    createdAt: row.created_at
  }));
}

function getAuditLogs(db) {
  return db.prepare(`
    SELECT al.*, COALESCE(u.name, 'Sistema') AS user_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC, al.rowid DESC
  `).all().map(row => ({
    id: row.id,
    userId: row.user_id || '',
    userName: row.user_name,
    action: row.action,
    entity: row.entity_id,
    entityType: row.entity_type,
    before: row.before_value || '',
    after: row.after_value || '',
    createdAt: row.created_at
  }));
}

function optionValues(db, type) {
  return db.prepare(`
    SELECT value FROM options
    WHERE option_type = ? AND active = 1
    ORDER BY sort_order, value
  `).all(type).map(row => row.value);
}

function activeLookupValues(db, table) {
  return db.prepare(`SELECT name FROM ${table} WHERE active = 1 ORDER BY name`).all().map(row => row.name);
}

export function redactDataForUser(data, user) {
  if (!user || user.role !== 'Vendedor' || data == null) return data;
  const redact = value => {
    if (Array.isArray(value)) return value.map(redact);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      ['cost', 'profit'].includes(key) ? null : redact(nested)
    ]));
  };
  return redact(data);
}

export function bootstrapStateForUser(db, user) {
  const state = bootstrapState(db);
  if (!user || user.role === 'Administrador') return state;

  state.users = state.users.map(userRow => ({
    id: userRow.id,
    name: userRow.name,
    role: userRow.role,
    active: userRow.active,
    avatar: userRow.avatar
  }));

  if (user.role === 'Vendedor') {
    state.products = state.products.map(product => ({ ...product, cost: null, supplierId: '' }));
    state.units = state.units.map(unit => ({ ...unit, cost: null }));
    state.sales = state.sales.map(sale => ({
      ...sale,
      cost: null,
      profit: null,
      items: sale.items.map(item => ({ ...item, cost: null }))
    }));
    state.movements = state.movements.map(movement => ({ ...movement, cost: null }));
    state.suppliers = [];
    state.purchases = [];
    state.auditLogs = [];
    state.errorLogs = [];
  } else if (user.role === 'Inventario') {
    state.customers = [];
    state.sales = [];
    state.returns = [];
    state.errorLogs = [];
    state.auditLogs = state.auditLogs.map(log => ({
      id: log.id,
      userId: log.userId,
      userName: log.userName,
      action: log.action,
      entity: log.entity,
      createdAt: log.createdAt
    }));
  }
  return state;
}

export function bootstrapState(db) {
  const buildState = () => {
    const products = getProducts(db);
    const settings = getSettings(db);
    settings.brands = activeLookupValues(db, 'brands');
    settings.categories = activeLookupValues(db, 'categories');
    settings.locations = activeLookupValues(db, 'locations');
    settings.capacities = activeLookupValues(db, 'capacities');
    settings.colors = activeLookupValues(db, 'colors');
    const productGroups = [...new Map(products.map(product => [product.productId, {
      id: product.productId,
      brand: product.brand,
      model: product.model,
      category: product.category,
      variants: []
    }])).values()];
    for (const product of products) {
      const group = productGroups.find(item => item.id === product.productId);
      if (group) group.variants.push(product);
    }
    return {
    version: 3,
    settings,
    users: getUsers(db),
    suppliers: getSuppliers(db),
    customers: getCustomers(db),
    products,
    productGroups,
    units: getUnits(db),
    sales: getSales(db),
    returns: getReturns(db),
    purchases: getPurchases(db),
    movements: getMovements(db),
    reservations: getReservations(db),
    warrantyClaims: getWarrantyClaims(db),
    auditLogs: getAuditLogs(db),
    errorLogs: getErrorLogs(db),
    options: db.prepare(`
      SELECT id, option_type, value, label, sort_order, metadata_json, active, created_at, updated_at
      FROM options ORDER BY option_type, sort_order, value
    `).all().map(row => ({
      id: row.id,
      type: row.option_type,
      value: row.value,
      label: row.label,
      sortOrder: Number(row.sort_order),
      metadata: (() => {
        try { return JSON.parse(row.metadata_json); } catch { return {}; }
      })(),
      active: row.active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    paymentMethods: optionValues(db, 'payment_method'),
    categories: activeLookupValues(db, 'categories'),
    locations: activeLookupValues(db, 'locations'),
    capacities: activeLookupValues(db, 'capacities'),
    colors: activeLookupValues(db, 'colors'),
    brands: activeLookupValues(db, 'brands'),
    models: db.prepare(`
      SELECT pm.id, pm.brand_id AS brandId, b.name AS brand, pm.name,
             pm.availability_status, pm.official_url, pm.active
      FROM product_models pm JOIN brands b ON b.id = pm.brand_id
      ORDER BY b.name, pm.name
    `).all().map(row => ({
      id: row.id,
      brandId: row.brandId,
      brand: row.brand,
      name: row.name,
      availabilityStatus: row.availability_status || 'OWN_STOCK',
      officialUrl: row.official_url || '',
      active: row.active === 1
    }))
    };
  };
  return db.inTransaction ? buildState() : db.transaction(buildState)();
}
