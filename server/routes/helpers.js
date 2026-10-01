import { bootstrapStateForUser, redactDataForUser } from '../db/bootstrap.js';

export function sendMutation(response, db, data, status = 200) {
  response.status(status).json({ data: redactDataForUser(data, response.locals.user), state: bootstrapStateForUser(db, response.locals.user) });
}

export function notFoundHandler(request, _response, next) {
  const error = new Error(`Ruta API no encontrada: ${request.method} ${request.originalUrl}`);
  error.status = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error);
}
