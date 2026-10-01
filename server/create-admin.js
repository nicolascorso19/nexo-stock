import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import { getConfig } from './config.js';
import { createDatabase, closeDatabase } from './db/database.js';
import { nowIso, createId } from './utils.js';

const config = getConfig();
const db = createDatabase(config.dbPath, { seed: false });
const rl = readline.createInterface({ input, output });
const name = String(process.env.ADMIN_NAME || await rl.question('Nombre: ')).trim();
const email = String(process.env.ADMIN_EMAIL || await rl.question('Email: ')).trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || await rl.question('Contraseña (mínimo 12 caracteres): '));
rl.close();
if (!name || !email || password.length < 12) throw new Error('Nombre, email y contraseña de al menos 12 caracteres son obligatorios.');
const role = db.prepare("SELECT id FROM roles WHERE id = 'admin' OR name = 'Administrador' LIMIT 1").get();
if (!role) throw new Error('No existe el rol Administrador. Inicializá la base una vez en desarrollo.');
const hash = await bcrypt.hash(password, config.bcryptRounds);
const result = db.prepare(`INSERT INTO users (id, role_id, name, email, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
  .run(createId('usr'), role.id, name, email, hash, nowIso(), nowIso());
console.log(`Administrador creado: ${email} (${result.lastInsertRowid})`);
closeDatabase(db);
