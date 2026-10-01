import { createApp } from './app.js';
import { getConfig } from './config.js';
import { closeDatabase, createDatabase } from './db/database.js';
import { ensureCommerceRuntime, expireCommerceHolds } from './services/commerce.js';
import { expireReservations } from './services/reservations.js';
import { dispatchCommerceEvents } from './services/commerce-webhooks.js';

const config = getConfig();
const db = createDatabase(config.dbPath, { seed: config.seedDemo });
const commerceRuntime = ensureCommerceRuntime(db, config);
const app = createApp({ db, config });

const server = app.listen(config.port, config.host, () => {
  console.log(`NEXO API escuchando en http://${config.host}:${config.port}`);
  console.log(`Base SQLite: ${config.dbPath}`);
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 120_000;

const commerceSweep = setInterval(() => {
  try { expireCommerceHolds(db); } catch (error) { console.error(' commerce sweep:', error.message); }
  try { expireReservations(db); } catch (error) { console.error(' reservation sweep:', error.message); }
  dispatchCommerceEvents(db, config).catch((error) => console.error(' commerce webhook sweep:', error.message));
}, 15_000);
commerceSweep.unref();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Señal ${signal} recibida; cerrando NEXO API.`);
  server.close(() => {
    clearInterval(commerceSweep);
    closeDatabase(db);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
