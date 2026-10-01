import { Router } from 'express';
import { createUser, updateUser } from '../services/users.js';
import { requestMetadata } from '../validation.js';
import { sendMutation } from './helpers.js';

export function userRoutes(db, config) {
  const router = Router();
  router.post('/', (request, response) => {
    const user = createUser(db, request.body, request.user, requestMetadata(request), config.bcryptRounds);
    sendMutation(response, db, user, 201);
  });
  const update = (request, response) => {
    const id = request.params.id || request.body?.id;
    const user = updateUser(db, id, request.body, request.user, requestMetadata(request), config.bcryptRounds);
    sendMutation(response, db, user);
  };
  router.patch('/', update);
  router.patch('/:id', (request, response) => {
    const user = updateUser(db, request.params.id, request.body, request.user, requestMetadata(request), config.bcryptRounds);
    sendMutation(response, db, user);
  });
  return router;
}
