import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { estimatePrivateTrip, quoteOpenTrip } from '../src/pricing.js';
import { DEFAULT_SETTINGS } from '../src/seed.js';
import { ADMIN, addDays, agentFor, booking, makeCtx, tripBody } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof makeCtx>>;
let ctx: Ctx;
let admin: Awaited<ReturnType<typeof agentFor>>;

beforeAll(async () => {
  ctx = await makeCtx();
  admin = await agentFor(ctx.app, ADMIN, false);
});

const settings = Object.fromEntries(DEFAULT_SETTINGS.map((s) => [s.key, s.value]));

describe('perhitungan harga', () => {
  it('Open Trip: subtotal = harga x peserta, ditambah biaya layanan tetap', () => {
    expect(quoteOpenTrip(100000, 3, settings)).toMatchObject({ subtotal: 300000, fee: 0, total: 300000 });
    expect(quoteOpenTrip(85000, 4, { ...settings, 'booking.fee_flat': '5000' })).toMatchObject({ subtotal: 340000, fee: 5000, total: 345000 });
  });
  it('Private Trip: estimasi bukan final, margin dan rentang dihitung, komponen yang tidak dipilih tidak dihitung', () => {
    const e = estimatePrivateTrip({ participants: 6, days: 1, vehicle: 'mobil_sopir', mealsPerDay: 2, facilities: { transport: true, tickets: false, meals: true, guide: false }, ticketPerPerson: null, ticketVerified: false } as never, settings);
    expect(e.isFinal).toBe(false);
    const transport = e.lines.find((l) => l.key === 'transport')!;
    const meals = e.lines.find((l) => l.key === 'meals')!;
    expect(transport.amount).toBe(800000);
    expect(meals.amount).toBe(6 * 2 * 35000);
    expect(e.lines.find((l) => l.key === 'tickets')!.amount).toBeNull();
    expect(e.subtotal).toBe(800000 + 420000);
    expect(e.estimate).toBe(e.subtotal + Math.round(e.subtotal * 0.1));
    expect(e.range.low).toBeLessThan(e.estimate);
    expect(e.range.high).toBeGreaterThan(e.estimate);
    expect(e.lines.every((l) => !l.verified)).toBe(true);
  });
  it('Private Trip: tiket tanpa data harga ditandai belum diketahui, bukan dikarang', () => {
    const e = estimatePrivateTrip({ participants: 2, days: 1, vehicle: 'motor', mealsPerDay: 0, facilities: { transport: false, tickets: true, meals: false, guide: false }, ticketPerPerson: null, ticketVerified: false } as never, settings);
    expect(e.unknown.length).toBeGreaterThan(0);
    expect(e.lines.find((l) => l.key === 'tickets')!.amount).toBeNull();
  });
});

describe('autentikasi dan akses', () => {
  it('registrasi memvalidasi email dan panjang kata sandi', async () => {
    const r = await request(ctx.app).post('/api/auth/register').send({ name: 'A', email: 'bukan-email', password: '123' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
  it('email ganda ditolak dan login salah memberi 401', async () => {
    await request(ctx.app).post('/api/auth/register').send({ name: 'Dua Kali', email: 'dup@example.com', password: 'password123' }).expect(201);
    await request(ctx.app).post('/api/auth/register').send({ name: 'Dua Kali', email: 'DUP@example.com', password: 'password123' }).expect(409);
    await request(ctx.app).post('/api/auth/login').send({ email: 'dup@example.com', password: 'salah-salah' }).expect(401);
  });
  it('rute admin menolak tamu (401) dan pengguna biasa (403)', async () => {
    await request(ctx.app).get('/api/admin/summary').expect(401);
    const u = await agentFor(ctx.app, { email: 'biasa@example.com', password: 'password123' });
    await u.get('/api/admin/summary').expect(403);
    await u.post('/api/admin/trips').send(tripBody()).expect(403);
    await admin.get('/api/admin/summary').expect(200);
  });
  it('pemesanan memerlukan login', async () => {
    await request(ctx.app).post('/api/bookings/open').send(booking(1, 1)).expect(401);
  });
});

describe('katalog dan data demo', () => {
  it('destinasi tersedia dan data belum diverifikasi diberi penanda', async () => {
    const r = await request(ctx.app).get('/api/destinations').expect(200);
    expect(r.body.items.length).toBeGreaterThan(5);
    const unverified = r.body.items.filter((d: { verified: { price: boolean } }) => !d.verified.price);
    expect(unverified.length).toBeGreaterThan(0);
    const meta = await request(ctx.app).get('/api/meta').expect(200);
    expect(meta.body.demoData).toBe(true);
    expect(meta.body.engine.ai).toBe(false);
  });
  it('filter kategori, jenis, dan pencarian bekerja; jarak memerlukan lokasi', async () => {
    const all = (await request(ctx.app).get('/api/destinations')).body.items;
    const kuliner = (await request(ctx.app).get('/api/destinations?kind=kuliner')).body.items;
    expect(kuliner.length).toBeGreaterThan(0);
    expect(kuliner.every((d: { kind: string }) => d.kind === 'kuliner')).toBe(true);
    expect(kuliner.length).toBeLessThan(all.length);
    const q = (await request(ctx.app).get(`/api/destinations?q=${encodeURIComponent(all[0].name.slice(0, 5))}`)).body.items;
    expect(q.length).toBeGreaterThan(0);
    const near = (await request(ctx.app).get('/api/destinations?lat=-7.3&lng=109.23&sort=jarak&maxKm=15')).body;
    expect(near.items.every((d: { distanceKm: number }) => d.distanceKm <= 15)).toBe(true);
    expect(near.distanceNote).toMatch(/garis lurus/);
    const bad = await request(ctx.app).get('/api/destinations?lat=999&lng=0');
    expect(bad.status).toBe(400);
    await request(ctx.app).get('/api/destinations/tidak-ada').expect(404);
  });
});

describe('Open Trip: kapasitas, status, dan pembayaran', () => {
  let tripId: number; let slug: string;
  let u1: Awaited<ReturnType<typeof agentFor>>; let u2: Awaited<ReturnType<typeof agentFor>>;

  beforeAll(async () => {
    const r = await admin.post('/api/admin/trips').send(tripBody({ capacity: 5, minParticipants: 3 })).expect(201);
    tripId = r.body.id; slug = r.body.slug;
    u1 = await agentFor(ctx.app, { email: 'u1@example.com', password: 'password123' });
    u2 = await agentFor(ctx.app, { email: 'u2@example.com', password: 'password123' });
  });

  it('admin memvalidasi trip: minimum > kapasitas, jam, dan batas pendaftaran', async () => {
    const r = await admin.post('/api/admin/trips').send(tripBody({ minParticipants: 9, capacity: 5, endTime: '06:00', registrationDeadline: addDays(40) }));
    expect(r.status).toBe(400);
    expect(r.body.error.fields).toMatchObject({ minParticipants: expect.any(String), endTime: expect.any(String), registrationDeadline: expect.any(String) });
    await admin.post('/api/admin/trips').send(tripBody({ price: -5 })).expect(400);
  });

  it('draf tidak tampil publik; trip terbit tampil dengan kursi nyata', async () => {
    const draft = await admin.post('/api/admin/trips').send(tripBody({ title: 'Draf Rahasia', status: 'draft' })).expect(201);
    const list = (await request(ctx.app).get('/api/trips')).body.items as { slug: string }[];
    expect(list.some((t) => t.slug === draft.body.slug)).toBe(false);
    await request(ctx.app).get(`/api/trips/${draft.body.slug}`).expect(404);
    const t = (await request(ctx.app).get(`/api/trips/${slug}`).expect(200)).body;
    expect(t.seats).toMatchObject({ capacity: 5, held: 0, left: 5 });
    expect(t.state).toBe('tersedia');
  });

  it('validasi formulir pesanan: telepon, email, persetujuan, jumlah peserta', async () => {
    const r = await u1.post('/api/bookings/open').send(booking(tripId, 0, { contactPhone: '123', contactEmail: 'x', agreeTerms: false }));
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields)).toEqual(expect.arrayContaining(['participants', 'contactPhone', 'contactEmail', 'agreeTerms']));
    const over = await u1.post('/api/bookings/open').send(booking(tripId, 11));
    expect(over.status).toBe(400);
  });

  it('pesanan menahan kursi, total benar, status menunggu pembayaran', async () => {
    const r = await u1.post('/api/bookings/open').send(booking(tripId, 3)).expect(201);
    expect(r.body).toMatchObject({ status: 'menunggu_pembayaran', participants: 3, unitPrice: 100000, total: 300000 });
    const t = (await request(ctx.app).get(`/api/trips/${slug}`)).body;
    expect(t.seats).toMatchObject({ held: 3, left: 2, confirmed: 0 });
    expect(t.minimum.met).toBe(false);
  });

  it('kapasitas tidak bisa dilampaui, trip penuh tidak tampil tersedia', async () => {
    const over = await u2.post('/api/bookings/open').send(booking(tripId, 3));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('kursi_tidak_cukup');
    await u2.post('/api/bookings/open').send(booking(tripId, 2)).expect(201);
    const t = (await request(ctx.app).get(`/api/trips/${slug}`)).body;
    expect(t.state).toBe('penuh');
    expect(t.seats.left).toBe(0);
    const full = await u1.post('/api/bookings/open').send(booking(tripId, 1));
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('kursi_penuh');
  });

  it('pemesanan serentak tidak melebihi kapasitas', async () => {
    const t = (await admin.post('/api/admin/trips').send(tripBody({ title: 'Trip Serentak', capacity: 4, minParticipants: 1 })).expect(201)).body;
    const users = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => agentFor(ctx.app, { email: `race${i}@example.com`, password: 'password123' })));
    const results = await Promise.all(users.map((u) => u.post('/api/bookings/open').send(booking(t.id, 1))));
    expect(results.filter((r) => r.status === 201).length).toBe(4);
    expect(results.filter((r) => r.status === 409).length).toBe(2);
    const after = (await request(ctx.app).get(`/api/trips/${t.slug}`)).body;
    expect(after.seats.held).toBe(4);
  });

  it('melapor pembayaran belum mengonfirmasi; hanya verifikasi admin yang mengonfirmasi', async () => {
    const list = (await u1.get('/api/bookings').expect(200)).body.items;
    const b = list.find((x: { trip: { slug: string } | null }) => x.trip?.slug === slug);
    const rep = await u1.post(`/api/bookings/${b.code}/payment`).send({ payerName: 'Budi', reference: 'TRX1' }).expect(200);
    expect(rep.body.status).toBe('menunggu_verifikasi');
    expect(rep.body.status).not.toBe('dikonfirmasi');
    const t1 = (await request(ctx.app).get(`/api/trips/${slug}`)).body;
    expect(t1.seats.confirmed).toBe(0);
    await u1.post(`/api/admin/bookings/${b.id}/verify-payment`).send({ amount: 300000 }).expect(403);
    const low = await admin.post(`/api/admin/bookings/${b.id}/verify-payment`).send({ amount: 100000 });
    expect(low.status).toBe(400);
    const ok = await admin.post(`/api/admin/bookings/${b.id}/verify-payment`).send({ amount: 300000, reference: 'TRX1' }).expect(200);
    expect(ok.body.status).toBe('dikonfirmasi');
    const t2 = (await request(ctx.app).get(`/api/trips/${slug}`)).body;
    expect(t2.seats.confirmed).toBe(3);
    expect(t2.minimum.met).toBe(true);
    const again = await admin.post(`/api/admin/bookings/${b.id}/verify-payment`).send({ amount: 300000 });
    expect(again.status).toBe(409);
  });

  it('pengguna lain tidak dapat melihat atau membatalkan pesanan orang', async () => {
    const b = (await u1.get('/api/bookings')).body.items[0];
    await u2.get(`/api/bookings/${b.code}`).expect(404);
    await u2.post(`/api/bookings/${b.code}/cancel`).send({}).expect(404);
  });

  it('pembatalan melepas kursi; yang sudah dibayar masuk antrean refund; admin mencatat refund tidak melebihi pembayaran', async () => {
    const items = (await u2.get('/api/bookings')).body.items;
    const unpaid = items.find((x: { trip: { slug: string } | null }) => x.trip?.slug === slug);
    const before = (await request(ctx.app).get(`/api/trips/${slug}`)).body.seats.left;
    const c = await u2.post(`/api/bookings/${unpaid.code}/cancel`).send({ reason: 'Berhalangan' }).expect(200);
    expect(c.body.status).toBe('dibatalkan');
    expect((await request(ctx.app).get(`/api/trips/${slug}`)).body.seats.left).toBe(before + 2);
    const paid = (await u1.get('/api/bookings')).body.items.find((x: { trip: { slug: string } | null }) => x.trip?.slug === slug);
    const cp = await u1.post(`/api/bookings/${paid.code}/cancel`).send({}).expect(200);
    expect(cp.body.refundStatus).toBe('diminta');
    const tooMuch = await admin.post(`/api/admin/bookings/${paid.id}/refund-complete`).send({ amount: 999999 });
    expect(tooMuch.status).toBe(400);
    const ok = await admin.post(`/api/admin/bookings/${paid.id}/refund-complete`).send({ amount: 300000 }).expect(200);
    expect(ok.body.refundStatus).toBe('selesai');
  });

  it('kapasitas tidak dapat diturunkan di bawah kursi terpesan', async () => {
    const t = (await admin.post('/api/admin/trips').send(tripBody({ title: 'Trip Kapasitas', capacity: 6, minParticipants: 1 })).expect(201)).body;
    await u1.post('/api/bookings/open').send(booking(t.id, 4)).expect(201);
    const r = await admin.put(`/api/admin/trips/${t.id}`).send(tripBody({ title: 'Trip Kapasitas', capacity: 3, minParticipants: 1 }));
    expect(r.status).toBe(400);
    expect(r.body.error.fields.capacity).toBeDefined();
  });

  it('pembatalan trip membatalkan semua pesanan dan menolak pesanan baru', async () => {
    const t = (await admin.post('/api/admin/trips').send(tripBody({ title: 'Trip Batal', capacity: 6, minParticipants: 1 })).expect(201)).body;
    const b = (await u1.post('/api/bookings/open').send(booking(t.id, 2)).expect(201)).body;
    await admin.post(`/api/admin/trips/${t.id}/cancel`).send({ reason: 'Cuaca ekstrem' }).expect(200);
    expect((await u1.get(`/api/bookings/${b.code}`)).body.status).toBe('dibatalkan');
    const r = await u2.post('/api/bookings/open').send(booking(t.id, 1));
    expect(r.status).toBe(409);
  });

  it('pesanan kedaluwarsa melepas kursi', async () => {
    const t = (await admin.post('/api/admin/trips').send(tripBody({ title: 'Trip Kedaluwarsa', capacity: 3, minParticipants: 1 })).expect(201)).body;
    const b = (await u1.post('/api/bookings/open').send(booking(t.id, 3)).expect(201)).body;
    ctx.db.prepare("UPDATE bookings SET expires_at = '2000-01-01T00:00:00.000Z' WHERE code = ?").run(b.code);
    const after = (await request(ctx.app).get(`/api/trips/${t.slug}`)).body;
    expect(after.seats.left).toBe(3);
    expect((await u1.get(`/api/bookings/${b.code}`)).body.status).toBe('dibatalkan');
  });
});

describe('Private Trip', () => {
  let u: Awaited<ReturnType<typeof agentFor>>;
  beforeAll(async () => { u = await agentFor(ctx.app, { email: 'priv@example.com', password: 'password123' }); });
  const body = (over: Record<string, unknown> = {}) => ({
    contactName: 'Sari', contactPhone: '081298765432', contactEmail: 'sari@example.com', desiredDate: addDays(30), flexibleDates: false, participants: 6, days: 1,
    origin: 'Hotel di Purwokerto', destinationIds: [], tourTypes: ['alam'], vehicle: 'mobil_sopir', budget: { mode: 'total', amount: 2500000 },
    facilities: { transport: true, tickets: false, meals: true, guide: false }, mealsPerDay: 2, notes: '', itineraryDraft: null, agreeTerms: true, ...over,
  });

  it('estimasi publik diberi label bukan final', async () => {
    const r = await request(ctx.app).post('/api/private-trips/estimate').send({ participants: 6, days: 1, vehicle: 'mobil_sopir', facilities: { transport: true, tickets: false, meals: true, guide: false }, mealsPerDay: 2, destinationIds: [] }).expect(200);
    expect(r.body.isFinal).toBe(false);
    expect(r.body.notes.join(' ')).toMatch(/bukan harga final/);
  });

  it('permintaan tidak terkonfirmasi sebelum penawaran admin; tidak bisa dibayar dulu', async () => {
    const r = await u.post('/api/bookings/private').send(body()).expect(201);
    expect(r.body.status).toBe('menunggu_konfirmasi');
    expect(r.body.total).toBe(0);
    expect(r.body.actions.canPay).toBe(false);
    expect(r.body.details.estimate.isFinal).toBe(false);
    const pay = await u.post(`/api/bookings/${r.body.code}/payment`).send({ payerName: 'Sari' });
    expect(pay.status).toBeGreaterThanOrEqual(400);
    const verify = await admin.post(`/api/admin/bookings/${r.body.id}/verify-payment`).send({ amount: 1 });
    expect(verify.status).toBeGreaterThanOrEqual(400);
    const quote = await admin.post(`/api/admin/bookings/${r.body.id}/quote`).send({ finalPrice: 1900000, lines: [{ label: 'Mobil', amount: 1000000 }], validDays: 3 });
    expect(quote.status).toBe(400);
    const okq = await admin.post(`/api/admin/bookings/${r.body.id}/quote`).send({ finalPrice: 1900000, note: 'Termasuk BBM', included: ['Mobil + sopir'], validDays: 3 }).expect(200);
    expect(okq.body).toMatchObject({ status: 'menunggu_pembayaran', total: 1900000 });
    expect(okq.body.details.quote.included).toContain('Mobil + sopir');
    const rep = await u.post(`/api/bookings/${r.body.code}/payment`).send({ payerName: 'Sari' }).expect(200);
    expect(rep.body.status).toBe('menunggu_verifikasi');
    const conf = await admin.post(`/api/admin/bookings/${r.body.id}/verify-payment`).send({ amount: 1900000 }).expect(200);
    expect(conf.body.status).toBe('dikonfirmasi');
  });

  it('validasi: tanggal lampau dan peserta tidak valid ditolak', async () => {
    const past = await u.post('/api/bookings/private').send(body({ desiredDate: '2020-01-01' }));
    expect(past.status).toBe(400);
    const zero = await u.post('/api/bookings/private').send(body({ participants: 0 }));
    expect(zero.status).toBe(400);
  });
});

describe('AI Planner', () => {
  const input = (over: Record<string, unknown> = {}) => ({
    participants: 4, startDate: addDays(7), days: 1, dayStart: '08:00', dayEnd: '18:00', origin: { label: 'Purwokerto', lat: -7.4242, lng: 109.2302 },
    vehicle: 'mobil_pribadi', budget: { mode: 'per_person', amount: 300000 }, interests: ['alam', 'kuliner'], pace: 'sedang', foodPrefs: [], maxLegMinutes: null, mustVisit: [], avoid: [], accessibility: [], ...over,
  });

  it('menghasilkan itinerary valid: tanpa tumpang tindih, dalam jam kerja, dengan pemeriksaan dan label mode demo', async () => {
    const r = await request(ctx.app).post('/api/planner/generate').send(input()).expect(200);
    const it = r.body;
    expect(it.engine.mode).toBe('demo');
    expect(it.disclaimer).toMatch(/berubah/);
    expect(it.checks.map((c: { key: string }) => c.key)).toEqual(expect.arrayContaining(['jadwal', 'perjalanan', 'jam_operasional', 'anggaran']));
    const stops = it.days[0].stops as { arrive: string; depart: string }[];
    expect(stops.length).toBeGreaterThan(0);
    let prev = '08:00';
    for (const s of stops) { expect(s.arrive >= prev).toBe(true); expect(s.depart > s.arrive).toBe(true); prev = s.depart; }
    expect(it.days[0].returnLeg.backAt <= '18:00' || it.warnings.some((w: { level: string }) => w.level !== 'info')).toBe(true);
    for (const s of it.days[0].stops as { flags: string[]; pricePerPerson: unknown }[]) {
      // Harga yang belum terverifikasi harus ditandai, bukan disajikan sebagai pasti.
      if (s.pricePerPerson) expect(Array.isArray(s.flags)).toBe(true);
    }
    expect(it.budget.total.low).toBeLessThanOrEqual(it.budget.total.high);
  });

  it('destinasi yang dihindari tidak muncul dan destinasi wajib muncul', async () => {
    const dests = (await request(ctx.app).get('/api/destinations?kind=wisata')).body.items as { id: string }[];
    const must = dests[0].id; const avoid = dests[1].id;
    const it = (await request(ctx.app).post('/api/planner/generate').send(input({ mustVisit: [must], avoid: [avoid] })).expect(200)).body;
    const ids = it.days.flatMap((d: { stops: { destinationId: string }[] }) => d.stops.map((s) => s.destinationId));
    expect(ids).toContain(must);
    expect(ids).not.toContain(avoid);
  });

  it('validasi input: tanggal lampau, jam terlalu pendek, peserta 0, titik di luar Jawa Tengah', async () => {
    const r1 = await request(ctx.app).post('/api/planner/generate').send(input({ startDate: '2020-01-01' }));
    expect(r1.status).toBe(400);
    const r2 = await request(ctx.app).post('/api/planner/generate').send(input({ dayEnd: '09:00' }));
    expect(r2.status).toBe(400);
    const r3 = await request(ctx.app).post('/api/planner/generate').send(input({ participants: 0 }));
    expect(r3.status).toBe(400);
    const r4 = await request(ctx.app).post('/api/planner/generate').send(input({ origin: { label: 'Jakarta', lat: -6.2, lng: 106.8 } }));
    expect(r4.status).toBe(400);
  });

  it('anggaran sangat kecil menghasilkan peringatan, bukan klaim sesuai anggaran', async () => {
    const it = (await request(ctx.app).post('/api/planner/generate').send(input({ budget: { mode: 'per_person', amount: 1000 } })).expect(200)).body;
    expect(['melebihi', 'mungkin_lebih']).toContain(it.budget.status);
    expect(it.checks.find((c: { key: string }) => c.key === 'anggaran').status).not.toBe('ok');
  });

  it('recompute setelah menghapus/mengurutkan ulang tetap konsisten', async () => {
    const it = (await request(ctx.app).post('/api/planner/generate').send(input()).expect(200)).body;
    const plan = it.days.map((d: { stops: { destinationId: string; role: string }[] }) => d.stops.map((s) => ({ destinationId: s.destinationId, role: s.role })));
    const reversed = [plan[0].slice().reverse()];
    const re = (await request(ctx.app).post('/api/planner/recompute').send({ input: it.input, plan: reversed, meta: { title: it.title, summary: it.summary, engine: it.engine } }).expect(200)).body;
    expect(re.days[0].stops.length).toBe(plan[0].length);
    const one = (await request(ctx.app).post('/api/planner/recompute').send({ input: it.input, plan: [plan[0].slice(0, 1)], meta: { title: it.title, summary: it.summary, engine: it.engine } }).expect(200)).body;
    expect(one.days[0].stops.length).toBe(1);
  });

  it('itinerary dapat disimpan, dibagikan tanpa data pribadi, dan hanya milik pemiliknya', async () => {
    const u = await agentFor(ctx.app, { email: 'plan@example.com', password: 'password123' });
    const other = await agentFor(ctx.app, { email: 'plan2@example.com', password: 'password123' });
    const it = (await request(ctx.app).post('/api/planner/generate').send(input()).expect(200)).body;
    const plan = it.days.map((d: { stops: { destinationId: string; role: string }[] }) => d.stops.map((s) => ({ destinationId: s.destinationId, role: s.role })));
    const saved = await u.post('/api/itineraries').send({ title: it.title, summary: it.summary, input: it.input, plan, engine: it.engine }).expect(201);
    await other.get(`/api/itineraries/${saved.body.id}`).expect(404);
    await request(ctx.app).get('/api/itineraries').expect(401);
    const sh = await u.post(`/api/itineraries/${saved.body.id}/share`).send({ enabled: true }).expect(200);
    const pub = await request(ctx.app).get(`/api/share/${sh.body.shareToken}`).expect(200);
    expect(JSON.stringify(pub.body)).not.toContain('plan@example.com');
    await u.post(`/api/itineraries/${saved.body.id}/share`).send({ enabled: false }).expect(200);
    await request(ctx.app).get(`/api/share/${sh.body.shareToken}`).expect(404);
  });
});

describe('Admin: destinasi, pengaturan, ekspor', () => {
  const dest = (over: Record<string, unknown> = {}) => ({
    name: 'Tempat Uji', kind: 'wisata', categoryId: '', summary: 'Tempat untuk pengujian otomatis.', description: '', addressText: 'Banyumas', lat: -7.35, lng: 109.2,
    avgDurationMin: 60, openHours: null, ...over,
  });
  let categoryId: string;
  beforeAll(async () => { categoryId = (await request(ctx.app).get('/api/meta')).body.categories[0].id; });

  it('validasi destinasi: koordinat di luar wilayah, jam terbalik, verifikasi tanpa data', async () => {
    const r = await admin.post('/api/admin/destinations').send(dest({ categoryId, lat: 10, openHours: { mon: ['17:00', '08:00'] }, priceVerified: true }));
    expect(r.status).toBe(400);
    expect(r.body.error.fields.lat).toBeDefined();
    const nocat = await admin.post('/api/admin/destinations').send(dest({ categoryId: 'tidak-ada' }));
    expect(nocat.status).toBe(400);
  });

  it('CRUD destinasi, penanda verifikasi, dan visibilitas publik', async () => {
    const c = await admin.post('/api/admin/destinations').send(dest({ categoryId, priceMin: 10000, priceMax: 20000, priceVerified: true })).expect(201);
    const id = c.body.id;
    expect(c.body.verified.price).toBe(true);
    expect(c.body.verified.hours).toBe(false);
    expect((await request(ctx.app).get(`/api/destinations/${id}`).expect(200)).body.price).toEqual({ min: 10000, max: 20000 });
    await admin.post('/api/admin/destinations').send(dest({ categoryId })).expect(409);
    await admin.put(`/api/admin/destinations/${id}`).send(dest({ categoryId, isPublished: false, priceMin: 10000, priceMax: 20000 })).expect(200);
    const pub = (await request(ctx.app).get('/api/destinations')).body.items as { id: string }[];
    expect(pub.some((d) => d.id === id)).toBe(false);
    await admin.delete(`/api/admin/destinations/${id}`).expect(200);
    await admin.delete(`/api/admin/destinations/${id}`).expect(404);
  });

  it('upload hanya menerima gambar sungguhan', async () => {
    const r = await admin.post('/api/admin/upload').attach('file', Buffer.from('<?php echo 1; ?>'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(r.status).toBe(400);
  });

  it('pengaturan menolak kunci tak dikenal dan angka tidak valid; tarif internal tidak bocor ke publik', async () => {
    await admin.put('/api/admin/settings').send({ items: [{ key: 'tidak.ada', value: '1' }] }).expect(400);
    await admin.put('/api/admin/settings').send({ items: [{ key: 'cost.meal_per_person', value: 'abc' }] }).expect(400);
    await admin.put('/api/admin/settings').send({ items: [{ key: 'cost.meal_per_person', value: '-5' }] }).expect(400);
    await admin.put('/api/admin/settings').send({ items: [{ key: 'contact.whatsapp', value: '081200000000' }] }).expect(200);
    const meta = (await request(ctx.app).get('/api/meta')).body;
    expect(meta.settings.contact.whatsapp).toBe('081200000000');
    expect(JSON.stringify(meta)).not.toMatch(/cost\.|private\.margin/);
  });

  it('ringkasan hanya menghitung pembayaran terverifikasi; ekspor CSV tersedia untuk admin saja', async () => {
    const s = (await admin.get('/api/admin/summary').expect(200)).body;
    expect(s.totals.revenue).toBeGreaterThan(0);
    const csv = await admin.get('/api/admin/export/bookings').expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('Kode');
    await request(ctx.app).get('/api/admin/export/bookings').expect(401);
  });

  it('pengeluaran divalidasi dan memengaruhi selisih', async () => {
    await admin.post('/api/admin/expenses').send({ spentOn: '2026-13-40', category: 'X', amount: 1 }).expect(400);
    await admin.post('/api/admin/expenses').send({ spentOn: addDays(0), category: 'Transportasi', amount: -1 }).expect(400);
    const before = (await admin.get('/api/admin/summary')).body.totals.net;
    await admin.post('/api/admin/expenses').send({ spentOn: addDays(0), category: 'Transportasi', amount: 50000 }).expect(201);
    const after = (await admin.get('/api/admin/summary')).body.totals.net;
    expect(before - after).toBe(50000);
  });
});
