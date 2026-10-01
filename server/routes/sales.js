import { Router } from 'express';
import { annulSale, createSale } from '../services/sales.js';
import { createSaleReturn } from '../services/returns.js';
import { normalizeIdempotencyKey } from '../services/commerce.js';
import { requestMetadata } from '../validation.js';
import { sendMutation } from './helpers.js';

export function salesRoutes(db) {
  const router = Router();
  router.post('/:id/returns', (request, response) => {
    const result = createSaleReturn(db, { ...request.body, saleId: request.params.id }, request.user, requestMetadata(request));
    sendMutation(response, db, result, 201);
  });
  router.post('/:id/annul', (request, response) => {
    const sale = annulSale(db, request.params.id, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, sale);
  });
  router.post('/', (request, response) => {
    const idempotencyKey = normalizeIdempotencyKey(request.get('Idempotency-Key') || request.body?.idempotencyKey);
    const result = createSale(db, request.body, request.user, requestMetadata(request), idempotencyKey);
    if (result.replayed) response.set('Idempotency-Replayed', 'true');
    sendMutation(response, db, result.sale, result.replayed ? 200 : 201);
  });
  return router;
}
