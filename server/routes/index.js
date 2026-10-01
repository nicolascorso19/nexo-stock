import { Router } from 'express';
import { authMiddleware, requireRoles } from '../auth.js';
import { bootstrapStateForUser } from '../db/bootstrap.js';
import { authRoutes } from './auth.js';
import { healthRoutes } from './health.js';
import { publicCatalog } from '../services/public.js';
import { commerceRoutes } from './commerce.js';
import { productRoutes } from './products.js';
import { stockRoutes } from './stock.js';
import { salesRoutes } from './sales.js';
import { purchaseRoutes } from './purchases.js';
import { contactRoutes } from './contacts.js';
import { userRoutes } from './users.js';
import { settingsOptionReservationRoutes } from './management.js';
import { adminRoutes } from './admin.js';
import { notFoundHandler } from './helpers.js';

export function apiRoutes(db, config) {
  const router = Router();
  const authenticate = authMiddleware(db, config);
  router.use(healthRoutes(db));
  router.get('/public/catalog', (_request, response) => response.json({ data: publicCatalog(db, config) }));
  router.use('/integrations/store', commerceRoutes(db, config));
  router.use(authRoutes(db, config));
  router.use((request, response, next) => (
    request.path.startsWith('/auth/') ? next() : authenticate(request, response, next)
  ));

  router.get('/bootstrap', (request, response) => {
    response.json(bootstrapStateForUser(db, request.user));
  });

  router.use('/products', requireRoles('Administrador', 'Vendedor', 'Inventario'), productRoutes(db));
  router.use('/stock', requireRoles('Administrador', 'Inventario'), stockRoutes(db));
  router.use('/sales', requireRoles('Administrador', 'Vendedor'), salesRoutes(db));
  router.use('/purchases', requireRoles('Administrador', 'Inventario'), purchaseRoutes(db));
  router.use(contactRoutes(db));
  router.use('/users', requireRoles('Administrador'), userRoutes(db, config));
  router.use(settingsOptionReservationRoutes(db));
  const admin = adminRoutes(db, config);
  router.use('/admin', requireRoles('Administrador'), admin);
  // Alias conservado para clientes existentes: /api/backup y /api/reset-demo.
  router.use('/', requireRoles('Administrador'), admin);
  router.use(notFoundHandler);
  return router;
}
