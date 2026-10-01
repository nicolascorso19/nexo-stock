import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './db/database.js';
import { verifyDatabase } from './db/verify.js';
import { requestId, randomToken } from './lib/security.js';
import { errorHandler, AppError } from './lib/errors.js';
import { getSession } from './services/auth.js';
import { publicRouter } from './routes/public.js';
import { pageRouter } from './routes/pages.js';
import { authRouter } from './routes/auth.js';
import { cartRouter } from './routes/cart.js';
import { checkoutRouter } from './routes/checkout.js';
import { accountRouter } from './routes/account.js';
import { adminRouter } from './routes/admin.js';
import { webhookRouter } from './routes/webhooks.js';
import { requireSameOrigin } from './lib/auth-guard.js';
import { CatalogClient } from './services/catalog-client.js';
import { getPaymentProvider } from './services/payments.js';
import { getPublicSettings } from './services/settings.js';
import { escapeHtml } from './lib/security.js';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp(config, { catalogClient = new CatalogClient(config), paymentProvider = getPaymentProvider(config) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    req.requestId = requestId();
    res.locals.cspNonce = randomToken(18);
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // Los scripts de terceros los inyecta el navegador en runtime
        // (analytics.js), así que no pueden llevar nonce. Se permiten sólo los
        // dos orígenes exactos de medición; sin esto GA4 y Meta Pixel nunca
        // cargaban porque la CSP los bloqueaba.
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, 'https://www.googletagmanager.com', 'https://connect.facebook.net'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://analytics.google.com', 'https://connect.facebook.net'],
        fontSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8'); } }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.storeSession = getSession(req);
    req.customerSession = req.storeSession?.kind === 'customer' ? req.storeSession : null;
    next();
  });
  // El límite global se comía también las imágenes estáticas, que son bytes ya
  // servidos desde disco: un catálogo con 24 productos y sus fotos consumía el
  // cupo entero y devolvía 429 a los visitantes. La API tiene su propio límite
  // y el de páginas excluye todo lo que sea un archivo estático.
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false });
  const pageLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
  const isStaticFile = (pathname) => /^\/(img|public-assets|css|js)\//.test(pathname) || /\.[a-z0-9]+$/i.test(pathname);
  app.use('/api', apiLimiter);
  app.use('/', (req, res, next) => (isStaticFile(req.path) ? next() : pageLimiter(req, res, next)));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', requireSameOrigin(config));

  app.get('/api/health', (_req, res) => {
    try {
      const verification = verifyDatabase();
      res.json({ data: { status: 'ok', service: 'nexo-store', database: verification, timestamp: new Date().toISOString() } });
    } catch (error) {
      res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'La base de datos no está disponible.' } });
    }
  });
  app.get('/api/ready', async (_req, res) => {
    const stock = await catalogClient.health();
    res.status(stock.ok ? 200 : 503).json({ data: { status: stock.ok ? 'ready' : 'degraded', stock } });
  });

  app.use('/api/auth', authRouter({ config }));
  app.use('/api/storefront', publicRouter({ config, catalogClient }));
  // Páginas renderizadas en el servidor: deben declararse antes de express.static
  // para que el HTML inicial ya traiga el contenido y los datos estructurados.
  app.use('/', pageRouter({ config, catalogClient }));
  // El HTML de las páginas públicas ya lo sirve pageRouter; el SPA toma el
  // relevo para las rutas privadas y de aplicación (/carrito, /checkout, ...).
  app.get('/carrito', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.get('/checkout', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.use('/api/cart', cartRouter({ config, catalogClient }));
  app.use('/api/checkout', checkoutRouter({ config, catalogClient, paymentProvider }));
  app.use('/api/account', accountRouter({ config }));
  app.use('/api/admin', adminRouter({ config, catalogClient, paymentProvider }));
  app.use('/api/webhooks', webhookRouter({ config, catalogClient, paymentProvider }));
  app.use('/api/integrations', webhookRouter({ config, catalogClient, paymentProvider }));

  app.get('/sitemap.xml', async (_req, res, next) => {
    try {
      const catalog = await catalogClient.getCatalog();
      const products = catalog.products.filter((product) => product.published === true);
      const today = new Date().toISOString().slice(0, 10);
      const url = (loc, priority, changefreq) => `<url><loc>${escapeHtml(loc)}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
      const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
      const body = [
        url(`${config.publicBaseUrl}/`, '1.0', 'daily'),
        url(`${config.publicBaseUrl}/catalogo`, '0.9', 'daily'),
        ...categories.map((category) => url(`${config.publicBaseUrl}/catalogo?category=${encodeURIComponent(category)}`, '0.7', 'weekly')),
        ...products.map((product) => url(`${config.publicBaseUrl}/producto/${encodeURIComponent(product.slug || product.id)}`, '0.8', 'weekly'))
      ].join('');
      res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
    } catch (error) { next(error); }
  });

  app.use((req, res, next) => {
    if (/^\/(admin|checkout|cuenta|pedido)(\/|$)/.test(req.path)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use(express.static(publicDir, { index: false, maxAge: config.production ? '1h' : 0, etag: true }));
  app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /cuenta\n'));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next(new AppError('Ruta no encontrada.', { status: 404, code: 'NOT_FOUND' }));
    if (/\.[a-z0-9]+$/i.test(req.path)) return next(new AppError('Ruta no encontrada.', { status: 404, code: 'NOT_FOUND' }));
    if (req.method !== 'GET') return next(new AppError('Ruta no encontrada.', { status: 404, code: 'NOT_FOUND' }));
    return res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.use((error, req, res, next) => errorHandler(error, req, res, next));
  return app;
}

export { getDatabase };
