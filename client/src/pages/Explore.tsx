import { LayoutGrid, LocateFixed, Map as MapIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DestCard } from '../components/Cards';
import { MapView, type MapPoint } from '../components/MapView';
import { Empty, ErrorBox, Loading, Note, SelectField, TextField, useFetch, useTitle } from '../components/ui';
import { qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Dest } from '../lib/types';

type Loc = { lat: number; lng: number; label: string } | null;

export default function Explore() {
  useTitle('Jelajahi wisata dan kuliner Banyumas');
  const { meta } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<'grid' | 'peta'>('grid');
  const [loc, setLoc] = useState<Loc>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [qInput, setQInput] = useState(sp.get('q') ?? '');

  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  useEffect(() => { const t = setTimeout(() => set('q', qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const kind = sp.get('kind') ?? '';
  const category = sp.get('category') ?? '';
  const family = sp.get('family') ?? '';
  const maxPrice = sp.get('maxPrice') ?? '';
  const maxKm = sp.get('maxKm') ?? '';
  const sortRaw = sp.get('sort') ?? 'relevansi';
  const sort = !loc && sortRaw === 'jarak' ? 'relevansi' : sortRaw;

  const url = '/api/destinations' + qs({ q: sp.get('q'), kind, category, family, maxPrice, lat: loc?.lat, lng: loc?.lng, maxKm: loc ? maxKm : '', sort });
  const { data, loading, error, reload } = useFetch<{ items: Dest[]; total: number; distanceNote: string | null }>(url);

  const askLocation = () => {
    if (!navigator.geolocation) { setGeoMsg('Peramban Anda tidak mendukung lokasi. Pilih titik secara manual di bawah.'); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Lokasi Anda' }); setGeoMsg(null); setGeoBusy(false); },
      () => { setGeoMsg('Izin lokasi ditolak atau tidak tersedia. Pilih titik secara manual di bawah.'); setGeoBusy(false); },
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  const points = useMemo<MapPoint[]>(() => (data?.items ?? []).map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, label: d.name, sub: d.categoryName, approximate: !d.verified.coords, href: `/destinasi/${d.id}` })), [data]);

  return (
    <div className="wrap">
      <div className="page-head">
        <h1 style={{ fontSize: 'clamp(1.9rem,4.4vw,2.8rem)' }}>Jelajahi Banyumas</h1>
        <p className="lead">Cari wisata alam, budaya, kuliner, dan tempat santai. Gunakan lokasi untuk melihat yang terdekat.</p>
      </div>

      <div className="filters">
        <TextField className="span-all" label="Cari nama tempat" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Contoh: curug, sroto, museum" maxLength={80} />
        <SelectField label="Jenis" value={kind} onChange={(e) => set('kind', e.target.value)}>
          <option value="">Wisata dan kuliner</option><option value="wisata">Wisata</option><option value="kuliner">Kuliner</option><option value="kafe">Kafe</option>
        </SelectField>
        <SelectField label="Kategori" value={category} onChange={(e) => set('category', e.target.value)}>
          <option value="">Semua kategori</option>
          {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <SelectField label="Kisaran harga" value={maxPrice} onChange={(e) => set('maxPrice', e.target.value)}>
          <option value="">Semua harga</option><option value="0">Gratis</option><option value="20000">Hingga Rp20.000</option><option value="50000">Hingga Rp50.000</option><option value="100000">Hingga Rp100.000</option>
        </SelectField>
        <SelectField label="Urutkan" value={sort} onChange={(e) => set('sort', e.target.value)}>
          <option value="relevansi">Relevansi</option><option value="jarak" disabled={!loc}>Jarak{!loc ? ' (aktifkan lokasi)' : ''}</option><option value="nama">Nama A–Z</option>
        </SelectField>
        <div className="span-all row between">
          <label className="check"><input type="checkbox" checked={family === '1'} onChange={(e) => set('family', e.target.checked ? '1' : '')} /> Ramah keluarga</label>
          <div className="seg" role="group" aria-label="Tampilan">
            <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid /> Kartu</button>
            <button aria-pressed={view === 'peta'} onClick={() => setView('peta')}><MapIcon /> Peta</button>
          </div>
        </div>
        <div className="span-all stack-sm">
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={askLocation} disabled={geoBusy}><LocateFixed /> {geoBusy ? 'Mencari lokasi…' : loc ? `Lokasi: ${loc.label}` : 'Pakai lokasi saya'}</button>
            <SelectField label="" aria-label="Atau pilih titik manual" value={loc && loc.label !== 'Lokasi Anda' ? loc.label : ''} onChange={(e) => { const o = meta?.origins.find((x) => x.label === e.target.value); setLoc(o ? { lat: o.lat, lng: o.lng, label: o.label } : null); }}>
              <option value="">Atau pilih titik manual</option>
              {meta?.origins.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
            </SelectField>
            {loc && (
              <SelectField label="" aria-label="Jarak maksimal" value={maxKm} onChange={(e) => set('maxKm', e.target.value)}>
                <option value="">Berapa pun jaraknya</option><option value="5">Dalam 5 km</option><option value="10">Dalam 10 km</option><option value="20">Dalam 20 km</option><option value="40">Dalam 40 km</option>
              </SelectField>
            )}
            {loc && <button className="btn btn-link" onClick={() => { setLoc(null); set('maxKm', ''); }}>Hapus lokasi</button>}
          </div>
          {geoMsg && <Note kind="warn">{geoMsg}</Note>}
        </div>
      </div>

      <div style={{ margin: '24px 0 56px' }}>
        {loading ? <Loading rows={1} height={320} /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
          <>
            <p className="muted small" aria-live="polite">{data?.total ?? 0} tempat ditemukan. {data?.distanceNote}</p>
            {data && data.items.length === 0 ? (
              <Empty title="Tidak ada tempat yang cocok" actions={<button className="btn btn-primary" onClick={() => { setSp(new URLSearchParams()); setQInput(''); }}>Hapus semua filter</button>}>
                Coba kata kunci lain atau longgarkan filter harga dan jarak.
              </Empty>
            ) : view === 'grid' ? (
              <div className="grid cols-3" style={{ marginTop: 12 }}>{data?.items.map((d) => <DestCard key={d.id} d={d} />)}</div>
            ) : (
              <div style={{ marginTop: 12 }}><MapView points={points} tall label="Peta destinasi Banyumas" /></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
