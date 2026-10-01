import { Router } from 'express';
import { createBackup } from '../services/backup.js';
import { restoreBackup } from '../db/restore.js';
import { resetInitialData } from '../services/admin.js';
import { inventoryReconciliation, reconcileInventory } from '../services/stock.js';
import { requestMetadata } from '../validation.js';
import { sendMutation } from './helpers.js';

export function adminRoutes(db, config = {}) {
  const router = Router();

  router.get('/inventory-check', (request, response) => {
    response.json({ data: inventoryReconciliation(db) });
  });
  router.post('/inventory-check', (request, response) => {
    const result = reconcileInventory(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, result);
  });
  router.get('/backup', (request, response) => {
    const backup = createBackup(db, request.user, requestMetadata(request));
    response
      .status(200)
      .type('application/json')
      .attachment(backup.filename)
      .send(backup.serialized);
  });

  router.post('/backup/restore', (request, response) => {
    const payload = request.body?.backup || request.body;
    const result = restoreBackup(db, payload, request.user, requestMetadata(request));
    sendMutation(response, db, result);
  });

  const reset = (request, response) => {
    if (config.isProduction) return response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
    const result = resetInitialData(db, request.user, requestMetadata(request));
    sendMutation(response, db, result);
  };
  router.post('/reset-empty', reset);
  // Alias de compatibilidad para installations antiguas; no crea datos de
  // actividad, sólo reinicia el catálogo y la configuración inicial.
  router.post('/reset-demo', reset);

  return router;
}
