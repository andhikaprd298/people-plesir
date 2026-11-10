import request from 'supertest';
import { makeAiProvider } from '../src/ai.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { openMemoryDb } from '../src/db.js';
import { makeRouter } from '../src/routing.js';
import { ensureAdmin, seedPartners, seedReference } from '../src/seed.js';
import { todayJakarta } from '../src/services.js';

export const ADMIN = { email: 'admin@test.local', password: 'admin-pass-123' };

export async function makeCtx() {
  const db = openMemoryDb();
  seedReference(db);
  seedPartners(db);
  await ensureAdmin(db, { ...ADMIN, isProd: false, log: () => undefined });
  const app = createApp({ db, config: { ...config, uploadDir: '/tmp/pp-test-uploads' }, router: makeRouter('estimate'), ai: makeAiProvider(undefined, 'x') });
  return { db, app };
}

export async function agentFor(app: ReturnType<typeof createApp>, who: { email: string; password: string; name?: string }, register = true) {
  const a = request.agent(app);
  const r = register
    ? await a.post('/api/auth/register').send({ name: who.name ?? 'Pengguna Uji', email: who.email, password: who.password })
    : await a.post('/api/auth/login').send({ email: who.email, password: who.password });
  if (r.status >= 300) throw new Error(`auth gagal: ${r.status} ${JSON.stringify(r.body)}`);
  return a;
}

export const addDays = (n: number) => { const d = new Date(todayJakarta() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const tripBody = (over: Record<string, unknown> = {}) => ({
  title: 'Trip Uji', theme: 'Alam', summary: 'Trip untuk pengujian otomatis.', date: addDays(20), departTime: '07:00', endTime: '17:00', meetingPoint: 'Alun-alun',
  price: 100000, capacity: 5, minParticipants: 2, registrationDeadline: null, included: ['Transport'], excluded: ['Oleh-oleh'], safety: [], faq: [], imageUrl: null,
  status: 'published', isDemo: true, itinerary: [{ time: '07:00', title: 'Berangkat', destinationId: null, note: null }], ...over,
});

export const booking = (tripId: number, participants: number, over: Record<string, unknown> = {}) => ({
  tripId, participants, contactName: 'Budi Santoso', contactPhone: '081234567890', contactEmail: 'budi@example.com', agreeTerms: true, ...over,
});
