import bcrypt from 'bcryptjs';
import { unauthorized } from './errors.js';
import { bootstrapState } from './db/bootstrap.js';
import { nowIso, randomToken, sha256 } from './utils.js';
import { emailAddress, requireObject } from './validation.js';

const DUMMY_PASSWORD_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

function userById(db, id) {
  return bootstrapState(db).users.find(user => user.id === id) || null;
}

export async function authenticate(db, payload, config, request) {
  requireObject(payload);
  const email = emailAddress(payload.email, { required: true });
  const password = String(payload.password || '');
  if (!password || password.length > 200) throw unauthorized('Credenciales incorrectas.');

  const row = db.prepare(`
    SELECT u.*, r.name AS role
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.email = ? COLLATE NOCASE
  `).get(email);
  const valid = await bcrypt.compare(password, row?.password_hash || DUMMY_PASSWORD_HASH);
  if (!row || row.active !== 1 || !valid) throw unauthorized('Credenciales incorrectas. Revisá tu email y contraseña.');

  const token = randomToken();
  const tokenHash = sha256(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + config.sessionTtlMs).toISOString();
  const userId = row.id;
  const ip = request.ip || request.socket?.remoteAddress || null;
  const userAgent = String(request.get('user-agent') || '').slice(0, 500);

  db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(createdAt);
    db.prepare(`
      INSERT INTO sessions (
        token_hash, user_id, expires_at, created_at, last_seen_at, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(tokenHash, userId, expiresAt, createdAt, createdAt, ip, userAgent || null);
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
      .run(createdAt, createdAt, userId);
  }).immediate();

  return { token, expiresAt, user: userById(db, userId) };
}

export function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/'
  };
}

export function setSessionCookie(response, token, config) {
  response.cookie(config.cookieName, token, {
    ...sessionCookieOptions(config),
    maxAge: config.sessionTtlMs
  });
}

export function clearSessionCookie(response, config) {
  response.clearCookie(config.cookieName, sessionCookieOptions(config));
}

export function authMiddleware(db, config) {
  return (request, response, next) => {
    try {
      const token = request.cookies?.[config.cookieName];
      if (!token) return next(unauthorized());
      const tokenHash = sha256(token);
      const now = nowIso();
      const row = db.prepare(`
        SELECT s.token_hash, s.expires_at, s.last_seen_at,
               u.id, u.name, u.email, u.active, r.name AS role
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        JOIN roles r ON r.id = u.role_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
      `).get(tokenHash, now);
      if (!row) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ? AND expires_at <= ?').run(tokenHash, now);
        return next(unauthorized('La sesión expiró o el usuario está inactivo.'));
      }
      if (!row.last_seen_at || new Date(row.last_seen_at).getTime() < Date.now() - 5 * 60 * 1000) {
        db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, tokenHash);
      }
      request.user = {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        active: row.active === 1
      };
      request.sessionTokenHash = tokenHash;
      response.locals.user = request.user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function logout(db, config, request, response) {
  const token = request.cookies?.[config.cookieName];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  clearSessionCookie(response, config);
}

export function requireRoles(...roles) {
  return (request, _response, next) => {
    if (!request.user) return next(unauthorized());
    if (!roles.includes(request.user.role)) {
      const error = new Error('Tu rol no permite realizar esta acción.');
      error.status = 403;
      error.code = 'FORBIDDEN';
      return next(error);
    }
    return next();
  };
}
