import { Router } from 'express';
import { createPurchase } from '../services/purchases.js';
import { normalizeIdempotencyKey } from '../services/commerce.js';
import { requestMetadata } from '../validation.js';
import { sendMutation } from './helpers.js';

export function purchaseRoutes(db) {
  const router = Router();
  router.post('/', (request, response) => {
    const idempotencyKey = normalizeIdempotencyKey(request.get('Idempotency-Key') || request.body?.idempotencyKey);
    const result = createPurchase(db, request.body, request.user, requestMetadata(request), idempotencyKey);
    if (result.replayed) response.set('Idempotency-Replayed', 'true');
    sendMutation(response, db, result.purchase, result.replayed ? 200 : 201);
  });
  return router;
}
