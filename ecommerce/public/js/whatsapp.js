/**
 * Enlaces de WhatsApp.
 *
 * Construye el mensaje a partir del producto y la variante que el cliente está
 * mirando, para que la consulta llegue con el contexto correcto. El número
 * sale de la configuración pública del servidor: si no está cargado, no se
 * muestra ningún botón en lugar de un enlace roto.
 */

const DEFAULT_MESSAGE = 'Hola, quiero consultar por un producto que vi en la web.';

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function whatsappNumber(config) {
  const raw = config?.whatsapp || config?.whatsappNumber || config?.contact?.whatsapp || '';
  return digits(raw);
}

/** Texto del mensaje con nombre, capacidad y color de la variante elegida. */
export function productMessage({ product, variant, config } = {}) {
  if (!product) return DEFAULT_MESSAGE;
  const details = [variant?.capacity, variant?.color].filter(Boolean).join(' ');
  const parts = [`Hola, quiero consultar por el ${product.name}`];
  if (details) parts.push(details);
  if (variant?.sku) parts.push(`(ref. ${variant.sku})`);
  const city = config?.address?.locality;
  if (city) parts.push(`- ${city}`);
  return `${parts.join(' ')}. ¿Tienen stock?`;
}

export function orderMessage(order) {
  return `Hola, realicé el pedido ${order?.number || ''} y quisiera consultar su estado.`;
}

export function supportMessage(config) {
  const city = config?.address?.locality;
  return `Hola, tengo una consulta${city ? ` sobre envíos a ${city}` : ''}.`;
}

/** Devuelve el href completo, o cadena vacía si no hay número configurado. */
export function whatsappLink({ message, config }) {
  const number = whatsappNumber(config);
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message || DEFAULT_MESSAGE)}`;
}
