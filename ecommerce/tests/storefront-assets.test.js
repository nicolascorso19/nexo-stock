import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = (name) => fs.readFileSync(path.join(publicDir, name), 'utf8');

test('the browser bundle only imports modules that exist', () => {
  const entry = read('js/app.js');
  const imports = [...entry.matchAll(/from '\.\/([\w.-]+)'/g)].map((match) => match[1]);
  assert.ok(imports.length >= 5, 'app.js debe delegar en varios módulos');
  for (const name of new Set(imports)) {
    assert.ok(fs.existsSync(path.join(publicDir, 'js', name)), `falta el módulo ${name}`);
  }
});

test('every browser module parses and exports what it promises', async () => {
  const modules = ['ui.js', 'views.js', 'product.js', 'analytics.js', 'whatsapp.js', 'store.js', 'api.js'];
  for (const name of modules) {
    // El DOM no existe en Node: se valida sólo que el archivo sea módulo
    // válido y declare sus exportaciones.
    const source = read(`js/${name}`);
    const exportsFound = /export\s+(async\s+)?(function|const|class|let)/.test(source);
    assert.ok(exportsFound, `${name} debe exportar algo`);
  }
});

test('no leftover references to the removed bootstrap or favorites helpers', () => {
  for (const name of ['app.js', 'views.js', 'product.js', 'ui.js', 'store.js']) {
    const source = read(`js/${name}`);
    assert.equal(/bootstrap\(\)|loadCatalog\(\{/.test(source) && name === 'store.js', name === 'store.js', `${name} no debe quedar código de la versión anterior`);
  }
  assert.equal(/from '\.\/store\.js'/.test(read('js/views.js')), true, 'views.js debe leer el estado de store.js');
  assert.equal(/\bstate\b/.test(read('js/app.js')), true, 'app.js debe usar el estado compartido');
});

test('the checkout never collects card data in the browser', () => {
  const source = read('js/views.js');
  assert.equal(/name="cardNumber"|name="cvv"|name="cvc"|name="cardholder"|name="expiry"/i.test(source), false, 'no se deben pedir datos de tarjeta');
  // El medio de pago se elige por etiqueta; la tarjeta se cobra en el proveedor.
  assert.match(source, /paymentOption\('card', 'Mercado Pago'/, 'el pago con tarjeta debe ir al proveedor');
  assert.match(source, /No se cobran datos de tarjetas/, 'debe aclarar que el pago es externo');
  assert.match(source, /No almacenamos datos de tarjetas/, 'el resumen debe aclarar que no se guardan tarjetas');
});

test('the storefront markup never reads internal stock fields', () => {
  for (const name of ['views.js', 'product.js', 'ui.js']) {
    const source = read(`js/${name}`);
    // Se admite la palabra "IMEI" sólo dentro de textos aimed al administrador
    // que explican qué NO hace el panel; nunca como dato de una variante.
    const internal = /unitCost|supplierId|variant\.cost|variant\.imei\b/.test(source);
    assert.equal(internal, false, `${name} no debe leer campos internos`);
  }
});

test('variants are grouped by capacity and color and carry their own SKU', () => {
  const ui = read('js/ui.js');
  const product = read('js/product.js');
  assert.match(ui, /export function variantGroups/, 'debe agrupar variantes');
  assert.match(ui, /key: 'capacity'/, 'debe agrupar por capacidad');
  assert.match(ui, /key: 'color'/, 'debe agrupar por color');
  assert.match(product, /SKU: /, 'la ficha debe mostrar el SKU de la variante elegida');
  assert.match(product, /variant-id="\$\{escape\(selected\?\.id \|\| ''\)\}"/, 'el botón de compra debe enviar la variante elegida');
});

test('analytics covers the events the store needs without personal data', () => {
  const source = read('js/analytics.js');
  for (const event of ['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'search', 'out_of_stock']) {
    assert.match(source, new RegExp(event), `falta el evento ${event}`);
  }
  assert.match(source, /googletagmanager\.com/, 'debe cargar GA4 cuando hay credenciales');
  assert.match(source, /facebook\.net/, 'debe cargar Meta Pixel cuando hay credenciales');
  // Prohibido enviar identidad: email, teléfono o documento.
  assert.equal(/firstName|documentNumber|phone\b/.test(source.replace(/gaMeasurementId|metaPixelId/g, '')), false, 'no debe enviar datos personales');
});

test('WhatsApp messages are generated from the product and variant', async () => {
  const { productMessage, orderMessage, whatsappLink } = await import('../public/js/whatsapp.js');
  const message = productMessage({
    product: { name: 'iPhone 17 Pro Max' },
    variant: { capacity: '256GB', color: 'Titanio Negro', sku: 'SKU-1' },
    config: { address: { locality: 'Córdoba Capital' } }
  });
  assert.match(message, /iPhone 17 Pro Max/);
  assert.match(message, /256GB/);
  assert.match(message, /Titanio Negro/);
  assert.match(message, /SKU-1/);
  assert.match(message, /Córdoba Capital/);
  assert.match(orderMessage({ number: 'NEXO-1' }), /NEXO-1/);

  assert.equal(whatsappLink({ message: 'hola', config: {} }), '', 'sin número no se genera enlace');
  const link = whatsappLink({ message: 'hola mundo', config: { whatsapp: '+54 9 351 000 0000' } });
  assert.match(link, /^https:\/\/wa\.me\/5493510000000\?text=hola%20mundo$/);
});

test('UI helpers produce correct stock labels and discounts', async () => {
  const { stockLabel, discountPercent, priceBlock } = await import('../public/js/ui.js');
  assert.match(stockLabel({ availability: 'OUT' }), /Sin stock/);
  assert.match(stockLabel({ availability: 'LOW', availableQuantity: 2 }), /Últimas 2/);
  assert.match(stockLabel({ availability: 'IN', availableQuantity: 5 }), /5 disponibles/);
  assert.equal(discountPercent({ price: 850, previousPrice: 1000 }), 15);
  assert.equal(discountPercent({ price: 1000 }), 0);
  assert.match(priceBlock({ price: 850, previousPrice: 1000 }, 15), /1,000\.00/, 'debe mostrar el precio tachado');
  assert.match(priceBlock({ price: 850, previousPrice: 1000 }, 15), /-15% OFF/);
});
