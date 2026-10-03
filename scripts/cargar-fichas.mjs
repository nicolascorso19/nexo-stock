/**
 * Ficha técnica de los equipos del catálogo, desde Wikidata (datos CC0: libres
 * también para uso comercial).
 *
 * No se copia nada de GSMArena: sus condiciones prohíben el scraping comercial y
 * sus fotos son suyas. Acá se leen datos abiertos y se anota el origen de cada
 * modelo para que la ficha sea rastreable.
 *
 *   node scripts/cargar-fichas.mjs
 *
 * Escribe data/fichas.json. El build de la página lo lee de ahí: no se consulta
 * a Wikidata en cada publicación.
 *
 * La API de Wikidata limita las peticiones anónimas, así que el script hace dos
 * llamadas grandes (claims de todos los modelos, etiquetas de todas las
 * referencias) en vez de una por dato. Los identificadores están fijos porque
 * buscar por nombre cuesta una consulta por modelo y las cuelga seguido.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salida = path.join(rootDir, 'data', 'fichas.json');
const UA = 'NexoCatalogo/1.0 (fichas tecnicas de catalogo)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(params, intentos = 4) {
  for (let intento = 1; intento <= intentos; intento++) {
    await sleep(700 * intento);
    try {
      const res = await fetch(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'User-Agent': UA } });
      const texto = await res.text();
      if (res.ok && !texto.startsWith('You are making')) return JSON.parse(texto);
    } catch { /* reintento */ }
  }
  return null;
}

// Modelo del catalogo -> identificador en Wikidata (verificado a mano).
const IDENTIFICADORES = {
  'iPhone 13': 'Q108118280',
  'iPhone 14': 'Q110397828',
  'iPhone 15': 'Q121992935',
  'iPhone 15 Celeste': 'Q121992935',
  'iPhone 15 Pro Turquesa': 'Q122442399',
  'iPhone 15 Pro Max': 'Q125178718',
  'iPhone 16e': 'Q132559447',
  'iPhone 17': 'Q136193312',
  'iPhone 17 Pro': 'Q136193477',
  'iPhone 17 Pro Max': 'Q136203050',
  'MacBook Air M1': null,
  'MacBook Pro M1': null,
  'MacBook PRO M2': null,
  'AirPods 2da Generación': 'Q125552915',
  'AirPods 3ra Generación': null,
  'Airpods Pro 2da Generación': null
};

const PROPIEDADES = {
  fecha: ['P6949', 'P571', 'P577'],
  pantalla: ['P13749'],
  tecnologia: ['P5307'],
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

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const claimDe = (claims, props) => { for (const p of props) if (claims[p]?.length) return claims[p]; return null; };
// claimDe devuelve la lista de valores de una propiedad; estas funciones toman
// el primero, que es el que Wikidata marca como preferido.
const primero = lista => (Array.isArray(lista) ? lista[0] : lista) || null;
const valorCrudo = claim => primero(claim)?.mainsnak?.datavalue?.value;
const cantidad = claim => {
  const v = valorCrudo(claim);
  return v && typeof v === 'object' && v.amount ? Number(String(v.amount).replace('+', '')) : null;
};
const idsDe = claim => {
  const v = valorCrudo(claim);
  return v && typeof v === 'object' && v.id ? [v.id] : [];
};

// 1) Claims de todos los modelos en una sola llamada.
// Ojo: wbgetclaims acepta un solo item por vez; wbgetentities con props=claims
// trae hasta 50 items, que es lo que hace falta para no chocar con el limite.
const idsUnicos = [...new Set(Object.values(IDENTIFICADORES).filter(Boolean))];
console.log(`modelos con identificador: ${idsUnicos.length}`);
const claimsPorModelo = new Map();
for (let i = 0; i < idsUnicos.length; i += 50) {
  const j = await api({ action: 'wbgetentities', ids: idsUnicos.slice(i, i + 50).join('|'), props: 'claims' });
  for (const [id, e] of Object.entries(j?.entities || {})) {
    if (e.claims) claimsPorModelo.set(id, e.claims);
  }
}
console.log(`fichas leidas: ${claimsPorModelo.size}`);

// 2) Etiquetas de todas las referencias (CPU, sistema, colores...) en dos llamadas.
const referencias = new Set();
for (const claims of claimsPorModelo.values()) {
  for (const [p, lista] of Object.entries(claims)) {
    if (!['P880', 'P306', 'P2935', 'P5307', 'P462', 'P2916'].includes(p)) continue;
    for (const claim of lista) for (const id of idsDe(claim)) referencias.add(id);
  }
}
const etiquetaPorId = new Map();
const listaRefs = [...referencias];
for (let i = 0; i < listaRefs.length; i += 40) {
  const j = await api({ action: 'wbgetentities', ids: listaRefs.slice(i, i + 40).join('|'), props: 'labels', languages: 'es|en' });
  for (const [id, e] of Object.entries(j?.entities || {})) {
    etiquetaPorId.set(id, e.labels?.es?.value || e.labels?.en?.value || id);
  }
}
console.log(`referencias resueltas: ${etiquetaPorId.size}`);
// Etiquetas que no se pudieron resolver (vuelven como Q123). No se publican:
// es preferible una ficha corta a una con identificadores crudos.
const nombre = id => {
  const etiqueta = etiquetaPorId.get(id);
  return !etiqueta || /^Q\d+$/.test(etiqueta) ? '' : etiqueta;
};
const soloValores = ids => ids.map(nombre).filter(Boolean);

const fichas = {};
const sinFicha = [];
for (const [modelo, id] of Object.entries(IDENTIFICADORES)) {
  const claims = id ? claimsPorModelo.get(id) : null;
  if (!claims || !Object.keys(claims).length) { sinFicha.push(modelo); continue; }
  const filas = [];
  const agregar = (etiqueta, valor) => { if (valor) filas.push([etiqueta, valor]); };

  // 1) Lanzamiento. Wikidata escribe los años con signo: "+2023-09-12".
  const fecha = claimDe(claims, PROPIEDADES.fecha);
  const momento = valorCrudo(fecha)?.time;
  if (momento) {
    const [anio, mes] = momento.slice(0, 10).split('-');
    const limpio = anio.replace(/[^\d]/g, '');
    agregar('Lanzamiento', mes ? `${MESES[Number(mes) - 1]} de ${limpio}` : limpio);
  }

  // 2) Pantalla: sólo con la medida real de la diagonal. Wikidata guarda aparte
  // la tecnología (OLED, etc.) y sin el tamaño no sirve como dato de pantalla.
  const diagonal = cantidad(claimDe(claims, PROPIEDADES.pantalla));
  if (diagonal && diagonal >= 4 && diagonal <= 8) agregar('Pantalla', `${diagonal}"`);

  // 3) Procesador: el dato más confiable de Wikidata para estos equipos.
  agregar('Procesador', soloValores(idsDe(claimDe(claims, PROPIEDADES.procesador)))[0]);
  agregar('Sistema operativo', soloValores(idsDe(claimDe(claims, PROPIEDADES.sistema))).slice(0, 2).join(' · '));

  // 4) Almacenamiento: se descartan los valores sueltos (Wikidata tiene entradas
  // de 1 y 2 GB que son ruido, no capacidades reales).
  const gb = (claimDe(claims, PROPIEDADES.almacenamiento) || []).map(cantidad).filter(n => n !== null && n >= 16);
  if (gb.length) agregar('Almacenamiento', [...new Set(gb)].sort((a, b) => a - b).map(n => `${n} GB`).join(' / '));

  // 5) Medidas: alto × ancho × grosor. Si el grosor es absurdo (Wikidata tiene
  // errores de unidad) se omite y se publica sólo el plano.
  const alto = cantidad(claimDe(claims, PROPIEDADES.altura));
  const ancho = cantidad(claimDe(claims, PROPIEDADES.ancho));
  const grosor = cantidad(claimDe(claims, PROPIEDADES.grosor));
  if (alto && ancho) {
    const grosorUtil = grosor && grosor <= 20 ? grosor : null;
    agregar('Medidas', [alto, ancho, grosorUtil].filter(n => n !== null).join(' × ') + ' mm');
  }

  const gramos = cantidad(claimDe(claims, PROPIEDADES.peso));
  if (gramos && gramos >= 80 && gramos <= 1000) agregar('Peso', `${gramos} g`);

  agregar('Conector', soloValores(idsDe(claimDe(claims, PROPIEDADES.conector))).slice(0, 2).join(' / '));

  // 6) Colores: se toman todos los valores de la propiedad, no sólo el primero.
  const colores = [...new Set((claimDe(claims, PROPIEDADES.colores) || []).flatMap(claim => idsDe(claim)).map(nombre).filter(Boolean))];
  agregar('Colores de fábrica', colores.slice(0, 10).join(', '));

  if (!filas.length) { sinFicha.push(modelo); continue; }
  fichas[modelo] = {
    fuente: 'Wikidata (CC0)',
    wikidata: id,
    url: `https://www.wikidata.org/wiki/${id}`,
    actualizado: new Date().toISOString(),
    filas
  };
  console.log(`${modelo.padEnd(26)} ${filas.length} datos`);
}

fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify({ generado: new Date().toISOString(), fichas }, null, 2));
console.log(`\ncon ficha: ${Object.keys(fichas).length}/${Object.keys(IDENTIFICADORES).length}`);
console.log(`sin ficha: ${sinFicha.join(', ') || 'ninguno'}`);
console.log(`escrito: ${salida}`);