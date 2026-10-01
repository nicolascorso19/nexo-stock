import { Router } from 'express';
import { requireRoles } from '../auth.js';
import { bootstrapStateForUser, getProductById } from '../db/bootstrap.js';
import { archiveProduct, createProduct, createVariant, getProductVariants, updateApplePrice, updateProduct } from '../services/products.js';
import { importProducts } from '../services/import.js';
import { requestMetadata } from '../validation.js';
import { sendMutation } from './helpers.js';

export function productRoutes(db) {
  const router = Router();
  router.post('/import', requireRoles('Administrador'), (request, response) => {
    const result = importProducts(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, result);
  });
  router.get('/', (request, response) => {
    if (request.query.id) return response.json({ data: getProductById(db, request.query.id) });
    if (request.query.parentId) return response.json({ data: getProductVariants(db, request.query.parentId) });
    return response.json({ data: bootstrapStateForUser(db, request.user).products });
  });
  router.post('/', requireRoles('Administrador'), (request, response) => {
    const product = createProduct(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, product, 201);
  });
  router.post('/:parentId/variants', requireRoles('Administrador'), (request, response) => {
    const product = createVariant(db, request.params.parentId, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, product, 201);
  });
  router.patch('/:id/apple-price', requireRoles('Administrador'), (request, response) => {
    const product = updateApplePrice(db, request.params.id, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, product);
  });
  router.patch('/:id/publication', requireRoles('Administrador'), (request, response) => {
    const product = updateProduct(db, request.params.id, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, product);
  });
  const update = (request, response) => {
    const id = request.params.id || request.body?.id;
    const product = updateProduct(db, id, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, product);
  };
  const archive = (request, response) => {
    const id = request.params.id || request.body?.id;
    const product = archiveProduct(db, id, request.user, requestMetadata(request));
    sendMutation(response, db, product);
  };
  router.patch('/', requireRoles('Administrador'), update);
  router.delete('/', requireRoles('Administrador', 'Inventario'), archive);
  router.patch('/:id', requireRoles('Administrador'), (request, response) => {
    const product = updateProduct(db, request.params.id, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, product);
  });
  router.delete('/:id', requireRoles('Administrador', 'Inventario'), (request, response) => {
    const product = archiveProduct(db, request.params.id, request.user, requestMetadata(request));
    sendMutation(response, db, product);
  });
  return router;
}
