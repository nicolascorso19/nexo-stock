import { Router } from 'express';
import { commerceAuth, requireCommerceScope } from '../services/commerce-auth.js';
import { commerceCatalog, createCommerceHold, getCommerceHold, releaseCommerceHold, confirmCommerceHold, cancelCommerceOrder } from '../services/commerce.js';

export function commerceRoutes(db, config) {
  const router = Router();
  router.use(commerceAuth(db, config));
  router.get('/catalog', (request, response) => {
    requireCommerceScope(request, 'catalog:read');
    // El cliente puede pedir el catálogo visual (incluido lo que no tiene
    // precio) sin cambiar la configuración global. Sigue sin poder comprarlo:
    // la reserva y la cotización rechazan lo que no tiene precio registrado.
    const includeUnpriced = request.query.includeUnpriced === 'true';
    const effective = includeUnpriced ? { ...config, commercePublishWithoutPrice: true } : config;
    response.json({ data: commerceCatalog(db, effective) });
  });
  router.post('/reservations', (request, response) => {
    requireCommerceScope(request, 'hold:create');
    const result = createCommerceHold(db, config, request);
    response.status(result.replayed ? 200 : 201).set('Idempotency-Replayed', String(Boolean(result.replayed))).json({ data: result.hold });
  });
  router.get('/reservations/:id', (request, response) => {
    requireCommerceScope(request, 'hold:read');
    response.json({ data: getCommerceHold(db, request, request.params.id) });
  });
  router.post('/reservations/:id/confirm', (request, response) => {
    requireCommerceScope(request, 'hold:confirm');
    const result = confirmCommerceHold(db, request, request.params.id);
    response.json({ data: result });
  });
  router.post('/reservations/:id/release', (request, response) => {
    requireCommerceScope(request, 'hold:release');
    const result = releaseCommerceHold(db, request, request.params.id);
    response.json({ data: result.hold });
  });
  router.post('/orders/:externalOrderId/cancel', (request, response) => {
    requireCommerceScope(request, 'sale:cancel');
    response.json({ data: cancelCommerceOrder(db, request, request.params.externalOrderId) });
  });
  return router;
}
