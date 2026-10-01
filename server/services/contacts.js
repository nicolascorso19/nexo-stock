import { createId, nowIso } from '../utils.js';
import { bootstrapState } from '../db/bootstrap.js';
import { recordAudit } from './audit.js';
import { emailAddress, idText, optionalText, requiredText, requireObject } from '../validation.js';
import { conflict, notFound } from '../errors.js';

function normalizeTaxId(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function splitName(payload, previous = {}) {
  const firstName = optionalText(payload.firstName ?? previous.firstName, 'El nombre', { max: 100 });
  const lastName = optionalText(payload.lastName ?? previous.lastName, 'El apellido', { max: 100 });
  const suppliedName = optionalText(payload.name, 'El nombre y apellido', { max: 180 });
  if (suppliedName) {
    const parts = suppliedName.split(/\s+/).filter(Boolean);
    return { firstName: firstName || parts.slice(0, -1).join(' '), lastName: lastName || parts.slice(-1)[0] || '', name: suppliedName };
  }
  const name = [firstName, lastName].filter(Boolean).join(' ') || previous.name;
  return { firstName, lastName, name };
}

function assertUniqueCustomer(db, taxId, ignoreId = null) {
  const normalized = normalizeTaxId(taxId);
  if (!normalized) return;
  const row = db.prepare(`
    SELECT id, name FROM customers
    WHERE id <> ? AND REPLACE(REPLACE(REPLACE(trim(COALESCE(tax_id, '')), '.', ''), '-', ''), ' ', '') = ?
    LIMIT 1
  `).get(ignoreId || '', normalized);
  if (row) throw conflict(`Ya existe un cliente con este DNI: ${row.name}.`, 'DUPLICATE_CUSTOMER_TAX_ID');
}

function customerPayload(payload, previous = {}) {
  const names = splitName(payload, previous);
  return {
    name: requiredText(names.name, 'El nombre del cliente', { max: 180 }),
    firstName: names.firstName || null,
    lastName: names.lastName || null,
    taxId: optionalText(payload.taxId ?? previous.taxId, 'El documento', { max: 80 }) || null,
    phone: optionalText(payload.phone ?? previous.phone, 'El teléfono', { max: 80 }) || null,
    whatsapp: optionalText(payload.whatsapp ?? previous.whatsapp, 'WhatsApp', { max: 80 }) || null,
    email: emailAddress(payload.email ?? previous.email) || null,
    address: optionalText(payload.address ?? previous.address, 'La dirección', { max: 300 }) || null,
    notes: optionalText(payload.notes ?? previous.notes, 'Las notas', { max: 4000 }) || null
  };
}

export function createCustomer(db, payload, user, request) {
  requireObject(payload);
  return db.transaction(() => {
    const row = customerPayload(payload);
    assertUniqueCustomer(db, row.taxId);
    const id = createId('customer');
    const now = nowIso();
    db.prepare(`
      INSERT INTO customers (id, name, first_name, last_name, tax_id, phone, whatsapp, email, address, notes, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, row.name, row.firstName, row.lastName, row.taxId, row.phone, row.whatsapp, row.email, row.address, row.notes, now, now);
    recordAudit(db, { userId: user.id, action: 'Cliente creado', entityType: 'customer', entityId: id, after: row, request });
    return bootstrapState(db).customers.find(customer => customer.id === id);
  }).immediate();
}

export function createSupplier(db, payload, user, request) {
  requireObject(payload);
  return db.transaction(() => {
    const row = {
      id: createId('supplier'),
      name: requiredText(payload.name, 'El nombre del proveedor', { max: 180 }),
      company: optionalText(payload.company, 'La empresa', { max: 180 }) || null,
      taxId: optionalText(payload.taxId, 'El CUIT', { max: 80 }) || null,
      phone: optionalText(payload.phone, 'El teléfono', { max: 80 }) || null,
      whatsapp: optionalText(payload.whatsapp, 'WhatsApp', { max: 80 }) || null,
      email: emailAddress(payload.email) || null,
      address: optionalText(payload.address, 'La dirección', { max: 300 }) || null,
      notes: optionalText(payload.notes, 'Las notas', { max: 4000 }) || null
    };
    const now = nowIso();
    db.prepare(`INSERT INTO suppliers (id, name, company, tax_id, phone, whatsapp, email, address, notes, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(row.id, row.name, row.company, row.taxId, row.phone, row.whatsapp, row.email, row.address, row.notes, now, now);
    recordAudit(db, { userId: user.id, action: 'Proveedor creado', entityType: 'supplier', entityId: row.id, after: row, request });
    return bootstrapState(db).suppliers.find(supplier => supplier.id === row.id);
  }).immediate();
}

export function updateCustomer(db, id, payload, user, request) {
  requireObject(payload);
  idText(id, 'El id del cliente');
  return db.transaction(() => {
    const before = bootstrapState(db).customers.find(customer => customer.id === id);
    if (!before) throw notFound('El cliente');
    const next = customerPayload(payload, before);
    assertUniqueCustomer(db, next.taxId, id);
    const now = nowIso();
    db.prepare('UPDATE customers SET name = ?, first_name = ?, last_name = ?, tax_id = ?, phone = ?, whatsapp = ?, email = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?')
      .run(next.name, next.firstName, next.lastName, next.taxId, next.phone, next.whatsapp, next.email, next.address, next.notes, now, id);
    recordAudit(db, { userId: user.id, action: 'Cliente actualizado', entityType: 'customer', entityId: id, before, after: next, request });
    return bootstrapState(db).customers.find(customer => customer.id === id);
  }).immediate();
}

export function updateSupplier(db, id, payload, user, request) {
  requireObject(payload);
  idText(id, 'El id del proveedor');
  return db.transaction(() => {
    const before = bootstrapState(db).suppliers.find(supplier => supplier.id === id);
    if (!before) throw notFound('El proveedor');
    const next = {
      name: requiredText(payload.name ?? before.name, 'El nombre del proveedor', { max: 180 }),
      company: optionalText(payload.company ?? before.company, 'La empresa', { max: 180 }) || null,
      taxId: optionalText(payload.taxId ?? before.taxId, 'El CUIT', { max: 80 }) || null,
      phone: optionalText(payload.phone ?? before.phone, 'El teléfono', { max: 80 }) || null,
      whatsapp: optionalText(payload.whatsapp ?? before.whatsapp, 'WhatsApp', { max: 80 }) || null,
      email: emailAddress(payload.email ?? before.email) || null,
      address: optionalText(payload.address ?? before.address, 'La dirección', { max: 300 }) || null,
      notes: optionalText(payload.notes ?? before.notes, 'Las notas', { max: 4000 }) || null
    };
    const now = nowIso();
    db.prepare('UPDATE suppliers SET name = ?, company = ?, tax_id = ?, phone = ?, whatsapp = ?, email = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?')
      .run(next.name, next.company, next.taxId, next.phone, next.whatsapp, next.email, next.address, next.notes, now, id);
    recordAudit(db, { userId: user.id, action: 'Proveedor actualizado', entityType: 'supplier', entityId: id, before, after: next, request });
    return bootstrapState(db).suppliers.find(supplier => supplier.id === id);
  }).immediate();
}

export function customerHistory(db, id) {
  const customer = bootstrapState(db).customers.find(item => item.id === id);
  if (!customer) throw notFound('El cliente');
  const state = bootstrapState(db);
  const sales = state.sales.filter(sale => sale.customerId === id);
  const returns = state.returns.filter(item => item.customerId === id);
  return {
    customer,
    sales,
    returns,
    purchaseCount: sales.filter(sale => sale.statusCode !== 'ANNULLED').length,
    totalSpent: sales.filter(sale => sale.statusCode !== 'ANNULLED').reduce((sum, sale) => sum + sale.total, 0),
    lastPurchaseAt: sales.filter(sale => sale.statusCode !== 'ANNULLED').map(sale => sale.date).sort().at(-1) || ''
  };
}
