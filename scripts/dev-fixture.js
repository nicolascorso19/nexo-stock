/**
 * NEXO · datos de DESARROLLO (MOCK)
 *
 * Crea un catálogo ficticio y marcado como tal en la base de DESARROLLO para
 * poder revisar la tienda sin inventar inventario real.
 *
 * Garantías:
 *  - Se niega a correr con NODE_ENV=production.
 *  - Por defecto escribe en una base separada (data/nexo-dev.sqlite), nunca en
 *    la base de producción, salvo que se pase DB_PATH explícitamente.
 *  - Marca cada fila con is_fictional = 1. La API de e-commerce excluye lo
 *    ficticio salvo que se habilite COMMERCE_INCLUDE_FICTIONAL, y getConfig()
 *    rechaza esa opción en producción.
 *  - No crea clientes, ventas, compras, costos reales ni IMEI de clientes.
 *
 * Uso:
 *   npm run dev:seed          # crea el catálogo de desarrollo
 *   npm run dev:seed -- --reset
 */
import { getConfig } from '../server/config.js';
import { createDatabase, closeDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { createProduct } from '../server/services/products.js';
import { addStock } from '../server/services/stock.js';
import { createId, nowIso, makeLuhnImei } from '../server/utils.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Los datos de desarrollo no pueden generarse en producción.');
  process.exit(1);
}

const reset = process.argv.includes('--reset');
const explicitDbPath = String(process.env.DB_PATH || '').trim();
// Sin DB_PATH explícita se usa una base propia para no tocar datos reales.
process.env.DB_PATH = explicitDbPath || 'data/nexo-dev.sqlite';
process.env.SEED_DEMO = process.env.SEED_DEMO || 'true';

const config = getConfig();
const db = createDatabase(config.dbPath, { seed: true, bootstrap: true });
const actor = db.prepare("SELECT id, name FROM users WHERE role_id = 'admin' ORDER BY id LIMIT 1").get();
const request = { ip: '127.0.0.1', userAgent: 'dev-fixture', requestId: createId('req') };

const catalog = [
  {
    brand: 'Apple', model: 'iPhone 17 Pro Max', category: 'Celulares', trending: true,
    description: 'Pantalla de 6,9", chip A19 Pro y sistema de cámaras de 48 MP. Con garantía oficial.',
    highlights: ['Chip A19 Pro', 'Cámara triple de 48 MP', 'Pantalla Super Retina XDR', 'Resistencia al agua IP68'],
    specifications: { 'Pantalla': '6,9" Super Retina XDR', 'Chip': 'A19 Pro', 'Cámara': 'Triple 48 MP', 'Batería': 'Hasta 33 h de video', 'Resistencia': 'IP68' },
    variants: [
      { capacity: '256GB', color: 'Titanio Negro', price: 1699, previousPrice: 1899, stock: 2, imei: true, warranty: '12 meses' },
      { capacity: '512GB', color: 'Titanio Negro', price: 1999, stock: 1, imei: true, warranty: '12 meses' },
      { capacity: '256GB', color: 'Titanio Natural', price: 1699, previousPrice: 1899, stock: 3, imei: true, warranty: '12 meses' },
      { capacity: '512GB', color: 'Titanio Natural', price: 1999, stock: 0, imei: true, warranty: '12 meses' },
      { capacity: '1TB', color: 'Titanio Blanco', price: 2299, stock: 2, imei: true, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'iPhone 17', category: 'Celulares', trending: true,
    description: 'El iPhone más equilibrado: chip A19, cámara de 48 MP y hasta 30 horas de video.',
    highlights: ['Chip A19', 'Cámara Fusion de 48 MP', 'Pantalla de 6,3"', 'USB-C'],
    specifications: { 'Pantalla': '6,3" Super Retina XDR', 'Chip': 'A19', 'Cámara': '48 MP Fusion', 'Resistencia': 'IP68' },
    variants: [
      { capacity: '128GB', color: 'Negro', price: 899, stock: 4, warranty: '12 meses' },
      { capacity: '256GB', color: 'Blanco', price: 1049, previousPrice: 1099, stock: 2, warranty: '12 meses' },
      { capacity: '256GB', color: 'Azul', price: 1049, stock: 1, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'iPhone 16', category: 'Celulares',
    description: 'Chip A18, botón de Control de Cámara y cámara doble de 48 MP.',
    highlights: ['Chip A18', 'Botón Control de Cámara', 'Cámara doble 48 MP'],
    specifications: { 'Pantalla': '6,1" Super Retina XDR', 'Chip': 'A18', 'Cámara': 'Doble 48 MP' },
    variants: [
      { capacity: '128GB', color: 'Negro', price: 699, stock: 5, warranty: '12 meses' },
      { capacity: '256GB', color: 'Verde', price: 799, stock: 2, warranty: '12 meses' },
      { capacity: '128GB', color: 'Blanco', price: 699, previousPrice: 799, stock: 0, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'AirPods Pro 3', category: 'Accesorios', trending: true, modelName: 'AirPods Pro',
    description: 'Cancelación activa de ruido 2,5× más potente y audio espacial personalizado.',
    highlights: ['Cancelación activa de ruido', 'Audio espacial', 'Resistencia IP57', 'USB-C'],
    specifications: { 'Chip': 'H3', 'Batería': 'Hasta 8 h de escucha', 'Conectividad': 'Bluetooth 5.4' },
    variants: [
      { capacity: '', color: 'Blanco', price: 249, previousPrice: 279, stock: 12, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'Apple Watch Series 11', category: 'Wearables', modelName: 'Watch Series',
    description: 'Sensores de salud avanzada, pantalla siempre activa y 24 h de batería.',
    highlights: ['Pantalla siempre activa', 'Detección de hipertensión', '24 h de batería'],
    specifications: { 'Pantalla': 'Retina LTPO3', 'Conectividad': 'GPS + LTE', 'Material': 'Aluminio reciclado' },
    variants: [
      { capacity: '46mm', color: 'Medianoche', price: 429, stock: 3, warranty: '12 meses' },
      { capacity: '46mm', color: 'Plata', price: 429, previousPrice: 469, stock: 1, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'iPad Air 13', category: 'Tablets',
    description: 'Chip M3, pantalla Liquid Retina de 13" y compatibilidad con Apple Pencil Pro.',
    highlights: ['Chip M3', 'Pantalla Liquid Retina 13"', 'Apple Pencil Pro'],
    specifications: { 'Pantalla': '13" Liquid Retina', 'Chip': 'M3', 'Conectividad': 'Wi-Fi 6E' },
    variants: [
      { capacity: '256GB', color: 'Azul', price: 799, stock: 2, warranty: '12 meses' },
      { capacity: '512GB', color: 'Espacial', price: 999, stock: 1, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'MacBook Air 15', category: 'Notebooks',
    description: 'Chip M4, hasta 18 horas de batería y un diseño de 11,5 mm de espesor.',
    highlights: ['Chip M4', '18 h de batería', 'Pantalla Liquid Retina'],
    specifications: { 'Chip': 'M4', 'Pantalla': '15,3" Liquid Retina', 'Memoria': '16 GB unify' },
    variants: [
      { capacity: '512GB', color: 'Medianoche', price: 1499, stock: 1, warranty: '12 meses' },
      { capacity: '1TB', color: 'Estelar', price: 1799, stock: 0, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'Funda MagSafe Silicona', category: 'Accesorios', modelName: 'Funda MagSafe',
    description: 'Silicona suave al tacto con imanes alineados y microfibra interior.',
    highlights: ['Silicona premium', 'Alineación magnética', 'Microfibra interior'],
    specifications: { 'Material': 'Silicona', 'Compatibilidad': 'iPhone 17', 'Acabado': 'Suave al tacto' },
    variants: [
      { capacity: '', color: 'Negro', price: 49, stock: 18, warranty: '3 meses' },
      { capacity: '', color: 'Verde Oliva', price: 49, previousPrice: 59, stock: 9, warranty: '3 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'Vidrio Templado Ceramic Shield', category: 'Accesorios', modelName: 'Vidrio Templado',
    description: 'Protección cerámica con marco duro y adhesivo de instalación asistida.',
    highlights: ['Ceramic Shield', 'Marco duro', 'Instalación asistida'],
    specifications: { 'Material': 'Vidrio templado', 'Dureza': '9H', 'Incluye': 'Marco de instalación' },
    variants: [
      { capacity: 'iPhone 17 Pro Max', color: 'Transparente', price: 29, stock: 25, warranty: '3 meses' },
      { capacity: 'iPhone 17', color: 'Transparente', price: 25, previousPrice: 32, stock: 14, warranty: '3 meses' }
    ]
  },
  {
    brand: 'Apple', model: 'Cargador USB-C 30W', category: 'Accesorios', modelName: 'Cargador USB-C',
    description: 'Adaptador compacto de 30 W con protección térmica y detección de dispositivo.',
    highlights: ['30 W de potencia', 'Detección de dispositivo', 'Diseño compacto'],
    specifications: { 'Potencia': '30 W', 'Conector': 'USB-C', 'Certificación': 'MFi' },
    variants: [
      { capacity: '', color: 'Blanco', price: 39, stock: 30, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Samsung', model: 'Galaxy S26 Ultra', category: 'Celulares', trending: true,
    description: 'Pantalla de 6,9", cámara de 200 MP y S Pen integrado. El rival directo del iPhone.',
    highlights: ['Cámara de 200 MP', 'S Pen integrado', 'Pantalla AMOLED 120 Hz', 'Chip Snapdragon'],
    specifications: { 'Pantalla': '6,9" AMOLED 120 Hz', 'Cámara': '200 MP + 50 MP + 12 MP', 'Batería': '5000 mAh' },
    variants: [
      { capacity: '256GB', color: 'Titanio Negro', price: 1299, stock: 2, imei: true, warranty: '12 meses' },
      { capacity: '512GB', color: 'Titanio Gris', price: 1499, previousPrice: 1599, stock: 1, imei: true, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Samsung', model: 'Galaxy A57', category: 'Celulares',
    description: 'Gama media con cámara triple y pantalla AMOLED de 120 Hz.',
    highlights: ['Pantalla AMOLED 120 Hz', 'Cámara triple 50 MP', 'Batería 5000 mAh'],
    specifications: { 'Pantalla': '6,6" AMOLED', 'Chip': 'Exynos 1580', 'Cámara': '50 MP + 12 MP + 5 MP' },
    variants: [
      { capacity: '128GB', color: 'Negro', price: 399, stock: 6, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Xiaomi', model: 'Redmi Note 15 Pro', category: 'Celulares',
    description: 'Cámara de 200 MP, carga rápida de 67 W y pantalla AMOLED de 120 Hz.',
    highlights: ['Cámara 200 MP', 'Carga rápida 67 W', 'AMOLED 120 Hz'],
    specifications: { 'Pantalla': '6,67" AMOLED', 'Chip': 'Snapdragon 7 Gen', 'Batería': '5110 mAh' },
    variants: [
      { capacity: '256GB', color: 'Verde', price: 329, previousPrice: 379, stock: 8, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Google', model: 'Pixel 10 Pro', category: 'Celulares',
    description: 'Chip Tensor G5 y procesamiento de imagen con Gemini Nano.',
    highlights: ['Chip Tensor G5', 'Cámara 48 MP', 'Pantalla LTPO 120 Hz'],
    specifications: { 'Pantalla': '6,3" LTPO', 'Chip': 'Tensor G5', 'Cámara': '48 MP + 48 MP + 48 MP' },
    variants: [
      { capacity: '128GB', color: 'Obsidiana', price: 999, stock: 2, imei: true, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Motorola', model: 'Edge 60', category: 'Celulares',
    description: 'Pantalla curvada, batería de 5500 mAh y carga TurboPower de 68 W.',
    highlights: ['Pantalla curvada pOLED', 'Carga TurboPower 68 W', 'Batería 5500 mAh'],
    specifications: { 'Pantalla': '6,7" pOLED', 'Cámara': '50 MP + 13 MP + 8 MP', 'Batería': '5500 mAh' },
    variants: [
      { capacity: '256GB', color: 'Azul', price: 449, stock: 4, warranty: '12 meses' }
    ]
  },
  {
    brand: 'OnePlus', model: 'Nord 5', category: 'Celulares',
    description: 'Rendimiento fluido con carga rápida de 80 W y pantalla AMOLED.',
    highlights: ['Carga rápida 80 W', 'Pantalla AMOLED 120 Hz', 'Chip Snapdragon'],
    specifications: { 'Pantalla': '6,74" AMOLED', 'Chip': 'Snapdragon 7 Gen 3', 'Batería': '6000 mAh' },
    variants: [
      { capacity: '256GB', color: 'Gris', price: 519, stock: 3, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Honor', model: 'Magic 8', category: 'Celulares',
    description: 'Cámara con IA, pantalla de 120 Hz y batería de 5800 mAh.',
    highlights: ['Cámara con IA', 'Pantalla 120 Hz', 'Batería 5800 mAh'],
    specifications: { 'Pantalla': '6,78" LTPO', 'Chip': 'Snapdragon 8 Elite', 'Cámara': '108 MP + 50 MP + 50 MP' },
    variants: [
      { capacity: '512GB', color: 'Negro', price: 999, previousPrice: 1099, stock: 2, warranty: '12 meses' }
    ]
  },
  {
    brand: 'Oppo', model: 'Find X9', category: 'Celulares',
    description: 'Diseño premium con cámara Hasselblad y pantalla de 120 Hz.',
    highlights: ['Cámara Hasselblad', 'Pantalla AMOLED 120 Hz', 'Carga rápida 80 W'],
    specifications: { 'Pantalla': '6,82" AMOLED', 'Cámara': '50 MP + 64 MP + 50 MP', 'Batería': '5800 mAh' },
    variants: [
      { capacity: '256GB', color: 'Blanco', price: 779, stock: 2, warranty: '12 meses' }
    ]
  }
];

function slugTag(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '').slice(0, 4).toUpperCase() || 'MOD';
}

function ensureModel(brand, model, category) {
  const brandRow = db.prepare('SELECT id FROM brands WHERE name = ?').get(brand) || (() => {
    const id = createId('brand');
    db.prepare('INSERT INTO brands (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, brand, nowIso(), nowIso());
    return { id };
  })();
  const modelRow = db.prepare('SELECT id FROM product_models WHERE brand_id = ? AND name = ?').get(brandRow.id, model) || (() => {
    const id = createId('model');
    db.prepare('INSERT INTO product_models (id, brand_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, brandRow.id, model, nowIso(), nowIso());
    return { id };
  })();
  const categoryRow = db.prepare('SELECT id FROM categories WHERE name = ?').get(category) || (() => {
    const id = createId('cat');
    db.prepare('INSERT INTO categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, category, nowIso(), nowIso());
    return { id };
  })();
  return { modelId: modelRow.id, categoryId: categoryRow.id, brandId: brandRow.id };
}

const FICTIONAL_VARIANTS = 'SELECT id FROM product_variants WHERE is_fictional = 1';

function resetFictional() {
  const count = (sql) => db.prepare(sql).get().c;
  const info = {
    products: count('SELECT COUNT(*) AS c FROM products WHERE is_fictional = 1'),
    variants: count('SELECT COUNT(*) AS c FROM product_variants WHERE is_fictional = 1'),
    units: count(`SELECT COUNT(*) AS c FROM inventory_units WHERE variant_id IN (${FICTIONAL_VARIANTS})`),
    movements: count(`SELECT COUNT(*) AS c FROM stock_movements WHERE variant_id IN (${FICTIONAL_VARIANTS})`),
    sales: count(`SELECT COUNT(DISTINCT sale_id) AS c FROM sale_items WHERE variant_id IN (${FICTIONAL_VARIANTS})`)
  };
  if (!info.products && !info.variants) return;

  // El orden respeta las claves foráneas: primero las filas hijas, después los
  // productos. Sólo se toca lo marcado como ficticio, nunca el stock real.
  db.transaction(() => {
    db.prepare(`DELETE FROM sale_return_items WHERE sale_item_id IN (SELECT id FROM sale_items WHERE variant_id IN (${FICTIONAL_VARIANTS}))`).run();
    db.prepare(`DELETE FROM sale_items WHERE variant_id IN (${FICTIONAL_VARIANTS})`).run();
    // Una venta de e-commerce queda sin ítems tras borrarlos: se elimina con
    // sus pagos y devoluciones para no dejar importes sueltos en desarrollo.
    const orphanSales = 'SELECT id FROM sales WHERE id NOT IN (SELECT DISTINCT sale_id FROM sale_items)';
    db.prepare(`DELETE FROM sale_returns WHERE sale_id IN (${orphanSales})`).run();
    db.prepare(`DELETE FROM payments WHERE sale_id IN (${orphanSales})`).run();
    // commerce_holds.confirmed_sale_id también apunta a la venta.
    db.prepare(`UPDATE commerce_holds SET confirmed_sale_id = NULL WHERE confirmed_sale_id IN (${orphanSales})`).run();
    db.prepare(`DELETE FROM sales WHERE id IN (${orphanSales})`).run();
    db.prepare(`DELETE FROM stock_movements WHERE variant_id IN (${FICTIONAL_VARIANTS})`).run();
    db.prepare(`DELETE FROM commerce_hold_items WHERE variant_id IN (${FICTIONAL_VARIANTS})`).run();
    db.prepare('DELETE FROM commerce_holds').run();
    db.prepare(`DELETE FROM inventory_reconciliations WHERE variant_id IN (${FICTIONAL_VARIANTS})`).run();
    db.prepare(`DELETE FROM purchase_items WHERE variant_id IN (${FICTIONAL_VARIANTS})`).run();
    db.prepare(`DELETE FROM inventory_units WHERE variant_id IN (${FICTIONAL_VARIANTS})`).run();
    db.prepare(`DELETE FROM inventory WHERE variant_id IN (${FICTIONAL_VARIANTS})`).run();
    db.prepare('DELETE FROM product_variants WHERE is_fictional = 1').run();
    db.prepare('DELETE FROM products WHERE is_fictional = 1').run();
  })();

  console.log(`[reset] ${info.products} productos, ${info.variants} variantes, ${info.units} unidades, ${info.movements} movimientos y ${info.sales} venta(s) ficticias eliminados.`);
}

if (reset) resetFictional();

seedDatabase(db, { force: true, preserveSecurity: true });
resetFictional();

let createdProducts = 0;
let createdVariants = 0;
let imeiSequence = 1;
for (const entry of catalog) {
  const { modelId, categoryId } = ensureModel(entry.brand, entry.model, entry.category);
  const parentId = createId('product');
  const now = nowIso();
  const modelTag = String(entry.model).replace(/\D+/g, '').slice(-3) || slugTag(entry.modelName || entry.model);
  const usedSkus = new Set();
  const displayName = entry.modelName ? `${entry.brand} ${entry.modelName}` : `${entry.brand} ${entry.model}`;
  const variants = entry.variants.map((variant) => {
    // El SKU debe ser único por combinación capacidad/color. Un sufijo numérico
    // evita colisiones cuando dos colores comparten iniciales ("Titanio ...").
    const base = `MOCK-${entry.brand.slice(0, 2).toUpperCase()}${modelTag}-${variant.capacity.replace(/\D+/g, '') || 'ST'}-${variant.color.replace(/\s+/g, '').toUpperCase()}`.slice(0, 60);
    let sku = base;
    let suffix = 1;
    while (usedSkus.has(sku) || db.prepare('SELECT 1 FROM product_variants WHERE sku = ?').get(sku)) {
      sku = `${base}-${++suffix}`;
    }
    usedSkus.add(sku);
    return {
      capacity: variant.capacity,
      color: variant.color,
      condition: 'Nuevo',
      requiresImei: Boolean(variant.imei),
      cost: 0,
      costRegistered: true,
      price: variant.price,
      salePriceRegistered: true,
      previousPrice: variant.previousPrice ?? null,
      promoPrice: null,
      minStock: 1,
      warranty: variant.warranty || '12 meses',
      published: true,
      active: true,
      sku
    };
  });
  createProduct(db, {
    parentId, brand: entry.brand, model: entry.modelName || entry.model, category: entry.category,
    published: true, variantPublished: true, isTrending: entry.trending ? true : false,
    publicSlug: String(displayName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    publicDescription: entry.description,
    publicHighlights: entry.highlights,
    publicSpecifications: entry.specifications,
    variants
  }, actor, request);
  createdProducts += 1;
  // El orden de inserción coincide con el de las variantes enviadas, así que se
  // resuelven los ids por SKU en lugar de depender de la forma del retorno.
  const variantIds = variants.map((variant) => db.prepare('SELECT id FROM product_variants WHERE sku = ?').get(variant.sku)?.id).filter(Boolean);
  createdVariants += variantIds.length;
  // Marcado explícito: el catálogo público nunca lo expone salvo opt-in de desarrollo.
  db.prepare('UPDATE products SET is_fictional = 1 WHERE id = ?').run(parentId);
  db.prepare('UPDATE product_variants SET is_fictional = 1 WHERE product_id = ?').run(parentId);
  entry.variants.forEach((variant, index) => {
    const variantId = variantIds[index];
    const quantity = Number(variant.stock || 0);
    if (!variantId || quantity <= 0) return;
    // Las variantes serializadas exigen un IMEI por unidad. Son valores Luhn
    // sintéticos que existen sólo dentro de la base de desarrollo.
    const imeis = variant.imei
      ? Array.from({ length: quantity }, () => makeLuhnImei(`99000000${String(imeiSequence++).padStart(6, '0')}`))
      : [];
    addStock(db, { productId: variantId, quantity, unitCost: 0, imeis, notes: 'Stock ficticio de desarrollo' }, actor, request);
  });
}

const totals = db.prepare(`SELECT
  (SELECT COUNT(*) FROM products WHERE is_fictional = 1) AS products,
  (SELECT COUNT(*) FROM product_variants WHERE is_fictional = 1) AS variants,
  (SELECT COALESCE(SUM(quantity), 0) FROM inventory WHERE variant_id IN (SELECT id FROM product_variants WHERE is_fictional = 1)) AS units`).get();

console.log('');
console.log('============================================================');
console.log('  CATÁLOGO DE DESARROLLO (MOCK) — no son datos reales');
console.log('============================================================');
console.log(`  Base:               ${config.dbPath}`);
console.log(`  Productos:          ${totals.products}`);
console.log(`  Variantes (SKU):    ${totals.variants}`);
console.log(`  Unidades en stock:  ${totals.units}`);
console.log(`  Clientes/ventas:    0 (no se inventan)`);
console.log('  Todos los productos tienen is_fictional = 1.');
console.log('  Para verlos en la tienda: COMMERCE_INCLUDE_FICTIONAL=true');
console.log('  Para borrarlos:      npm run dev:seed -- --reset');
console.log('============================================================');
console.log('');
closeDatabase(db);
