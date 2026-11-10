import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { type AppCtx } from '../app.js';
import { all, get, run, tx } from '../db.js';
import { toMin, isValidDate } from '../geo.js';
import { HttpError, bad, conflict, csvCell, notFound, parse, requireAdmin, wrap } from '../http.js';
import { rowToDest } from '../planner.js';
import {
  type BookingRow, type TripRow, audit, bookingDto, cancelBooking, cancelTrip, expireStale, getBooking, quoteSchema, rejectPayment,
  seatCounts, sendQuote, setStatus, todayJakarta, tripDto, verifyPayment, verifySchema,
} from '../services.js';
import { readSettings, saveSetting } from '../settings.js';
import { destDto } from './public.js';

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Gunakan format JJ:MM').refine((v) => !Number.isNaN(toMin(v)), 'Jam tidak valid');
const imageUrl = z.string().max(300).refine((v) => v.startsWith('/uploads/') || /^https:\/\//.test(v), 'URL foto harus diawali /uploads/ atau https://').nullable().default(null);
const strArr = z.array(z.string().trim().min(1).max(120)).max(30).default([]);

const hoursSchema = z
  .record(z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']), z.tuple([hhmm, hhmm]).nullable())
  .nullable()
  .default(null)
  .refine((h) => !h || Object.values(h).every((w) => !w || toMin(w[0]) < toMin(w[1])), 'Jam buka harus lebih awal dari jam tutup');

const destinationSchema = z
  .object({
    id: z.string().trim().max(60).optional(),
    name: z.string().trim().min(2, 'Isi nama destinasi').max(120),
    kind: z.enum(['wisata', 'kuliner', 'kafe']),
    categoryId: z.string().min(1, 'Pilih kategori'),
    summary: z.string().trim().min(10, 'Ringkasan minimal 10 karakter').max(300),
    description: z.string().max(4000).default(''),
    addressText: z.string().max(200).default(''),
    lat: z.number().min(-9, 'Latitude di luar Jawa Tengah').max(-6, 'Latitude di luar Jawa Tengah'),
    lng: z.number().min(108, 'Longitude di luar Jawa Tengah').max(111, 'Longitude di luar Jawa Tengah'),
    coordsVerified: z.boolean().default(false),
    priceMin: z.number().int().min(0).max(100_000_000).nullable().default(null),
    priceMax: z.number().int().min(0).max(100_000_000).nullable().default(null),
    priceVerified: z.boolean().default(false),
    avgDurationMin: z.number().int().min(10, 'Durasi minimal 10 menit').max(720),
    openHours: hoursSchema,
    hoursVerified: z.boolean().default(false),
    familyFriendly: z.boolean().default(false),
    accessibility: z.array(z.enum(['kursi_roda', 'lansia', 'anak_kecil'])).default([]),
    facilities: strArr,
    tags: strArr,
    foodTags: strArr,
    imageUrl,
    gallery: z.array(z.string().max(300)).max(12).default([]),
    dataStatus: z.enum(['demo', 'verified']).default('demo'),
    isPublished: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.priceMin != null && v.priceMax != null && v.priceMax < v.priceMin) ctx.addIssue({ code: 'custom', path: ['priceMax'], message: 'Harga maksimum tidak boleh lebih kecil dari minimum' });
    if (v.priceVerified && v.priceMin == null && v.priceMax == null) ctx.addIssue({ code: 'custom', path: ['priceVerified'], message: 'Isi harga sebelum menandai terverifikasi' });
    if (v.hoursVerified && !v.openHours) ctx.addIssue({ code: 'custom', path: ['hoursVerified'], message: 'Isi jam operasional sebelum menandai terverifikasi' });
  });

const tripSchema = z
  .object({
    slug: z.string().trim().max(60).optional(),
    title: z.string().trim().min(3, 'Isi nama trip').max(120),
    theme: z.string().trim().max(80).default(''),
    summary: z.string().max(400).default(''),
    date: z.string().refine(isValidDate, 'Tanggal tidak valid'),
    departTime: hhmm,
    endTime: hhmm,
    meetingPoint: z.string().max(200).default(''),
    price: z.number().int().min(0, 'Harga tidak boleh negatif').max(10_000_000),
    capacity: z.number().int().min(1, 'Kapasitas minimal 1').max(500),
    minParticipants: z.number().int().min(1, 'Minimum peserta minimal 1'),
    registrationDeadline: z.string().refine(isValidDate, 'Tanggal tidak valid').nullable().default(null),
    included: strArr,
    excluded: strArr,
    safety: strArr,
    faq: z.array(z.object({ q: z.string().min(1).max(200), a: z.string().min(1).max(1000) })).max(20).default([]),
    imageUrl,
    status: z.enum(['draft', 'published', 'closed']).default('draft'),
    isDemo: z.boolean().default(false),
    itinerary: z.array(z.object({ time: hhmm, title: z.string().min(1).max(150), destinationId: z.string().max(80).nullable().default(null), note: z.string().max(300).nullable().default(null) })).max(30).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.minParticipants > v.capacity) ctx.addIssue({ code: 'custom', path: ['minParticipants'], message: 'Minimum peserta tidak boleh melebihi kapasitas' });
    if (toMin(v.endTime) <= toMin(v.departTime)) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Jam selesai harus setelah jam berangkat' });
    if (v.registrationDeadline && v.registrationDeadline > v.date) ctx.addIssue({ code: 'custom', path: ['registrationDeadline'], message: 'Batas pendaftaran tidak boleh setelah tanggal trip' });
  });

const partnerSchema = z.object({
  type: z.enum(['kendaraan', 'pemandu', 'kuliner', 'lainnya']),
  name: z.string().trim().min(2, 'Isi nama mitra').max(120),
  contact: z.string().max(120).default(''),
  notes: z.string().max(500).default(''),
  rateNote: z.string().max(200).default(''),
  isActive: z.boolean().default(true),
});

const expenseSchema = z.object({
  spentOn: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  category: z.string().trim().min(2, 'Isi kategori').max(60),
  description: z.string().max(300).default(''),
  amount: z.number().int().min(0, 'Jumlah tidak boleh negatif').max(1_000_000_000),
  tripId: z.number().int().positive().nullable().default(null),
});

function detectImage(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export function adminRoutes(ctx: AppCtx) {
  const r = Router();
  const { db, config } = ctx;
  r.use(requireAdmin);

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });

  r.post('/upload', upload.single('file'), wrap(async (req, res) => {
    if (!req.file) throw bad('Pilih file foto terlebih dahulu.');
    const ext = detectImage(req.file.buffer);
    if (!ext) throw bad('File harus berupa foto JPG, PNG, atau WebP.');
    fs.mkdirSync(config.uploadDir, { recursive: true });
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(config.uploadDir, name), req.file.buffer);
    res.status(201).json({ url: `/uploads/${name}` });
  }));

  /* ---------- destinasi ---------- */

  const destParams = (d: z.infer<typeof destinationSchema>) => [
    d.name, d.kind, d.categoryId, d.summary, d.description, d.addressText, d.lat, d.lng, d.coordsVerified, d.priceMin, d.priceMax, d.priceVerified,
    d.avgDurationMin, d.openHours ? JSON.stringify(d.openHours) : null, d.hoursVerified, d.familyFriendly, JSON.stringify(d.accessibility),
    JSON.stringify(d.facilities), JSON.stringify(d.tags), JSON.stringify(d.foodTags), d.imageUrl, JSON.stringify(d.gallery), d.dataStatus, d.isPublished,
  ];

  const adminDest = (id: string) => {
    const row = get<Parameters<typeof rowToDest>[0] & { description: string | null; facilities: string; gallery: string; data_status: string; is_published: number; updated_at: string }>(
      db, 'SELECT d.*, c.name AS category_name FROM destinations d JOIN categories c ON c.id = d.category_id WHERE d.id = ?', id,
    );
    if (!row) throw notFound('Destinasi tidak ditemukan');
    return { ...destDto(rowToDest(row)), description: row.description, facilities: JSON.parse(row.facilities), gallery: JSON.parse(row.gallery), dataStatus: row.data_status, isPublished: !!row.is_published, updatedAt: row.updated_at };
  };

  const checkCategory = (id: string) => { if (!get(db, 'SELECT 1 FROM categories WHERE id = ?', id)) throw bad('Kategori tidak ditemukan', { categoryId: 'Kategori tidak ditemukan' }); };

  r.get('/destinations', wrap(async (_req, res) => {
    const rows = all<{ id: string }>(db, 'SELECT id FROM destinations ORDER BY name');
    res.json({ items: rows.map((x) => adminDest(x.id)) });
  }));

  r.post('/destinations', wrap(async (req, res) => {
    const d = parse(destinationSchema, req.body);
    checkCategory(d.categoryId);
    const id = d.id ? slugify(d.id) : slugify(d.name);
    if (!id) throw bad('Nama tidak valid untuk membuat ID destinasi.');
    if (get(db, 'SELECT 1 FROM destinations WHERE id = ?', id)) throw conflict('ID destinasi sudah dipakai. Ubah nama atau ID.', 'id_terpakai');
    run(db, `INSERT INTO destinations (id,name,kind,category_id,summary,description,address_text,lat,lng,coords_verified,price_min,price_max,price_verified,avg_duration_min,open_hours,hours_verified,family_friendly,accessibility,facilities,tags,food_tags,image_url,gallery,data_status,is_published)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, ...destParams(d));
    audit(db, req.user!.id, 'create', 'destination', id);
    res.status(201).json(adminDest(id));
  }));

  r.put('/destinations/:id', wrap(async (req, res) => {
    const id = String(req.params.id);
    adminDest(id);
    const d = parse(destinationSchema, req.body);
    checkCategory(d.categoryId);
    run(db, `UPDATE destinations SET name=?,kind=?,category_id=?,summary=?,description=?,address_text=?,lat=?,lng=?,coords_verified=?,price_min=?,price_max=?,price_verified=?,avg_duration_min=?,open_hours=?,hours_verified=?,family_friendly=?,accessibility=?,facilities=?,tags=?,food_tags=?,image_url=?,gallery=?,data_status=?,is_published=?,updated_at=datetime('now') WHERE id=?`, ...destParams(d), id);
    audit(db, req.user!.id, 'update', 'destination', id);
    res.json(adminDest(id));
  }));

  r.delete('/destinations/:id', wrap(async (req, res) => {
    const id = String(req.params.id);
    adminDest(id);
    const used = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM trip_itineraries i JOIN trips t ON t.id = i.trip_id WHERE i.destination_id = ? AND t.status IN ('published','closed')", id)!.n;
    if (used > 0) throw conflict(`Destinasi dipakai di ${used} itinerary Open Trip aktif. Sembunyikan (jangan terbitkan) atau ganti dulu di trip.`, 'masih_dipakai');
    run(db, 'DELETE FROM destinations WHERE id = ?', id);
    audit(db, req.user!.id, 'delete', 'destination', id);
    res.json({ ok: true });
  }));

  /* ---------- Open Trip ---------- */

  const tripRow = (id: number) => { const t = get<TripRow>(db, 'SELECT * FROM trips WHERE id = ?', id); if (!t) throw notFound('Trip tidak ditemukan'); return t; };

  const saveItinerary = (tripId: number, items: z.infer<typeof tripSchema>['itinerary']) => {
    run(db, 'DELETE FROM trip_itineraries WHERE trip_id = ?', tripId);
    items.forEach((it, i) => {
      if (it.destinationId && !get(db, 'SELECT 1 FROM destinations WHERE id = ?', it.destinationId)) throw bad(`Destinasi "${it.destinationId}" pada itinerary tidak ditemukan.`);
      run(db, 'INSERT INTO trip_itineraries (trip_id,sort_order,time,title,destination_id,note) VALUES (?,?,?,?,?,?)', tripId, i, it.time, it.title, it.destinationId, it.note);
    });
  };

  r.get('/trips', wrap(async (_req, res) => {
    expireStale(db);
    const rows = all<TripRow>(db, 'SELECT * FROM trips ORDER BY trip_date DESC');
    res.json({ items: rows.map((t) => tripDto(db, t, { detail: true })) });
  }));

  r.post('/trips', wrap(async (req, res) => {
    const t = parse(tripSchema, req.body);
    let slug = slugify(t.slug || t.title);
    if (!slug) throw bad('Nama trip tidak valid.');
    if (get(db, 'SELECT 1 FROM trips WHERE slug = ?', slug)) slug = `${slug}-${t.date}`;
    const id = tx(db, () => {
      const r1 = run(db, `INSERT INTO trips (slug,title,theme,summary,trip_date,depart_time,end_time,meeting_point,price,capacity,min_participants,registration_deadline,included,excluded,safety,faq,image_url,status,is_demo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, slug, t.title, t.theme, t.summary, t.date, t.departTime, t.endTime, t.meetingPoint, t.price, t.capacity, t.minParticipants, t.registrationDeadline,
        JSON.stringify(t.included), JSON.stringify(t.excluded), JSON.stringify(t.safety), JSON.stringify(t.faq), t.imageUrl, t.status, t.isDemo);
      saveItinerary(r1.lastInsertRowid, t.itinerary);
      return r1.lastInsertRowid;
    });
    audit(db, req.user!.id, 'create', 'trip', id);
    res.status(201).json(tripDto(db, tripRow(id), { detail: true }));
  }));

  r.put('/trips/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const cur = tripRow(id);
    if (cur.status === 'cancelled') throw conflict('Trip yang dibatalkan tidak dapat diubah.');
    const t = parse(tripSchema, req.body);
    const { held } = seatCounts(db, id);
    if (t.capacity < held) throw bad(`Kapasitas tidak boleh di bawah jumlah kursi yang sudah dipesan (${held}).`, { capacity: `Minimal ${held} (kursi terpesan)` });
    if (cur.price !== t.price && held > 0) {
      // Pesanan lama tetap memakai harga saat dipesan (unit_price tersimpan di pesanan).
    }
    tx(db, () => {
      run(db, `UPDATE trips SET title=?,theme=?,summary=?,trip_date=?,depart_time=?,end_time=?,meeting_point=?,price=?,capacity=?,min_participants=?,registration_deadline=?,included=?,excluded=?,safety=?,faq=?,image_url=?,status=?,is_demo=? WHERE id=?`,
        t.title, t.theme, t.summary, t.date, t.departTime, t.endTime, t.meetingPoint, t.price, t.capacity, t.minParticipants, t.registrationDeadline,
        JSON.stringify(t.included), JSON.stringify(t.excluded), JSON.stringify(t.safety), JSON.stringify(t.faq), t.imageUrl, t.status, t.isDemo, id);
      saveItinerary(id, t.itinerary);
    });
    audit(db, req.user!.id, 'update', 'trip', id);
    res.json(tripDto(db, tripRow(id), { detail: true }));
  }));

  r.post('/trips/:id/cancel', wrap(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Isi alasan pembatalan').max(300) }), req.body);
    cancelTrip(db, Number(req.params.id), req.user!.id, reason);
    res.json(tripDto(db, tripRow(Number(req.params.id)), { detail: true }));
  }));

  r.get('/trips/:id/participants', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const t = tripRow(id);
    const rows = all<BookingRow>(db, "SELECT * FROM bookings WHERE trip_id = ? AND type='open' AND status IN ('menunggu_pembayaran','menunggu_verifikasi','dikonfirmasi','selesai') ORDER BY id", id);
    res.json({ trip: tripDto(db, t), items: rows.map((b) => bookingDto(db, b, { admin: true })) });
  }));

  /* ---------- pesanan ---------- */

  r.get('/bookings', wrap(async (req, res) => {
    expireStale(db);
    const q = parse(z.object({ status: z.string().max(30).optional(), type: z.enum(['open', 'private']).optional(), tripId: z.coerce.number().int().optional(), q: z.string().max(60).optional() }), req.query);
    const where: string[] = []; const params: (string | number)[] = [];
    if (q.status) { where.push('status = ?'); params.push(q.status); }
    if (q.type) { where.push('type = ?'); params.push(q.type); }
    if (q.tripId) { where.push('trip_id = ?'); params.push(q.tripId); }
    if (q.q) { where.push('(code LIKE ? OR contact_name LIKE ? OR contact_email LIKE ?)'); const like = `%${q.q}%`; params.push(like, like, like); }
    const rows = all<BookingRow>(db, `SELECT * FROM bookings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`, ...params);
    res.json({ items: rows.map((b) => bookingDto(db, b, { admin: true })) });
  }));

  const bookingById = (id: number) => { const b = getBooking(db, { id }); if (!b) throw notFound('Pesanan tidak ditemukan'); return b; };

  r.get('/bookings/:id', wrap(async (req, res) => res.json(bookingDto(db, bookingById(Number(req.params.id)), { admin: true }))));

  r.post('/bookings/:id/quote', wrap(async (req, res) => {
    const b = bookingById(Number(req.params.id));
    sendQuote(db, b, parse(quoteSchema, req.body), req.user!.id);
    res.json(bookingDto(db, bookingById(b.id), { admin: true }));
  }));

  r.post('/bookings/:id/verify-payment', wrap(async (req, res) => {
    const b = bookingById(Number(req.params.id));
    verifyPayment(db, b, parse(verifySchema, req.body), req.user!.id);
    res.json(bookingDto(db, bookingById(b.id), { admin: true }));
  }));

  r.post('/bookings/:id/reject-payment', wrap(async (req, res) => {
    const b = bookingById(Number(req.params.id));
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Isi alasan').max(300) }), req.body);
    rejectPayment(db, b, reason, req.user!.id);
    res.json(bookingDto(db, bookingById(b.id), { admin: true }));
  }));

  r.post('/bookings/:id/status', wrap(async (req, res) => {
    const b = bookingById(Number(req.params.id));
    const body = parse(z.object({ status: z.enum(['selesai', 'dibatalkan']), reason: z.string().trim().max(300).default('') }), req.body);
    if (body.status === 'dibatalkan') cancelBooking(db, b, req.user!.id, body.reason || 'Dibatalkan oleh admin');
    else tx(db, () => setStatus(db, b, 'selesai', { actorId: req.user!.id }));
    res.json(bookingDto(db, bookingById(b.id), { admin: true }));
  }));

  r.post('/bookings/:id/refund-complete', wrap(async (req, res) => {
    const b = bookingById(Number(req.params.id));
    if (b.refund_status !== 'diminta') throw conflict('Tidak ada permintaan pengembalian dana untuk pesanan ini.');
    const paid = get<{ s: number | null }>(db, "SELECT SUM(amount) AS s FROM payments WHERE booking_id = ? AND status = 'verified'", b.id)!.s ?? 0;
    const { amount } = parse(z.object({ amount: z.number().int().min(0) }), req.body);
    if (amount > paid) throw bad(`Pengembalian (${amount}) melebihi pembayaran terverifikasi (${paid}).`, { amount: 'Melebihi pembayaran terverifikasi' });
    tx(db, () => {
      run(db, "INSERT INTO payments (booking_id, amount, status, note, verified_by, verified_at) VALUES (?,?, 'refunded', 'Pengembalian dana', ?, ?)", b.id, amount, req.user!.id, new Date().toISOString());
      run(db, "UPDATE bookings SET refund_status='selesai', updated_at=? WHERE id=?", new Date().toISOString(), b.id);
      audit(db, req.user!.id, 'refund', 'booking', b.id, { amount });
    });
    res.json(bookingDto(db, bookingById(b.id), { admin: true }));
  }));

  /* ---------- mitra ---------- */

  r.get('/partners', wrap(async (_req, res) => {
    res.json({ items: all(db, 'SELECT id, type, name, contact, notes, rate_note AS rateNote, is_active AS isActive FROM partners ORDER BY type, name').map((p) => ({ ...p, isActive: !!(p as { isActive: number }).isActive })) });
  }));
  r.post('/partners', wrap(async (req, res) => {
    const p = parse(partnerSchema, req.body);
    const { lastInsertRowid } = run(db, 'INSERT INTO partners (type,name,contact,notes,rate_note,is_active) VALUES (?,?,?,?,?,?)', p.type, p.name, p.contact, p.notes, p.rateNote, p.isActive);
    res.status(201).json({ id: lastInsertRowid });
  }));
  r.put('/partners/:id', wrap(async (req, res) => {
    const p = parse(partnerSchema, req.body);
    if (run(db, 'UPDATE partners SET type=?,name=?,contact=?,notes=?,rate_note=?,is_active=? WHERE id=?', p.type, p.name, p.contact, p.notes, p.rateNote, p.isActive, Number(req.params.id)).changes === 0) throw notFound('Mitra tidak ditemukan');
    res.json({ ok: true });
  }));
  r.delete('/partners/:id', wrap(async (req, res) => {
    if (run(db, 'DELETE FROM partners WHERE id = ?', Number(req.params.id)).changes === 0) throw notFound('Mitra tidak ditemukan');
    res.json({ ok: true });
  }));

  /* ---------- keuangan ---------- */

  r.get('/expenses', wrap(async (_req, res) => {
    res.json({ items: all(db, 'SELECT id, spent_on AS spentOn, category, description, amount, trip_id AS tripId FROM expenses ORDER BY spent_on DESC, id DESC LIMIT 300') });
  }));
  r.post('/expenses', wrap(async (req, res) => {
    const e = parse(expenseSchema, req.body);
    const { lastInsertRowid } = run(db, 'INSERT INTO expenses (spent_on,category,description,amount,trip_id,created_by) VALUES (?,?,?,?,?,?)', e.spentOn, e.category, e.description, e.amount, e.tripId, req.user!.id);
    res.status(201).json({ id: lastInsertRowid });
  }));
  r.put('/expenses/:id', wrap(async (req, res) => {
    const e = parse(expenseSchema, req.body);
    if (run(db, 'UPDATE expenses SET spent_on=?,category=?,description=?,amount=?,trip_id=? WHERE id=?', e.spentOn, e.category, e.description, e.amount, e.tripId, Number(req.params.id)).changes === 0) throw notFound('Pengeluaran tidak ditemukan');
    res.json({ ok: true });
  }));
  r.delete('/expenses/:id', wrap(async (req, res) => {
    if (run(db, 'DELETE FROM expenses WHERE id = ?', Number(req.params.id)).changes === 0) throw notFound('Pengeluaran tidak ditemukan');
    res.json({ ok: true });
  }));

  r.get('/summary', wrap(async (req, res) => {
    expireStale(db);
    const today = todayJakarta();
    const q = parse(z.object({ from: z.string().refine(isValidDate).optional(), to: z.string().refine(isValidDate).optional() }), req.query);
    const from = q.from ?? `${today.slice(0, 7)}-01`;
    const to = q.to ?? today;
    const fromIso = `${from}T00:00:00.000Z`;
    const toIso = `${to}T23:59:59.999Z`;
    const rev = get<{ s: number | null }>(db, "SELECT SUM(amount) AS s FROM payments WHERE status='verified' AND verified_at BETWEEN ? AND ?", fromIso, toIso)!.s ?? 0;
    const ref = get<{ s: number | null }>(db, "SELECT SUM(amount) AS s FROM payments WHERE status='refunded' AND verified_at BETWEEN ? AND ?", fromIso, toIso)!.s ?? 0;
    const exp = get<{ s: number | null }>(db, 'SELECT SUM(amount) AS s FROM expenses WHERE spent_on BETWEEN ? AND ?', from, to)!.s ?? 0;
    const byStatus = all<{ status: string; n: number }>(db, 'SELECT status, COUNT(*) AS n FROM bookings GROUP BY status');
    const byMonth = all<{ month: string; revenue: number; refunds: number }>(db, `
      SELECT substr(verified_at,1,7) AS month,
             SUM(CASE WHEN status='verified' THEN amount ELSE 0 END) AS revenue,
             SUM(CASE WHEN status='refunded' THEN amount ELSE 0 END) AS refunds
      FROM payments WHERE status IN ('verified','refunded') AND verified_at IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 12`);
    const expByMonth = all<{ month: string; amount: number }>(db, 'SELECT substr(spent_on,1,7) AS month, SUM(amount) AS amount FROM expenses GROUP BY month ORDER BY month DESC LIMIT 12');
    const upcoming = all<TripRow>(db, "SELECT * FROM trips WHERE status IN ('published','closed') AND trip_date >= ? ORDER BY trip_date LIMIT 6", today).map((t) => tripDto(db, t, { today }));
    res.json({
      range: { from, to },
      totals: { revenue: rev, refunds: ref, expenses: exp, net: rev - ref - exp },
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s.n])),
      attention: {
        awaitingVerification: byStatus.find((s) => s.status === 'menunggu_verifikasi')?.n ?? 0,
        privateAwaitingQuote: get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM bookings WHERE type='private' AND status='menunggu_konfirmasi'")!.n,
        refundsPending: get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM bookings WHERE refund_status='diminta'")!.n,
        unverifiedDestinations: get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM destinations WHERE price_verified=0 OR hours_verified=0 OR coords_verified=0')!.n,
      },
      byMonth: byMonth.map((m) => ({ ...m, expenses: expByMonth.find((e) => e.month === m.month)?.amount ?? 0 })),
      upcoming,
    });
  }));

  /* ---------- pengaturan ---------- */

  r.get('/settings', wrap(async (_req, res) => {
    res.json({ items: all<{ key: string; value: string; verified: number; note: string | null }>(db, 'SELECT key, value, verified, note FROM settings ORDER BY key').map((s) => ({ ...s, verified: !!s.verified })) });
  }));

  r.put('/settings', wrap(async (req, res) => {
    const body = parse(z.object({ items: z.array(z.object({ key: z.string().max(80), value: z.string().max(2000), verified: z.boolean().optional() })).min(1).max(80) }), req.body);
    const current = readSettings(db);
    tx(db, () => {
      for (const it of body.items) {
        if (!(it.key in current)) throw bad(`Pengaturan "${it.key}" tidak dikenal.`);
        if (/^(speed|cost|private|booking)\./.test(it.key) && !it.key.endsWith('_pct') && it.value !== '' && !Number.isFinite(Number(it.value))) throw bad(`Nilai "${it.key}" harus berupa angka.`, { [it.key]: 'Harus berupa angka' });
        if (/^(speed|cost|private|booking)\./.test(it.key) && Number(it.value) < 0) throw bad(`Nilai "${it.key}" tidak boleh negatif.`);
        saveSetting(db, it.key, it.value, it.verified);
      }
      audit(db, req.user!.id, 'update', 'settings', null, { keys: body.items.map((i) => i.key) });
    });
    res.json({ ok: true });
  }));

  /* ---------- ekspor ---------- */

  r.get('/export/:kind', wrap(async (req, res) => {
    const kind = String(req.params.kind);
    let header: string[]; let rows: unknown[][];
    if (kind === 'bookings') {
      header = ['Kode', 'Jenis', 'Status', 'Trip', 'Nama', 'Telepon', 'Email', 'Peserta', 'Total', 'Status refund', 'Dibuat'];
      rows = all<Record<string, unknown>>(db, "SELECT b.*, t.title AS trip_title FROM bookings b LEFT JOIN trips t ON t.id = b.trip_id ORDER BY b.id DESC").map((b) => [b.code, b.type, b.status, b.trip_title, b.contact_name, b.contact_phone, b.contact_email, b.participants, b.total, b.refund_status, b.created_at]);
    } else if (kind === 'payments') {
      header = ['Kode pesanan', 'Status pembayaran', 'Jumlah', 'Pengirim', 'Referensi', 'Diverifikasi pada'];
      rows = all<Record<string, unknown>>(db, 'SELECT p.*, b.code FROM payments p JOIN bookings b ON b.id = p.booking_id ORDER BY p.id DESC').map((p) => [p.code, p.status, p.amount, p.payer_name, p.reference, p.verified_at]);
    } else if (kind === 'expenses') {
      header = ['Tanggal', 'Kategori', 'Deskripsi', 'Jumlah', 'Trip'];
      rows = all<Record<string, unknown>>(db, 'SELECT * FROM expenses ORDER BY spent_on DESC').map((e) => [e.spent_on, e.category, e.description, e.amount, e.trip_id]);
    } else throw notFound('Jenis ekspor tidak dikenal');
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="people-plesir-${kind}-${todayJakarta()}.csv"`);
    res.send('﻿' + csv);
  }));

  r.get('/audit', wrap(async (_req, res) => {
    res.json({ items: all(db, 'SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.detail, a.created_at AS createdAt, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 100') });
  }));

  r.get('/outbox', wrap(async (_req, res) => {
    res.json({ items: all(db, 'SELECT id, to_email AS toEmail, subject, sent_at AS sentAt, created_at AS createdAt FROM email_outbox ORDER BY id DESC LIMIT 50'), smtpConfigured: false });
  }));

  void HttpError;
  return r;
}
