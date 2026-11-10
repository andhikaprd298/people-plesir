import { makeAiProvider } from './ai.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db.js';
import { makeRouter } from './routing.js';
import { ensureAdmin, seedDemoTrips, seedPartners, seedReference } from './seed.js';
import { expireStale } from './services.js';

async function main() {
  const db = openDb(config.dbPath);
  seedReference(db);
  seedDemoTrips(db);
  seedPartners(db);
  await ensureAdmin(db, { email: config.adminEmail, password: config.adminPassword, isProd: config.isProd });

  const app = createApp({
    db,
    config,
    router: makeRouter(config.routingProvider, config.osrmUrl),
    ai: makeAiProvider(config.anthropicApiKey, config.aiModel),
  });

  setInterval(() => { try { expireStale(db); } catch (e) { console.error('[expire]', e); } }, 5 * 60 * 1000).unref();

  app.listen(config.port, () => {
    console.log(`People Plesir API berjalan di http://localhost:${config.port}`);
    console.log(`  AI: ${config.anthropicApiKey ? 'aktif (' + config.aiModel + ')' : 'tidak aktif (mode demo)'} | Rute: ${config.routingProvider === 'osrm' && config.osrmUrl ? 'OSRM' : 'estimasi garis lurus'}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
