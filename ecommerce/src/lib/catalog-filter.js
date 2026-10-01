/**
 * Filtros del catálogo compartidos por la API y por el HTML de servidor.
 *
 * Condición en dos idiomas: el sistema de stock la guarda en español con
 * mayúscula inicial ("Nuevo", "Usado", "Reacondicionado"...). La UI escribe la
 * URL en minúsculas, pero un enlace guardado o tipeado a mano puede venir en
 * inglés ("NEW"), así que ambas formas tienen que encontrar lo mismo. Antes
 * `?condition=NEW` no encontraba nada y devolvía el catálogo vacío.
 */
const ALIASES = new Map([
  ['new', 'nuevo'], ['nuevo', 'nuevo'],
  ['used', 'usado'], ['usado', 'usado'],
  ['refurbished', 'reacondicionado'], ['reacondicionado', 'reacondicionado'],
  ['reacondición', 'reacondicionado'],
  ['exhibition', 'exhibicion'], ['exhibición', 'exhibicion'], ['exibicion', 'exhibicion'],
  ['repaired', 'reparado'], ['reparado', 'reparado']
]);

/** Traduce el valor del filtro a la forma canónica con la que se compara. */
export function normalizeCondition(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return ALIASES.get(raw) || raw;
}

/** Compara la condición del catálogo con la pedida, sea cual sea el idioma. */
export function matchesCondition(catalogValue, wanted) {
  if (!wanted) return true;
  return normalizeCondition(catalogValue) === wanted;
}
