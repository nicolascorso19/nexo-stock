import { getConfig } from './config.js';
import { openDatabase, closeDatabase } from './db/database.js';
import { verifyDatabase } from './db/verify.js';
import { createApp } from './app.js';
import { startWorkers, stopWorkers } from './workers.js';

const config = getConfig();
openDatabase(config);
verifyDatabase();
const app = createApp(config);
const server = app.listen(config.port, config.host, () => {
  console.log(`NEXO Store escuchando en ${config.publicBaseUrl} (${config.host}:${config.port})`);
});
const workers = startWorkers(config);

function shutdown(signal) {
  console.log(`${signal}: cerrando NEXO Store...`);
  stopWorkers(workers);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => console.error('unhandledRejection', error));
process.on('uncaughtException', (error) => { console.error('uncaughtException', error); shutdown('uncaughtException'); });
