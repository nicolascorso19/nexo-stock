import { getDatabase } from './database.js';

export function verifyDatabase(db = getDatabase()) {
  const integrity = db.pragma('integrity_check', { simple: true });
  const foreignKeys = db.pragma('foreign_key_check');
  const version = Number(db.pragma('user_version', { simple: true }));
  const result = { ok: integrity === 'ok' && foreignKeys.length === 0, integrity, foreignKeys, version };
  if (!result.ok) {
    const error = new Error('La verificación de la base de datos falló.');
    error.code = 'DATABASE_INTEGRITY_FAILED';
    error.details = result;
    throw error;
  }
  return result;
}
