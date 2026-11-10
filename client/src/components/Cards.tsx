import { Clock, MapPin, Navigation, Plus, Check, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatDuration, rupiah, rupiahRange, KIND_LABEL } from '../lib/format';
import { useWishlist } from '../lib/wishlist';
import type { Dest, Trip } from '../lib/types';
import { gmapsDirections } from './MapView';
import { DestImage, Scene, sceneKindFor } from './Scene';
import { ConfirmTag, TripStateChip } from './ui';

export function PriceLabel({ d }: { d: Pick<Dest, 'price' | 'verified' | 'kind'> }) {
  if (!d.price) return <span className="muted">Harga <ConfirmTag /></span>;
  const txt = d.price.max === 0 ? 'Gratis' : rupiahRange(d.price.min, d.price.max);
  return <span>{txt} {!d.verified.price && <ConfirmTag />}</span>;
}

export function DestCard({ d, showWishlist = true, onRoute }: { d: Dest; showWishlist?: boolean; onRoute?: () => void }) {
  const wl = useWishlist();
  const added = wl.has(d.id);
  return (
    <article className="dest-card">
      <div className="dest-media">
        <Link to={`/destinasi/${d.id}`} tabIndex={-1} aria-hidden="true" style={{ display: 'block', height: '100%' }}>
          <DestImage src={d.imageUrl} alt="" kind={sceneKindFor({ categoryId: d.categoryId, id: d.id, kind: d.kind })} />
        </Link>
        <span className="chip paper chip-tl">{KIND_LABEL[d.kind]}</span>
      </div>
      <div className="dest-body">
        <div>
          <h3><Link to={`/destinasi/${d.id}`}>{d.name}</Link></h3>
          <div className="muted small">{d.categoryName}</div>
        </div>
        <p className="small" style={{ color: 'var(--ink-2)' }}>{d.summary}</p>
        <div className="dest-meta">
          <span><MapPin /> {d.addressText ?? 'Banyumas'}{!d.verified.coords && ' (perkiraan)'}</span>
          <span><Clock /> {formatDuration(d.avgDurationMin)}</span>
          <span><Wallet /> <PriceLabel d={d} /></span>
          {d.distanceKm != null && <span><Navigation /> {d.distanceKm} km garis lurus</span>}
          {d.familyFriendly && <span><Users /> Ramah keluarga</span>}
        </div>
        <div className="dest-actions">
          <a className="btn btn-ghost btn-sm" href={gmapsDirections(d.lat, d.lng)} target="_blank" rel="noopener noreferrer" onClick={onRoute}>Lihat Rute</a>
          {showWishlist && (
            <button className={`btn btn-sm ${added ? 'btn-primary' : 'btn-ghost'}`} onClick={() => wl.toggle(d.id)} aria-pressed={added}>
              {added ? <><Check /> Di itinerary</> : <><Plus /> Tambahkan ke Itinerary</>}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

const MONTH = (iso: string) => formatDate(iso, { month: 'short' });
const DAYNUM = (iso: string) => formatDate(iso, { day: 'numeric' });

export function TripCard({ t }: { t: Trip }) {
  const pct = Math.min(100, Math.round((t.seats.held / t.seats.capacity) * 100));
  const open = t.state === 'tersedia';
  return (
    <article className="ticket">
      <div className="ticket-media">
        {t.imageUrl ? <img src={t.imageUrl} alt="" loading="lazy" /> : <Scene kind={sceneKindFor({ theme: t.theme })} />}
        {!t.imageUrl && <span className="chip paper chip-br xsmall">Ilustrasi</span>}
        <span className="chip paper chip-tl">{t.theme ?? 'Open Trip'}</span>
      </div>
      <div className="ticket-body">
        <div className="ticket-date">
          <div className="date-stub" aria-hidden="true"><b>{DAYNUM(t.date)}</b><span>{MONTH(t.date)}</span></div>
          <div>
            <h3><Link to={`/open-trip/${t.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{t.title}</Link></h3>
            <div className="muted small">{formatDate(t.date)} · {t.departTime}–{t.endTime}</div>
          </div>
        </div>
        {t.places && t.places.length > 0 && <div className="places">{t.places.map((p) => <span key={p} className="chip">{p}</span>)}</div>}
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div className="price num">{rupiah(t.price)} <small>/orang</small></div>
          <TripStateChip state={t.state} />
        </div>
        <div>
          <div className={`meter ${t.seats.left <= 5 ? 'low' : ''}`} role="img" aria-label={`${t.seats.held} dari ${t.seats.capacity} kursi terisi`}><i style={{ width: `${pct}%` }} /></div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {t.state === 'penuh' ? 'Kursi penuh' : <><b style={{ color: 'var(--ink)' }}>{t.seats.left}</b> dari {t.seats.capacity} kursi tersedia</>} · {t.minimum.met ? 'Keberangkatan pasti' : `Min. ${t.minimum.required} peserta`}
          </div>
        </div>
        {t.isDemo && <div><span className="chip sun">Trip contoh (demo)</span></div>}
        <div className="row" style={{ marginTop: 'auto' }}>
          <Link className="btn btn-ghost btn-sm" to={`/open-trip/${t.slug}`}>Lihat Detail</Link>
          {open
            ? <Link className="btn btn-primary btn-sm" to={`/open-trip/${t.slug}/daftar`}>Daftar Trip</Link>
            : <span className="btn btn-primary btn-sm" aria-disabled="true">{t.state === 'penuh' ? 'Penuh' : 'Tidak tersedia'}</span>}
        </div>
      </div>
    </article>
  );
}
