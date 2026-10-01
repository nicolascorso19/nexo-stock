import { Router } from 'express';
import { requireRoles } from '../auth.js';
import { updateSettings } from '../services/settings.js';
import { createOption, deleteOption, deleteOptionByValue } from '../services/options.js';
import { cancelReservation, createReservation } from '../services/reservations.js';
import { requestMetadata } from '../validation.js';
import { sendMutation } from './helpers.js';

export function settingsOptionReservationRoutes(db) {
  const router = Router();

  router.patch('/settings', requireRoles('Administrador'), (request, response) => {
    const settings = updateSettings(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, settings);
  });

  router.post('/options', requireRoles('Administrador'), (request, response) => {
    const option = createOption(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, option, 201);
  });
  router.delete('/options', requireRoles('Administrador'), (request, response) => {
    const option = deleteOptionByValue(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, option);
  });
  router.delete('/options/:id', requireRoles('Administrador'), (request, response) => {
    const option = deleteOption(db, request.params.id, request.user, requestMetadata(request));
    sendMutation(response, db, option);
  });

  router.post('/reservations', requireRoles('Administrador', 'Vendedor', 'Inventario'), (request, response) => {
    const reservation = createReservation(db, request.body, request.user, requestMetadata(request));
    sendMutation(response, db, reservation, 201);
  });
  router.delete('/reservations/:id', requireRoles('Administrador', 'Vendedor', 'Inventario'), (request, response) => {
    const reservation = cancelReservation(db, request.params.id, request.user, requestMetadata(request));
    sendMutation(response, db, reservation);
  });

  return router;
}
