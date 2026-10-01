/**
 * Importador de catálogo e imágenes desde un sitio de e-commerce externo.
 *
 * Uso:
 *   node scripts/import-site-catalog.mjs --plan     # sólo descubre y reporta, no escribe nada
 *   node scripts/import-site-catalog.mjs --apply    # descarga imágenes y escribe el catálogo
 *
 * Opciones:
 *   --base-url <url>   sitio origen (por defecto https://www.iphonestorecordoba.com.ar)
 *   --db <ruta>        base privada destino (por defecto data/nexo.sqlite)
 *   --max-pages <n>    tope de páginas a visitar
 *   --delay <ms>       pausa entre peticiones (por defecto 350)
 *   --images           [apply] también descarga las imágenes
 *   --images-only      [apply] no inserta productos, sólo deja las imágenes en disco
 *
 * Reglas duras (no negociables):
 *   · No inventa precios. El sitio publica en pesos; el sistema es USD sin
 *     conversión automática, así que la venta queda SIN REGISTRAR y el monto
 *     original se guarda sólo en las notas privadas.
 *   · No inventa stock: todas las variantes nacen en 0.
 *   · No inventa costos: 0 y sin registrar.
 *   · Respeta robots.txt: nunca visita /order, /checkout ni /account.
 *   · Es idempotente: los ids y los SKU se derivan de la URL, así que se puede
 *     volver a ejecutar sin duplicar nada.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE_URL = String(option('base-url', 'https://www.iphonestorecordoba.com.ar')).replace(/\/$/, '');
const DB_PATH = path.resolve(rootDir, option('db', 'data/nexo.sqlite'));
const MAX_PAGES = Number(option('max-pages', 260));
const DELAY = Number(option('delay', 350));
const APPLY = flag('apply');
const WANT_IMAGES = flag('images') || !flag('images-only');
const IMAGES_ONLY = flag('images-only');

// Ambos sistemas sirven las imágenes en la misma ruta /img/catalog/...
const IMAGE_DIRS = [
  path.join(rootDir, 'ecommerce', 'public', 'img', 'catalog'),
  path.join(rootDir, 'assets', 'img', 'catalog')
];

const SKIP_PATHS = /^\/(order|checkout|account|carrito|buscar|search|login|registro)/i;
const STATIC_PAGES = /^\/(politicas-de-privacidad|info-ayuda|whatsapp|promo|contacto|nosotros|envios|formas-de-pago|faqs?)(\/|$)/i;
const PAYMENT_HOSTS = /payment-icons|logos\/payment|sprite|\.gif($|\?)/i;
const USER_AGENT = 'Mozilla/5.0 (compatible; NEXOCatalogImport/1.0; +local migration)';
const SITE_CURRENCY = 'ARS';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (value, length = 16) => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, length);
const nowIso = () => new Date().toISOString();
const slugify = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';

function text(value) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/\s+/g, ' ').trim();
}

async function get(url, { binary = false } = {}) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': USER_AGENT, accept: '*/*' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  if (binary) {
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) throw new Error(`no es imagen (${type}) ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 12 * 1024 * 1024) throw new Error('imagen demasiado grande');
    return { buffer, type };
  }
  return response.text();
}

/* -----------------------------------------------------------------_descubrimiento */

async function sitemapUrls() {
  try {
    const xml = await get(`${BASE_URL}/sitemap.xml`);
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
    if (locs.length) return locs;
  } catch { /* sin sitemap: se recurre a /productos */ }
  return [`${BASE_URL}/productos`];
}

function candidateUrls(locs) {
  const seen = new Set();
  const urls = [];
  for (const loc of locs) {
    let pathname;
    try { pathname = new URL(loc).pathname; } catch { continue; }
    if (pathname === '/' || pathname === '') continue;
    if (SKIP_PATHS.test(pathname) || STATIC_PAGES.test(pathname)) continue;
    if (pathname.split('/').filter(Boolean).length < 2) continue; // sólo categorías y fichas
    const clean = `${BASE_URL}${pathname.replace(/\/$/, '')}`;
    if (!seen.has(clean)) { seen.add(clean); urls.push(clean); }
  }
  return urls;
}

/**
 * Clasificación de la línea del sitio. Se recalcula SIEMPRE en la importación
 * (no se confía en la caché) para que un cambio de mapeo no exija re-raspar.
 * Se reutilizan las categorías canónicas del sistema en vez de crear
 * "Iphone"/"Ipad"/"Macbook", que duplicarían Celulares/Tablets/Notebooks.
 */
const CATEGORY_BY_LINE = {
  iphone: 'Celulares',
  ipad: 'Tablets',
  macbook: 'Notebooks',
  'apple-watch': 'Wearables',
  accesorios: 'Accesorios'
};

function classify(pathname) {
  const line = (pathname.split('/').filter(Boolean)[0] || 'general').toLowerCase();
  const category = CATEGORY_BY_LINE[line] || 'Otros';
  const brand = /^(iphone|ipad|macbook|apple-watch)$/.test(line) ? 'Apple' : 'Genérico';
  return { category, brand, serialized: category !== 'Accesorios' && category !== 'Otros' };
}

function parsePage(html, url) {
  const pathname = new URL(url).pathname.replace(/\/$/, '');
  const isProduct = /<meta property="og:type" content="product"/i.test(html);
  if (!isProduct) return null;

  const name = text((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1]);
  if (!name) return null;

  const description = text((/<meta name="description" content="([^"]*)"/i.exec(html) || [])[1]);

  // Precio publicado: se captura el texto original, nunca se convierte.
  const priceRaw = text((/<span class="product-vip__price-value"[^>]*>([\s\S]*?)<\/span>/i.exec(html) || [])[1]);
  const compareRaw = text((/<(?:del|before)[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\//i.exec(html) || [])[1]);

  // Atributos: <select name="atributos-N"> → opciones (capacidad / color).
  const options = [];
  for (const select of html.matchAll(/<select[^>]*name="atributos-\d+"[^>]*>([\s\S]*?)<\/select>/gi)) {
    for (const option of select[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)) {
      const label = text(option[2]) || text(option[1]);
      if (label) options.push(label);
    }
  }

  // Imágenes: sólo el CDN de contenido, excluyendo íconos de pago y sprites.
  const images = [];
  const seen = new Set();
  const push = (src) => {
    if (!src || PAYMENT_HOSTS.test(src)) return;
    const clean = src.split('?')[0];
    if (seen.has(clean)) return;
    seen.add(clean);
    images.push(clean);
  };
  const ogImage = (/<meta property="og:image" content="([^"]*)"/i.exec(html) || [])[1];
  if (ogImage) push(ogImage);
  for (const match of html.matchAll(/<img[^>]+src="(https:\/\/[^"]+\.(?:jpe?g|png|webp))"/gi)) push(match[1]);
  for (const match of html.matchAll(/data-(?:src|zoom|large|gallery)="(https:\/\/[^"]+\.(?:jpe?g|png|webp))"/gi)) push(match[1]);

  const segments = pathname.split('/').filter(Boolean);
  const line = segments[0] || 'general';
  const { category, brand, serialized } = classify(pathname);

  return { url, pathname, name, description, priceRaw, compareRaw, options: [...new Set(options)], images, category, brand, serialized };
}

/* ---------------------------------------------------------------------- imágenes */

/* ---------------------------------------------------------------------- imágenes */

function imageName(source, productSlug, index) {
  const digest = hash(source, 10);
  // El grupo de captura NO incluye el punto: hay que agregarlo o el archivo
  // queda sin extensión y el navegador lo recibe como application/octet-stream.
  const match = /\.(jpe?g|png|webp)$/i.exec(source.split('?')[0]);
  const extension = `.${(match ? match[1] : 'jpg').toLowerCase().replace('jpeg', 'jpg')}`;
  return `${productSlug}-${index + 1}-${digest}${extension}`;
}

async function downloadImages(products, report) {
  const bySource = new Map();
  for (const product of products) {
    product.localImages = [];
    for (const [index, source] of product.images.entries()) {
      if (!bySource.has(source)) bySource.set(source, { source, usedBy: [] });
      bySource.get(source).usedBy.push({ product, index });
    }
  }

  for (const [source, entry] of bySource) {
    const first = entry.usedBy[0];
    const fileName = imageName(source, slugify(first.product.name), first.index);
    const targets = IMAGE_DIRS.map((dir) => path.join(dir, fileName));
    if (targets.every((target) => fs.existsSync(target))) {
      for (const { product } of entry.usedBy) product.localImages.push(`/img/catalog/${fileName}`);
      report.skipped += 1;
      continue;
    }
    try {
      const { buffer } = await get(source, { binary: true });
      for (const target of targets) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buffer);
      }
      for (const { product } of entry.usedBy) product.localImages.push(`/img/catalog/${fileName}`);
      report.downloaded += 1;
      report.bytes += buffer.length;
    } catch (error) {
      report.failed.push({ source, error: error.message });
    }
    await sleep(120);
  }
}

/* -------------------------------------------------------------------------- base */

/** Upsert por id. `columns` debe incluir todas las NOT NULL de la tabla. */
function upsert(db, table, id, columns) {
  const keys = Object.keys(columns);
  db.prepare(`INSERT INTO ${table} (id, ${keys.join(', ')}, created_at, updated_at) VALUES (@id, @${keys.join(', @')}, @now, @now)
    ON CONFLICT(id) DO UPDATE SET ${keys.map((key) => `${key} = excluded.${key}`).join(', ')}, updated_at = @now`)
    .run({ id, ...columns, now: nowIso() });
}

const COLOR_WORDS = /^(blanc[oa]|negr[oa]|azul|rojo|verde|gris|rosa|dorado|platead[oa]|platead[oa]|transparente|celeste|amarill[oa]|naranja|violeta|morad[oa]|turquesa|sand|beige|café|titán[io]|natural|titanio|sierra blue|midnight|midnight|starlight|spacegra[yi]m|lavender|champagne|gold|silver|black|white|blue|red|green|pink|purple)\b/i;

/**
 * Clasifica una opción de variante. En accesorios el sitio usa el selector para
 * listar **compatibilidad** ("iPhone 13 Pro", "iPhone 11"), que no es un color:
 * esos valores se conservan como nombre de variante pero no se ensucian las
 * tablas de referencia.
 */
/**
 * Las tablas de referencia (brands, categories, capacities, colors,
 * product_models) tienen UNIQUE por nombre, no por id. La base puede venir con
 * filas del seed, así que primero se busca la fila existente y se reutiliza su
 * id: insertar un duplicado revienta la restricción y aborta toda la
 * transacción.
 */
function existingId(db, table, where, params) {
  return db.prepare(`SELECT id FROM ${table} WHERE ${where} LIMIT 1`).get(params)?.id || null;
}

function capacityKind(value) {
  const label = String(value).trim();
  if (/^\d+\s*(gb|tb|mb)$/i.test(label.replace(/\s+/g, ''))) return 'capacity';
  if (COLOR_WORDS.test(label)) return 'color';
  return 'none';
}

function applyToDatabase(products, report) {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  const now = nowIso();
  const cache = { brands: new Map(), models: new Map(), categories: new Map(), capacities: new Map(), colors: new Map() };

  const ensureBrand = (name) => {
    const key = name.toLowerCase();
    if (cache.brands.has(key)) return cache.brands.get(key);
    const found = existingId(db, 'brands', 'name = ? COLLATE NOCASE', name);
    if (found) { cache.brands.set(key, found); return found; }
    const id = `ref_brand_${hash(key, 12)}`;
    upsert(db, 'brands', id, { name });
    cache.brands.set(key, id);
    return id;
  };
  const ensureCategory = (name) => {
    const key = name.toLowerCase();
    if (cache.categories.has(key)) return cache.categories.get(key);
    const found = existingId(db, 'categories', 'name = ? COLLATE NOCASE', name);
    if (found) { cache.categories.set(key, found); return found; }
    const id = `ref_category_${hash(key, 12)}`;
    upsert(db, 'categories', id, { name });
    cache.categories.set(key, id);
    return id;
  };
  const ensureModel = (brandId, name) => {
    const key = `${brandId}|${name.toLowerCase()}`;
    if (cache.models.has(key)) return cache.models.get(key);
    const found = existingId(db, 'product_models', 'brand_id = ? AND name = ? COLLATE NOCASE', [brandId, name]);
    if (found) { cache.models.set(key, found); return found; }
    const id = `ref_model_${hash(key, 14)}`;
    upsert(db, 'product_models', id, { brand_id: brandId, name, availability_status: 'CURRENT' });
    cache.models.set(key, id);
    return id;
  };
  const ensureVariantAttribute = (table, name) => {
    const key = `${table}|${name.toLowerCase()}`;
    const map = table === 'capacities' ? cache.capacities : cache.colors;
    if (map.has(key)) return map.get(key);
    const found = existingId(db, table, 'name = ? COLLATE NOCASE', name);
    if (found) { map.set(key, found); return found; }
    const id = `ref_${table.slice(0, -1)}_${hash(key, 12)}`;
    upsert(db, table, id, { name, sort_order: 0 });
    map.set(key, id);
    return id;
  };

  const importAll = db.transaction(() => {
    for (const product of products) {
      const brandId = ensureBrand(product.brand);
      const modelId = ensureModel(brandId, product.name);
      const categoryId = ensureCategory(product.category);
      const productId = `imp_product_${hash(product.pathname, 14)}`;
      const images = JSON.stringify(product.localImages || []);

      upsert(db, 'products', productId, {
        model_id: modelId,
        category_id: categoryId,
        public_slug: slugify(product.name),
        public_description: product.description || null,
        public_images_json: images,
        public_highlights_json: JSON.stringify(product.description ? [product.description.slice(0, 220)] : []),
        public_specs_json: '{}',
        published: 1,
        is_fictional: 0,
        archived: 0,
        published_at: now
      });

      const options = product.options.length ? product.options : ['Estándar'];
      let variantCount = 0;
      for (const option of options) {
        const kind = capacityKind(option);
        const attributeId = kind === 'none' ? null : ensureVariantAttribute(kind === 'capacity' ? 'capacities' : 'colors', option);
        const key = `${product.pathname}|${option}`;
        const variantId = `imp_variant_${hash(key, 14)}`;
        const sku = `EXT-${hash(key, 14).toUpperCase()}`;
        const notes = [
          'Importado del sitio de origen; SKU interno real pendiente de asignar.',
          product.priceRaw
            ? `Precio publicado en el sitio (${SITE_CURRENCY}): ${product.priceRaw}.`
            : 'El sitio no publica precio para esta ficha.',
          'Venta SIN REGISTRAR a propósito: el sistema opera en USD y no convierte monedas.'
        ].join(' ');

        upsert(db, 'product_variants', variantId, {
          product_id: productId,
          capacity_id: kind === 'capacity' ? attributeId : null,
          color_id: kind === 'color' ? attributeId : null,
          variant_name: option,
          sku,
          condition: 'Nuevo',
          requires_imei: product.serialized ? 1 : 0,
          cost: 0,
          cost_registered: 0,
          sale_price: 0,
          sale_price_registered: 0,
          notes,
          published: 1,
          public_images_json: images,
          is_fictional: 0,
          active: 1
        });

        const existing = db.prepare('SELECT 1 FROM inventory WHERE variant_id = ?').get(variantId);
        if (existing) {
          db.prepare('UPDATE inventory SET quantity = 0, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(now, variantId);
        } else {
          db.prepare('INSERT INTO inventory (variant_id, quantity, reserved_quantity, updated_at) VALUES (?, 0, 0, ?)').run(variantId, now);
        }
        variantCount += 1;
      }
      report.products += 1;
      report.variants += variantCount;
    }
  });

  try {
    importAll();
  } finally {
    db.close();
  }
}

/* ---------------------------------------------------------------------------- main */

const CACHE_PATH = path.join(rootDir, '.tmp', 'catalogo-descubierto.json');
const discovered = fs.existsSync(CACHE_PATH)
  ? new Map(JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')).map((item) => [item.pathname, item]))
  : new Map();
const saveDiscovered = () => {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify([...discovered.values()], null, 0));
};

async function main() {
  const report = { products: 0, variants: 0, downloaded: 0, skipped: 0, bytes: 0, failed: [], pages: 0, categories: {} };
  const locs = await sitemapUrls();
  const urls = candidateUrls(locs).slice(0, MAX_PAGES);
  const pending = urls.filter((url) => !discovered.has(new URL(url).pathname));
  console.log(`URLs candidatas ${urls.length} · ya en caché ${urls.length - pending.length} · pendientes ${pending.length}`);

  for (const [index, url] of pending.entries()) {
    const pathname = new URL(url).pathname;
    try {
      const html = await get(url);
      report.pages += 1;
      const parsed = parsePage(html, url);
      // Se marca también lo que no es producto: si no, esas páginas se
      // vuelven a pedir en cada ejecución y el rastreo nunca termina.
      discovered.set(pathname, parsed || { pathname, notProduct: true });
    } catch (error) {
      report.failed.push({ url, error: error.message });
      discovered.set(pathname, { pathname, notProduct: true, error: error.message });
    }
    if ((index + 1) % 10 === 0) {
      saveDiscovered();
      console.log(`  ${index + 1}/${pending.length} visitadas · ${discovered.size} páginas en caché`);
    }
    await sleep(DELAY);
  }
  saveDiscovered();

  const products = [...discovered.values()].filter((item) => !item.notProduct)
    .map((product) => ({ ...product, ...classify(product.pathname) }));
  const notProducts = [...discovered.values()].filter((item) => item.notProduct);
  console.log(`\nProductos detectados: ${products.length} (páginas no-producto: ${notProducts.length})`);
  for (const product of products) report.categories[product.category] = (report.categories[product.category] || 0) + 1;
  console.log('Por categoría:', report.categories);
  const totalImages = new Set(products.flatMap((product) => product.images)).size;
  console.log(`Imágenes distintas referenciadas: ${totalImages}`);
  const withPrice = products.filter((product) => product.priceRaw).length;
  console.log(`Fichas con precio publicado (${SITE_CURRENCY}, sólo referencia): ${withPrice}/${products.length}`);

  if (!APPLY) {
    const preview = products.slice(0, 5).map((product) => ({
      name: product.name, category: product.category, brand: product.brand,
      variants: product.options, images: product.images.length, priceArs: product.priceRaw || null
    }));
    console.log('\nMODO PLAN: no se escribió nada. Vista previa:');
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  if (WANT_IMAGES) {
    console.log('\nDescargando imágenes…');
    for (const product of products) {
      product.localImages = [];
      for (const [index, source] of product.images.entries()) {
        const fileName = imageName(source, slugify(product.name), index);
        const targets = IMAGE_DIRS.map((dir) => path.join(dir, fileName));
        if (targets.every((target) => fs.existsSync(target))) { product.localImages.push(`/img/catalog/${fileName}`); report.skipped += 1; continue; }
        try {
          const { buffer } = await get(source, { binary: true });
          for (const target of targets) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, buffer); }
          product.localImages.push(`/img/catalog/${fileName}`);
          report.downloaded += 1;
          report.bytes += buffer.length;
        } catch (error) {
          report.failed.push({ source, error: error.message });
        }
        await sleep(80);
      }
    }
    console.log(`  descargadas ${report.downloaded} · omitidas ${report.skipped} · fallidas ${report.failed.length} · ${(report.bytes / 1048576).toFixed(1)} MB`);
  }

  console.log('\nEscribiendo el catálogo en la base privada…');
  applyToDatabase(products, report);
  console.log(`  productos ${report.products} · variantes ${report.variants}`);

  const manifest = {
    importedAt: nowIso(),
    source: BASE_URL,
    sourceCurrency: SITE_CURRENCY,
    saleCurrency: 'USD',
    pricesImported: false,
    stockImported: false,
    imagesDownloaded: report.downloaded,
    bytesDownloaded: report.bytes,
    products: products.map((product) => ({
      name: product.name, source: product.url, category: product.category, brand: product.brand,
      serialized: product.serialized, variants: product.options, images: product.localImages || [],
      sourcePriceArs: product.priceRaw || null
    })),
    failures: report.failed
  };
  fs.mkdirSync(path.join(rootDir, 'backups'), { recursive: true });
  const manifestPath = path.join(rootDir, 'backups', `import-catalogo-${nowIso().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifiesto: ${path.relative(rootDir, manifestPath)}`);
  if (report.failed.length) {
    console.log(`\n${report.failed.length} fallos (no bloquean la importación):`);
    for (const failure of report.failed.slice(0, 10)) console.log('  -', failure.url || failure.source, failure.error);
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error('FALLO DEL IMPORTADOR:', error?.stack || error);
  process.exit(1);
}
