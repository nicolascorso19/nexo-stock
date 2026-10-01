import { createId, displayJson, jsonValue, nowIso, redact } from '../utils.js';

export function recordAudit(db, entry) {
  const id = createId('aud');
  const before = entry.before === undefined ? null : entry.before;
  const after = entry.after === undefined ? null : entry.after;

  db.prepare(`
    INSERT INTO audit_logs (
      id, user_id, action, entity_type, entity_id, before_value,
      after_value, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.userId || null,
    String(entry.action || 'Acción registrada'),
    String(entry.entityType || 'system'),
    String(entry.entityId || 'system'),
    before === null ? null : displayJson(redact(before)),
    after === null ? null : displayJson(redact(after)),
    entry.request?.ip || null,
    entry.request?.userAgent?.slice(0, 500) || null,
    entry.createdAt || nowIso()
  );

  return id;
}

export function recordError(db, entry = {}) {
  const id = createId('err');
  const level = ['WARN', 'ERROR', 'FATAL'].includes(String(entry.level || 'ERROR').toUpperCase())
    ? String(entry.level).toUpperCase() : 'ERROR';
  const now = entry.createdAt || nowIso();
  db.prepare(`
    INSERT INTO error_logs (id, user_id, level, code, message, entity_type, entity_id, request_id, stack, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.userId || null,
    level,
    entry.code ? String(entry.code).slice(0, 120) : null,
    String(entry.message || 'Error no especificado').slice(0, 4000),
    entry.entityType ? String(entry.entityType).slice(0, 120) : null,
    entry.entityId ? String(entry.entityId).slice(0, 120) : null,
    entry.requestId ? String(entry.requestId).slice(0, 120) : null,
    entry.stack ? String(entry.stack).slice(0, 20_000) : null,
    now
  );
  return id;
}

export function insertBackupLog(db, entry) {
  const id = createId('bkp');
  db.prepare(`
    INSERT INTO backup_logs (
      id, user_id, action, format_version, filename, record_count,
      byte_count, checksum_sha256, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.userId || null,
    entry.action,
    entry.formatVersion || 1,
    entry.filename || null,
    entry.recordCount || 0,
    entry.byteCount || 0,
    entry.checksum || null,
    jsonValue(entry.metadata || {}),
    entry.createdAt || nowIso()
  );
  return id;
}

export { jsonValue };
