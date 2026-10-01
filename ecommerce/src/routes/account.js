import express from 'express';
import { requireCsrf } from '../lib/auth-guard.js';
import { requireCustomer } from '../services/auth.js';
import { getCustomerProfile } from '../services/auth.js';
import { listCustomerOrders } from '../services/orders.js';
import { getDatabase, transaction } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { email, text } from '../lib/validation.js';

export function accountRouter({ config }) {
  const router = express.Router();
  router.use((req, _res, next) => {
    req.customer = requireCustomer(req);
    next();
  });
  router.get('/profile', (req, res) => res.json({ data: profileView(getCustomerProfile(req.customer.id)) }));
  router.put('/profile', requireCsrf(config), (req, res) => {
    const current = getCustomerProfile(req.customer.id);
    const next = {
      first_name: text(req.body?.firstName ?? current.first_name, 'firstName', { required: true, max: 80 }),
      last_name: text(req.body?.lastName ?? current.last_name, 'lastName', { required: true, max: 80 }),
      phone: text(req.body?.phone ?? current.phone, 'phone', { required: true, max: 40 }),
      whatsapp: text(req.body?.whatsapp ?? current.whatsapp, 'whatsapp', { max: 40 }),
      email: email(req.body?.email ?? current.email),
      accepts_marketing: req.body?.acceptsMarketing ? 1 : 0,
      updated_at: new Date().toISOString(),
      id: req.customer.id
    };
    getDatabase().prepare('UPDATE customers SET first_name=@first_name, last_name=@last_name, phone=@phone, whatsapp=@whatsapp, email=@email, accepts_marketing=@accepts_marketing, updated_at=@updated_at WHERE id=@id').run(next);
    res.json({ data: profileView(getCustomerProfile(req.customer.id)) });
  });
  router.get('/orders', (req, res) => res.json({ data: listCustomerOrders(req.customer.id) }));
  router.get('/addresses', (req, res) => res.json({ data: listAddresses(req.customer.id) }));
  router.post('/addresses', requireCsrf(config), (req, res) => {
    const address = { label: text(req.body?.label, 'label', { required: true, max: 60 }), street: text(req.body?.street, 'street', { required: true, max: 160 }), number: text(req.body?.number, 'number', { required: true, max: 20 }), floor: text(req.body?.floor, 'floor', { max: 20 }), apartment: text(req.body?.apartment, 'apartment', { max: 20 }), locality: text(req.body?.locality, 'locality', { required: true, max: 100 }), province: text(req.body?.province, 'province', { required: true, max: 100 }), postalCode: text(req.body?.postalCode, 'postalCode', { required: true, max: 20 }), notes: text(req.body?.notes, 'notes', { max: 500 }) };
    const result = getDatabase().prepare(`INSERT INTO customer_addresses (customer_id, label, street, number, floor, apartment, locality, province, postal_code, notes, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.customer.id, address.label, address.street, address.number, address.floor, address.apartment, address.locality, address.province, address.postalCode, address.notes, req.body?.isDefault ? 1 : 0);
    if (req.body?.isDefault) getDatabase().prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ? AND id <> ?').run(req.customer.id, result.lastInsertRowid);
    res.status(201).json({ data: getDatabase().prepare('SELECT * FROM customer_addresses WHERE id = ?').get(result.lastInsertRowid) });
  });
  router.delete('/addresses/:id', requireCsrf(config), (req, res) => {
    getDatabase().prepare('DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?').run(Number(req.params.id), req.customer.id);
    res.json({ data: { deleted: true } });
  });
  router.get('/wishlist', (req, res) => res.json({ data: getDatabase().prepare('SELECT inventory_product_id AS productId, created_at AS createdAt FROM wishlists WHERE customer_id = ? ORDER BY created_at DESC').all(req.customer.id) }));
  router.post('/wishlist/:productId', requireCsrf(config), (req, res) => {
    const productId = String(req.params.productId || '').trim();
    if (!productId) throw new AppError('Producto inválido.', { code: 'VALIDATION_ERROR' });
    getDatabase().prepare('INSERT INTO wishlists (customer_id, inventory_product_id) VALUES (?, ?) ON CONFLICT(customer_id, inventory_product_id) DO NOTHING').run(req.customer.id, productId);
    res.status(201).json({ data: { productId, saved: true } });
  });
  router.delete('/wishlist/:productId', requireCsrf(config), (req, res) => {
    getDatabase().prepare('DELETE FROM wishlists WHERE customer_id = ? AND inventory_product_id = ?').run(req.customer.id, Number(req.params.productId));
    res.json({ data: { productId: Number(req.params.productId), saved: false } });
  });
  return router;
}

function listAddresses(customerId) {
  return getDatabase().prepare('SELECT id, label, street, number, floor, apartment, locality, province, postal_code AS postalCode, notes, is_default AS isDefault, created_at AS createdAt FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC').all(customerId);
}

function profileView(row) {
  if (!row) return null;
  return { id: row.id, firstName: row.first_name, lastName: row.last_name, documentType: row.document_type, documentNumber: row.document_number, email: row.email, phone: row.phone, whatsapp: row.whatsapp, acceptsMarketing: Boolean(row.accepts_marketing), createdAt: row.created_at };
}
