import crypto from 'node:crypto';

export function nowIso() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function createId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(5).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function jsonValue(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function displayJson(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|hash/i;

export function redact(value, depth = 0) {
  if (depth > 8) return '[profundo]';
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTADO]' : redact(item, depth + 1)])
  );
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeImei(value) {
  return String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
}

export function isValidImei(value) {
  const imei = normalizeImei(value);
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    let digit = Number(imei[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(imei[14]);
}

export function makeLuhnImei(prefix14) {
  const base = String(prefix14).replace(/\D/g, '').slice(0, 14).padEnd(14, '0');
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    let digit = Number(base[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return `${base}${(10 - (sum % 10)) % 10}`;
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
