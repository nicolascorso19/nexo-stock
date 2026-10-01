function readCookie(name) {
  return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}

export class ApiError extends Error {
  constructor(message, payload = {}, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.code || 'UNKNOWN_ERROR';
    this.details = payload?.details;
    this.requestId = payload?.requestId;
  }
}

export async function request(path, { method = 'GET', body, headers = {}, idempotencyKey, signal } = {}) {
  const requestHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('nexo_store_csrf');
    if (csrf) requestHeaders['X-CSRF-Token'] = decodeURIComponent(csrf);
  }
  if (idempotencyKey) requestHeaders['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(path, { method, credentials: 'same-origin', headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: { code: 'INVALID_RESPONSE', message: 'El servidor devolvió una respuesta inválida.' } }; }
  if (!response.ok) throw new ApiError(payload.error?.message || 'No se pudo completar la operación.', payload.error || {}, response.status);
  return payload.data ?? payload;
}

export function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values || {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  }
  const result = params.toString();
  return result ? `?${result}` : '';
}

export function formatMoney(value, currency = 'USD') {
  if (currency !== 'USD') return `${currency} ${Number(value || 0).toFixed(2)}`;
  return `US$ ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function debounce(fn, wait = 280) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

export { readCookie };
