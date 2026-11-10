import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { type AiProvider } from './ai.js';
import { type Config } from './config.js';
import { type Db } from './db.js';
import { errorHandler, originGuard, sessionLoader } from './http.js';
import { type RouteProvider } from './routing.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { plannerRoutes } from './routes/planner.js';
import { publicRoutes } from './routes/public.js';

export interface AppCtx {
  db: Db;
  config: Config;
  router: RouteProvider;
  ai: AiProvider | null;
}

export function createApp(ctx: AppCtx): Express {
  const { config } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
          'connect-src': ["'self'"],
          'font-src': ["'self'", 'data:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(express.json({ limit: '300kb' }));
  app.use(cookieParser());
  app.use(originGuard(config));
  app.use(sessionLoader(config, ctx.db));

  const limiter = (windowMs: number, max: number) =>
    config.isTest ? (_q: unknown, _r: unknown, n: () => void) => n() : rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'terlalu_sering', message: 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.' } } });

  app.use('/api/auth', limiter(15 * 60 * 1000, 40), authRoutes(ctx));
  app.use('/api/planner', limiter(10 * 60 * 1000, 60), plannerRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', limiter(15 * 60 * 1000, 600), meRoutes(ctx), publicRoutes(ctx));

  fs.mkdirSync(config.uploadDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadDir, { fallthrough: false, maxAge: '7d', index: false }));

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'tidak_ditemukan', message: 'Endpoint tidak ditemukan' } }));

  // Produksi: layani hasil build klien dengan fallback SPA.
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use(errorHandler(config));
  return app;
}
