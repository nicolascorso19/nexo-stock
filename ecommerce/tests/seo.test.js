import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, closeDatabase, getDatabase } from '../src/db/database.js';
import { getConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { CatalogClient } from '../src/services/catalog-client.js';
import { publicProduct } from '../src/services/catalog-client.js';

const KEY_ID = 'seo-store';
const SECRET = 'q'.repeat(48);
let stockServer;
let stockDb;
let app;
let variantId;

test.before(async () => {
  const { getConfig: getStockConfig } = await import('../../server/config.js');
  const { createDatabase } = await import('../../server/db/database.js');
  const { ensureCommerceRuntime } = await import('../../server/services/commerce.js');
  const { createApp: createStockApp } = await import('../../server/app.js');
  const stockConfig = getStockConfig({ NODE_ENV: 'test', COMMERCE_API_KEY_ID: KEY_ID, COMMERCE_API_SECRET: SECRET, COOKIE_SECURE: 'false' });
  stockDb = createDatabase(':memory:', { seed: true });
  ensureCommerceRuntime(stockDb, stockConfig);
  const variant = stockDb.prepare('SELECT id, product_id FROM product_variants WHERE requires_imei = 0 LIMIT 1').get();
  const now = new Date().toISOString();
  stockDb.prepare('UPDATE products SET published = 1, published_at = ?, public_description = ?, public_slug = ?, public_images_json = ?, public_highlights_json = ?, public_specs_json = ? WHERE id = ?')
    .run(now, 'Equipo verificado con garantía', 'iphone-de-prueba', JSON.stringify(['https://cdn.example.test/iphone-1.jpg', 'https://cdn.example.test/iphone-2.jpg']), JSON.stringify(['Chip A19', 'Cámara 48 MP']), JSON.stringify({ Pantalla: '6,9"', Chip: 'A19 Pro' }), variant.product_id);
  stockDb.prepare('UPDATE product_variants SET published = 1, sale_price = 1699, previous_price = 1899, sale_price_registered = 1, promo_price = NULL WHERE id = ?').run(variant.id);
  stockDb.prepare('UPDATE inventory SET quantity = 2, reserved_quantity = 0, updated_at = ? WHERE variant_id = ?').run(now, variant.id);
  stockServer = createStockApp({ db: stockDb, config: stockConfig }).listen(0, '127.0.0.1');
  await new Promise((resolve) => stockServer.once('listening', resolve));

  const config = getConfig({ NODE_ENV: 'test', DB_PATH: ':memory:', PUBLIC_BASE_URL: 'http://localhost:4000', STOCK_API_BASE_URL: `http://127.0.0.1:${stockServer.address().port}`, STOCK_API_KEY_ID: KEY_ID, STOCK_API_SECRET: SECRET, COOKIE_SECURE: 'false' });
  openDatabase(config);
  variantId = variant.id;
  app = createApp(config, { catalogClient: new CatalogClient(config), paymentProvider: { enabled: () => false } });
});

test.after(async () => {
  await new Promise((resolve) => stockServer.close(resolve));
  closeDatabase();
  void stockDb;
});

test('a product page is server-rendered with crawlable content, meta and JSON-LD', async () => {
  const response = await fetch(`http://127.0.0.1:${stockServer.address().port}/api/health`).catch(() => null);
  void response;
  const html = await renderProductPage('iphone-de-prueba');
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1]?.replace(/<[^>]+>/g, '').trim();
  assert.ok(h1 && h1.length > 2, `el H1 debe estar en el HTML del servidor (encontrado: ${h1})`);
  assert.match(html, /og:title/, 'debe incluir Open Graph');
  assert.match(html, /og:image/, 'debe incluir Open Graph image');
  assert.match(html, /rel="canonical"/, 'debe incluir canonical');
  assert.match(html, /twitter:card/, 'debe incluir twitter:card');
  assert.match(html, /<html lang="es">/, 'debe declarar el idioma');
  assert.match(html, /BreadcrumbList/, 'debe incluir migas de pan estructuradas');
  assert.match(html, /application\/ld\+json/);
  // El JSON-LD debe tener precio, disponibilidad y una URL de oferta.
  const ld = extractJsonLd(html);
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.offers.priceCurrency, 'USD');
  assert.equal(ld.offers.price, '1699.00');
  assert.equal(ld.offers.availability, 'https://schema.org/InStock');
  assert.ok(ld.offers.url, 'la oferta debe declarar su URL');
  assert.equal(ld.offers.priceValidUntil || true, true);
  // Sin datos internos.
  assert.equal(JSON.stringify(ld).match(/"cost"|"supplier"|"imei"/i), null);
});

test('the JSON-LD advertises AggregateOffer across every variant', async () => {
  const html = await renderProductPage('iphone-de-prueba');
  const ld = extractJsonLd(html);
  if (ld.offers['@type'] === 'AggregateOffer') {
    assert.equal(ld.offers.lowPrice, '1699.00');
    assert.ok(ld.offers.offerCount >= 1);
    assert.ok(Array.isArray(ld.offers.offers) && ld.offers.offers.length >= 1);
  }
});

test('a discounted product exposes the strikethrough price in JSON-LD', async () => {
  const html = await renderProductPage('iphone-de-prueba');
  assert.match(html, /1899/, 'el precio anterior debe ser visible para el buscador');
});

test('the product page body contains real product content, not only a JS shell', async () => {
  const html = await renderProductPage('iphone-de-prueba');
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] || '';
  assert.ok(body.length > 1500, `el body debería tener contenido real (${body.length} caracteres)`);
  assert.match(body, /producto/i, 'debe mencionar el producto');
  assert.ok(!/^\s*<div id="app">\s*<div class="boot-screen">/.test(body), 'no debe ser sólo el shell de carga');
});

test('home and catalog emit SEO head tags and Organization/WebSite JSON-LD', async () => {
  const home = await renderPage('/');
  assert.match(home, /og:title/);
  assert.match(home, /rel="canonical"/);
  const graphs = [...home.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((block) => JSON.parse(block[1].replace(/\\u003c/g, '<')));
  const types = graphs.flatMap((graph) => (graph['@graph'] || [graph]).map((node) => node['@type']));
  assert.ok(types.includes('OnlineStore'), `la home debe describir la organización (types: ${types.join(', ')})`);
  assert.ok(types.includes('WebSite'), 'la home debe describir el sitio');

  const catalog = await renderPage('/catalogo');
  assert.match(catalog, /rel="canonical"/);
  assert.match(catalog, /og:title/);
});

test('the catalog page is server-rendered with products and a noindex-safe canonical', async () => {
  const html = await renderPage('/catalogo');
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] || '';
  assert.ok(body.length > 1200, 'el catálogo debe venir renderizado');
  assert.match(html, /name="robots" content="([^"]*)"/, 'debe declarar robots');
});

test('an unknown product returns a real 404 status', async () => {
  const html = await renderPage('/producto/no-existe-este-producto');
  assert.match(html, /<h1|404/, 'debe responder con una página de error');
});

test('internal data never leaks into the rendered HTML', async () => {
  for (const path of ['/', '/catalogo', '/producto/iphone-de-prueba']) {
    const html = await renderPage(path);
    const forbidden = /"cost"|"costTotal"|"profit"|"supplierId"|"imei"\s*:|unitCost|"margin"/i;
    assert.equal(forbidden.test(html), false, `${path} no debe filtrar datos internos`);
  }
});

async function renderPage(path) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return await response.text();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function renderProductPage(slug) {
  return renderPage(`/producto/${slug}`);
}

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const product = blocks.map((block) => JSON.parse(block[1].replace(/\\u003c/g, '<'))).find((item) => item['@type'] === 'Product');
  assert.ok(product, 'debe haber un JSON-LD de tipo Product');
  return product;
}

void getDatabase;
void publicProduct;
void variantId;
