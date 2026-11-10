import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { type AppCtx } from '../app.js';
import { all, get, run } from '../db.js';
import { HttpError, notFound, parse, requireUser, wrap } from '../http.js';
import { loadDests, plannerInputSchema, recomputeItinerary } from '../planner.js';
import {
  type BookingRow, bookingDto, cancelBooking, createOpenBooking, createPrivateRequest, expireStale, getBooking, openBookingSchema,
  paymentReportSchema, privateRequestSchema, reportPayment,
} from '../services.js';
import { readSettings } from '../settings.js';

const savedSchema = z.object({
  title: z.string().trim().min(2, 'Isi judul itinerary').max(150),
  summary: z.string().max(500).default(''),
  input: plannerInputSchema,
  plan: z.array(z.array(z.object({ destinationId: z.string().max(80), role: z.enum(['visit', 'meal']) })).max(14)).max(5),
  engine: z.object({ mode: z.enum(['demo', 'ai']), routing: z.string().max(40), note: z.string().max(300) }),
});

export function meRoutes(ctx: AppCtx) {
  const r = Router();
  const { db } = ctx;

  /* ---------- pemesanan ---------- */

  const ownBooking = (code: string, user: { id: number; role: string }): BookingRow => {
    const b = getBooking(db, { code });
    if (!b || (b.user_id !== user.id && user.role !== 'admin')) throw notFound('Pesanan tidak ditemukan');
    return b;
  };

  r.post('/bookings/open', requireUser, wrap(async (req, res) => {
    const input = parse(openBookingSchema, req.body);
    const code = createOpenBooking(db, req.user!.id, input);
    res.status(201).json(bookingDto(db, getBooking(db, { code })!));
  }));

  r.post('/bookings/private', requireUser, wrap(async (req, res) => {
    const input = parse(privateRequestSchema, req.body);
    const code = createPrivateRequest(db, req.user!.id, input);
    res.status(201).json(bookingDto(db, getBooking(db, { code })!));
  }));

  r.get('/bookings', requireUser, wrap(async (req, res) => {
    expireStale(db);
    const rows = all<BookingRow>(db, 'SELECT * FROM bookings WHERE user_id = ? ORDER BY id DESC', req.user!.id);
    res.json({ items: rows.map((b) => bookingDto(db, b)) });
  }));

  r.get('/bookings/:code', requireUser, wrap(async (req, res) => {
    expireStale(db);
    res.json(bookingDto(db, ownBooking(String(req.params.code), req.user!)));
  }));

  r.post('/bookings/:code/payment', requireUser, wrap(async (req, res) => {
    const b = ownBooking(String(req.params.code), req.user!);
    if (b.user_id !== req.user!.id) throw new HttpError(403, 'dilarang', 'Hanya pemesan yang dapat melaporkan pembayaran.');
    reportPayment(db, b, parse(paymentReportSchema, req.body));
    res.json(bookingDto(db, getBooking(db, { id: b.id })!));
  }));

  r.post('/bookings/:code/cancel', requireUser, wrap(async (req, res) => {
    const b = ownBooking(String(req.params.code), req.user!);
    if (b.user_id !== req.user!.id) throw new HttpError(403, 'dilarang', 'Hanya pemesan yang dapat membatalkan.');
    const dto = bookingDto(db, b);
    if (!dto.actions.canCancel) throw new HttpError(409, 'tidak_bisa_dibatalkan', 'Pesanan ini tidak dapat dibatalkan lagi.');
    const { reason } = parse(z.object({ reason: z.string().trim().max(300).default('Dibatalkan oleh pemesan') }), req.body ?? {});
    cancelBooking(db, b, req.user!.id, reason || 'Dibatalkan oleh pemesan');
    res.json(bookingDto(db, getBooking(db, { id: b.id })!));
  }));

  /* ---------- itinerary tersimpan ---------- */

  const loadSaved = (id: number, userId: number) => {
    const row = get<{ id: number; title: string; data: string; share_token: string | null; created_at: string; updated_at: string }>(
      db, 'SELECT * FROM saved_itineraries WHERE id = ? AND user_id = ?', id, userId,
    );
    if (!row) throw notFound('Itinerary tidak ditemukan');
    return row;
  };

  const hydrate = async (row: NonNullable<ReturnType<typeof loadSaved>>) => {
    const saved = JSON.parse(row.data) as z.infer<typeof savedSchema>;
    const dests = new Map(loadDests(db).map((d) => [d.id, d]));
    // Dihitung ulang dari data terbaru agar harga/jam yang diperbarui admin ikut tercermin.
    const itinerary = await recomputeItinerary(
      { input: saved.input, dests, router: ctx.router, settings: readSettings(db) },
      saved.plan, { title: row.title, summary: saved.summary, engine: saved.engine },
    );
    return { id: row.id, title: row.title, shareToken: row.share_token, createdAt: row.created_at, updatedAt: row.updated_at, itinerary, plan: saved.plan };
  };

  r.get('/itineraries', requireUser, wrap(async (req, res) => {
    const rows = all<{ id: number; title: string; data: string; share_token: string | null; updated_at: string }>(db, 'SELECT id, title, data, share_token, updated_at FROM saved_itineraries WHERE user_id = ? ORDER BY updated_at DESC', req.user!.id);
    res.json({
      items: rows.map((row) => {
        const d = JSON.parse(row.data) as z.infer<typeof savedSchema>;
        return {
          id: row.id, title: row.title, shared: !!row.share_token, updatedAt: row.updated_at,
          days: d.input.days, startDate: d.input.startDate, participants: d.input.participants,
          stops: d.plan.reduce((n, day) => n + day.length, 0),
        };
      }),
    });
  }));

  r.post('/itineraries', requireUser, wrap(async (req, res) => {
    const b = parse(savedSchema, req.body);
    const data = JSON.stringify({ input: b.input, plan: b.plan, summary: b.summary, engine: b.engine });
    const { lastInsertRowid } = run(db, 'INSERT INTO saved_itineraries (user_id, title, data) VALUES (?,?,?)', req.user!.id, b.title, data);
    res.status(201).json(await hydrate(loadSaved(lastInsertRowid, req.user!.id)));
  }));

  r.get('/itineraries/:id', requireUser, wrap(async (req, res) => {
    res.json(await hydrate(loadSaved(Number(req.params.id), req.user!.id)));
  }));

  r.put('/itineraries/:id', requireUser, wrap(async (req, res) => {
    const row = loadSaved(Number(req.params.id), req.user!.id);
    const b = parse(savedSchema, req.body);
    run(db, "UPDATE saved_itineraries SET title=?, data=?, updated_at=datetime('now') WHERE id=?", b.title, JSON.stringify({ input: b.input, plan: b.plan, summary: b.summary, engine: b.engine }), row.id);
    res.json(await hydrate(loadSaved(row.id, req.user!.id)));
  }));

  r.delete('/itineraries/:id', requireUser, wrap(async (req, res) => {
    const row = loadSaved(Number(req.params.id), req.user!.id);
    run(db, 'DELETE FROM saved_itineraries WHERE id = ?', row.id);
    res.json({ ok: true });
  }));

  r.post('/itineraries/:id/share', requireUser, wrap(async (req, res) => {
    const row = loadSaved(Number(req.params.id), req.user!.id);
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    const token = enabled ? row.share_token ?? crypto.randomBytes(16).toString('base64url') : null;
    run(db, 'UPDATE saved_itineraries SET share_token = ? WHERE id = ?', token, row.id);
    res.json({ shareToken: token });
  }));

  /* ---------- notifikasi ---------- */

  r.get('/notifications', requireUser, wrap(async (req, res) => {
    const items = all(db, 'SELECT id, booking_id AS bookingId, title, body, read_at AS readAt, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', req.user!.id);
    res.json({ items });
  }));

  r.post('/notifications/read-all', requireUser, wrap(async (req, res) => {
    run(db, "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", req.user!.id);
    res.json({ ok: true });
  }));

  return r;
}
