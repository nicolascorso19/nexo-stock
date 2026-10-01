import bcrypt from 'bcryptjs';
import { getDatabase, transaction } from '../db/database.js';
import { AppError } from '../lib/errors.js';
import { randomToken, hashToken, safeEqual, hashIp } from '../lib/security.js';
import { email, normalizeDocument, text } from '../lib/validation.js';

export const CUSTOMER_COOKIE = 'nexo_store_customer';
export const ADMIN_COOKIE = 'nexo_store_admin';
export const CART_COOKIE = 'nexo_store_cart';
export const CSRF_COOKIE = 'nexo_store_csrf';

function cookieOptions(config, httpOnly = true) {
  return { httpOnly, secure: config.cookieSecure, sameSite: 'lax', path: '/' };
}

function issueCsrfCookie(res, config, token = randomToken(24)) {
  res.cookie(CSRF_COOKIE, token, cookieOptions(config, false));
  return token;
}

export function ensureCsrfToken(req, res, config) {
  const existing = String(req.cookies?.[CSRF_COOKIE] || '');
  if (existing.length >= 20) return existing;
  return issueCsrfCookie(res, config);
}

export function requireCsrf(req, _res, config) {
  const cookie = String(req.cookies?.[CSRF_COOKIE] || '');
  const header = String(req.get('X-CSRF-Token') || '');
  if (!cookie || !header || !safeEqual(cookie, header)) throw new AppError('La validación CSRF no fue superada. Actualizá la página e intentá nuevamente.', { status: 403, code: 'CSRF_FAILED' });
  const session = getSession(req);
  if (session?.csrfToken && !safeEqual(session.csrfToken, header)) throw new AppError('La sesión expiró. Actualizá la página e intentá nuevamente.', { status: 403, code: 'CSRF_FAILED' });
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new AppError('La contraseña debe tener entre 8 y 200 caracteres.', { code: 'VALIDATION_ERROR' });
  return bcrypt.hash(password, 12);
}

export async function registerCustomer(input, req, res, config) {
  const emailValue = email(input.email);
  const document = normalizeDocument(input.documentNumber);
  if (!document) throw new AppError('El DNI es obligatorio.', { code: 'VALIDATION_ERROR' });
  const passwordHash = await hashPassword(input.password);
  const db = getDatabase();
  const exists = db.prepare('SELECT id FROM customers WHERE (email = ? OR document_number_normalized = ?) AND archived_at IS NULL').get(emailValue, document);
  if (exists) throw new AppError('Ya existe una cuenta con ese email o documento.', { status: 409, code: 'CUSTOMER_EXISTS' });
  const row = {
    first_name: text(input.firstName, 'firstName', { required: true, max: 80 }),
    last_name: text(input.lastName, 'lastName', { required: true, max: 80 }),
    document_type: input.documentType || 'DNI',
    document_number: text(input.documentNumber, 'documentNumber', { required: true, max: 40 }),
    document_number_normalized: document,
    email: emailValue,
    phone: text(input.phone, 'phone', { required: true, max: 40 }),
    whatsapp: text(input.whatsapp, 'whatsapp', { max: 40 }),
    password_hash: passwordHash,
    accepts_marketing: input.acceptsMarketing ? 1 : 0
  };
  const customerId = transaction(() => db.prepare(`
    INSERT INTO customers (first_name, last_name, document_type, document_number, document_number_normalized, email, phone, whatsapp, password_hash, accepts_marketing)
    VALUES (@first_name, @last_name, @document_type, @document_number, @document_number_normalized, @email, @phone, @whatsapp, @password_hash, @accepts_marketing)
  `).run(row).lastInsertRowid);
  return createCustomerSession(customerId, req, res, config);
}

export async function loginCustomer(input, req, res, config) {
  const db = getDatabase();
  const customer = db.prepare('SELECT * FROM customers WHERE email = ? COLLATE NOCASE AND archived_at IS NULL').get(email(input.email));
  const valid = customer ? await bcrypt.compare(String(input.password || ''), customer.password_hash) : false;
  if (!valid) throw new AppError('Email o contraseña incorrectos.', { status: 401, code: 'INVALID_CREDENTIALS' });
  return createCustomerSession(customer.id, req, res, config);
}

export async function loginAdmin(input, req, res, config) {
  const db = getDatabase();
  const admin = db.prepare('SELECT * FROM admin_users WHERE email = ? COLLATE NOCASE AND active = 1').get(email(input.email));
  const valid = admin ? await bcrypt.compare(String(input.password || ''), admin.password_hash) : false;
  if (!valid) throw new AppError('Email o contraseña incorrectos.', { status: 401, code: 'INVALID_CREDENTIALS' });
  db.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), admin.id);
  return createAdminSession(admin.id, req, res, config);
}

export function createCustomerSession(customerId, req, res, config) {
  return createSession('customer', customerId, req, res, config);
}

export function createAdminSession(adminId, req, res, config) {
  return createSession('admin', adminId, req, res, config);
}

function createSession(kind, userId, req, res, config) {
  const token = randomToken(40);
  const csrfToken = issueCsrfCookie(res, config);
  const expiresAt = new Date(Date.now() + config.sessionTtlMs).toISOString();
  const ipHash = hashIp(req.ip, config.stockApi.secret || 'nexo-store');
  const table = kind === 'admin' ? 'admin_sessions' : 'customer_sessions';
  getDatabase().prepare(`INSERT INTO ${table} (${kind === 'admin' ? 'admin_id' : 'customer_id'}, token_hash, csrf_token, user_agent, ip_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId, hashToken(token), csrfToken, String(req.get('user-agent') || '').slice(0, 300), ipHash, expiresAt);
  const cookie = kind === 'admin' ? ADMIN_COOKIE : CUSTOMER_COOKIE;
  res.cookie(cookie, token, { ...cookieOptions(config), maxAge: config.sessionTtlMs });
  return { token, csrfToken, expiresAt, kind, userId: Number(userId) };
}

export function logout(req, res, config) {
  const db = getDatabase();
  const customerToken = req.cookies?.[CUSTOMER_COOKIE];
  const adminToken = req.cookies?.[ADMIN_COOKIE];
  if (customerToken) db.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(hashToken(customerToken));
  if (adminToken) db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashToken(adminToken));
  res.clearCookie(CUSTOMER_COOKIE, cookieOptions(config));
  res.clearCookie(ADMIN_COOKIE, cookieOptions(config));
  return { ok: true };
}

export function getSession(req) {
  const db = getDatabase();
  const adminToken = req.cookies?.[ADMIN_COOKIE];
  if (adminToken) {
    const session = db.prepare(`SELECT s.*, u.id AS user_id, u.name, u.email, u.role, u.active
      FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).get(hashToken(adminToken), new Date().toISOString());
    if (session) return { kind: 'admin', id: session.user_id, name: session.name, email: session.email, role: session.role, csrfToken: session.csrf_token };
  }
  const customerToken = req.cookies?.[CUSTOMER_COOKIE];
  if (customerToken) {
    const session = db.prepare(`SELECT s.*, c.id AS user_id, c.first_name, c.last_name, c.email, c.archived_at
      FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND c.archived_at IS NULL`).get(hashToken(customerToken), new Date().toISOString());
    if (session) return { kind: 'customer', id: session.user_id, name: `${session.first_name} ${session.last_name}`, email: session.email, csrfToken: session.csrf_token };
  }
  return null;
}

export function requireCustomer(req) {
  const session = getSession(req);
  if (!session || session.kind !== 'customer') throw new AppError('Iniciá sesión para continuar.', { status: 401, code: 'AUTH_REQUIRED' });
  return session;
}

export function requireAdmin(req, roles = ['ADMIN']) {
  const session = getSession(req);
  if (!session || session.kind !== 'admin') throw new AppError('Acceso exclusivo del administrador.', { status: 401, code: 'ADMIN_REQUIRED' });
  if (!roles.includes(session.role)) throw new AppError('No tenés permiso para esta acción.', { status: 403, code: 'FORBIDDEN' });
  return session;
}

export async function createAdminUser({ name, email: emailValue, password, role = 'ADMIN' }) {
  const passwordHash = await hashPassword(password);
  const result = getDatabase().prepare(`INSERT INTO admin_users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`)
    .run(text(name, 'name', { required: true, max: 120 }), email(emailValue), passwordHash, role);
  return { id: Number(result.lastInsertRowid), name, email: emailValue, role };
}

export function getCustomerProfile(customerId) {
  return getDatabase().prepare('SELECT id, first_name, last_name, document_type, document_number, email, phone, whatsapp, accepts_marketing, created_at FROM customers WHERE id = ?').get(customerId);
}

export async function requestPasswordReset(emailValue, req, res, config) {
  const db = getDatabase();
  const customer = db.prepare('SELECT id, email FROM customers WHERE email = ? COLLATE NOCASE AND archived_at IS NULL').get(email(emailValue));
  if (!customer) return { accepted: true };
  const token = randomToken(36);
  db.prepare('INSERT INTO password_resets (customer_id, token_hash, expires_at) VALUES (?, ?, ?)').run(customer.id, hashToken(token), new Date(Date.now() + 60 * 60 * 1000).toISOString());
  // El enlace se entrega por el outbox de email; nunca se devuelve en respuestas de producción.
  db.prepare('INSERT INTO email_outbox (template, recipient, subject, payload_json, dedupe_key) VALUES (?, ?, ?, ?, ?)').run(
    'PASSWORD_RESET', customer.email, 'Restablecer tu contraseña',
    JSON.stringify({ customerId: customer.id, resetUrl: `${config.publicBaseUrl}/recuperar?token=${encodeURIComponent(token)}` }),
    `PASSWORD_RESET:${customer.id}:${Date.now()}`
  );
  return { accepted: true };
}

export async function resetPassword(input, req, res, config) {
  const token = String(input.token || '');
  const db = getDatabase();
  const record = db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(hashToken(token), new Date().toISOString());
  if (!record) throw new AppError('El enlace de restablecimiento no es válido o expiró.', { status: 400, code: 'INVALID_RESET_TOKEN' });
  const passwordHash = await hashPassword(input.password);
  transaction(() => {
    db.prepare('UPDATE customers SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, new Date().toISOString(), record.customer_id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(new Date().toISOString(), record.id);
    db.prepare('DELETE FROM customer_sessions WHERE customer_id = ?').run(record.customer_id);
  });
  return { ok: true };
}
