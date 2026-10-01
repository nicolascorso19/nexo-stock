/**
 * Build del catálogo público para GitHub Pages.
 *
 * Lee la base real (la misma que usa la API) y escribe un sitio estático en
 * `docs/`. Reusa la página pública que ya existe: no hay diseño duplicado, sólo
 * se copia y se le cambia la fuente de datos de la API por `catalogo.json`.
 *
 * La base es la única fuente de verdad. `docs/` es un artefacto: se regenera
 * entero en cada build, así que nunca hay que editarlo a mano.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getConfig } from '../server/config.js';
import { publicCatalog } from '../server/services/public.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const assetsOut = path.join(docsDir, 'assets');

const config = getConfig();
const db = new Database(config.dbPath, { readonly: true, fileMustExist: true });
const catalog = publicCatalog(db);
db.close();

fs.rmSync(docsDir, { recursive: true, force: true });
fs.mkdirSync(path.join(docsDir, 'js'), { recursive: true });
fs.mkdirSync(assetsOut, { recursive: true });

// Las imágenes se copian a docs/assets y la URL pasa a ser relativa: en GitHub
// Pages no existe /img ni /public-assets. Se copia sólo la primera foto de cada
// variante (la galería completa son 6 por producto en promedio y pesaría 80 MB);
// la que no exista en disco se descarta, para no publicar un link roto.
const copied = new Set();
let sinFoto = 0;
const products = catalog.products.map((product, index) => {
  const images = [];
  for (const image of product.images || []) {
    const relative = image.startsWith('/img/') ? `assets/${image.slice('/img/'.length)}` : image.replace(/^\/public-assets\//, 'assets/');
    if (!/^assets\//.test(relative)) continue;
    const source = path.join(
      rootDir,
      image.startsWith('/img/') ? path.join('assets', image.replace(/^\//, '')) : path.join('public-assets', image.slice('/public-assets/'.length))
    );
    if (!fs.existsSync(source)) { sinFoto++; continue; }
    const name = path.basename(source);
    if (!copied.has(name)) { fs.copyFileSync(source, path.join(assetsOut, name)); copied.add(name); }
    images.push(`assets/${name}`);
    break; // la página muestra una foto por variante
  }
  return { ...product, id: `p${index}`, images };
});

const business = catalog.business || {};
const generatedAt = new Date().toISOString();

fs.writeFileSync(
  path.join(docsDir, 'catalogo.json'),
  JSON.stringify({ data: { business, generatedAt, products } }, null, 2),
  'utf8'
);

// La página existente, con la fuente de datos cambiada por el JSON local.
const page = fs.readFileSync(path.join(rootDir, 'public.html'), 'utf8')
  .replaceAll('href="/"', 'href="#catalogo"')
  .replaceAll('href="/public"', 'href="./"')
  .replace(/<a[^>]*href="#catalogo"[^>]*>\s*Acceso privado\s*<\/a>/g, '')
  .replaceAll('<script src="js/public.js"></script>', '<script src="js/public.js"></script>\n    <noscript>NEXO Móviles · Córdoba Capital</noscript>');
fs.writeFileSync(path.join(docsDir, 'index.html'), page, 'utf8');

const client = fs.readFileSync(path.join(rootDir, 'js', 'public.js'), 'utf8')
  .replace("fetch('/api/public/catalog'", "fetch('catalogo.json'");
fs.writeFileSync(path.join(docsDir, 'js', 'public.js'), client, 'utf8');

fs.copyFileSync(path.join(rootDir, 'styles.css'), path.join(docsDir, 'styles.css'));
fs.writeFileSync(path.join(docsDir, 'CNAME'), 'nexo-moviles.github.io\n', 'utf8');

const bytes = fs.readdirSync(docsDir, { recursive: true })
  .filter(name => fs.statSync(path.join(docsDir, name)).isFile())
  .reduce((sum, name) => sum + fs.statSync(path.join(docsDir, name)).size, 0);

console.log('Catalogo estatico generado en docs/');
console.log(`  productos      : ${products.length}`);
console.log(`  con imagen     : ${products.filter(p => p.images.length).length}`);
console.log(`  imagenes copiadas: ${copied.size} (${Math.round([...copied].reduce((s, n) => s + fs.statSync(path.join(assetsOut, n)).size, 0) / 1024)} KB)`);
console.log(`  enlaces rotos descartados: ${sinFoto}`);
console.log(`  peso total     : ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  generado       : ${generatedAt}`);
