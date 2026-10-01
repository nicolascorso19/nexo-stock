import { Router } from 'express';
import { requireRoles } from '../auth.js';
import { createCustomer, createSupplier, customerHistory, updateCustomer, updateSupplier } from '../services/contacts.js';
import { requestMetadata } from '../validation.js';
import { sendMutation } from './helpers.js';

export function contactRoutes(db) {
  const router = Router();
  router.post('/customers', requireRoles('Administrador', 'Vendedor'), (request, response) => {
    const customer = createCustomer(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, customer, 201);
  });
  router.post('/suppliers', requireRoles('Administrador', 'Inventario'), (request, response) => {
    const supplier = createSupplier(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, supplier, 201);
  });
  router.get('/customers/:id/history', requireRoles('Administrador', 'Vendedor'), (request, response) => {
    response.json({ data: customerHistory(db, request.params.id) });
  });
  router.patch('/customers/:id', requireRoles('Administrador', 'Vendedor'), (request, response) => {
    const customer = updateCustomer(db, request.params.id, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, customer);
  });
  router.patch('/suppliers/:id', requireRoles('Administrador', 'Inventario'), (request, response) => {
    const supplier = updateSupplier(db, request.params.id, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, supplier);
  });
  return router;
}
