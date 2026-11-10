import { z } from 'zod';
import { type Db, all } from './db.js';
import { type LatLng, addDays, dayKeyOf, haversineKm, isValidDate, toHHMM, toMin, type DayKey } from './geo.js';
import { type AiProvider } from './ai.js';
import { type RouteProvider, type Vehicle, estimateLeg } from './routing.js';
import { type SettingsMap, num } from './settings.js';

/* ------------------------------------------------------------------ */
/* Tipe dan skema input                                                 */
/* ------------------------------------------------------------------ */

export const INTERESTS = ['alam', 'kuliner', 'budaya', 'keluarga', 'hidden_gems', 'foto', 'kafe'] as const;
export const PACES = ['santai', 'sedang', 'padat'] as const;
export const VEHICLES = ['motor', 'mobil_pribadi', 'sewa', 'umum'] as const;

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Gunakan format JJ:MM').refine((v) => !Number.isNaN(toMin(v)), 'Jam tidak valid');

export const plannerInputSchema = z
  .object({
    participants: z.number({ invalid_type_error: 'Jumlah peserta harus berupa angka' }).int().min(1, 'Minimal 1 peserta').max(50, 'Maksimal 50 peserta'),
    startDate: z.string().refine(isValidDate, 'Tanggal tidak valid'),
    days: z.number().int().min(1, 'Minimal 1 hari').max(5, 'Maksimal 5 hari'),
    dayStart: hhmm,
    dayEnd: hhmm,
    origin: z.object({
      label: z.string().min(1, 'Isi titik keberangkatan').max(120),
      lat: z.number().min(-9).max(-6, 'Titik keberangkatan harus di sekitar Jawa Tengah'),
      lng: z.number().min(108).max(111, 'Titik keberangkatan harus di sekitar Jawa Tengah'),
    }),
    vehicle: z.enum(VEHICLES),
    budget: z.object({
      mode: z.enum(['per_person', 'total']),
      amount: z.number().int().min(0).max(1_000_000_000).nullable(),
    }),
    interests: z.array(z.enum(INTERESTS)).max(7).default([]),
    pace: z.enum(PACES).default('sedang'),
    foodPrefs: z.array(z.enum(['halal', 'vegetarian', 'tidak_pedas'])).default([]),
    maxLegMinutes: z.number().int().min(10).max(240).nullable().default(null),
    mustVisit: z.array(z.string().max(80)).max(20).default([]),
    avoid: z.array(z.string().max(80)).max(20).default([]),
    accessibility: z.array(z.enum(['kursi_roda', 'lansia', 'anak_kecil'])).default([]),
  })
  .superRefine((v, ctx) => {
    if (toMin(v.dayEnd) - toMin(v.dayStart) < 180) {
      ctx.addIssue({ code: 'custom', path: ['dayEnd'], message: 'Jam selesai minimal 3 jam setelah jam mulai' });
    }
  });

export type PlannerInput = z.infer<typeof plannerInputSchema>;

export interface Dest {
  id: string;
  name: string;
  kind: 'wisata' | 'kuliner' | 'kafe';
  categoryId: string;
  categoryName: string;
  summary: string;
  addressText: string | null;
  lat: number;
  lng: number;
  coordsVerified: boolean;
  priceMin: number | null;
  priceMax: number | null;
  priceVerified: boolean;
  avgDurationMin: number;
  openHours: Partial<Record<DayKey, [string, string] | null>> | null;
  hoursVerified: boolean;
  familyFriendly: boolean;
  accessibility: string[];
  tags: string[];
  foodTags: string[];
  imageUrl: string | null;
}

type DestRow = Omit<Dest, 'coordsVerified' | 'priceVerified' | 'hoursVerified' | 'familyFriendly' | 'openHours' | 'accessibility' | 'tags' | 'foodTags' | 'categoryName' | 'categoryId' | 'addressText' | 'avgDurationMin' | 'priceMin' | 'priceMax' | 'imageUrl'> & {
  category_id: string; category_name: string; address_text: string | null; avg_duration_min: number;
  price_min: number | null; price_max: number | null; image_url: string | null;
  coords_verified: number; price_verified: number; hours_verified: number; family_friendly: number;
  open_hours: string | null; accessibility: string; tags: string; food_tags: string;
};

const arr = (s: string | null | undefined): string[] => {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
};

export function rowToDest(r: DestRow): Dest {
  let openHours: Dest['openHours'] = null;
  try { openHours = r.open_hours ? JSON.parse(r.open_hours) : null; } catch { openHours = null; }
  return {
    id: r.id, name: r.name, kind: r.kind, categoryId: r.category_id, categoryName: r.category_name,
    summary: r.summary, addressText: r.address_text, lat: r.lat, lng: r.lng,
    coordsVerified: !!r.coords_verified, priceMin: r.price_min, priceMax: r.price_max, priceVerified: !!r.price_verified,
    avgDurationMin: r.avg_duration_min, openHours, hoursVerified: !!r.hours_verified, familyFriendly: !!r.family_friendly,
    accessibility: arr(r.accessibility), tags: arr(r.tags), foodTags: arr(r.food_tags), imageUrl: r.image_url,
  };
}

export function loadDests(db: Db, includeUnpublished = false): Dest[] {
  const rows = all<DestRow>(
    db,
    `SELECT d.*, c.name AS category_name FROM destinations d JOIN categories c ON c.id = d.category_id
     ${includeUnpublished ? '' : 'WHERE d.is_published = 1'} ORDER BY d.name`,
  );
  return rows.map(rowToDest);
}

/* ------------------------------------------------------------------ */
/* Tipe keluaran                                                        */
/* ------------------------------------------------------------------ */

export type StopRole = 'visit' | 'meal';
export interface PlanEntry { destinationId: string; role: StopRole }

export type Flag = 'harga_perlu_konfirmasi' | 'jam_perlu_konfirmasi' | 'lokasi_perkiraan';

export interface Money { low: number; mid: number; high: number }

export interface StopPlan {
  destinationId: string;
  role: StopRole;
  dest: Pick<Dest, 'name' | 'kind' | 'categoryName' | 'addressText' | 'lat' | 'lng' | 'summary' | 'imageUrl' | 'familyFriendly'>;
  arrive: string;
  depart: string;
  durationMin: number;
  waitMin: number;
  travel: { from: string; distanceKm: number; minutes: number; source: 'estimasi_garis_lurus' | 'osrm' };
  pricePerPerson: { min: number; max: number } | null;
  costKind: 'tiket' | 'makan';
  groupCost: Money | null;
  hours: { open: string; close: string } | null;
  flags: Flag[];
  tip?: string;
}

export interface DayPlan {
  dayIndex: number;
  date: string;
  stops: StopPlan[];
  returnLeg: { distanceKm: number; minutes: number; source: 'estimasi_garis_lurus' | 'osrm'; backAt: string };
  totals: { distanceKm: number; travelMin: number; tickets: Money; food: Money; transport: number };
}

export interface Warning {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  day?: number;
  destinationId?: string;
}

export interface BudgetSummary {
  tickets: Money;
  food: Money;
  transport: number;
  total: Money;
  perPerson: Money;
  unknownPriceCount: number;
  allowedTotal: number | null;
  status: 'ok' | 'mungkin_lebih' | 'melebihi' | 'tidak_diatur';
  note: string;
}

export interface Check { key: 'jadwal' | 'perjalanan' | 'jam_operasional' | 'anggaran'; label: string; status: 'ok' | 'perhatian' | 'gagal' | 'belum_pasti'; detail: string }

export interface ScheduleResult { days: DayPlan[]; budget: BudgetSummary; warnings: Warning[]; checks: Check[] }

export interface Itinerary extends ScheduleResult {
  title: string;
  summary: string;
  input: PlannerInput;
  engine: { mode: 'demo' | 'ai'; routing: string; note: string };
  generatedAt: string;
  disclaimer: string;
}

export const DISCLAIMER =
  'Estimasi waktu tempuh dan biaya dapat berubah sesuai kondisi lapangan (lalu lintas, cuaca, antrean, perubahan tarif). Informasi berlabel "Perlu konfirmasi" belum diverifikasi oleh tim People Plesir.';

/* ------------------------------------------------------------------ */
/* Utilitas biaya                                                       */
/* ------------------------------------------------------------------ */

const round500 = (n: number) => Math.round(n / 500) * 500;
const zero = (): Money => ({ low: 0, mid: 0, high: 0 });
const addMoney = (a: Money, b: Money): Money => ({ low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high });

function priceOf(d: Dest): { min: number; max: number } | null {
  if (d.priceMin == null && d.priceMax == null) return null;
  const min = d.priceMin ?? d.priceMax!;
  const max = d.priceMax ?? d.priceMin!;
  return { min, max: Math.max(min, max) };
}

export function transportCost(vehicle: Vehicle, participants: number, totalKm: number, days: number, s: SettingsMap): number {
  switch (vehicle) {
    case 'motor': return Math.ceil(participants / 2) * totalKm * num(s, 'cost.motor_per_km', 600);
    case 'mobil_pribadi': return Math.ceil(participants / 4) * totalKm * num(s, 'cost.mobil_pribadi_per_km', 1800);
    case 'sewa': return Math.ceil(participants / 6) * (days * num(s, 'cost.sewa_per_day', 600000) + totalKm * num(s, 'cost.sewa_per_km', 1800));
    case 'umum': return participants * totalKm * num(s, 'cost.umum_per_km', 1500);
  }
}

/* ------------------------------------------------------------------ */
/* Penjadwalan (dipakai untuk generate DAN untuk edit manual)           */
/* ------------------------------------------------------------------ */

export interface Ctx {
  input: PlannerInput;
  dests: Map<string, Dest>;
  router: RouteProvider;
  settings: SettingsMap;
  tips?: Record<string, string>;
}

export async function buildSchedule(ctx: Ctx, plan: PlanEntry[][]): Promise<ScheduleResult> {
  const { input, dests, router, settings } = ctx;
  const origin: LatLng = { lat: input.origin.lat, lng: input.origin.lng };
  const warnings: Warning[] = [];
  const days: DayPlan[] = [];
  const dayStart = toMin(input.dayStart);
  const dayEnd = toMin(input.dayEnd);
  let unknownPrice = 0;
  let totalKm = 0;

  for (let di = 0; di < input.days; di++) {
    const date = addDays(input.startDate, di);
    const dk = dayKeyOf(date);
    const entries = plan[di] ?? [];
    const stops: StopPlan[] = [];
    let t = dayStart;
    let cur: LatLng = origin;
    let curLabel = input.origin.label;
    let dayKm = 0;
    let dayTravel = 0;
    let tickets = zero();
    let food = zero();

    if (entries.length === 0) {
      warnings.push({ level: 'info', code: 'empty_day', day: di, message: `Hari ${di + 1} belum memiliki destinasi.` });
    }

    for (const e of entries) {
      const d = dests.get(e.destinationId);
      if (!d) {
        warnings.push({ level: 'warn', code: 'unknown_destination', day: di, destinationId: e.destinationId, message: `Destinasi "${e.destinationId}" tidak ditemukan dan dilewati.` });
        continue;
      }
      const leg = await router.leg(cur, d, input.vehicle, settings);
      let arrive = t + leg.minutes;
      let wait = 0;
      let hours: StopPlan['hours'] = null;
      const flags: Flag[] = [];
      if (!d.coordsVerified) flags.push('lokasi_perkiraan');

      if (d.hoursVerified && d.openHours) {
        const win = d.openHours[dk];
        if (!win) {
          warnings.push({ level: 'error', code: 'closed_day', day: di, destinationId: d.id, message: `${d.name} tutup pada hari ini (${date}).` });
        } else {
          hours = { open: win[0], close: win[1] };
          const open = toMin(win[0]);
          const close = toMin(win[1]);
          if (arrive < open) {
            wait = open - arrive;
            arrive = open;
            warnings.push({ level: 'info', code: 'wait_open', day: di, destinationId: d.id, message: `Tiba di ${d.name} sebelum buka; menunggu ${wait} menit hingga ${win[0]}.` });
          }
          if (arrive + d.avgDurationMin > close) {
            warnings.push({ level: 'error', code: 'after_close', day: di, destinationId: d.id, message: `Kunjungan ke ${d.name} berakhir ${toHHMM(arrive + d.avgDurationMin)}, melewati jam tutup ${win[1]}.` });
          }
        }
      } else {
        flags.push('jam_perlu_konfirmasi');
      }

      const depart = arrive + d.avgDurationMin;
      if (depart > dayEnd) {
        warnings.push({ level: 'error', code: 'time_overrun', day: di, destinationId: d.id, message: `Kunjungan ke ${d.name} selesai ${toHHMM(depart)}, melewati jam selesai ${input.dayEnd}.` });
      }
      if (input.maxLegMinutes && leg.minutes > input.maxLegMinutes) {
        warnings.push({ level: 'warn', code: 'leg_too_long', day: di, destinationId: d.id, message: `Perjalanan ke ${d.name} sekitar ${leg.minutes} menit, melebihi batas ${input.maxLegMinutes} menit.` });
      }

      const price = priceOf(d);
      const costKind: StopPlan['costKind'] = d.kind === 'wisata' ? 'tiket' : 'makan';
      let groupCost: Money | null = null;
      if (price) {
        groupCost = { low: price.min * input.participants, mid: round500((price.min + price.max) / 2) * input.participants, high: price.max * input.participants };
        if (!d.priceVerified) flags.push('harga_perlu_konfirmasi');
        if (costKind === 'tiket') tickets = addMoney(tickets, groupCost); else food = addMoney(food, groupCost);
      } else {
        flags.push('harga_perlu_konfirmasi');
        unknownPrice += 1;
        if (e.role === 'meal') {
          const per = num(settings, 'cost.meal_per_person', 30000);
          groupCost = { low: per * input.participants, mid: per * input.participants, high: per * input.participants };
          food = addMoney(food, groupCost);
        }
      }

      stops.push({
        destinationId: d.id, role: e.role,
        dest: { name: d.name, kind: d.kind, categoryName: d.categoryName, addressText: d.addressText, lat: d.lat, lng: d.lng, summary: d.summary, imageUrl: d.imageUrl, familyFriendly: d.familyFriendly },
        arrive: toHHMM(arrive), depart: toHHMM(depart), durationMin: d.avgDurationMin, waitMin: wait,
        travel: { from: curLabel, distanceKm: leg.distanceKm, minutes: leg.minutes, source: leg.source },
        pricePerPerson: price, costKind, groupCost, hours, flags,
        tip: ctx.tips?.[d.id],
      });
      dayKm += leg.distanceKm;
      dayTravel += leg.minutes;
      t = depart;
      cur = d;
      curLabel = d.name;
    }

    const ret = entries.length ? await router.leg(cur, origin, input.vehicle, settings) : { distanceKm: 0, minutes: 0, source: 'estimasi_garis_lurus' as const };
    const backAt = t + ret.minutes;
    if (entries.length && backAt > dayEnd) {
      warnings.push({ level: 'error', code: 'return_overrun', day: di, message: `Hari ${di + 1}: tiba kembali di ${input.origin.label} sekitar ${toHHMM(backAt)}, melewati jam selesai ${input.dayEnd}.` });
    }
    dayKm += ret.distanceKm;
    dayTravel += ret.minutes;
    totalKm += dayKm;
    const transport = Math.round(transportCost(input.vehicle, input.participants, dayKm, 1, settings));
    days.push({
      dayIndex: di, date, stops,
      returnLeg: { distanceKm: ret.distanceKm, minutes: ret.minutes, source: ret.source, backAt: toHHMM(backAt) },
      totals: { distanceKm: Math.round(dayKm * 10) / 10, travelMin: dayTravel, tickets, food, transport },
    });
  }

  // Transportasi total dihitung ulang dari km total agar tarif sewa harian tidak dihitung per hari secara ganda.
  const hasStops = days.some((d) => d.stops.length > 0);
  const activeDays = days.filter((d) => d.stops.length > 0).length;
  const transport = hasStops ? Math.round(transportCost(input.vehicle, input.participants, totalKm, activeDays, settings)) : 0;
  const tickets = days.reduce((m, d) => addMoney(m, d.totals.tickets), zero());
  const food = days.reduce((m, d) => addMoney(m, d.totals.food), zero());
  const total: Money = { low: tickets.low + food.low + transport, mid: tickets.mid + food.mid + transport, high: tickets.high + food.high + transport };

  const allowedTotal = input.budget.amount == null ? null : input.budget.mode === 'total' ? input.budget.amount : input.budget.amount * input.participants;
  let status: BudgetSummary['status'] = 'tidak_diatur';
  let note = 'Anggaran tidak diisi; ringkasan biaya hanya sebagai gambaran.';
  if (allowedTotal != null) {
    if (total.mid > allowedTotal) { status = 'melebihi'; note = 'Estimasi biaya melebihi anggaran. Kurangi destinasi berbayar atau naikkan anggaran.'; }
    else if (total.high > allowedTotal) { status = 'mungkin_lebih'; note = 'Estimasi tengah masih di dalam anggaran, tetapi batas atas harga bisa melampauinya.'; }
    else { status = 'ok'; note = 'Estimasi biaya (termasuk batas atas harga) masih di dalam anggaran.'; }
  }
  if (unknownPrice > 0) note += ` ${unknownPrice} tempat belum punya data harga (Perlu konfirmasi).`;

  const budget: BudgetSummary = {
    tickets, food, transport, total,
    perPerson: { low: Math.round(total.low / input.participants), mid: Math.round(total.mid / input.participants), high: Math.round(total.high / input.participants) },
    unknownPriceCount: unknownPrice, allowedTotal, status, note,
  };
  if (status === 'melebihi') warnings.push({ level: 'error', code: 'over_budget', message: note });

  return { days, budget, warnings, checks: deriveChecks(days, warnings, budget) };
}

export function deriveChecks(days: DayPlan[], warnings: Warning[], budget: BudgetSummary): Check[] {
  const has = (...codes: string[]) => warnings.filter((w) => codes.includes(w.code));
  const stops = days.flatMap((d) => d.stops);
  const unverifiedHours = stops.filter((s) => s.flags.includes('jam_perlu_konfirmasi')).length;
  const timeErr = has('time_overrun', 'return_overrun');
  const hoursErr = has('closed_day', 'after_close');
  const legWarn = has('leg_too_long');
  const estimated = stops.some((s) => s.travel.source === 'estimasi_garis_lurus');
  return [
    {
      key: 'jadwal', label: 'Jadwal masuk akal',
      status: timeErr.length ? 'gagal' : 'ok',
      detail: timeErr.length ? timeErr[0].message : 'Tidak ada jadwal yang tumpang tindih dan semua kunjungan selesai sebelum jam selesai.',
    },
    {
      key: 'perjalanan', label: 'Waktu tempuh cukup',
      status: legWarn.length ? 'perhatian' : estimated ? 'belum_pasti' : 'ok',
      detail: legWarn.length ? legWarn[0].message : estimated ? 'Waktu tempuh adalah estimasi garis lurus; belum dari layanan rute.' : 'Waktu tempuh dihitung dari layanan rute.',
    },
    {
      key: 'jam_operasional', label: 'Jam operasional sesuai',
      status: hoursErr.length ? 'gagal' : unverifiedHours > 0 ? 'belum_pasti' : 'ok',
      detail: hoursErr.length ? hoursErr[0].message : unverifiedHours > 0 ? `${unverifiedHours} tempat belum punya jam operasional terverifikasi (Perlu konfirmasi).` : 'Semua kunjungan berada dalam jam operasional terverifikasi.',
    },
    {
      key: 'anggaran', label: 'Biaya sesuai anggaran',
      status: budget.status === 'melebihi' ? 'gagal' : budget.status === 'mungkin_lebih' ? 'perhatian' : budget.status === 'tidak_diatur' ? 'belum_pasti' : 'ok',
      detail: budget.note,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Pemilihan destinasi dan penyusunan rute                              */
/* ------------------------------------------------------------------ */

const INTEREST_CATEGORIES: Record<string, string[]> = {
  alam: ['alam-air-terjun', 'pegunungan-hutan'],
  budaya: ['budaya-sejarah'],
  keluarga: ['keluarga'],
  kuliner: ['kuliner-banyumasan'],
  kafe: ['kafe-santai'],
};

const PER_DAY: Record<PlannerInput['pace'], number> = { santai: 3, sedang: 4, padat: 5 };

const isMealPlace = (d: Dest) => d.kind === 'kuliner' && !d.tags.includes('camilan');

function scoreDest(d: Dest, input: PlannerInput, origin: LatLng): number {
  let s = 1;
  const wanted = new Set(input.interests.flatMap((i) => INTEREST_CATEGORIES[i] ?? []));
  if (wanted.has(d.categoryId)) s += 3;
  if (input.interests.includes('hidden_gems') && d.tags.includes('hidden_gem')) s += 2.5;
  if (input.interests.includes('foto') && d.tags.includes('foto')) s += 1.5;
  if (input.interests.includes('kafe') && d.kind === 'kafe') s += 1.5;
  if (input.interests.includes('keluarga') && d.familyFriendly) s += 2;
  if (input.accessibility.includes('anak_kecil') && d.familyFriendly) s += 1;
  if (input.accessibility.includes('lansia') && d.accessibility.includes('lansia')) s += 1;
  if (input.mustVisit.includes(d.id)) s += 100;
  s -= haversineKm(origin, d) / 12;
  if (input.pace === 'santai' && d.avgDurationMin > 150) s -= 0.5;
  const price = priceOf(d);
  if (input.budget.amount != null && input.budget.mode === 'per_person' && input.budget.amount < 100000 && price && price.max > 20000) s -= 0.5;
  return s;
}

function eligible(d: Dest, input: PlannerInput): boolean {
  if (input.avoid.includes(d.id)) return false;
  if (input.mustVisit.includes(d.id)) return true;
  if (input.accessibility.includes('kursi_roda') && !d.accessibility.includes('kursi_roda')) return false;
  if ((input.accessibility.includes('lansia') || input.accessibility.includes('anak_kecil')) && d.tags.includes('trek_berat')) return false;
  return true;
}

function kmeans(points: Dest[], k: number): Dest[][] {
  if (k <= 1 || points.length <= k) return k <= 1 ? [points] : points.map((p) => [p]);
  // Inisialisasi farthest-first agar klaster tersebar.
  const centers: LatLng[] = [points[0]];
  while (centers.length < k) {
    let best = points[0], bd = -1;
    for (const p of points) {
      const dmin = Math.min(...centers.map((c) => haversineKm(p, c)));
      if (dmin > bd) { bd = dmin; best = p; }
    }
    centers.push({ lat: best.lat, lng: best.lng });
  }
  let groups: Dest[][] = [];
  for (let iter = 0; iter < 12; iter++) {
    groups = Array.from({ length: k }, () => []);
    for (const p of points) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => { const d = haversineKm(p, c); if (d < bd) { bd = d; bi = i; } });
      groups[bi].push(p);
    }
    groups.forEach((g, i) => {
      if (g.length) centers[i] = { lat: g.reduce((a, p) => a + p.lat, 0) / g.length, lng: g.reduce((a, p) => a + p.lng, 0) / g.length };
    });
  }
  return groups;
}

function balance(groups: Dest[][], cap: number): Dest[][] {
  for (let guard = 0; guard < 50; guard++) {
    const over = groups.findIndex((g) => g.length > cap);
    if (over < 0) break;
    const target = groups.map((g, i) => ({ g, i })).filter((x) => x.i !== over && x.g.length < cap);
    if (!target.length) break;
    const c = { lat: groups[over].reduce((a, p) => a + p.lat, 0) / groups[over].length, lng: groups[over].reduce((a, p) => a + p.lng, 0) / groups[over].length };
    // pindahkan titik terjauh dari pusat klaster ke klaster terdekat yang masih muat
    groups[over].sort((a, b) => haversineKm(b, c) - haversineKm(a, c));
    const mover = groups[over].shift()!;
    target.sort((x, y) => Math.min(...x.g.map((p) => haversineKm(p, mover))) - Math.min(...y.g.map((p) => haversineKm(p, mover))));
    target[0].g.push(mover);
  }
  return groups;
}

function orderRoute(origin: LatLng, stops: Dest[]): Dest[] {
  if (stops.length <= 1) return [...stops];
  const left = [...stops];
  const order: Dest[] = [];
  let cur: LatLng = origin;
  while (left.length) {
    left.sort((a, b) => haversineKm(cur, a) - haversineKm(cur, b));
    const next = left.shift()!;
    order.push(next);
    cur = next;
  }
  // 2-opt pada tur tertutup (asal -> ... -> asal)
  const tourLen = (o: Dest[]) => {
    let len = 0; let prev: LatLng = origin;
    for (const p of o) { len += haversineKm(prev, p); prev = p; }
    return len + haversineKm(prev, origin);
  };
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (tourLen(cand) + 1e-9 < tourLen(order)) { order.splice(0, order.length, ...cand); improved = true; }
      }
    }
  }
  return order;
}

interface Arranged { entries: PlanEntry[] }

/** Menyisipkan makan siang (dan makan malam bila hari panjang) ke dalam urutan kunjungan. */
function arrangeDay(
  visits: Dest[], input: PlannerInput, settings: SettingsMap, mealPool: Dest[], usedMeals: Set<string>, preferredMeals: Dest[], warnings: Warning[], di: number,
): Arranged {
  const origin: LatLng = { lat: input.origin.lat, lng: input.origin.lng };
  const entries: PlanEntry[] = visits.map((d) => ({ destinationId: d.id, role: 'visit' as const }));
  const dayStart = toMin(input.dayStart);
  const dayEnd = toMin(input.dayEnd);

  // Waktu kasar (estimasi) untuk menentukan posisi makan.
  const departTimes = () => {
    let t = dayStart; let cur: LatLng = origin; const out: number[] = [];
    for (const e of entries) {
      const d = visitsAndMeals.get(e.destinationId)!;
      t += estimateLeg(cur, d, input.vehicle, settings).minutes + d.avgDurationMin;
      out.push(t); cur = d;
    }
    return out;
  };
  const visitsAndMeals = new Map<string, Dest>(visits.map((d) => [d.id, d]));
  for (const d of mealPool) visitsAndMeals.set(d.id, d);

  const mealOk = (d: Dest) => {
    if (input.foodPrefs.includes('vegetarian') && !d.foodTags.includes('vegetarian_friendly')) return false;
    if (input.foodPrefs.includes('halal') && !d.foodTags.includes('halal')) return false;
    return true;
  };

  const insertMeal = (afterMin: number, label: string) => {
    if (entries.length === 0 && dayEnd - dayStart < 240) return;
    const times = departTimes();
    let idx = times.findIndex((t) => t >= afterMin);
    idx = idx < 0 ? entries.length : idx + 1;
    const prev: LatLng = idx === 0 ? origin : visitsAndMeals.get(entries[idx - 1].destinationId)!;
    const next: LatLng = idx >= entries.length ? origin : visitsAndMeals.get(entries[idx].destinationId)!;
    const candidates = [...preferredMeals.filter((d) => !usedMeals.has(d.id)), ...mealPool.filter((d) => !usedMeals.has(d.id))].filter(mealOk);
    let pool = candidates;
    if (pool.length === 0) {
      pool = mealPool.filter(mealOk);
      if (pool.length === 0) {
        warnings.push({ level: 'warn', code: 'no_meal_match', day: di, message: `Belum ada tempat makan yang cocok dengan preferensi makanan untuk ${label} hari ${di + 1}.` });
        return;
      }
      warnings.push({ level: 'info', code: 'meal_reused', day: di, message: `Tempat makan untuk ${label} hari ${di + 1} dipakai ulang karena pilihan terbatas.` });
    }
    const detour = (d: Dest) => haversineKm(prev, d) + haversineKm(d, next) - haversineKm(prev, next);
    // tempat makan pilihan pengguna didahulukan; selain itu pilih detour terkecil
    const pref = pool.find((d) => preferredMeals.some((p) => p.id === d.id));
    const best = pref ?? [...pool].sort((a, b) => detour(a) - detour(b))[0];
    usedMeals.add(best.id);
    visitsAndMeals.set(best.id, best);
    entries.splice(idx, 0, { destinationId: best.id, role: 'meal' });
  };

  if (dayEnd > 12 * 60 + 30) insertMeal(11 * 60 + 30, 'makan siang');
  if (dayEnd >= 19 * 60) insertMeal(17 * 60 + 30, 'makan malam');
  return { entries };
}

export interface GenerateOptions { ai?: AiProvider | null }

export async function generateItinerary(ctx: Omit<Ctx, 'tips'>, opts: GenerateOptions = {}): Promise<Itinerary> {
  const { input, dests, settings } = ctx;
  const origin: LatLng = { lat: input.origin.lat, lng: input.origin.lng };
  const warnings: Warning[] = [];
  const all_ = [...dests.values()];

  for (const id of [...input.mustVisit, ...input.avoid]) {
    if (!dests.has(id)) warnings.push({ level: 'warn', code: 'unknown_destination', destinationId: id, message: `Destinasi "${id}" tidak ada di database dan diabaikan.` });
  }

  const attractions = all_.filter((d) => !isMealPlace(d) && eligible(d, input));
  const mealPool = all_.filter((d) => isMealPlace(d) && !input.avoid.includes(d.id));
  const preferredMeals = mealPool.filter((d) => input.mustVisit.includes(d.id));

  // Batas perjalanan: tempat yang jauh dari titik berangkat dikeluarkan kecuali dipilih pengguna.
  let pool = attractions;
  if (input.maxLegMinutes) {
    pool = attractions.filter((d) => input.mustVisit.includes(d.id) || estimateLeg(origin, d, input.vehicle, settings).minutes <= input.maxLegMinutes!);
    if (pool.length < attractions.length) {
      warnings.push({ level: 'info', code: 'leg_filter', message: `${attractions.length - pool.length} destinasi dikeluarkan karena melebihi batas perjalanan ${input.maxLegMinutes} menit dari titik berangkat.` });
    }
  }

  const scored = pool.map((d) => ({ d, score: scoreDest(d, input, origin) })).sort((a, b) => b.score - a.score);
  const scoreOf = new Map(scored.map((x) => [x.d.id, x.score]));
  const perDay = PER_DAY[input.pace];
  const target = Math.min(scored.length, perDay * input.days);

  let selected: Dest[] = scored.slice(0, target).map((x) => x.d);
  let engineMode: 'demo' | 'ai' = 'demo';
  let engineNote = 'Mode demo: pemilihan memakai aturan skor dari data destinasi, tanpa model AI.';
  let aiTitle: string | undefined;
  let aiSummary: string | undefined;
  let tips: Record<string, string> = {};

  if (opts.ai) {
    try {
      const cands = scored.slice(0, Math.min(scored.length, Math.max(target + 6, 14)));
      const out = await opts.ai.refine({
        days: input.days, participants: input.participants, pace: input.pace, interests: input.interests, vehicle: input.vehicle, perDay,
        mustVisit: input.mustVisit.filter((id) => dests.has(id)),
        candidates: cands.map(({ d, score }) => ({
          id: d.id, name: d.name, category: d.categoryName, kind: d.kind, tags: d.tags, familyFriendly: d.familyFriendly,
          priceMid: priceOf(d) ? round500((priceOf(d)!.min + priceOf(d)!.max) / 2) : null, durationMin: d.avgDurationMin,
          distFromOriginKm: Math.round(haversineKm(origin, d) * 10) / 10, score: Math.round(score * 10) / 10,
        })),
      });
      const allowed = new Set(cands.map((c) => c.d.id));
      const ids = [...new Set(out.selectedIds)].filter((id) => allowed.has(id));
      for (const m of input.mustVisit) if (allowed.has(m) && !ids.includes(m)) ids.unshift(m);
      if (ids.length >= 1) {
        selected = ids.slice(0, Math.max(target, input.mustVisit.length)).map((id) => dests.get(id)!);
        engineMode = 'ai';
        engineNote = `Model AI (${opts.ai.name}) memilih dari kandidat database; jadwal, jarak, biaya, dan jam dihitung dan divalidasi sistem.`;
        aiTitle = out.title;
        aiSummary = out.summary;
        tips = Object.fromEntries(Object.entries(out.tips).filter(([id]) => allowed.has(id)));
      } else {
        engineNote = 'Mode demo: respons AI tidak berisi pilihan yang valid, sehingga dipakai aturan skor.';
      }
    } catch {
      engineNote = 'Mode demo: layanan AI tidak dapat dihubungi atau responsnya tidak valid, sehingga dipakai aturan skor.';
    }
  }

  if (selected.length < perDay * input.days) {
    warnings.push({ level: 'info', code: 'limited_data', message: `Data destinasi yang cocok baru ${selected.length}; itinerary lebih ringan dari tempo "${input.pace}".` });
  }

  // Bagi per hari berdasarkan kedekatan lokasi, lalu urutkan rute.
  let clusters = balance(kmeans(selected, Math.min(input.days, Math.max(1, selected.length))), perDay);
  clusters = clusters.filter((g) => g.length > 0).sort((a, b) => {
    const ca = Math.min(...a.map((p) => haversineKm(origin, p)));
    const cb = Math.min(...b.map((p) => haversineKm(origin, p)));
    return ca - cb;
  });
  while (clusters.length < input.days) clusters.push([]);

  const usedMeals = new Set<string>();
  let dayVisits: Dest[][] = clusters.map((g) => orderRoute(origin, g));
  const buildPlan = () => {
    usedMeals.clear();
    const mealWarnings: Warning[] = [];
    const plan = dayVisits.map((v, di) => arrangeDay(v, input, settings, mealPool, usedMeals, preferredMeals, mealWarnings, di).entries);
    return { plan, mealWarnings };
  };

  const fullCtx: Ctx = { ...ctx, tips };
  let { plan, mealWarnings } = buildPlan();
  let result = await buildSchedule(fullCtx, plan);

  const removable = (d: Dest) => !input.mustVisit.includes(d.id);
  // Pangkas bila jadwal tidak muat: buang destinasi dengan skor terendah pada hari bermasalah.
  for (let guard = 0; guard < 25; guard++) {
    const badDays = new Set(result.warnings.filter((w) => ['time_overrun', 'return_overrun', 'after_close', 'closed_day'].includes(w.code) && w.day != null).map((w) => w.day!));
    if (badDays.size === 0) break;
    let dropped = false;
    for (const di of badDays) {
      const cands = dayVisits[di].filter(removable).sort((a, b) => (scoreOf.get(a.id) ?? 0) - (scoreOf.get(b.id) ?? 0));
      if (cands.length) {
        const gone = cands[0];
        dayVisits[di] = dayVisits[di].filter((d) => d.id !== gone.id);
        dayVisits[di] = orderRoute(origin, dayVisits[di]);
        warnings.push({ level: 'info', code: 'dropped_time', day: di, destinationId: gone.id, message: `${gone.name} tidak dimasukkan ke hari ${di + 1} karena jadwal tidak muat.` });
        dropped = true;
      }
    }
    if (!dropped) break;
    ({ plan, mealWarnings } = buildPlan());
    result = await buildSchedule(fullCtx, plan);
  }

  // Pangkas bila melebihi anggaran: buang destinasi berbayar dengan biaya tertinggi relatif terhadap skor.
  for (let guard = 0; guard < 25 && result.budget.status === 'melebihi'; guard++) {
    const costOf = (d: Dest) => { const p = priceOf(d); return p ? round500((p.min + p.max) / 2) : 0; };
    const all_v = dayVisits.flatMap((v, di) => v.map((d) => ({ d, di }))).filter((x) => removable(x.d) && costOf(x.d) > 0);
    if (!all_v.length) break;
    all_v.sort((a, b) => costOf(b.d) / Math.max(0.5, scoreOf.get(b.d.id) ?? 1) - costOf(a.d) / Math.max(0.5, scoreOf.get(a.d.id) ?? 1));
    const { d, di } = all_v[0];
    dayVisits[di] = orderRoute(origin, dayVisits[di].filter((x) => x.id !== d.id));
    warnings.push({ level: 'info', code: 'dropped_budget', day: di, destinationId: d.id, message: `${d.name} dikeluarkan dari hari ${di + 1} agar biaya mendekati anggaran.` });
    ({ plan, mealWarnings } = buildPlan());
    result = await buildSchedule(fullCtx, plan);
  }

  const mergedWarnings = [...warnings, ...mealWarnings, ...result.warnings];
  const interestsLabel = input.interests.length ? input.interests.map((i) => i.replace('_', ' ')).join(', ') : 'jelajah umum';
  const title = aiTitle ?? `Plesir ${input.days} hari di Banyumas: ${interestsLabel}`;
  const stopCount = result.days.reduce((n, d) => n + d.stops.length, 0);
  const summary = aiSummary ?? `${input.days} hari untuk ${input.participants} orang dengan tempo ${input.pace}, ${stopCount} pemberhentian dari ${input.origin.label}.`;

  return {
    ...result,
    warnings: mergedWarnings,
    checks: deriveChecks(result.days, mergedWarnings, result.budget),
    title, summary, input,
    engine: { mode: engineMode, routing: ctx.router.name, note: engineNote },
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
}

/** Hitung ulang itinerary setelah pengguna mengedit urutan/daftar destinasi (tanpa memangkas otomatis). */
export async function recomputeItinerary(ctx: Ctx, plan: PlanEntry[][], meta: { title: string; summary: string; engine: Itinerary['engine'] }): Promise<Itinerary> {
  const padded = Array.from({ length: ctx.input.days }, (_, i) => plan[i] ?? []);
  const result = await buildSchedule(ctx, padded);
  return { ...result, input: ctx.input, title: meta.title, summary: meta.summary, engine: meta.engine, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER };
}
