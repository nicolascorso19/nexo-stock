export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message, code = 'BAD_REQUEST', details) {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = 'Debés iniciar sesión.') {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'No tenés permisos para realizar esta acción.') {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(entity = 'El recurso') {
  return new AppError(404, 'NOT_FOUND', `${entity} no existe.`);
}

export function conflict(message, code = 'CONFLICT') {
  return new AppError(409, code, message);
}

export function unprocessable(message, code = 'VALIDATION_ERROR', details) {
  return new AppError(422, code, message, details);
}
