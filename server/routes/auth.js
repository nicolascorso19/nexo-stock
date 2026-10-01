import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authMiddleware, logout } from '../auth.js';
import { bootstrapStateForUser } from '../db/bootstrap.js';

export function authRoutes(db, config) {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({
      error: { code: 'LOGIN_RATE_LIMIT', message: 'Demasiados intentos de acceso. Probá de nuevo en unos minutos.' }
    })
  });

  router.post('/auth/login', loginLimiter, async (request, response) => {
    const result = await authenticate(db, request.body, config, request);
    response.cookie(config.cookieName, result.token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'strict',
      path: '/',
      maxAge: config.sessionTtlMs
    });
    response.status(200).json({ data: { user: result.user }, state: bootstrapStateForUser(db, result.user) });
  });

  router.use('/auth', authMiddleware(db, config));
  router.post('/auth/logout', (request, response) => {
    logout(db, config, request, response);
    response.json({ data: { loggedOut: true } });
  });
  router.get('/auth/me', (request, response) => {
    response.json({ data: { user: request.user } });
  });

  return router;
}
