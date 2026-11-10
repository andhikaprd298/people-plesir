import { Accessibility, Check, Clock, MapPin, Plus, Users, Wallet } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DestCard, PriceLabel } from '../components/Cards';
import { MapView, gmapsDirections } from '../components/MapView';
import { DestImage, sceneKindFor } from '../components/Scene';
import { ConfirmTag, ErrorBox, Loading, useFetch, useTitle } from '../components/ui';
import { KIND_LABEL, formatDuration } from '../lib/format';
import type { DayKey, DestDetail } from '../lib/types';
import { useWishlist } from '../lib/wishlist';

const DAYS: [DayKey, string][] = [['mon', 'Senin'], ['tue', 'Selasa'], ['wed', 'Rabu'], ['thu', 'Kamis'], ['fri', 'Jumat'], ['sat', 'Sabtu'], ['sun', 'Minggu']];
const ACC: Record<string, string> = { kursi_roda: 'Dapat diakses kursi roda', lansia: 'Cocok untuk lansia', anak_kecil: 'Cocok untuk anak kecil' };

export default function DestinationDetail() {
  const { id } = useParams();
  const { data: d, loading, error, reload } = useFetch<DestDetail>(`/api/destinations/${id}`);
  const wl = useWishlist();
  useTitle(d?.name ?? 'Destinasi');

  if (loading) return <div className="wrap section"><Loading rows={2} height={260} /></div>;
  if (error || !d) return <div className="wrap section"><ErrorBox error={error ?? 'Destinasi tidak ditemukan'} onRetry={reload} /><p style={{ marginTop: 16 }}><Link to="/jelajah">Kembali ke Jelajahi</Link></p></div>;

  const kind = sceneKindFor({ categoryId: d.categoryId, id: d.id, kind: d.kind });
  const added = wl.has(d.id);
  const gallery = d.gallery.length ? d.gallery : d.imageUrl ? [d.imageUrl] : [];

  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Rincian halaman"><Link to="/jelajah">Jelajahi</Link> / {d.categoryName}</nav>
        <div className="row" style={{ marginBottom: 10 }}><span className="chip solid">{KIND_LABEL[d.kind]}</span><span className="chip">{d.categoryName}</span>{d.dataStatus === 'demo' && <span className="chip sun">Data contoh</span>}</div>
        <h1 style={{ fontSize: 'clamp(1.9rem,4.4vw,2.8rem)' }}>{d.name}</h1>
        <p className="lead">{d.summary}</p>
      </div>

      <div className="split">
        <div className="stack-lg">
          <div className={`gallery ${gallery.length > 1 ? 'multi' : ''}`}>
            <div className="main" style={{ position: 'relative' }}><DestImage src={gallery[0] ?? null} alt={`Foto ${d.name}`} kind={kind} /></div>
            {gallery.length > 1 && <div className="stack">{gallery.slice(1, 3).map((g) => <div key={g} className="main"><img src={g} alt={`Foto tambahan ${d.name}`} loading="lazy" /></div>)}</div>}
          </div>

          <section aria-labelledby="tentang">
            <h2 id="tentang" style={{ fontSize: '1.4rem', marginBottom: 12 }}>Tentang tempat ini</h2>
            <p style={{ color: 'var(--ink-2)', maxWidth: '68ch' }}>{d.description || d.summary}</p>
          </section>

          <section aria-labelledby="fakta">
            <h2 id="fakta" style={{ fontSize: '1.4rem', marginBottom: 12 }}>Informasi singkat</h2>
            <div className="facts">
              <div className="fact"><span><Clock size={13} style={{ display: 'inline' }} /> Durasi kunjungan</span><b>{formatDuration(d.avgDurationMin)}</b></div>
              <div className="fact"><span><Wallet size={13} style={{ display: 'inline' }} /> Kisaran biaya</span><b><PriceLabel d={d} /></b></div>
              <div className="fact"><span><MapPin size={13} style={{ display: 'inline' }} /> Lokasi</span><b>{d.addressText ?? 'Banyumas'}</b>{!d.verified.coords && <ConfirmTag text="Titik peta perkiraan" />}</div>
              <div className="fact"><span><Users size={13} style={{ display: 'inline' }} /> Keluarga</span><b>{d.familyFriendly ? 'Ramah keluarga' : 'Kurang cocok untuk anak'}</b></div>
            </div>
          </section>

          <section aria-labelledby="jam">
            <h2 id="jam" style={{ fontSize: '1.4rem', marginBottom: 12 }}>Jam operasional</h2>
            {d.openHours && d.verified.hours ? (
              <div className="panel"><dl className="kv">{DAYS.map(([k, label]) => <><dt key={`${k}t`}>{label}</dt><dd key={`${k}d`}>{d.openHours?.[k] ? `${d.openHours[k]![0]}–${d.openHours[k]![1]}` : 'Tutup'}</dd></>)}</dl></div>
            ) : <div className="alert warn"><Clock /><div>Jam operasional belum diverifikasi. <ConfirmTag /> Hubungi pengelola atau tim kami sebelum berangkat.</div></div>}
          </section>

          {(d.facilities.length > 0 || d.accessibility.length > 0) && (
            <section aria-labelledby="fasilitas">
              <h2 id="fasilitas" style={{ fontSize: '1.4rem', marginBottom: 12 }}>Fasilitas</h2>
              <div className="places">
                {d.facilities.map((f) => <span key={f} className="chip"><Check />{f}</span>)}
                {d.accessibility.map((a) => <span key={a} className="chip ok"><Accessibility />{ACC[a] ?? a}</span>)}
              </div>
            </section>
          )}

          {d.nearby.length > 0 && (
            <section aria-labelledby="sekitar">
              <h2 id="sekitar" style={{ fontSize: '1.4rem', marginBottom: 16 }}>Dekat dari sini</h2>
              <div className="grid cols-2">{d.nearby.slice(0, 4).map((n) => <DestCard key={n.id} d={n} />)}</div>
              <p className="xsmall muted" style={{ marginTop: 8 }}>Jarak antar tempat adalah garis lurus, bukan jarak tempuh.</p>
            </section>
          )}
        </div>

        <aside className="side stack">
          <MapView points={[{ id: d.id, lat: d.lat, lng: d.lng, label: d.name, sub: d.addressText ?? undefined, approximate: !d.verified.coords }, ...d.nearby.map((n) => ({ id: n.id, lat: n.lat, lng: n.lng, label: n.name, kind: 'dest' as const, href: `/destinasi/${n.id}` }))]} label={`Peta ${d.name}`} />
          <div className="card stack">
            <a className="btn btn-primary btn-block" href={gmapsDirections(d.lat, d.lng)} target="_blank" rel="noopener noreferrer">Lihat Rute</a>
            <button className={`btn btn-block ${added ? 'btn-primary' : 'btn-ghost'}`} onClick={() => wl.toggle(d.id)} aria-pressed={added}>{added ? <><Check /> Ada di itinerary</> : <><Plus /> Tambahkan ke Itinerary</>}</button>
            {wl.ids.length > 0 && <Link className="btn btn-accent btn-block" to="/planner">Susun itinerary ({wl.ids.length} tempat)</Link>}
            <p className="xsmall muted">Titik peta dan tombol rute memakai koordinat yang tersimpan{!d.verified.coords ? ' (belum diverifikasi)' : ''}. Cek kondisi terbaru sebelum berangkat.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
