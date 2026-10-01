import { Router } from 'express';
import { addStock, removeStock } from '../services/stock.js';
import { requestMetadata } from '../validation.js';
import { sendMutation } from './helpers.js';

export function stockRoutes(db) {
  const router = Router();
  router.post('/', (request, response) => {
    const result = addStock(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, result.product, 201);
  });
  router.post('/remove', (request, response) => {
    const result = removeStock(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, result.product);
  });
  return router;
}
