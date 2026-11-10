import { config } from './config.js';
import { openDb } from './db.js';
import { ensureAdmin, seedDemoTrips, seedPartners, seedReference } from './seed.js';

const db = openDb(config.dbPath);
seedReference(db);
seedDemoTrips(db);
seedPartners(db);
await ensureAdmin(db, { email: config.adminEmail, password: config.adminPassword, isProd: config.isProd });
console.log('Seed selesai (data yang sudah ada tidak ditimpa).');
