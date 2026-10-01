import { getConfig } from '../config.js';
import { openDatabase, migrateDatabase, closeDatabase } from './database.js';
import { verifyDatabase } from './verify.js';

const config = getConfig();
openDatabase(config, { applySchema: false });
const result = migrateDatabase();
console.log(JSON.stringify({ migrated: result, verification: verifyDatabase() }, null, 2));
closeDatabase();
