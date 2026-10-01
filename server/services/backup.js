import { Buffer } from 'node:buffer';
import { bootstrapState } from '../db/bootstrap.js';
import { nowIso, sha256 } from '../utils.js';
import { insertBackupLog, recordAudit } from './audit.js';
import { setLastBackup } from './settings.js';

export function createBackup(db, user, request) {
  return db.transaction(() => {
    const exportedAt = nowIso();
    setLastBackup(db, exportedAt, user.id);
    const data = bootstrapState(db);
    const counts = Object.fromEntries(
      ['products', 'units', 'sales', 'returns', 'purchases', 'movements', 'reservations', 'warrantyClaims', 'auditLogs', 'errorLogs']
        .map(key => [key, Array.isArray(data[key]) ? data[key].length : 0])
    );
    const envelope = {
      app: 'NEXO Stock',
      format: 'nexo-json-backup',
      version: 3,
      exportedAt,
      metadata: {
        schemaVersion: 3,
        exportedBy: { id: user.id, name: user.name, email: user.email },
        counts
      },
      data
    };
    const serialized = JSON.stringify(envelope, null, 2);
    const checksum = sha256(serialized);
    const filename = `nexo-backup-${exportedAt.slice(0, 10)}-${exportedAt.slice(11, 19).replace(/:/g, '')}.json`;
    const recordCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const byteCount = Buffer.byteLength(serialized, 'utf8');
    insertBackupLog(db, {
      userId: user.id,
      action: 'EXPORT',
      formatVersion: 3,
      filename,
      recordCount,
      byteCount,
      checksum,
      metadata: { counts },
      createdAt: exportedAt
    });
    recordAudit(db, {
      userId: user.id,
      action: 'Backup exportado',
      entityType: 'backup',
      entityId: filename,
      after: { filename, recordCount, byteCount },
      request,
      createdAt: exportedAt
    });
    return { envelope, serialized, filename, byteCount, checksum };
  }).immediate();
}
