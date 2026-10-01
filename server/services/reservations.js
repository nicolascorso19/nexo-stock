import { conflict, notFound, unprocessable } from '../errors.js';
import { bootstrapState } from '../db/bootstrap.js';
import { createId, nowIso } from '../utils.js';
import { recordAudit } from './audit.js';
import { requireCustomer } from './catalog.js';
import {
  nonNegativeMoney,
  optionalText,
  parseDateTime,
  requireObject,
  requiredText
} from '../validation.js';

function reservationById(db, id) {
  return bootstrapState(db).reservations.find(reservation => reservation.id === id) || null;
}

export function createReservation(db, payload, user, request) {
  requireObject(payload);
  expireReservations(db);
  return db.transaction(() => {
    const unitId = requiredText(payload.unitId || payload.unit_id, 'La unidad', { max: 120 });
    const customerId = requiredText(payload.customerId, 'El cliente', { max: 120 });
    const customer = requireCustomer(db, customerId);
    const unit = db.prepare(`
      SELECT iu.*, p.archived, pv.active AS variant_active
      FROM inventory_units iu
      JOIN product_variants pv ON pv.id = iu.variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE iu.id = ?
    `).get(unitId);
    if (!unit) throw notFound('La unidad');
    if (unit.archived || !unit.variant_active) throw conflict('El producto está archivado.', 'PRODUCT_ARCHIVED');
    if (unit.unit_status !== 'AVAILABLE') {
      throw conflict('La unidad no está disponible.', 'UNIT_NOT_AVAILABLE');
    }
    const reservedAt = parseDateTime(payload.date || payload.createdAt, 'La fecha de reserva', { required: false, fallback: nowIso() });
    const inventory = db.prepare('SELECT quantity, reserved_quantity FROM inventory WHERE variant_id = ?').get(unit.variant_id);
    if (!inventory || Number(inventory.quantity) - Number(inventory.reserved_quantity || 0) < 1) throw conflict('No hay stock disponible para reservar.', 'INSUFFICIENT_STOCK');
    const reservedStock = db.prepare('UPDATE inventory SET reserved_quantity = reserved_quantity + 1, updated_at = ? WHERE variant_id = ? AND quantity - reserved_quantity >= 1').run(reservedAt, unit.variant_id);
    if (reservedStock.changes !== 1) throw conflict('No se pudo reservar el stock.', 'RESERVATION_STOCK_FAILED');
    const expiresAt = parseDateTime(payload.expiresAt, 'El vencimiento', { required: false, fallback: null });
    if (expiresAt && new Date(expiresAt).getTime() <= new Date(reservedAt).getTime()) {
      throw unprocessable('El vencimiento debe ser posterior a la reserva.', 'INVALID_EXPIRY');
    }
    const deposit = nonNegativeMoney(payload.deposit ?? 0, 'El depósito');
    const notes = optionalText(payload.notes, 'Las notas', { max: 4000 });
    const id = createId('reservation');
    const updated = db.prepare(`
      UPDATE inventory_units SET unit_status = 'RESERVED', updated_at = ?
      WHERE id = ? AND unit_status = 'AVAILABLE'
    `).run(reservedAt, unitId);
    if (updated.changes !== 1) throw conflict('La unidad dejó de estar disponible.', 'UNIT_NOT_AVAILABLE');

    db.prepare(`
      INSERT INTO reservations (
        id, inventory_unit_id, customer_id, user_id, reserved_at, expires_at,
        deposit, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
    `).run(id, unitId, customer.id, user.id, reservedAt, expiresAt, deposit, notes || null, reservedAt, reservedAt);

    const reservation = reservationById(db, id);
    recordAudit(db, {
      userId: user.id,
      action: 'Reserva creada',
      entityType: 'reservation',
      entityId: id,
      before: { unitStatus: 'Disponible' },
      after: { unitStatus: 'Reservado', customerId: customer.id, expiresAt },
      request
    });
    return reservation;
  }).immediate();
}

export function expireReservations(db) {
  const now = nowIso();
  const rows = db.prepare(`
    SELECT r.*, iu.variant_id
    FROM reservations r
    JOIN inventory_units iu ON iu.id = r.inventory_unit_id
    WHERE r.status = 'ACTIVE' AND r.expires_at IS NOT NULL AND r.expires_at <= ?
  `).all(now);
  let expired = 0;
  for (const reservation of rows) {
    try {
      db.transaction(() => {
        const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(reservation.inventory_unit_id);
        if (unit?.unit_status === 'RESERVED') {
          const updated = db.prepare("UPDATE inventory_units SET unit_status = 'AVAILABLE', updated_at = ? WHERE id = ? AND unit_status = 'RESERVED'").run(now, reservation.inventory_unit_id);
          if (updated.changes !== 1) throw conflict('No se pudo liberar la unidad reservada.', 'UNIT_STATUS_CONFLICT');
          const released = db.prepare('UPDATE inventory SET reserved_quantity = MAX(0, reserved_quantity - 1), updated_at = ? WHERE variant_id = ?').run(now, reservation.variant_id);
          if (released.changes !== 1) throw conflict('No se pudo liberar el stock reservado.', 'RESERVATION_STOCK_FAILED');
        }
        db.prepare("UPDATE reservations SET status = 'EXPIRED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'").run(now, reservation.id);
        recordAudit(db, {
          userId: null,
          action: 'Reserva expirada',
          entityType: 'reservation',
          entityId: reservation.id,
          before: { status: 'ACTIVE' },
          after: { status: 'EXPIRED' },
          createdAt: now
        });
        expired += 1;
      }).immediate();
    } catch (error) {
      console.error('No se pudo expirar la reserva', reservation.id, error.message);
    }
  }
  return expired;
}

export function cancelReservation(db, id, user, request) {
  expireReservations(db);
  return db.transaction(() => {
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    if (!reservation) throw notFound('La reserva');
    if (reservation.status === 'CANCELLED') return reservationById(db, id);
    if (reservation.status !== 'ACTIVE') throw conflict('La reserva ya no se puede cancelar.', 'RESERVATION_NOT_ACTIVE');

    const now = nowIso();
    const unit = db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(reservation.inventory_unit_id);
    if (unit?.unit_status === 'RESERVED') {
      const updated = db.prepare(`
        UPDATE inventory_units SET unit_status = 'AVAILABLE', updated_at = ?
        WHERE id = ? AND unit_status = 'RESERVED'
      `).run(now, reservation.inventory_unit_id);
      if (updated.changes !== 1) throw conflict('No se pudo liberar la unidad reservada.', 'UNIT_STATUS_CONFLICT');
      const releasedStock = db.prepare('UPDATE inventory SET reserved_quantity = MAX(0, reserved_quantity - 1), updated_at = ? WHERE variant_id = ?').run(now, unit.variant_id);
      if (releasedStock.changes !== 1) throw conflict('No se pudo liberar el stock reservado.', 'RESERVATION_STOCK_FAILED');
    }
    db.prepare("UPDATE reservations SET status = 'CANCELLED', updated_at = ? WHERE id = ?")
      .run(now, id);
    const cancelled = reservationById(db, id);
    recordAudit(db, {
      userId: user.id,
      action: 'Reserva cancelada',
      entityType: 'reservation',
      entityId: id,
      before: { status: 'Activa', unitStatus: unit?.unit_status || 'Desconocido' },
      after: { status: 'Cancelada', unitStatus: 'Disponible' },
      request
    });
    return cancelled;
  }).immediate();
}
