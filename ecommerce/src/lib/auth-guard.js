import { AppError } from './errors.js';
import { requireCsrf as checkCsrf } from '../services/auth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * El token CSRF protege operaciones que cambian estado. Aplicado sobre GET/HEAD
 * no aporta seguridad y rompe las lecturas: el navegador sólo puede adjuntar
 * la cabecera en mutaciones, así que exigirla en lecturas convertía cualquier
 * panel en un 403 constante.
 */
export function requireCsrf(config) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(String(req.method || 'GET').toUpperCase())) return next();
    try {
      checkCsrf(req, res, config);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireSameOrigin(config) {
  return (req, _res, next) => {
    const origin = req.get('Origin');
    if (!origin) return next();
    try {
      const allowed = new URL(config.publicBaseUrl).origin;
      if (new URL(origin).origin !== allowed && origin !== `${req.protocol}://${req.get('host')}`) throw new AppError('Origen no permitido.', { status: 403, code: 'ORIGIN_NOT_ALLOWED' });
      next();
    } catch {
      next(new AppError('Origen no permitido.', { status: 403, code: 'ORIGIN_NOT_ALLOWED' }));
    }
  };
}
