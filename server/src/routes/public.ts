import { Router } from 'express';
import { z } from 'zod';
import { type AppCtx } from '../app.js';
import { all, get } from '../db.js';
import { haversineKm } from '../geo.js';
import { notFound, parse, wrap } from '../http.js';
import { type Dest, loadDests, recomputeItinerary, plannerInputSchema } from '../planner.js';
import { privateEstimateSchema } from '../pricing.js';
import { type TripRow, expireStale, privateEstimateFor, tripDto, todayJakarta } from '../services.js';
import { publicSettings, readSettings } from '../settings.js';

export function destDto(d: Dest, from?: { lat: number; lng: number }) {
  return {
    id: d.id, name: d.name, kind: d.kind, categoryId: d.categoryId, categoryName: d.categoryName, summary: d.summary,
    addressText: d.addressText, lat: d.lat, lng: d.lng,
    price: d.priceMin == null && d.priceMax == null ? null : { min: d.priceMin ?? d.priceMax, max: d.priceMax ?? d.priceMin },
    avgDurationMin: d.avgDurationMin, openHours: d.openHours, familyFriendly: d.familyFriendly,
    accessibility: d.accessibility, tags: d.tags, foodTags: d.foodTags, imageUrl: d.imageUrl,
    verified: { coords: d.coordsVerified, price: d.priceVerified, hours: d.hoursVerified },
    distanceKm: from ? Math.round(haversineKm(from, d) * 10) / 10 : null,
  };
}

const listQuery = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().max(60).optional(),
  kind: z.enum(['wisata', 'kuliner', 'kafe']).optional(),
  family: z.enum(['1']).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  maxKm: z.coerce.number().min(0).max(500).optional(),
  sort: z.enum(['relevansi', 'jarak', 'nama']).default('relevansi'),
});

export function publicRoutes(ctx: AppCtx) {
  const r = Router();
  const { db, config } = ctx;

  r.get('/meta', wrap(async (_req, res) => {
    const s = readSettings(db);
    const cats = all(db, 'SELECT id, name, description FROM categories ORDER BY sort_order');
    const dests = loadDests(db);
    // Titik berangkat contoh diambil dari koordinat destinasi di database; semuanya perkiraan.
    const pick = (id: string, label: string) => { const d = dests.find((x) => x.id === id); return d ? { label, lat: d.lat, lng: d.lng, approximate: !d.coordsVerified } : null; };
    res.json({
      categories: cats,
      settings: publicSettings(s),
      engine: { ai: Boolean(ctx.ai), aiName: ctx.ai?.name ?? null, routing: ctx.router.name },
      origins: [
        pick('alun-alun-purwokerto', 'Pusat kota Purwokerto'),
        pick('lokawisata-baturraden', 'Kawasan Baturraden'),
        pick('pendopo-sipanji-banyumas', 'Kota lama Banyumas'),
        pick('sroto-sokaraja', 'Sokaraja'),
      ].filter(Boolean),
      today: todayJakarta(),
      demoData: dests.some((d) => !d.priceVerified || !d.hoursVerified || !d.coordsVerified),
    });
  }));

  r.get('/destinations', wrap(async (req, res) => {
    const q = parse(listQuery, req.query);
    const from = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    let list = loadDests(db);
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter((d) => `${d.name} ${d.summary} ${d.categoryName} ${d.addressText ?? ''}`.toLowerCase().includes(n)); }
    if (q.category) list = list.filter((d) => d.categoryId === q.category);
    if (q.kind) list = list.filter((d) => d.kind === q.kind);
    if (q.family) list = list.filter((d) => d.familyFriendly);
    if (q.maxPrice != null) list = list.filter((d) => d.priceMin == null || d.priceMin <= q.maxPrice!);
    let items = list.map((d) => destDto(d, from));
    if (from && q.maxKm != null) items = items.filter((d) => d.distanceKm != null && d.distanceKm <= q.maxKm!);
    if (q.sort === 'jarak' && from) items.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    else if (q.sort === 'nama') items.sort((a, b) => a.name.localeCompare(b.name, 'id'));
    res.json({ items, total: items.length, distanceNote: from ? 'Jarak adalah garis lurus dari lokasi Anda, bukan jarak tempuh.' : null });
  }));

  r.get('/destinations/:id', wrap(async (req, res) => {
    const all_ = loadDests(db);
    const d = all_.find((x) => x.id === req.params.id);
    if (!d) throw notFound('Destinasi tidak ditemukan');
    const nearby = all_.filter((x) => x.id !== d.id).map((x) => ({ x, km: haversineKm(d, x) })).sort((a, b) => a.km - b.km).slice(0, 4).map(({ x }) => destDto(x, d));
    const row = get<{ description: string | null; facilities: string; gallery: string; data_status: string }>(db, 'SELECT description, facilities, gallery, data_status FROM destinations WHERE id = ?', d.id)!;
    res.json({
      ...destDto(d),
      description: row.description, facilities: JSON.parse(row.facilities), gallery: JSON.parse(row.gallery), dataStatus: row.data_status,
      nearby,
    });
  }));

  r.get('/trips', wrap(async (req, res) => {
    expireStale(db);
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : null;
    const today = todayJakarta();
    const rows = all<TripRow>(db, "SELECT * FROM trips WHERE status IN ('published','closed','cancelled') AND trip_date >= ? ORDER BY trip_date", today);
    const items = rows.filter((t) => !month || t.trip_date.startsWith(month)).map((t) => {
      const dto = tripDto(db, t, { today });
      const places = all<{ name: string }>(db, 'SELECT d.name FROM trip_itineraries i JOIN destinations d ON d.id = i.destination_id WHERE i.trip_id = ? ORDER BY i.sort_order', t.id).map((p) => p.name);
      return { ...dto, places };
    });
    res.json({ items });
  }));

  r.get('/trips/:slug', wrap(async (req, res) => {
    expireStale(db);
    const t = get<TripRow>(db, "SELECT * FROM trips WHERE slug = ? AND status != 'draft'", req.params.slug);
    if (!t) throw notFound('Open Trip tidak ditemukan');
    res.json(tripDto(db, t, { detail: true }));
  }));

  r.post('/private-trips/estimate', wrap(async (req, res) => {
    const body = parse(
      z.object({
        participants: privateEstimateSchema.shape.participants,
        days: privateEstimateSchema.shape.days,
        vehicle: privateEstimateSchema.shape.vehicle,
        facilities: privateEstimateSchema.shape.facilities,
        mealsPerDay: privateEstimateSchema.shape.mealsPerDay,
        destinationIds: z.array(z.string().max(80)).max(20).default([]),
      }),
      req.body,
    );
    res.json(privateEstimateFor(db, body));
  }));

  r.get('/share/:token', wrap(async (req, res) => {
    const row = get<{ title: string; data: string }>(db, 'SELECT title, data FROM saved_itineraries WHERE share_token = ?', req.params.token);
    if (!row) throw notFound('Itinerary tidak ditemukan atau tautan sudah tidak dibagikan');
    const saved = JSON.parse(row.data) as { input: unknown; plan: { destinationId: string; role: 'visit' | 'meal' }[][]; summary: string; engine: { mode: 'demo' | 'ai'; routing: string; note: string } };
    const input = plannerInputSchema.parse(saved.input);
    const dests = new Map(loadDests(db).map((d) => [d.id, d]));
    const itinerary = await recomputeItinerary({ input, dests, router: ctx.router, settings: readSettings(db) }, saved.plan, { title: row.title, summary: saved.summary, engine: saved.engine });
    // Data pribadi tidak diikutkan: hanya itinerary.
    res.json({ itinerary });
  }));

  void config;
  return r;
}
