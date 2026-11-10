import { type LatLng, haversineKm } from './geo.js';
import { type SettingsMap, num } from './settings.js';

export type Vehicle = 'motor' | 'mobil_pribadi' | 'sewa' | 'umum';

export interface Leg {
  distanceKm: number;
  minutes: number;
  /** Asal angka: perhitungan estimasi garis lurus atau layanan rute sungguhan. */
  source: 'estimasi_garis_lurus' | 'osrm';
}

export interface RouteProvider {
  readonly name: string;
  leg(a: LatLng, b: LatLng, vehicle: Vehicle, settings: SettingsMap): Promise<Leg>;
}

export function estimateLeg(a: LatLng, b: LatLng, vehicle: Vehicle, settings: SettingsMap): Leg {
  const detour = num(settings, 'route.detour_factor', 1.4);
  const speed = num(settings, `speed.${vehicle}`, 30);
  const km = haversineKm(a, b) * detour;
  const minutes = speed > 0 ? Math.round((km / speed) * 60) : 0;
  return { distanceKm: Math.round(km * 10) / 10, minutes, source: 'estimasi_garis_lurus' };
}

/** Penyedia default: estimasi garis lurus x faktor jalan. Selalu diberi label "estimasi". */
export class EstimateRouter implements RouteProvider {
  readonly name = 'estimasi';
  async leg(a: LatLng, b: LatLng, vehicle: Vehicle, settings: SettingsMap) {
    return estimateLeg(a, b, vehicle, settings);
  }
}

/** OSRM (server sendiri atau publik). Jika gagal, jatuh kembali ke estimasi sehingga planner tetap jalan. */
export class OsrmRouter implements RouteProvider {
  readonly name = 'osrm';
  private cache = new Map<string, { distanceKm: number; baseMinutes: number }>();
  constructor(private baseUrl: string, private timeoutMs = 6000, private fetchImpl: typeof fetch = fetch) {}

  async leg(a: LatLng, b: LatLng, vehicle: Vehicle, settings: SettingsMap): Promise<Leg> {
    const key = `${a.lng.toFixed(5)},${a.lat.toFixed(5)};${b.lng.toFixed(5)},${b.lat.toFixed(5)}`;
    let hit = this.cache.get(key);
    if (!hit) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
        const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/route/v1/driving/${key}?overview=false`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`OSRM ${res.status}`);
        const json = (await res.json()) as { routes?: { distance: number; duration: number }[] };
        const r = json.routes?.[0];
        if (!r) throw new Error('OSRM: tidak ada rute');
        hit = { distanceKm: r.distance / 1000, baseMinutes: r.duration / 60 };
        this.cache.set(key, hit);
      } catch {
        return estimateLeg(a, b, vehicle, settings);
      }
    }
    // Profil OSRM adalah mobil. Motor dianggap setara; transportasi umum diberi pengali asumsi (menunggu, berhenti).
    const factor = vehicle === 'umum' ? 1.6 : 1;
    return { distanceKm: Math.round(hit.distanceKm * 10) / 10, minutes: Math.round(hit.baseMinutes * factor), source: 'osrm' };
  }
}

export function makeRouter(provider: string, osrmUrl?: string): RouteProvider {
  if (provider === 'osrm' && osrmUrl) return new OsrmRouter(osrmUrl);
  return new EstimateRouter();
}
