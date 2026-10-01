import { badRequest, unprocessable } from './errors.js';
import { isPlainObject, normalizeImei, roundMoney } from './utils.js';

export function requireObject(value, label = 'El cuerpo') {
  if (!isPlainObject(value)) throw badRequest(`${label} debe ser un objeto JSON.`);
  return value;
}

export function requiredText(value, label, { max = 160 } = {}) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw unprocessable(`${label} es obligatorio.`, 'REQUIRED_FIELD');
  if (normalized.length > max) throw unprocessable(`${label} supera el máximo de ${max} caracteres.`);
  return normalized;
}

export function optionalText(value, label = 'El valor', { max = 2000 } = {}) {
  if (value === undefined || value === null) return '';
  const normalized = String(value).trim();
  if (normalized.length > max) throw unprocessable(`${label} supera el máximo de ${max} caracteres.`);
  return normalized;
}

export function nullableText(value, label = 'El valor', options = {}) {
  const normalized = optionalText(value, label, options);
  return normalized || null;
}

export function parseNumber(value, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined || value === null || value === '') {
    throw unprocessable(`${label} es obligatorio.`, 'REQUIRED_FIELD');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw unprocessable(`${label} debe ser un número válido.`);
  if (integer && !Number.isInteger(parsed)) throw unprocessable(`${label} debe ser un entero.`);
  if (parsed < min || parsed > max) throw unprocessable(`${label} está fuera del rango permitido.`);
  return integer ? parsed : roundMoney(parsed);
}

export function optionalNumber(value, label, options = {}) {
  if (value === undefined || value === null || value === '') return null;
  return parseNumber(value, label, options);
}

export function positiveMoney(value, label) {
  return parseNumber(value, label, { min: 0.000001, max: 1_000_000_000_000 });
}

export function nonNegativeMoney(value, label) {
  return parseNumber(value, label, { min: 0, max: 1_000_000_000_000 });
}

export function nonNegativeInteger(value, label, { max = 1_000_000 } = {}) {
  return parseNumber(value, label, { min: 0, max, integer: true });
}

export function positiveInteger(value, label, { max = 1_000_000 } = {}) {
  return parseNumber(value, label, { min: 1, max, integer: true });
}

export function emailAddress(value, { required = false } = {}) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    if (required) throw unprocessable('El email es obligatorio.', 'REQUIRED_FIELD');
    return '';
  }
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw unprocessable('El email no tiene un formato válido.');
  }
  return normalized;
}

export function parseDateTime(value, label, { required = true, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw unprocessable(`${label} es obligatorio.`, 'REQUIRED_FIELD');
    return fallback;
  }
  const raw = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) throw unprocessable(`${label} no es una fecha válida.`);
  return date.toISOString();
}

export function parseDateOnly(value, label, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T12:00:00Z`).getTime())) {
    throw unprocessable(`${label} no es una fecha válida.`);
  }
  return normalized;
}

export function idText(value, label = 'El identificador') {
  return requiredText(value, label, { max: 120 });
}

export function stringArray(value, label, { maxItems = 10_000, maxLength = 120 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw unprocessable(`${label} debe ser una lista.`);
  if (value.length > maxItems) throw unprocessable(`${label} contiene demasiados elementos.`);
  return value.map(item => requiredText(item, `${label} contiene un elemento vacío`, { max: maxLength }));
}

export function normalizeRequiredImei(value, label = 'IMEI') {
  const imei = normalizeImei(requiredText(value, label, { max: 30 }));
  return imei;
}

export function requestMetadata(request) {
  return {
    ip: request.ip || request.socket?.remoteAddress || null,
    userAgent: String(request.get?.('user-agent') || '')
  };
}
