import fs from 'node:fs';
import Database from 'better-sqlite3';
import { getConfig } from '../server/config.js';
import { nowIso } from '../server/utils.js';

// iPhone 13 y hacia arriba se queda. Todo lo demas, fuera.
const MANTENER = new Set(['13', '13 mini', '13 pro', '13 pro max', '14', '14 plus', '14 pro', '14 pro max',
  '15', '15 plus', '15 pro', '15 pro max', '16', '16 plus', '16 pro', '16 pro max', '16e', '17', '17 air',
  '17 pro', '17 pro max', '18', '18 air', '18 plus', '18 pro', '18 pro max', 'air']);

// Extrae los modelos de iPhone que menciona un nombre, en orden de aparicion.
// "Silicone Case iPhone 12 - 12 Pro Color Fucsia" -> ["12", "12 pro"]
export function modelosIphone(nombre) {
  const texto = String(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const encontrados = new Set();
  const re = /iphone\s*(?:\bx\b|\bxr\b|\bxs\b|xs\s*max|\d{1,2}s?(?:\s*(?:plus|pro|max|mini|se))?(?:\s*\d{4})?)?/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const modelo = m[0].replace(/^iphone\s*/, '').replace(/\s+\d{4}$/, '').trim();
    if (modelo) encontrados.add(modelo);
  }
  return [...encontrados];
}

/** true = el nombre menciona un iPhone que hay que sacar. */
export function esObsoleto(nombre) {
  const modelos = modelosIphone(nombre);
  if (!modelos.length) return false;                 // cables, fundas genericas, notebooks
  if (modelos.some(modelo => MANTENER.has(modelo))) return false;
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('listar-modelos-obsoletos.mjs')) {
  const config = getConfig();
  const aplicar = process.argv.includes('--aplicar');
  const db = new Database(config.dbPath);
  const filas = db.prepare(`SELECT pm.name, COUNT(pv.id) variantes, p.published, p.archived
    FROM product_models pm
    JOIN products p ON p.model_id = pm.id
    JOIN product_variants pv ON pv.product_id = p.id
    GROUP BY pm.id ORDER BY pm.name`).all();
  let fueraModelos = 0, fueraVariantes = 0, quedanModelos = 0, quedanVariantes = 0;
  const fuera = [], quedan = [];
  for (const fila of filas) {
    if (esObsoleto(fila.name)) { fuera.push(fila); fueraModelos++; fueraVariantes += fila.variantes; }
    else { quedan.push(fila); quedanModelos++; quedanVariantes += fila.variantes; }
  }

  if (aplicar) {
    const stamp = nowIso().replace(/[:.]/g, '-');
    const backup = `backups/nexo-before-retiro-obsoletos-${stamp}.sqlite`;
    new Database(config.dbPath, { readonly: true }).exec(`VACUUM INTO '${backup}'`);
    console.log(`respaldo: ${backup} (${Math.round(fs.statSync(backup).size / 1024)} KB)\n`);
    const nombres = fuera.map(f => f.name);
    const marcas = db.prepare('SELECT id, name FROM product_models').all().filter(m => esObsoleto(m.name)).map(m => m.id);
    const aplicar = db.transaction(() => {
      const updateProduct = db.prepare('UPDATE products SET published = 0, archived = 1, updated_at = ? WHERE model_id = ?');
      const updateVariant = db.prepare('UPDATE product_variants SET published = 0, updated_at = ? WHERE product_id IN (SELECT id FROM products WHERE model_id = ?)');
      for (const id of marcas) { updateProduct.run(nowIso(), id); updateVariant.run(nowIso(), id); }
      const admin = db.prepare("SELECT id FROM users WHERE role_id = 'admin' AND active = 1 ORDER BY id LIMIT 1").get();
      if (admin) {
        db.prepare(`INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_value,after_value,ip_address,user_agent,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(`retiro_obsoletos_${Date.now()}`, admin.id,
          'Retiro de productos iPhone 12 hacia abajo', 'product', 'iphone-obsoletos', null,
          JSON.stringify({ modelos: nombres, motivo: 'el local solo trabaja con iPhone 13 en adelante' }),
          '127.0.0.1', 'catalogo-limpieza', nowIso());
      }
    });
    aplicar.immediate();
    console.log(`Archivados ${marcas.length} modelos / ${fueraVariantes} variantes (siguen en la base, pero fuera del catalogo y de la web)`);
  }

  console.log(`\nMODELOS QUE SE SACAN (${fueraModelos} modelos / ${fueraVariantes} variantes)`);
  for (const f of fuera) console.log(`  ${String(f.variantes).padStart(3)}x  ${f.name}`);
  console.log(`\nSE QUEDAN (${quedanModelos} modelos / ${quedanVariantes} variantes)`);
  for (const f of quedan) console.log(`  ${String(f.variantes).padStart(3)}x  ${f.name}`);
  console.log(`\ntotal: ${filas.length} modelos / ${filas.reduce((s, f) => s + f.variantes, 0)} variantes`);
  db.close();
}
