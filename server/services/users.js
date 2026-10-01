import bcrypt from 'bcryptjs';
import { AppError, conflict, notFound, unprocessable } from '../errors.js';
import { bootstrapState } from '../db/bootstrap.js';
import { asBoolean, createId, initials, nowIso } from '../utils.js';
import { recordAudit } from './audit.js';
import { emailAddress, idText, requireObject, requiredText } from '../validation.js';

function userById(db, id) {
  return bootstrapState(db).users.find(user => user.id === id) || null;
}

function rawUser(db, id) {
  return db.prepare(`
    SELECT u.*, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.id = ?
  `).get(id);
}

function resolveRole(db, value) {
  const role = String(value || '').trim();
  if (!role) throw unprocessable('Indicá un rol válido.', 'ROLE_REQUIRED');
  const found = db.prepare(`
    SELECT id, name, active FROM roles
    WHERE id = ? COLLATE NOCASE OR name = ? COLLATE NOCASE
  `).get(role, role);
  if (!found) throw unprocessable('El rol seleccionado no existe.', 'ROLE_NOT_FOUND');
  if (!found.active) throw unprocessable('El rol seleccionado está inactivo.', 'ROLE_INACTIVE');
  return found;
}

function strictBoolean(value, label) {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1 || value === '0' || value === '1') return Boolean(Number(value));
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'false', 'yes', 'no', 'on', 'off'].includes(normalized)) return asBoolean(normalized);
  throw unprocessable(`${label} debe ser booleano.`);
}

function assertNotLastAdmin(db, existing, nextRoleId, nextActive, actingUser) {
  if (existing.role_name !== 'Administrador' || (nextRoleId === existing.role_id && nextActive)) return;
  if (existing.id === actingUser.id && !nextActive) {
    throw conflict('No podés desactivar tu propio usuario administrador.', 'CANNOT_DEACTIVATE_SELF');
  }
  const count = db.prepare(`
    SELECT COUNT(*) AS count
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.active = 1 AND r.name = 'Administrador'
  `).get().count;
  if (count <= 1) throw conflict('Debe quedar al menos un usuario administrador activo.', 'LAST_ADMIN');
}

export function createUser(db, payload, user, request, bcryptRounds = 12) {
  requireObject(payload);
  const password = String(payload.password || '');
  if (password.length < 8 || password.length > 200) {
    throw unprocessable('La contraseña debe tener entre 8 y 200 caracteres.', 'INVALID_PASSWORD');
  }
  const passwordHash = bcrypt.hashSync(password, bcryptRounds);
  return db.transaction(() => {
    const name = requiredText(payload.name, 'El nombre', { max: 180 });
    const email = emailAddress(payload.email, { required: true });
    const role = resolveRole(db, payload.role || 'Vendedor');
    const active = payload.active === undefined ? true : strictBoolean(payload.active, 'active');
    const id = createId('user');
    const now = nowIso();

    db.prepare(`
      INSERT INTO users (
        id, role_id, name, email, password_hash, active, last_login_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(id, role.id, name, email, passwordHash, active ? 1 : 0, now, now);

    const created = userById(db, id);
    recordAudit(db, {
      userId: user.id,
      action: 'Usuario creado',
      entityType: 'user',
      entityId: id,
      after: { name: created.name, email: created.email, role: created.role, active: created.active },
      request
    });
    return created;
  }).immediate();
}

export function updateUser(db, id, payload, user, request, bcryptRounds = 12) {
  requireObject(payload);
  idText(id, 'El id del usuario');
  if (!Object.keys(payload).length) throw new AppError(422, 'EMPTY_PATCH', 'Enviá al menos un campo para actualizar.');
  let providedPasswordHash = null;
  if (Object.hasOwn(payload, 'password')) {
    const password = String(payload.password || '');
    if (password.length < 8 || password.length > 200) {
      throw unprocessable('La contraseña debe tener entre 8 y 200 caracteres.', 'INVALID_PASSWORD');
    }
    providedPasswordHash = bcrypt.hashSync(password, bcryptRounds);
  }
  return db.transaction(() => {
    const existingRaw = rawUser(db, id);
    if (!existingRaw) throw notFound('El usuario');
    const existing = userById(db, id);
    const nextName = payload.name === undefined ? existing.name : requiredText(payload.name, 'El nombre', { max: 180 });
    const nextEmail = payload.email === undefined ? existing.email : emailAddress(payload.email, { required: true });
    const nextRole = payload.role === undefined
      ? { id: existingRaw.role_id, name: existing.role }
      : resolveRole(db, payload.role);
    const nextActive = payload.active === undefined ? existing.active : strictBoolean(payload.active, 'active');
    assertNotLastAdmin(db, existingRaw, nextRole.id, nextActive, user);

    const passwordHash = providedPasswordHash || existingRaw.password_hash;

    const now = nowIso();
    db.prepare(`
      UPDATE users SET role_id = ?, name = ?, email = ?, password_hash = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(nextRole.id, nextName, nextEmail, passwordHash, nextActive ? 1 : 0, now, id);

    const updated = userById(db, id);
    recordAudit(db, {
      userId: user.id,
      action: 'Usuario actualizado',
      entityType: 'user',
      entityId: id,
      before: { name: existing.name, email: existing.email, role: existing.role, active: existing.active },
      after: { name: updated.name, email: updated.email, role: updated.role, active: updated.active },
      request
    });
    return updated;
  }).immediate();
}

export { resolveRole, userById };
