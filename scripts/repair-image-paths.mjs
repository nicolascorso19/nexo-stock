/**
 * Reparación de rutas de imagen del catálogo.
 *
 * En la importación de imágenes, la extensión se guardaba sin el punto
 * (`producto-1-a1b2c3d4e5jpg`). El archivo en disco sí lo tiene
 * (`producto-1-a1b2c3d4e5.jpg`), así que cada imagen daba 404 y el catálogo
 * se veía sin fotos aunque los archivos estuvieran ahí.
 *
 * Este script no adivina: sólo agrega el punto si el archivo existe en disco.
 * Lo que no se puede reparar queda como estaba, para que se vea en el resumen.
 *
 *   node scripts/repair-image-paths.mjs [--apply]
 *   node scripts/repair-image-paths.mjs --from backups/alguno.sqlite --apply
 *
 * Sin --apply sólo informa. Con --from se toman las rutas de ese respaldo como
 * origen en vez de las actuales: sirve cuando las rutas buenas se pisaron con
 * otras y hay que volver a la última copia que las tenía.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { getConfig } from '../server/config.js';
import { nowIso } from '../server/utils.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// El servidor sirve /img desde assets/img (ver server/app.js), así que ése es
// el lugar real del archivo. /public-assets vive en la raíz del proyecto.
const toDisk = relative => {
  const clean = relative.replace(/^\//, '').split('/').join(path.sep);
  return path.join(rootDir, clean.startsWith('img' + path.sep) ? path.join('assets', clean) : clean);
};

/** Devuelve la ruta corregida si el archivo existe, o null si no hay forma de arreglarlo. */
export function repairImagePath(value) {
  const item = String(value || '').trim();
  if (!item) return null;
  if (fs.existsSync(toDisk(item))) return item;
  const match = /^(.*\/)([^/]+?)(jpe?g|png|webp|gif)$/i.exec(item);
  if (!match) return null;
  for (const extension of EXTENSIONS) {
    const candidate = `${match[1]}${match[2]}${extension}`;
    if (fs.existsSync(toDisk(candidate))) return candidate;
  }
  return null;
}

const config = getConfig();
const db = new Database(config.dbPath);
const variants = db.prepare('SELECT id, product_id, public_images_json FROM product_variants').all();

const fromIndex = process.argv.indexOf('--from');
const source = fromIndex === -1 ? null : new Database(path.resolve(rootDir, process.argv[fromIndex + 1]), { readonly: true, fileMustExist: true });
const sourceImages = source
  ? new Map(source.prepare('SELECT id, public_images_json FROM product_variants').all().map(row => [row.id, row.public_images_json]))
  : null;

let repaired = 0;
let unchanged = 0;
let dropped = 0;
const changed = [];
const stillBroken = [];
const byProduct = new Map();

const run = db.transaction(() => {
  const update = db.prepare('UPDATE product_variants SET public_images_json = ?, updated_at = ? WHERE id = ?');
  for (const variant of variants) {
    const origin = sourceImages ? sourceImages.get(variant.id) : variant.public_images_json;
    const current = JSON.parse(origin || '[]');
    const next = [];
    for (const value of current) {
      if (typeof value !== 'string') continue;
      const fixed = repairImagePath(value);
      if (fixed) {
        if (fixed !== value) repaired++;
        else unchanged++;
        next.push(fixed);
      } else {
        dropped++;
        stillBroken.push(value);
      }
    }
    if (next.length !== current.length || next.some((value, index) => value !== current[index])) {
      changed.push({ variant, next });
      if (apply) update.run(JSON.stringify(next), nowIso(), variant.id);
    }
    const list = byProduct.get(variant.product_id) || [];
    list.push(...next);
    byProduct.set(variant.product_id, list);
  }
  if (apply) {
    const updateProduct = db.prepare('UPDATE products SET public_images_json = ?, updated_at = ? WHERE id = ?');
    for (const [productId, images] of byProduct) updateProduct.run(JSON.stringify([...new Set(images)]), nowIso(), productId);
  }
  return changed.length;
});

const changedCount = run.immediate();
if (source) source.close();

const withImages = variants.filter(v => {
  const origin = sourceImages ? sourceImages.get(v.id) : v.public_images_json;
  return JSON.parse(origin || '[]').length > 0;
}).length;
console.log(`${apply ? 'Reparadas' : 'A reparar'}: rutas de imagen${sourceImages ? ' (origen: respaldo)' : ''}`);
console.log(`  variantes a tocar: ${changedCount}`);
console.log(`  ya existentes sin cambios : ${unchanged}`);
console.log(`  corregidas (faltaba el punto): ${repaired}`);
console.log(`  sin archivo en disco y descartadas: ${dropped}`);
console.log(`  variantes con al menos una foto: ${withImages}/${variants.length}`);
if (stillBroken.length) console.log(`  ejemplos sin reparar: ${stillBroken.slice(0, 3).join(', ')}`);
db.close();
