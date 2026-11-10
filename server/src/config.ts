import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) {
    throw new Error('JWT_SECRET wajib diisi di production.');
  }
  jwtSecret = crypto.randomBytes(32).toString('hex');
  if (!isTest) {
    console.warn('[config] JWT_SECRET belum diatur: memakai secret sementara (sesi login hilang saat server restart).');
  }
}

export const config = {
  isProd,
  isTest,
  port: Number(env.PORT ?? 4000),
  jwtSecret,
  dbPath: env.DB_PATH ?? path.join(SERVER_ROOT, 'data', 'people-plesir.db'),
  uploadDir: env.UPLOAD_DIR ?? path.join(SERVER_ROOT, 'uploads'),
  clientOrigins: (env.CLIENT_ORIGIN ?? 'http://localhost:5173,http://localhost:4000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  adminEmail: env.ADMIN_EMAIL,
  adminPassword: env.ADMIN_PASSWORD,
  // AI (opsional). Kunci hanya dibaca di server.
  anthropicApiKey: env.ANTHROPIC_API_KEY,
  aiModel: env.AI_MODEL ?? 'claude-sonnet-5-5',
  // Routing (opsional): "osrm" memakai OSRM_URL. Tanpa itu, estimasi garis lurus berlabel.
  routingProvider: env.ROUTING_PROVIDER ?? 'estimate',
  osrmUrl: env.OSRM_URL,
  clientDist: env.CLIENT_DIST ?? path.resolve(SERVER_ROOT, '..', 'client', 'dist'),
};

export type Config = typeof config;
