import { getDatabase } from '../db/database.js';

export function recordAudit({ actorType = 'SYSTEM', actorId = null, action, entityType, entityId, before = null, after = null, requestId = null, ipHash = null }) {
  getDatabase().prepare(`INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, before_json, after_json, request_id, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(actorType, actorId, String(action).slice(0, 160), String(entityType).slice(0, 80), String(entityId ?? '').slice(0, 160), before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), requestId, ipHash);
}
