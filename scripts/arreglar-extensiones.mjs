/**
 * Renombra a disco las imágenes que el importador guardó sin extensión y
 * actualiza las rutas en products.public_images_json y
 * product_variants.public_images_json. Es idempotente: si el nombre ya tiene
 * punto, no hace nada.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DIRS = ['assets/img/catalog', 'ecommerce/public/img/catalog'];
const SIN_PUNTO = /^(.*?[^.])(jpe?g|png|webp)$/i;

let renombrados = 0;
const mapa = new Map();
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const nombre of fs.readdirSync(dir)) {
    const match = SIN_PUNTO.exec(nombre);
    if (!match) continue;
    const nuevo = `${match[1]}.${match[2].toLowerCase().replace('jpeg', 'jpg')}`;
    if (nuevo === nombre) continue;
    fs.renameSync(path.join(dir, nombre), path.join(dir, nuevo));
    mapa.set(`/${dir.split('/').join('/')}/${nombre}`, `/${dir.split('/').join('/')}/${nuevo}`);
    renombrados += 1;
  }
}
console.log('archivos renombrados:', renombrados);

const db = new Database('data/nexo.sqlite');
const cambiar = (tabla) => {
  let cambios = 0;
  const filas = db.prepare(`SELECT id, public_images_json FROM ${tabla} WHERE public_images_json LIKE '%/img/catalog/%'`).all();
  const update = db.prepare(`UPDATE ${tabla} SET public_images_json = ? WHERE id = ?`);
  for (const fila of filas) {
    const rutas = JSON.parse(fila.public_images_json || '[]');
    const nuevas = rutas.map((ruta) => {
      if (ruta.endsWith('.jpg') || ruta.endsWith('.png') || ruta.endsWith('.webp')) return ruta;
      const base = ruta.split('/').pop();
      const match = SIN_PUNTO.exec(base);
      return match ? ruta.replace(base, `${match[1]}.${match[2].toLowerCase().replace('jpeg', 'jpg')}`) : ruta;
    });
    if (JSON.stringify(nuevas) !== JSON.stringify(rutas)) { update.run(JSON.stringify(nuevas), fila.id); cambios += 1; }
  }
  return cambios;
};
console.log('products actualizados:', cambiar('products'));
console.log('product_variants actualizados:', cambiar('product_variants'));
console.log('integridad:', db.pragma('integrity_check', { simple: true }));
db.close();

// Comprobación: ¿queda alguna ruta sin extensión?
const db2 = new Database('data/nexo.sqlite', { readonly: true });
const rutas = db2.prepare("SELECT public_images_json FROM products WHERE public_images_json <> '[]'").all().flatMap((r) => JSON.parse(r.public_images_json));
const sinExtension = rutas.filter((r) => !/\.(jpe?g|png|webp)$/i.test(r));
console.log('rutas totales:', rutas.length, '| sin extensión:', sinExtension.length);
const faltan = [...new Set(rutas)].filter((r) => !fs.existsSync(path.join('assets', r)));
console.log('rutas cuyo archivo no existe:', faltan.length, faltan.slice(0, 3));
db2.close();
