import { asBoolean, nowIso, parseJson, roundMoney } from '../utils.js';
import { unprocessable } from '../errors.js';
import { recordAudit } from './audit.js';
import { optionalText, requiredText } from '../validation.js';

export const DEFAULT_SETTINGS = Object.freeze({
  businessName: 'NEXO Móviles',
  legalName: 'NEXO Móviles S.A.',
  currency: 'USD',
  locale: 'es-AR',
  locationName: 'Córdoba Capital',
  valuationMethod: 'AVERAGE',
  minMargin: 20,
  defaultMinStock: 1,
  lastUnitThreshold: 1,
  allowNegativeStock: false,
  taxRate: 0,
  logoText: 'N',
  lastBackup: null,
  lowStockNotifications: true,
  publicShowApplePrice: false,
  // Capital aportado por el negocio. Es un dato del dueño, editable desde el
  // panel; arranca en 0 porque no se inventa información financiera.
  investedCapital: 0
});

export const EDITABLE_SETTINGS = Object.freeze([
  'businessName', 'legalName', 'currency', 'locale', 'locationName', 'valuationMethod',
  'minMargin', 'defaultMinStock', 'lastUnitThreshold', 'allowNegativeStock', 'taxRate',
  'logoText', 'lowStockNotifications', 'publicShowApplePrice', 'investedCapital'
]);

export function getSettings(db) {
  const result = { ...DEFAULT_SETTINGS };
  for (const row of db.prepare('SELECT key, value_json FROM settings').all()) {
    if (Object.hasOwn(DEFAULT_SETTINGS, row.key)) result[row.key] = parseJson(row.value_json, DEFAULT_SETTINGS[row.key]);
  }
  result.minMargin = Number(result.minMargin);
  result.defaultMinStock = Number(result.defaultMinStock);
  result.lastUnitThreshold = Number(result.lastUnitThreshold);
  result.taxRate = Number(result.taxRate);
  result.investedCapital = Number.isFinite(Number(result.investedCapital)) ? Number(result.investedCapital) : 0;
  result.allowNegativeStock = asBoolean(result.allowNegativeStock, false);
  result.lowStockNotifications = asBoolean(result.lowStockNotifications, true);
  result.publicShowApplePrice = asBoolean(result.publicShowApplePrice, false);
  return result;
}

export function saveSetting(db, key, value, userId, createdAt = nowIso()) {
  db.prepare(`
    INSERT INTO settings (key, value_json, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(key, JSON.stringify(value), createdAt, userId || null);
}

function normalizeSetting(key, value) {
  switch (key) {
    case 'businessName':
      return requiredText(value, 'El nombre del negocio', { max: 120 });
    case 'legalName':
      return optionalText(value, 'La razón social', { max: 180 });
    case 'currency': {
      const currency = requiredText(value, 'La moneda', { max: 8 }).toUpperCase();
      if (currency !== 'USD') throw unprocessable('La moneda principal del sistema es USD.', 'UNSUPPORTED_CURRENCY');
      return currency;
    }
    case 'locale':
      return requiredText(value, 'El locale', { max: 20 });
    case 'locationName':
      return requiredText(value, 'La ubicación principal', { max: 120 });
    case 'valuationMethod': {
      const method = requiredText(value, 'El método de valoración', { max: 20 }).toUpperCase();
      if (method !== 'AVERAGE') throw unprocessable('El método de valoración habilitado es AVERAGE (coste promedio).', 'INVALID_VALUATION_METHOD');
      return method;
    }
    case 'minMargin': {
      const margin = Number(value);
      if (!Number.isFinite(margin) || margin < 0 || margin > 1000) throw unprocessable('El margen mínimo debe estar entre 0 y 1000.');
      return roundMoney(margin);
    }
    case 'defaultMinStock': {
      const minimum = Number(value);
      if (!Number.isInteger(minimum) || minimum < 0 || minimum > 1_000_000) throw unprocessable('El stock mínimo por defecto debe ser un entero no negativo.');
      return minimum;
    }
    case 'lastUnitThreshold': {
      const threshold = Number(value);
      if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1_000_000) throw unprocessable('El límite de última unidad debe ser un entero no negativo.');
      return threshold;
    }
    case 'allowNegativeStock':
      if (typeof value !== 'boolean') throw unprocessable('allowNegativeStock debe ser booleano.');
      if (value) throw unprocessable('El backend no permite stock negativo; allowNegativeStock debe ser false.');
      return false;
    case 'taxRate': {
      const tax = Number(value);
      if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw unprocessable('La tasa de impuestos debe estar entre 0 y 100.');
      return roundMoney(tax);
    }
    case 'logoText':
      return requiredText(value, 'El texto del logo', { max: 4 });
    case 'lowStockNotifications':
      if (typeof value !== 'boolean') throw unprocessable('lowStockNotifications debe ser booleano.');
      return value;
    case 'publicShowApplePrice':
      if (typeof value !== 'boolean') throw unprocessable('publicShowApplePrice debe ser booleano.');
      return value;
    case 'investedCapital': {
      const capital = Number(value);
      if (!Number.isFinite(capital) || capital < 0) throw unprocessable('El capital invertido no puede ser negativo.');
      return roundMoney(capital);
    }
    default:
      throw unprocessable(`El setting ${key} no se puede modificar desde la API.`);
  }
}

export function updateSettings(db, payload, user, request) {
  const before = getSettings(db);
  const next = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (!EDITABLE_SETTINGS.includes(key)) throw unprocessable(`El setting ${key} no se puede modificar desde la API.`);
    next[key] = normalizeSetting(key, value);
  }
  if (!Object.keys(next).length) throw unprocessable('Enviá al menos un setting válido.');

  const createdAt = nowIso();
  db.transaction(() => {
    for (const [key, value] of Object.entries(next)) saveSetting(db, key, value, user.id, createdAt);
    recordAudit(db, {
      userId: user.id,
      action: 'Configuración actualizada',
      entityType: 'settings',
      entityId: 'settings',
      before: Object.fromEntries(Object.keys(next).map(key => [key, before[key]])),
      after: next,
      request,
      createdAt
    });
  }).immediate();

  return getSettings(db);
}

export function setLastBackup(db, value, userId) {
  saveSetting(db, 'lastBackup', value, userId);
}

export function assertMinimumMargin(price, cost, settings, { priceKnown = true, costKnown = true } = {}) {
  if (!settings) throw new Error('assertMinimumMargin requiere la configuración vigente.');
  if (!priceKnown || !costKnown) return;
  if (cost < 0) throw unprocessable('El costo no puede ser negativo.');
  if (price <= 0) throw unprocessable('El precio debe ser mayor a cero.');
  const margin = ((price - cost) / price) * 100;
  if (margin + 0.000001 < Number(settings.minMargin)) {
    throw unprocessable(
      `El margen es ${margin.toFixed(2)}% y el mínimo configurado es ${Number(settings.minMargin).toFixed(2)}%.`,
      'MARGIN_TOO_LOW'
    );
  }
}
