/**
 * Ficha técnica de los equipos del catálogo, desde Wikidata (datos CC0: libres
 * también para uso comercial).
 *
 * No se copia nada de GSMArena: sus condiciones prohíben el scraping comercial
 * y sus fotos son suyas. Acá se leen datos abiertos y se anota el origen de cada
 * modelo, para que la ficha sea rastreable.
 *
 *   node scripts/cargar-fichas.mjs
 *
 * Escribe data/fichas.json. Correlo cuando quieras refrescar los datos; el build
 * de la página los lee de ahí, así que no se consulta a Wikidata en cada build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = path.join(rootDir, 'data', 'fichas.json');
const UA = 'NexoCatalogo/1.0 (fichas tecnicas; catalogo local)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ultimo = 0;
async function api(params) {
  for (let intento = 1; intento <= 4; intento++) {
    await sleep(Math.max(0, 400 - (Date.now() - ultimo)) + 250);
    ultimo = Date.now();
    const res = await fetch(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'User-Agent': UA } });
    const texto = await res.text();
    if (res.ok && !texto.startsWith('You are making')) { try { return JSON.parse(texto); } catch { /* reintento */ } }
    await sleep(1200 * intento);
  }
  return {};
}

// Modelo del catalogo -> candidatos de busqueda en Wikidata, en orden.
const MODELOS = {
  'iPhone 13': ['iPhone 13'],
  'iPhone 14': ['iPhone 14'],
  'iPhone 15': ['iPhone 15'],
  'iPhone 15 Celeste': ['iPhone 15'],
  'iPhone 15 Pro Turquesa': ['iPhone 15 Pro'],
  'iPhone 15 Pro Max': ['iPhone 15 Pro Max'],
  'iPhone 16e': ['iPhone 16e'],
  'iPhone 17': ['iPhone 17'],
  'iPhone 17 Pro': ['iPhone 17 Pro'],
  'iPhone 17 Pro Max': ['iPhone 17 Pro Max'],
  'MacBook Air M1': ['MacBook Air (M1, 2020)', 'MacBook Air (2020)'],
  'MacBook Pro M1': ['MacBook Pro (M1, 2020)', 'MacBook Pro (2020)'],
  'MacBook PRO M2': ['MacBook Pro (M2, 2022)', 'MacBook Pro (2022)'],
  'AirPods 2da Generación': ['AirPods (2nd generation)', 'AirPods 2'],
  'AirPods 3ra Generación': ['AirPods (3rd generation)', 'AirPods 3'],
  'Airpods Pro 2da Generación': ['AirPods Pro (2nd generation)', 'AirPods Pro']
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const plano = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const PROPIEDADES = {
  fecha: ['P6949', 'P571', 'P577'],
  pantalla: ['P13749'],
  tecnologiaPantalla: ['P5307'],
  procesador: ['P880'],
  sistema: ['P306'],
  almacenamiento: ['P2928'],
  bateria: ['P12221'],
  conector: ['P2935'],
  altura: ['P2048'],
  ancho: ['P2049'],
  grosor: ['P2610'],
  peso: ['P2067'],
  colores: ['P462']
};

const etiquetaCache = new Map();
async function etiquetaDe(id) {
  if (etiquetaCache.has(id)) return etiquetaCache.get(id);
  const j = await api({ action: 'wbgetentities', ids: id, props: 'labels', languages: 'en|es' });
  const e = j.entities?.[id];
  const valor = e?.labels?.es?.value || e?.labels?.en?.value || id;
  etiquetaCache.set(id, valor);
  return valor;
}

const claimDe = (claims, lista) => {
  for (const p of lista) if (claims[p]?.length) return claims[p];
  return null;
};
const valorCrudo = (claim) => claim?.mainsnak?.datavalue?.value;
const cantidad = claim => {
  const v = valorCrudo(claim);
  return v && typeof v === 'object' && v.amount ? Number(String(v.amount).replace('+', '')) : null;
};
const idsDe = claim => {
  const v = valorCrudo(claim);
  return v && typeof v === 'object' && v.id ? [v.id] : [];
};

async function fichaDe(terminos) {
  let entidad = null;
  for (const termino of terminos) {
    const j = await api({ action: 'wbsearchentities', search: termino, language: 'en', format: 'json', limit: 4 });
    const hit = (j.search || []).find(x => plano(x.description || '').includes('iphone') || plano(x.description || '').includes('smartphone') || plano(x.description || '').includes('laptop') || plano(x.description || '').includes('computer') || plano(x.description || '').includes('headphone') || plano(x.description || '').includes('earphone'));
    if (hit) { entidad = hit; break; }
  }
  if (!entidad) return null;
  const claims = (await api({ action: 'wbgetclaims', entity: entidad.id })).claims || {};
  if (!Object.keys(claims).length) return null;

  const filas = [];
  const agregar = (etiqueta, valor) => { if (valor) filas.push([etiqueta, valor]); };

  const fecha = claimDe(claims, PROPIEDADES.fecha);
  const fechaTexto = valorCrudo(fecha);
  if (fechaTexto?.time) {
    const [anio, mes] = fechaTexto.time.slice(0, 10).split('-');
    agregar('Lanzamiento', mes ? `${MESES[Number(mes) - 1]} de ${anio}` : anio);
  }

  const diagonal = cantidad(claimDe(claims, PROPIEDADES.pantalla));
  const tecnologia = idsDe(claimDe(claims, PROPIEDADES.tecnologiaPantalla));
  const tecnologiaTexto = tecnologia.length ? await etiquetaDe(tecnologia[0]) : '';
  if (diagonal || tecnologiaTexto) {
    agregar('Pantalla', [diagonal ? `${diagonal}"` : '', tecnologiaTexto].filter(Boolean).join(' · '));
  }

  const cpu = idsDe(claimDe(claims, PROPIEDADES.procesador));
  if (cpu.length) agregar('Procesador', await etiquetaDe(cpu[0]));

  const sistema = idsDe(claimDe(claims, PROPIEDADES.sistema));
  if (sistema.length) agregar('Sistema', (await Promise.all(sistema.slice(0, 2).map(etiquetaDe))).join(' · '));

  const gb = (claimDe(claims, PROPIEDADES.almacenamiento) || []).map(cantidad).filter(n => n !== null && n > 1);
  if (gb.length) agregar('Almacenamiento', [...new Set(gb)].sort((a, b) => a - b).join(' / ').replace(/(\d+) /g, '$1 GB, ').replace(/, $/, ''));

  const horas = claimDe(claims, PROPIEDADES.bateria);
  const hs = cantidad(horas);
  if (hs) agregar('Batería', `${hs} h`);

  const conector = idsDe(claimDe(claims, PROPIEDADES.conector));
  if (conector.length) agregar('Conector', (await Promise.all(conector.slice(0, 2).map(etiquetaDe))).join(' / '));

  const ancho = cantidad(claimDe(claims, PROPIEDADES.ancho));
  const alto = cantidad(claimDe(claims, PROPIEDADES.altura));
  const grosor = cantidad(claimDe(claims, PROPIEDADES.grosor));
  if (alto && ancho) agregar('Medidas', [alto, ancho, grosor].filter(n => n !== null).join(' × ') + ' mm');

  const peso = claimDe(claims, PROPIEDADES.peso);
  const gramos = cantidad(peso);
  if (gramos) agregar('Peso', `${gramos} g`);

  const colores = idsDe(claimDe(claims, PROPIEDADES.colores));
  if (colores.length) {
    const nombres = await Promise.all(colores.slice(0, 8).map(etiquetaDe));
    agregar('Colores de fábrica', [...new Set(nombres)].join(', '));
  }

  if (!filas.length) return null;
  return {
    fuente: 'Wikidata (CC0)',
    wikidata: entidad.id,
    url: `https://www.wikidata.org/wiki/${entidad.id}`,
    actualizado: new Date().toISOString(),
    filas
  };
}

const fichas = {};
const sinFicha = [];
for (const [modelo, terminos] of Object.entries(MODELOS)) {
  const ficha = await fichaDe(terminos);
  if (ficha) { fichas[modelo] = ficha; console.log(`${modelo.padEnd(26)} ${ficha.filas.length} datos  (${ficha.wikidata})`); }
  else { sinFicha.push(modelo); console.log(`${modelo.padEnd(26)} SIN FICHA`); }
  await sleep(150);
}

fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify({ generado: new Date().toISOString(), fichas }, null, 2));
console.log(`\ncon ficha: ${Object.keys(fichas).length}/${Object.keys(MODELOS).length}`);
console.log(`sin ficha: ${sinFicha.join(', ') || 'ninguno'}`);
console.log(`escrito: ${salida}`);