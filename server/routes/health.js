import { Router } from 'express';
import { databaseHealth } from '../db/database.js';
import { nowIso } from '../utils.js';

export function healthRoutes(db) {
  const router = Router();
  router.get('/health', (_request, response) => {
    const healthy = databaseHealth(db);
    response.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'error',
      service: 'nexo-api',
      database: healthy ? 'ok' : 'error',
      timestamp: nowIso()
    });
  });
  return router;
}
