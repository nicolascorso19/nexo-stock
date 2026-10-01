import { getConfig } from './config.js';
import { closeDatabase, createDatabase } from './db/database.js';

const config = getConfig();
const db = createDatabase(config.dbPath, { seed: config.seedDemo });
console.log(`Base NEXO inicializada en ${config.dbPath}`);
closeDatabase(db);
