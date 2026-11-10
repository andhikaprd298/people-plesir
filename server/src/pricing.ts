import { z } from 'zod';
import { type SettingsMap, num } from './settings.js';

/* ---------------- Open Trip ---------------- */

export interface OpenTripQuote {
  unitPrice: number;
  participants: number;
  subtotal: number;
  fee: number;
  total: number;
}

export function quoteOpenTrip(unitPrice: number, participants: number, settings: SettingsMap): OpenTripQuote {
  const subtotal = unitPrice * participants;
  const fee = participants > 0 ? num(settings, 'booking.fee_flat', 0) : 0;
  return { unitPrice, participants, subtotal, fee, total: subtotal + fee };
}

/* ---------------- Private Trip ---------------- */

export const PRIVATE_VEHICLES = ['motor', 'mobil_sopir', 'minibus'] as const;
export type PrivateVehicle = (typeof PRIVATE_VEHICLES)[number];

export const privateEstimateSchema = z.object({
  participants: z.number().int().min(1, 'Minimal 1 peserta').max(60, 'Untuk lebih dari 60 peserta, hubungi tim kami'),
  days: z.number().int().min(1).max(7, 'Maksimal 7 hari'),
  vehicle: z.enum(PRIVATE_VEHICLES),
  facilities: z.object({
    transport: z.boolean(),
    tickets: z.boolean(),
    meals: z.boolean(),
    guide: z.boolean(),
  }),
  mealsPerDay: z.number().int().min(0).max(3).default(2),
  /** Total tiket per orang dari destinasi yang dipilih; null bila belum ada data harga. */
  ticketPerPerson: z.number().int().min(0).max(5_000_000).nullable().default(null),
  ticketVerified: z.boolean().default(false),
});

export type PrivateEstimateInput = z.infer<typeof privateEstimateSchema>;

export interface EstimateLine {
  key: 'transport' | 'tickets' | 'meals' | 'guide';
  label: string;
  amount: number | null;
  basis: string;
  verified: boolean;
  included: boolean;
}

export interface PrivateEstimate {
  isFinal: false;
  lines: EstimateLine[];
  subtotal: number;
  margin: number;
  estimate: number;
  range: { low: number; high: number };
  perPerson: number;
  unknown: string[];
  notes: string[];
}

const VEHICLE_META: Record<PrivateVehicle, { key: string; capacity: number; label: string }> = {
  motor: { key: 'private.motor_per_day', capacity: 2, label: 'motor' },
  mobil_sopir: { key: 'private.mobil_sopir_per_day', capacity: 6, label: 'mobil + sopir' },
  minibus: { key: 'private.minibus_per_day', capacity: 12, label: 'minibus + sopir' },
};

export function estimatePrivateTrip(input: PrivateEstimateInput, s: SettingsMap): PrivateEstimate {
  const lines: EstimateLine[] = [];
  const unknown: string[] = [];
  const meta = VEHICLE_META[input.vehicle];
  // Tarif internal (Pengaturan) tidak pernah dianggap terverifikasi pada estimasi awal.

  const vehicles = Math.ceil(input.participants / meta.capacity);
  const transportAmount = input.facilities.transport ? vehicles * input.days * num(s, meta.key, 0) : 0;
  lines.push({
    key: 'transport', label: 'Transportasi', amount: input.facilities.transport ? transportAmount : null,
    basis: input.facilities.transport ? `${vehicles} ${meta.label} × ${input.days} hari` : 'Tidak termasuk (peserta mengurus sendiri)',
    verified: false, included: input.facilities.transport,
  });

  let ticketAmount: number | null = null;
  if (input.facilities.tickets) {
    if (input.ticketPerPerson == null) { unknown.push('Tiket masuk: pilih destinasi atau tunggu penawaran final'); }
    else ticketAmount = input.ticketPerPerson * input.participants;
  }
  lines.push({
    key: 'tickets', label: 'Tiket masuk', amount: input.facilities.tickets ? ticketAmount : null,
    basis: input.facilities.tickets
      ? input.ticketPerPerson == null ? 'Belum ada data harga tiket (Perlu konfirmasi)' : `${input.participants} orang × tiket destinasi pilihan${input.ticketVerified ? '' : ' (harga Perlu konfirmasi)'}`
      : 'Tidak termasuk',
    verified: input.ticketVerified, included: input.facilities.tickets,
  });

  const mealCount = input.days * input.mealsPerDay;
  const mealAmount = input.facilities.meals ? input.participants * mealCount * num(s, 'private.meal_per_person', 0) : 0;
  lines.push({
    key: 'meals', label: 'Makan', amount: input.facilities.meals ? mealAmount : null,
    basis: input.facilities.meals ? `${input.participants} orang × ${mealCount} kali makan` : 'Tidak termasuk',
    verified: false, included: input.facilities.meals,
  });

  const guideAmount = input.facilities.guide ? input.days * num(s, 'private.guide_per_day', 0) : 0;
  lines.push({
    key: 'guide', label: 'Pemandu', amount: input.facilities.guide ? guideAmount : null,
    basis: input.facilities.guide ? `${input.days} hari` : 'Tidak termasuk',
    verified: false, included: input.facilities.guide,
  });

  const subtotal = lines.reduce((n, l) => n + (l.amount ?? 0), 0);
  const margin = Math.round((subtotal * num(s, 'private.margin_pct', 0)) / 100);
  const estimate = subtotal + margin;
  const rangePct = num(s, 'private.range_pct', 15) / 100;
  const round1k = (n: number) => Math.round(n / 1000) * 1000;

  return {
    isFinal: false,
    lines, subtotal, margin, estimate,
    range: { low: round1k(estimate * (1 - rangePct)), high: round1k(estimate * (1 + rangePct)) },
    perPerson: Math.round(estimate / input.participants),
    unknown,
    notes: [
      'Ini estimasi awal, bukan harga final. Tim People Plesir akan memeriksa ketersediaan mitra dan biaya aktual sebelum mengirim penawaran final.',
      'Tarif yang dipakai untuk estimasi masih asumsi dan belum diverifikasi.',
    ],
  };
}
