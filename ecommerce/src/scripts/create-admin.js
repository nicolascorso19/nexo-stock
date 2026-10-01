/**
 * Crea el primer administrador del e-commerce.
 *
 *   npm run admin:create
 *
 * Los datos se piden por entrada estándar. No se imprimen ni se guardan en
 * ningún archivo: la contraseña se hashea y sólo queda en la base.
 */
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getConfig } from '../config.js';
import { openDatabase, closeDatabase } from '../db/database.js';
import { createAdminUser } from '../services/auth.js';

const config = getConfig();
openDatabase(config);

const rl = readline.createInterface({ input, output });
try {
  const name = String(process.env.ADMIN_NAME || await rl.question('Nombre del administrador: ')).trim();
  const email = String(process.env.ADMIN_EMAIL || await rl.question('Email: ')).trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || await rl.question('Contraseña (mínimo 8 caracteres): '));
  if (!name || !email || !password) throw new Error('Nombre, email y contraseña son obligatorios.');
  const result = await createAdminUser({ name, email, password, role: 'ADMIN' });
  console.log(`\nAdministrador creado: ${result.email}`);
  console.log('Ya puede entrar en /admin con ese email y contraseña.');
} catch (error) {
  console.error(`No se pudo crear el administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  closeDatabase();
}
