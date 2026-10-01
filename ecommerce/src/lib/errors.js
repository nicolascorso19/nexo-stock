import { getDatabase } from '../db/database.js';

export class AppError extends Error {
  constructor(message, { status = 400, code = 'BAD_REQUEST', details, cause, expose = true } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }
}

export function assert(condition, message, options = {}) {
  if (!condition) throw new AppError(message, options);
}

export function notFound(message = 'Recurso no encontrado.') {
  return new AppError(message, { status: 404, code: 'NOT_FOUND' });
}

export function conflict(message, details) {
  return new AppError(message, { status: 409, code: 'CONFLICT', details });
}

export function publicError(error, requestId) {
  const known = error instanceof AppError && error.expose;
  return {
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : 'No se pudo completar la operación.',
      ...(known && error.details !== undefined ? { details: error.details } : {}),
      requestId
    }
  };
}

export function errorHandler(error, req, res, _next) {
  const requestId = req.requestId;
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    error = new AppError('Ya existe un registro con esos datos.', { status: 409, code: 'DUPLICATE' });
  }
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
  if (status >= 500 || error?.code === 'STOCK_API_UNAVAILABLE') {
    try { getDatabase().prepare('INSERT INTO error_logs (request_id, level, code, message, method, path) VALUES (?, ?, ?, ?, ?, ?)').run(requestId || null, status >= 500 ? 'ERROR' : 'WARN', String(error?.code || 'INTERNAL_ERROR').slice(0, 120), String(error?.message || 'Error').slice(0, 1000), req.method, req.path); } catch { /* logging must never mask the original error */ }
    console.error(JSON.stringify({ level: 'error', requestId, method: req.method, path: req.path, code: error?.code, message: error?.message }));
  }
  res.status(status).json(publicError(error, requestId));
}
