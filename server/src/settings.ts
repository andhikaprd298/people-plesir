import { type Db, all, run } from './db.js';

export type SettingsMap = Record<string, string>;

export function readSettings(db: Db): SettingsMap {
  const rows = all<{ key: string; value: string }>(db, 'SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function num(s: SettingsMap, key: string, fallback = 0): number {
  const v = Number(s[key]);
  return Number.isFinite(v) && s[key] !== '' ? v : fallback;
}

export function saveSetting(db: Db, key: string, value: string, verified?: boolean) {
  const r = run(db, 'UPDATE settings SET value = ?, verified = COALESCE(?, verified) WHERE key = ?', value, verified === undefined ? null : verified, key);
  return r.changes > 0;
}

/** Pengaturan yang boleh dilihat publik (kontak, kebijakan, instruksi pembayaran). Tidak termasuk tarif internal. */
export function publicSettings(s: SettingsMap) {
  return {
    contact: {
      whatsapp: s['contact.whatsapp'] || null,
      email: s['contact.email'] || null,
      instagram: s['contact.instagram'] || null,
      businessInfo: s['contact.business_info'] || null,
    },
    policy: {
      isDemo: s['policy.is_demo'] === '1',
      cancellation: s['policy.cancellation'],
      payment: s['policy.payment'],
      minParticipants: s['policy.min_participants'],
    },
    payment: {
      configured: Boolean(s['payment.bank_name'] && s['payment.account_number'] && s['payment.account_holder']),
      bankName: s['payment.bank_name'] || null,
      accountNumber: s['payment.account_number'] || null,
      accountHolder: s['payment.account_holder'] || null,
    },
    booking: {
      holdHours: num(s, 'booking.hold_hours', 24),
      maxPerOrder: num(s, 'booking.max_per_order', 10),
      feeFlat: num(s, 'booking.fee_flat', 0),
    },
  };
}
