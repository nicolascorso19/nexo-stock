import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireCsrf } from '../lib/auth-guard.js';
import { getSession, ensureCsrfToken, registerCustomer, loginCustomer, logout, requestPasswordReset, resetPassword } from '../services/auth.js';
import { mergeCustomerCart } from '../services/cart.js';

export function authRouter({ config }) {
  const router = express.Router();
  // El límite global (300/min) no frena un ataque de credenciales: hay que
  // probarlas miles de veces por minuto desde una sola IP.
  const credentialsLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos. Probá de nuevo en unos minutos.' } }
  });
  router.get('/session', (req, res) => {
    const session = getSession(req);
    const csrfToken = ensureCsrfToken(req, res, config);
    res.json({ data: { authenticated: Boolean(session), user: session ? { id: session.id, kind: session.kind, name: session.name, email: session.email, role: session.role } : null, csrfToken } });
  });

  router.post('/register', requireCsrf(config), async (req, res) => {
    const result = await registerCustomer(req.body, req, res, config);
    attachMergedCart(req, res, config, result.userId || result.customerId);
    res.status(201).json({ data: { authenticated: true, csrfToken: result.csrfToken, user: { id: result.userId || result.customerId, kind: 'customer' } } });
  });

  router.post('/login', credentialsLimiter, requireCsrf(config), async (req, res) => {
    const result = await loginCustomer(req.body, req, res, config);
    attachMergedCart(req, res, config, result.userId || result.customerId);
    res.json({ data: { authenticated: true, csrfToken: result.csrfToken } });
  });

  router.post('/logout', requireCsrf(config), (req, res) => {
    logout(req, res, config);
    res.json({ data: { ok: true } });
  });

  router.post('/password-reset/request', credentialsLimiter, requireCsrf(config), async (req, res) => {
    await requestPasswordReset(req.body?.email, req, res, config);
    res.json({ data: { accepted: true, message: 'Si existe una cuenta, te enviaremos un enlace.' } });
  });

  router.post('/password-reset/confirm', credentialsLimiter, requireCsrf(config), async (req, res) => {
    await resetPassword(req.body, req, res, config);
    res.json({ data: { ok: true } });
  });

  return router;
}

function attachMergedCart(req, res, config, customerId) {
  if (customerId) mergeCustomerCart(customerId, req, res, config);
}
