export const rupiah = (n: number | null | undefined): string =>
  n == null ? '—' : 'Rp' + Math.round(n).toLocaleString('id-ID');

export const rupiahRange = (min: number, max: number): string =>
  min === max ? rupiah(min) : `${rupiah(min)}–${rupiah(max).replace('Rp', '')}`;

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+07:00` : iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('+') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', ...opts });
}

export const formatDateShort = (iso: string | null | undefined) => formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} mnt`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} jam ${m} mnt` : `${h} jam`;
}

export const monthLabel = (ym: string) => formatDate(`${ym}-01`, { month: 'long', year: 'numeric' });

export const digitsOnly = (s: string) => s.replace(/[^\d]/g, '');

export function toInt(s: string): number | null {
  const d = digitsOnly(s);
  return d === '' ? null : Number(d);
}

export const KIND_LABEL: Record<string, string> = { wisata: 'Wisata', kuliner: 'Kuliner', kafe: 'Kafe' };
export const VEHICLE_LABEL: Record<string, string> = { motor: 'Motor', mobil_pribadi: 'Mobil pribadi', sewa: 'Kendaraan sewa', umum: 'Transportasi umum' };
export const PRIVATE_VEHICLE_LABEL: Record<string, string> = { motor: 'Motor', mobil_sopir: 'Mobil + sopir (maks. 6)', minibus: 'Minibus + sopir (maks. 12)' };
export const INTEREST_LABEL: Record<string, string> = { alam: 'Alam', kuliner: 'Kuliner', budaya: 'Budaya & sejarah', keluarga: 'Wisata keluarga', hidden_gems: 'Hidden gems', foto: 'Tempat foto', kafe: 'Kafe & santai' };
export const STATUS_LABEL: Record<string, string> = {
  menunggu_konfirmasi: 'Menunggu konfirmasi', menunggu_pembayaran: 'Menunggu pembayaran', menunggu_verifikasi: 'Menunggu verifikasi pembayaran',
  dikonfirmasi: 'Dikonfirmasi', selesai: 'Selesai', dibatalkan: 'Dibatalkan',
};
export const TRIP_STATE_LABEL: Record<string, string> = { tersedia: 'Tersedia', penuh: 'Penuh', ditutup: 'Pendaftaran ditutup', dibatalkan: 'Dibatalkan', selesai: 'Selesai', draft: 'Draf' };

/** Jarak garis lurus (km) — dipakai hanya untuk urutan/filter lokal. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371; const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function safeStorage(kind: 'local' | 'session' = 'local') {
  const get = () => { try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; } };
  return {
    read<T>(key: string, fallback: T): T { try { const v = get()?.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } },
    write(key: string, value: unknown) { try { get()?.setItem(key, JSON.stringify(value)); } catch { /* abaikan */ } },
    remove(key: string) { try { get()?.removeItem(key); } catch { /* abaikan */ } },
  };
}
