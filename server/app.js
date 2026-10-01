import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { getConfig } from './config.js';
import { AppError } from './errors.js';
import { recordError } from './services/audit.js';
import { apiRoutes } from './routes/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp({ db, config = getConfig() } = {}) {
  if (!db?.open) throw new Error('createApp() requiere una instancia SQLite abierta.');
  db.prepare('SELECT 1').get();

  const app = express();
  app.disable('x-powered-by');
  app.set('json escape', true);
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      }
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' }
  }));
  app.use((request, response, next) => {
    request.id = request.get('X-Request-ID') || crypto.randomUUID();
    response.set('X-Request-ID', request.id);
    next();
  });
  app.use(express.json({ limit: config.jsonBodyLimit, strict: true, verify: (request, _response, buffer) => { request.rawBody = buffer.toString('utf8'); } }));
  app.use(cookieParser());
  app.use('/api', (request, response, next) => {
    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (unsafeMethod && request.get('sec-fetch-site') === 'cross-site') {
      return response.status(403).json({ error: { code: 'CROSS_SITE_REQUEST', message: 'Origen de solicitud no permitido.' } });
    }
    const origin = request.get('origin');
    if (unsafeMethod && origin) {
      try {
        if (new URL(origin).host !== request.get('host')) {
          return response.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Origen de solicitud no permitido.' } });
        }
      } catch {
        return response.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Origen de solicitud no permitido.' } });
      }
    }
    return next();
  });

  app.use('/api', apiRoutes(db, config));

  const staticOptions = {
    dotfiles: 'deny',
    etag: true,
    index: false,
    maxAge: config.isProduction ? '1h' : 0,
    setHeaders(response) { response.set('X-Content-Type-Options', 'nosniff'); }
  };
  app.get('/', (_request, response) => response.sendFile(path.join(rootDir, 'index.html')));
  app.get('/index.html', (_request, response) => response.sendFile(path.join(rootDir, 'index.html')));
  // La web pública es la tienda del puerto 4100. El catálogo estático que vivía
  // acá quedó sin uso, así que sus rutas apuntan directo a la tienda.
  // La web pública es la tienda del puerto 4100. El catálogo estático que vivía
  // acá quedó sin uso, así que sus rutas apuntan directo a la tienda.
  for (const route of ['/public', '/public.html']) {
    app.get(route, (_request, response) => response.redirect(302, config.storefrontUrl));
  }
  app.get('/styles.css', (_request, response) => response.sendFile(path.join(rootDir, 'styles.css'), staticOptions));
  app.use('/js', express.static(path.join(rootDir, 'js'), staticOptions));
  // Imágenes del catálogo. Se sirven desde carpetas dedicadas y acotadas: el
  // catálogo público del sistema privado y el e-commerce usan las mismas rutas
  // (/img/catalog/... y /public-assets/...) sin exponer nada más.
  app.use('/img', express.static(path.join(rootDir, 'assets', 'img'), staticOptions));
  app.use('/public-assets', express.static(path.join(rootDir, 'public-assets'), staticOptions));
  app.use('/public-assets', express.static(path.join(rootDir, 'public-assets'), staticOptions));

  app.use((request, _response, next) => {
    const error = new Error(`Ruta no encontrada: ${request.method} ${request.originalUrl}`);
    error.status = 404;
    error.code = 'ROUTE_NOT_FOUND';
    next(error);
  });

  app.use((error, request, response, _next) => {
    let normalized = error;
    if (error?.type === 'entity.parse.failed') {
      normalized = new AppError(400, 'INVALID_JSON', 'El cuerpo JSON no es válido.');
    } else if (error?.type === 'entity.too.large') {
      normalized = new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la solicitud excede el límite permitido.');
    } else if (typeof error?.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
      const unique = error.code.includes('UNIQUE') || error.code.includes('PRIMARYKEY');
      normalized = new AppError(
        unique ? 409 : 422,
        unique ? 'UNIQUE_CONSTRAINT' : 'CHECK_CONSTRAINT',
        unique ? 'Ya existe un registro con ese valor único.' : 'La operación viola una regla de integridad.'
      );
    } else if (error?.code === 'SQLITE_BUSY') {
      normalized = new AppError(503, 'DATABASE_BUSY', 'La base está ocupada. Reintentá en unos segundos.');
    }

    const status = Number.isInteger(normalized?.status) ? normalized.status : 500;
    if (status >= 500) {
      console.error(`[${request.id}]`, error);
      try {
        recordError(db, {
          userId: request.user?.id,
          level: status >= 500 ? 'ERROR' : 'WARN',
          code: normalized?.code || 'INTERNAL_ERROR',
          message: normalized?.message || 'Error interno del servidor',
          requestId: request.id,
          stack: error?.stack
        });
      } catch (logError) {
        console.error('No se pudo registrar el error:', logError);
      }
    }
    response.status(status).json({
      error: {
        code: normalized?.code || 'INTERNAL_ERROR',
        message: status >= 500 ? 'Ocurrió un error interno.' : normalized.message,
        ...(normalized?.details ? { details: normalized.details } : {})
      },
      requestId: request.id
    });
  });

  app.locals.db = db;
  app.locals.config = config;
  return app;
}

export default createApp;
