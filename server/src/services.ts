import crypto from 'node:crypto';
import { z } from 'zod';
import { type Db, all, get, run, tx } from './db.js';
import { HttpError, bad, conflict, notFound } from './http.js';
import { type SettingsMap, num, readSettings } from './settings.js';
import { estimatePrivateTrip, privateEstimateSchema, quoteOpenTrip } from './pricing.js';
import { isValidDate } from './geo.js';
import { loadDests } from './planner.js';

export const todayJakarta = (now = new Date()) => now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

export const STATUS_LABEL: Record<string, string> = {
  menunggu_konfirmasi: 'Menunggu konfirmasi',
  menunggu_pembayaran: 'Menunggu pembayaran',
  menunggu_verifikasi: 'Menunggu verifikasi pembayaran',
  dikonfirmasi: 'Dikonfirmasi',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

/** Status yang menahan kursi Open Trip. */
const HOLDING = ['menunggu_pembayaran', 'menunggu_verifikasi', 'dikonfirmasi', 'selesai'] as const;

const json = <T>(s: string | null | undefined, fallback: T): T => {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
};

/* ---------------- Kedaluwarsa ---------------- */

/** Melepas kursi untuk pesanan yang belum dibayar sampai batas waktu. Dipanggil sebelum membaca ketersediaan. */
export function expireStale(db: Db, now = new Date()) {
  const rows = all<{ id: number; user_id: number; code: string; type: string }>(
    db,
    "SELECT id, user_id, code, type FROM bookings WHERE status = 'menunggu_pembayaran' AND expires_at IS NOT NULL AND expires_at < ?",
    now.toISOString(),
  );
  for (const r of rows) {
    tx(db, () => {
      run(db, "UPDATE bookings SET status='dibatalkan', cancel_reason='Batas waktu pembayaran habis', updated_at=? WHERE id=? AND status='menunggu_pembayaran'", now.toISOString(), r.id);
      run(db, "UPDATE payments SET status='rejected', note='Kedaluwarsa' WHERE booking_id=? AND status='pending'", r.id);
      notify(db, r.user_id, r.id, 'Pesanan dibatalkan otomatis', `Pesanan ${r.code} dibatalkan karena batas waktu pembayaran habis. Kursi dilepas kembali.`);
    });
  }
  return rows.length;
}

/* ---------------- Notifikasi ---------------- */

export function notify(db: Db, userId: number, bookingId: number | null, title: string, body: string) {
  run(db, 'INSERT INTO notifications (user_id, booking_id, title, body) VALUES (?,?,?,?)', userId, bookingId, title, body);
  const u = get<{ email: string }>(db, 'SELECT email FROM users WHERE id = ?', userId);
  // Email masuk antrean; terkirim hanya jika pengirim SMTP dipasang (belum ada di MVP).
  if (u) run(db, 'INSERT INTO email_outbox (to_email, subject, body) VALUES (?,?,?)', u.email, title, body);
}

export function audit(db: Db, actorId: number | null, action: string, entity: string, entityId: string | number | null, detail?: unknown) {
  run(db, 'INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)', actorId, action, entity, entityId == null ? null : String(entityId), detail ? JSON.stringify(detail) : null);
}

/* ---------------- Open Trip: ketersediaan ---------------- */

interface TripRow {
  id: number; slug: string; title: string; theme: string | null; summary: string | null; trip_date: string; depart_time: string; end_time: string;
  meeting_point: string | null; price: number; capacity: number; min_participants: number; registration_deadline: string | null;
  included: string; excluded: string; safety: string; faq: string; image_url: string | null; status: string; is_demo: number;
}

export function seatCounts(db: Db, tripId: number) {
  const r = get<{ held: number | null; paid: number | null }>(
    db,
    `SELECT
       SUM(CASE WHEN status IN ('menunggu_pembayaran','menunggu_verifikasi','dikonfirmasi','selesai') THEN participants ELSE 0 END) AS held,
       SUM(CASE WHEN status IN ('dikonfirmasi','selesai') THEN participants ELSE 0 END) AS paid
     FROM bookings WHERE trip_id = ? AND type = 'open'`,
    tripId,
  )!;
  return { held: Number(r.held ?? 0), paid: Number(r.paid ?? 0) };
}

export function tripDto(db: Db, t: TripRow, opts: { detail?: boolean; today?: string } = {}) {
  const today = opts.today ?? todayJakarta();
  const { held, paid } = seatCounts(db, t.id);
  const seatsLeft = Math.max(0, t.capacity - held);
  const past = t.trip_date < today;
  const deadlinePassed = t.registration_deadline ? t.registration_deadline < today : false;
  let state: 'tersedia' | 'penuh' | 'ditutup' | 'dibatalkan' | 'selesai' | 'draft';
  if (t.status === 'cancelled') state = 'dibatalkan';
  else if (t.status === 'draft') state = 'draft';
  else if (past) state = 'selesai';
  else if (t.status === 'closed' || deadlinePassed) state = 'ditutup';
  else if (seatsLeft <= 0) state = 'penuh';
  else state = 'tersedia';
  const dto: Record<string, unknown> = {
    id: t.id, slug: t.slug, title: t.title, theme: t.theme, summary: t.summary,
    date: t.trip_date, departTime: t.depart_time, endTime: t.end_time, meetingPoint: t.meeting_point,
    price: t.price, capacity: t.capacity, minParticipants: t.min_participants, registrationDeadline: t.registration_deadline,
    imageUrl: t.image_url, status: t.status, isDemo: !!t.is_demo,
    seats: { capacity: t.capacity, held, left: seatsLeft, confirmed: paid },
    state,
    minimum: {
      required: t.min_participants,
      confirmed: paid,
      met: paid >= t.min_participants,
      label: paid >= t.min_participants
        ? 'Kuota minimum terpenuhi, keberangkatan pasti.'
        : `Menunggu kuota minimum: ${paid} dari ${t.min_participants} peserta terkonfirmasi.`,
    },
  };
  if (opts.detail) {
    dto.included = json<string[]>(t.included, []);
    dto.excluded = json<string[]>(t.excluded, []);
    dto.safety = json<string[]>(t.safety, []);
    dto.faq = json<{ q: string; a: string }[]>(t.faq, []);
    dto.itinerary = all(
      db,
      `SELECT i.id, i.sort_order AS sortOrder, i.time, i.title, i.destination_id AS destinationId, i.note,
              d.name AS destinationName, d.lat, d.lng, d.coords_verified AS coordsVerified
       FROM trip_itineraries i LEFT JOIN destinations d ON d.id = i.destination_id
       WHERE i.trip_id = ? ORDER BY i.sort_order`,
      t.id,
    );
  }
  return dto;
}

/* ---------------- Validasi kontak ---------------- */

const phoneSchema = z
  .string({ required_error: 'Isi nomor WhatsApp' })
  .transform((v) => v.replace(/[\s\-().]/g, ''))
  .refine((v) => /^(\+62|62|0)8\d{7,12}$/.test(v), 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx)');

export const contactSchema = z.object({
  contactName: z.string().trim().min(2, 'Isi nama pemesan').max(100),
  contactPhone: phoneSchema,
  contactEmail: z.string().trim().email('Format email tidak valid').max(150),
});

export const openBookingSchema = contactSchema.extend({
  tripId: z.number().int().positive(),
  participants: z.number({ invalid_type_error: 'Jumlah peserta harus berupa angka' }).int().min(1, 'Minimal 1 peserta'),
  agreeTerms: z.literal(true, { errorMap: () => ({ message: 'Setujui kebijakan pembatalan dan ketentuan pembayaran' }) }),
});

function newCode(db: Db): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 20; i++) {
    let c = 'PP-';
    const bytes = crypto.randomBytes(6);
    for (const b of bytes) c += alphabet[b % alphabet.length];
    if (!get(db, 'SELECT 1 FROM bookings WHERE code = ?', c)) return c;
  }
  throw new HttpError(500, 'server', 'Gagal membuat kode pesanan.');
}

/* ---------------- Buat pesanan Open Trip ---------------- */

export function createOpenBooking(db: Db, userId: number, input: z.infer<typeof openBookingSchema>, now = new Date()) {
  expireStale(db, now);
  const s = readSettings(db);
  const maxPer = num(s, 'booking.max_per_order', 10);
  if (input.participants > maxPer) throw bad(`Maksimal ${maxPer} peserta per pesanan. Untuk rombongan lebih besar, ajukan Private Trip.`, { participants: `Maksimal ${maxPer} peserta` });
  const today = todayJakarta(now);

  return tx(db, () => {
    const t = get<TripRow>(db, 'SELECT * FROM trips WHERE id = ?', input.tripId);
    if (!t || t.status === 'draft') throw notFound('Open Trip tidak ditemukan');
    const dto = tripDto(db, t, { today }) as { state: string; seats: { left: number } };
    if (dto.state === 'dibatalkan') throw conflict('Open Trip ini dibatalkan.', 'trip_dibatalkan');
    if (dto.state === 'selesai') throw conflict('Open Trip ini sudah lewat.', 'trip_lewat');
    if (dto.state === 'ditutup') throw conflict('Pendaftaran Open Trip ini sudah ditutup.', 'pendaftaran_ditutup');
    if (dto.seats.left <= 0) throw conflict('Maaf, kursi sudah penuh.', 'kursi_penuh');
    if (input.participants > dto.seats.left) throw conflict(`Kursi tersisa ${dto.seats.left}. Kurangi jumlah peserta.`, 'kursi_tidak_cukup');

    const q = quoteOpenTrip(t.price, input.participants, s);
    const code = newCode(db);
    const holdMs = num(s, 'booking.hold_hours', 24) * 3600 * 1000;
    const expires = new Date(now.getTime() + holdMs).toISOString();
    const r = run(
      db,
      `INSERT INTO bookings (code,type,user_id,trip_id,contact_name,contact_phone,contact_email,participants,status,unit_price,subtotal,fee,total,expires_at,created_at,updated_at)
       VALUES (?, 'open', ?, ?, ?, ?, ?, ?, 'menunggu_pembayaran', ?, ?, ?, ?, ?, ?, ?)`,
      code, userId, t.id, input.contactName, input.contactPhone, input.contactEmail, input.participants,
      q.unitPrice, q.subtotal, q.fee, q.total, expires, now.toISOString(), now.toISOString(),
    );
    run(db, "INSERT INTO payments (booking_id, amount, status) VALUES (?, ?, 'pending')", r.lastInsertRowid, q.total);
    notify(db, userId, r.lastInsertRowid, 'Pesanan dibuat, menunggu pembayaran',
      `Pesanan ${code} untuk ${t.title} (${input.participants} peserta) dibuat. Selesaikan pembayaran sebelum ${expires.slice(0, 16).replace('T', ' ')} UTC agar kursi tetap ditahan.`);
    return code;
  });
}

/* ---------------- Private Trip ---------------- */

export const privateRequestSchema = contactSchema.extend({
  desiredDate: z.string().refine(isValidDate, 'Tanggal tidak valid'),
  flexibleDates: z.boolean().default(false),
  participants: privateEstimateSchema.shape.participants,
  days: privateEstimateSchema.shape.days,
  origin: z.string().trim().min(2, 'Isi titik keberangkatan atau penginapan').max(200),
  destinationIds: z.array(z.string().max(80)).max(20).default([]),
  tourTypes: z.array(z.string().max(40)).max(8).default([]),
  vehicle: privateEstimateSchema.shape.vehicle,
  budget: z.object({ mode: z.enum(['per_person', 'total']), amount: z.number().int().min(0).max(1_000_000_000).nullable() }),
  facilities: privateEstimateSchema.shape.facilities,
  mealsPerDay: privateEstimateSchema.shape.mealsPerDay,
  notes: z.string().max(1500).default(''),
  itineraryDraft: z
    .object({
      title: z.string().max(150),
      days: z.array(z.object({ date: z.string().max(10), stops: z.array(z.object({ destinationId: z.string().max(80), name: z.string().max(150) })).max(20) })).max(7),
    })
    .nullable()
    .default(null),
  agreeTerms: z.literal(true, { errorMap: () => ({ message: 'Setujui bahwa estimasi awal bukan harga final' }) }),
});

/** Menghitung estimasi dengan harga tiket yang dibaca server dari database (tidak dipercaya dari klien). */
export function privateEstimateFor(db: Db, input: { participants: number; days: number; vehicle: z.infer<typeof privateEstimateSchema>['vehicle']; facilities: z.infer<typeof privateEstimateSchema>['facilities']; mealsPerDay: number; destinationIds: string[] }) {
  const s = readSettings(db);
  const dests = new Map(loadDests(db).map((d) => [d.id, d]));
  const chosen = input.destinationIds.map((id) => dests.get(id)).filter((d) => !!d);
  const paid = chosen.filter((d) => d!.kind === 'wisata');
  let ticketPerPerson: number | null = null;
  let verified = false;
  if (paid.length) {
    const priced = paid.filter((d) => d!.priceMin != null || d!.priceMax != null);
    if (priced.length === paid.length) {
      ticketPerPerson = priced.reduce((n, d) => n + Math.round(((d!.priceMin ?? d!.priceMax!) + (d!.priceMax ?? d!.priceMin!)) / 2 / 500) * 500, 0);
      verified = priced.every((d) => d!.priceVerified);
    }
  } else if (chosen.length) {
    ticketPerPerson = 0;
    verified = true;
  }
  return estimatePrivateTrip(
    { participants: input.participants, days: input.days, vehicle: input.vehicle, facilities: input.facilities, mealsPerDay: input.mealsPerDay, ticketPerPerson, ticketVerified: verified },
    s,
  );
}

export function createPrivateRequest(db: Db, userId: number, input: z.infer<typeof privateRequestSchema>, now = new Date()) {
  if (input.desiredDate < todayJakarta(now)) throw bad('Tanggal yang diinginkan sudah lewat', { desiredDate: 'Pilih tanggal hari ini atau setelahnya' });
  const estimate = privateEstimateFor(db, input);
  return tx(db, () => {
    const code = newCode(db);
    const details = {
      desiredDate: input.desiredDate, flexibleDates: input.flexibleDates, days: input.days, origin: input.origin,
      destinationIds: input.destinationIds, tourTypes: input.tourTypes, vehicle: input.vehicle, budget: input.budget,
      facilities: input.facilities, mealsPerDay: input.mealsPerDay, notes: input.notes, itineraryDraft: input.itineraryDraft,
      estimate,
    };
    const r = run(
      db,
      `INSERT INTO bookings (code,type,user_id,trip_id,contact_name,contact_phone,contact_email,participants,status,details,created_at,updated_at)
       VALUES (?, 'private', ?, NULL, ?, ?, ?, ?, 'menunggu_konfirmasi', ?, ?, ?)`,
      code, userId, input.contactName, input.contactPhone, input.contactEmail, input.participants, JSON.stringify(details), now.toISOString(), now.toISOString(),
    );
    notify(db, userId, r.lastInsertRowid, 'Permintaan Private Trip diterima',
      `Permintaan ${code} diterima. Tim kami akan memeriksa ketersediaan mitra dan biaya aktual, lalu mengirim penawaran final. Pesanan belum terkonfirmasi sebelum tim menyetujui jadwal, harga, dan ketersediaan.`);
    return code;
  });
}

/* ---------------- Transisi status ---------------- */

const TRANSITIONS: Record<string, string[]> = {
  menunggu_konfirmasi: ['menunggu_pembayaran', 'dibatalkan'],
  menunggu_pembayaran: ['menunggu_verifikasi', 'dikonfirmasi', 'dibatalkan'],
  menunggu_verifikasi: ['dikonfirmasi', 'menunggu_pembayaran', 'dibatalkan'],
  dikonfirmasi: ['selesai', 'dibatalkan'],
  selesai: [],
  dibatalkan: [],
};

export function canTransition(from: string, to: string) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export interface BookingRow {
  id: number; code: string; type: 'open' | 'private'; user_id: number; trip_id: number | null; contact_name: string; contact_phone: string;
  contact_email: string; participants: number; status: string; unit_price: number; subtotal: number; fee: number; total: number;
  details: string | null; quote_note: string | null; expires_at: string | null; cancel_reason: string | null; refund_status: string;
  created_at: string; updated_at: string;
}

export function setStatus(db: Db, b: BookingRow, to: string, opts: { actorId: number | null; reason?: string; notifyTitle?: string; notifyBody?: string }) {
  if (!canTransition(b.status, to)) {
    throw conflict(`Status tidak dapat diubah dari "${STATUS_LABEL[b.status]}" ke "${STATUS_LABEL[to]}".`, 'transisi_tidak_valid');
  }
  const refund = to === 'dibatalkan' && ['menunggu_verifikasi', 'dikonfirmasi'].includes(b.status) ? 'diminta' : b.refund_status;
  run(db, 'UPDATE bookings SET status = ?, cancel_reason = COALESCE(?, cancel_reason), refund_status = ?, updated_at = ? WHERE id = ?', to, opts.reason ?? null, refund, new Date().toISOString(), b.id);
  if (to === 'dibatalkan') run(db, "UPDATE payments SET status='rejected', note=COALESCE(note,'Pesanan dibatalkan') WHERE booking_id=? AND status IN ('pending','submitted')", b.id);
  audit(db, opts.actorId, `status:${b.status}->${to}`, 'booking', b.id, { reason: opts.reason });
  notify(db, b.user_id, b.id, opts.notifyTitle ?? `Status pesanan ${b.code}: ${STATUS_LABEL[to]}`, opts.notifyBody ?? `Status pesanan ${b.code} sekarang "${STATUS_LABEL[to]}".`);
}

export function getBooking(db: Db, where: { id?: number; code?: string }): BookingRow | undefined {
  return where.id != null
    ? get<BookingRow>(db, 'SELECT * FROM bookings WHERE id = ?', where.id)
    : get<BookingRow>(db, 'SELECT * FROM bookings WHERE code = ?', where.code);
}

export function bookingDto(db: Db, b: BookingRow, opts: { admin?: boolean } = {}) {
  const trip = b.trip_id ? get<TripRow>(db, 'SELECT * FROM trips WHERE id = ?', b.trip_id) : undefined;
  const payment = get<Record<string, unknown>>(db, 'SELECT id, method, amount, status, payer_name AS payerName, reference, note, submitted_at AS submittedAt, verified_at AS verifiedAt FROM payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1', b.id);
  const details = json<Record<string, unknown> | null>(b.details, null);
  const today = todayJakarta();
  const canCancel = canTransition(b.status, 'dibatalkan') && (!trip || trip.trip_date >= today);
  return {
    id: b.id, code: b.code, type: b.type, status: b.status, statusLabel: STATUS_LABEL[b.status],
    participants: b.participants, unitPrice: b.unit_price, subtotal: b.subtotal, fee: b.fee, total: b.total,
    contact: { name: b.contact_name, phone: b.contact_phone, email: b.contact_email },
    expiresAt: b.expires_at, cancelReason: b.cancel_reason, refundStatus: b.refund_status,
    quoteNote: b.quote_note, createdAt: b.created_at, updatedAt: b.updated_at,
    trip: trip ? { id: trip.id, slug: trip.slug, title: trip.title, date: trip.trip_date, departTime: trip.depart_time, meetingPoint: trip.meeting_point } : null,
    payment: payment ?? null,
    details,
    actions: {
      canPay: b.status === 'menunggu_pembayaran' && (b.type === 'open' || b.total > 0),
      canCancel,
    },
    ...(opts.admin ? { userId: b.user_id } : {}),
  };
}

/** Admin menetapkan penawaran final Private Trip. */
export const quoteSchema = z.object({
  finalPrice: z.number().int().min(1, 'Isi harga final').max(1_000_000_000),
  note: z.string().max(2000).default(''),
  lines: z.array(z.object({ label: z.string().min(1).max(80), amount: z.number().int().min(0).max(1_000_000_000) })).max(15).default([]),
  included: z.array(z.string().max(120)).max(20).default([]),
  excluded: z.array(z.string().max(120)).max(20).default([]),
  validDays: z.number().int().min(1).max(30).default(3),
});

export function sendQuote(db: Db, b: BookingRow, q: z.infer<typeof quoteSchema>, actorId: number) {
  if (b.type !== 'private') throw bad('Hanya permintaan Private Trip yang memakai penawaran.');
  if (b.status !== 'menunggu_konfirmasi') throw conflict('Penawaran hanya dapat dikirim saat status "Menunggu konfirmasi".', 'transisi_tidak_valid');
  const sum = q.lines.reduce((n, l) => n + l.amount, 0);
  if (q.lines.length && sum !== q.finalPrice) throw bad(`Total rincian (${sum}) harus sama dengan harga final (${q.finalPrice}).`, { finalPrice: 'Total rincian tidak sama dengan harga final' });
  tx(db, () => {
    const details = { ...(json<Record<string, unknown>>(b.details, {})), quote: { lines: q.lines, included: q.included, excluded: q.excluded, sentAt: new Date().toISOString(), validDays: q.validDays } };
    const expires = new Date(Date.now() + q.validDays * 86400000).toISOString();
    run(db, 'UPDATE bookings SET subtotal=?, total=?, quote_note=?, details=?, expires_at=? WHERE id=?', q.finalPrice, q.finalPrice, q.note, JSON.stringify(details), expires, b.id);
    run(db, "INSERT INTO payments (booking_id, amount, status) VALUES (?, ?, 'pending')", b.id, q.finalPrice);
    setStatus(db, { ...b, status: 'menunggu_konfirmasi' }, 'menunggu_pembayaran', {
      actorId, notifyTitle: 'Penawaran Private Trip siap',
      notifyBody: `Penawaran final untuk ${b.code} sudah dikirim. Periksa rinciannya dan selesaikan pembayaran dalam ${q.validDays} hari agar jadwal ditahan.`,
    });
  });
}

/** Pembayaran: pengguna melapor sudah transfer (belum berarti berhasil). */
export const paymentReportSchema = z.object({
  payerName: z.string().trim().min(2, 'Isi nama pemilik rekening pengirim').max(100),
  reference: z.string().trim().max(100).default(''),
  note: z.string().max(500).default(''),
});

export function reportPayment(db: Db, b: BookingRow, input: z.infer<typeof paymentReportSchema>) {
  if (b.status !== 'menunggu_pembayaran') throw conflict('Pesanan ini tidak sedang menunggu pembayaran.', 'transisi_tidak_valid');
  if (b.expires_at && b.expires_at < new Date().toISOString()) throw conflict('Batas waktu pembayaran sudah habis.', 'kedaluwarsa');
  tx(db, () => {
    const p = get<{ id: number }>(db, "SELECT id FROM payments WHERE booking_id=? AND status='pending' ORDER BY id DESC LIMIT 1", b.id);
    if (p) run(db, "UPDATE payments SET status='submitted', payer_name=?, reference=?, note=?, submitted_at=? WHERE id=?", input.payerName, input.reference, input.note, new Date().toISOString(), p.id);
    else run(db, "INSERT INTO payments (booking_id, amount, status, payer_name, reference, note, submitted_at) VALUES (?,?, 'submitted', ?,?,?,?)", b.id, b.total, input.payerName, input.reference, input.note, new Date().toISOString());
    setStatus(db, b, 'menunggu_verifikasi', {
      actorId: b.user_id, notifyTitle: 'Laporan pembayaran diterima',
      notifyBody: `Kami menerima laporan pembayaran untuk ${b.code}. Pesanan dikonfirmasi setelah admin memverifikasi pembayaran.`,
    });
  });
}

export const verifySchema = z.object({
  amount: z.number().int().min(0),
  reference: z.string().max(100).optional(),
});

export function verifyPayment(db: Db, b: BookingRow, input: z.infer<typeof verifySchema>, adminId: number) {
  if (!['menunggu_verifikasi', 'menunggu_pembayaran'].includes(b.status)) throw conflict('Pesanan ini tidak menunggu pembayaran.', 'transisi_tidak_valid');
  if (b.total <= 0) throw conflict('Pesanan belum memiliki total harga final.', 'belum_ada_harga');
  if (input.amount < b.total) throw bad(`Jumlah diterima (${input.amount}) kurang dari total pesanan (${b.total}).`, { amount: 'Jumlah kurang dari total pesanan' });
  if (b.trip_id) {
    const t = get<{ status: string }>(db, 'SELECT status FROM trips WHERE id=?', b.trip_id);
    if (t?.status === 'cancelled') throw conflict('Trip sudah dibatalkan.', 'trip_dibatalkan');
  }
  tx(db, () => {
    const p = get<{ id: number }>(db, "SELECT id FROM payments WHERE booking_id=? AND status IN ('submitted','pending') ORDER BY id DESC LIMIT 1", b.id);
    const now = new Date().toISOString();
    if (p) run(db, "UPDATE payments SET status='verified', amount=?, reference=COALESCE(?, reference), verified_by=?, verified_at=? WHERE id=?", input.amount, input.reference ?? null, adminId, now, p.id);
    else run(db, "INSERT INTO payments (booking_id, amount, status, reference, verified_by, verified_at) VALUES (?,?, 'verified', ?, ?, ?)", b.id, input.amount, input.reference ?? null, adminId, now);
    run(db, 'UPDATE bookings SET expires_at = NULL WHERE id = ?', b.id);
    setStatus(db, b, 'dikonfirmasi', {
      actorId: adminId, notifyTitle: 'Pesanan dikonfirmasi',
      notifyBody: `Pembayaran untuk ${b.code} sudah diverifikasi. Pesanan Anda dikonfirmasi.`,
    });
  });
}

export function rejectPayment(db: Db, b: BookingRow, reason: string, adminId: number) {
  if (b.status !== 'menunggu_verifikasi') throw conflict('Tidak ada pembayaran yang menunggu verifikasi.', 'transisi_tidak_valid');
  tx(db, () => {
    run(db, "UPDATE payments SET status='rejected', note=? WHERE booking_id=? AND status='submitted'", reason, b.id);
    run(db, "INSERT INTO payments (booking_id, amount, status) VALUES (?,?, 'pending')", b.id, b.total);
    setStatus(db, b, 'menunggu_pembayaran', {
      actorId: adminId, notifyTitle: 'Pembayaran belum dapat diverifikasi',
      notifyBody: `Pembayaran untuk ${b.code} belum dapat diverifikasi: ${reason}. Silakan kirim ulang laporan pembayaran.`,
    });
  });
}

export function cancelBooking(db: Db, b: BookingRow, actorId: number, reason: string) {
  tx(db, () => setStatus(db, b, 'dibatalkan', {
    actorId, reason,
    notifyTitle: 'Pesanan dibatalkan',
    notifyBody: `Pesanan ${b.code} dibatalkan.${['menunggu_verifikasi', 'dikonfirmasi'].includes(b.status) ? ' Permintaan pengembalian dana dicatat dan akan diproses sesuai kebijakan pembatalan.' : ''}`,
  }));
}

/** Admin membatalkan trip: semua pesanan aktif dibatalkan, pengembalian dana dicatat untuk yang sudah bayar. */
export function cancelTrip(db: Db, tripId: number, adminId: number, reason: string) {
  const t = get<TripRow>(db, 'SELECT * FROM trips WHERE id = ?', tripId);
  if (!t) throw notFound('Trip tidak ditemukan');
  if (t.status === 'cancelled') throw conflict('Trip sudah dibatalkan.');
  tx(db, () => {
    run(db, "UPDATE trips SET status='cancelled' WHERE id=?", tripId);
    const bs = all<BookingRow>(db, "SELECT * FROM bookings WHERE trip_id = ? AND status IN ('menunggu_pembayaran','menunggu_verifikasi','dikonfirmasi')", tripId);
    for (const b of bs) {
      setStatus(db, b, 'dibatalkan', { actorId: adminId, reason, notifyTitle: 'Open Trip dibatalkan', notifyBody: `${t.title} dibatalkan oleh penyelenggara (${reason}). ${b.status === 'menunggu_pembayaran' ? '' : 'Pengembalian dana penuh akan diproses.'}` });
    }
    audit(db, adminId, 'trip:cancel', 'trip', tripId, { reason, bookings: bs.length });
  });
}

export type { TripRow, SettingsMap };
