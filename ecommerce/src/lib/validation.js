import { AppError } from './errors.js';

export function text(value, field, { required = false, min = 0, max = 255 } = {}) {
  const normalized = String(value ?? '').trim();
  if (required && !normalized) throw new AppError(`${field} es obligatorio.`, { code: 'VALIDATION_ERROR' });
  if (normalized.length < min || normalized.length > max) throw new AppError(`${field} no tiene un formato válido.`, { code: 'VALIDATION_ERROR' });
  return normalized;
}

export function email(value, { required = true } = {}) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    if (required) throw new AppError('El email es obligatorio.', { code: 'VALIDATION_ERROR' });
    return '';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized) || normalized.length > 254) {
    throw new AppError('El email no tiene un formato válido.', { code: 'VALIDATION_ERROR' });
  }
  return normalized;
}

export function integer(value, field, { required = true, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(`${field} debe ser un entero válido.`, { code: 'VALIDATION_ERROR' });
  }
  return parsed;
}

export function cents(value, field, { required = true, min = 0 } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new AppError(`${field} debe ser un importe USD válido con hasta dos decimales.`, { code: 'VALIDATION_ERROR' });
  }
  return Math.round((parsed + Number.EPSILON) * 100);
}

export function oneOf(value, allowed, field, { required = true } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  if (!allowed.includes(value)) throw new AppError(`${field} no es válido.`, { code: 'VALIDATION_ERROR' });
  return value;
}

export function normalizeDocument(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function cleanObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
