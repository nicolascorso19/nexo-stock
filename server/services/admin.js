import { clearCurrentDomain } from '../db/restore.js';
import { seedDatabase } from '../db/seed.js';
import { nowIso } from '../utils.js';
import { insertBackupLog, recordAudit } from './audit.js';

export function resetInitialData(db, actor, request) {
  return db.transaction(() => {
    clearCurrentDomain(db);
    seedDatabase(db, { force: true, preserveSecurity: true, actorId: actor.id });
    const resetAt = nowIso();
    recordAudit(db, {
      userId: actor.id,
      action: 'Datos iniciales restaurados',
      entityType: 'system',
      entityId: 'initial-data',
      after: { resetAt, securityPreserved: true },
      request,
      createdAt: resetAt
    });
    insertBackupLog(db, {
      userId: actor.id,
      action: 'RESET_EMPTY',
      formatVersion: 3,
      recordCount: 0,
      byteCount: 0,
      metadata: { securityPreserved: true },
      createdAt: resetAt
    });
    return { resetAt, securityPreserved: true, catalogSeeded: true };
  }).immediate();
}
