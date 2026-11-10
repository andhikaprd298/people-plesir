import { Check, Clock, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TripCard } from '../components/Cards';
import { MapView, type MapPoint } from '../components/MapView';
import { Scene, sceneKindFor } from '../components/Scene';
import { Empty, ErrorBox, Loading, Note, TripStateChip, useFetch, useTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { formatDate, monthLabel, rupiah } from '../lib/format';
import type { TripDetail, Trip } from '../lib/types';

export function OpenTripList() {
  useTitle('Open Trip Banyumas');
  const { data, loading, error, reload } = useFetch<{ items: Trip[] }>('/api/trips');
  const [month, setMonth] = useState('');
  const items = data?.items ?? [];
  const months = Array.from(new Set(items.map((t) => t.date.slice(0, 7))));
  const shown = items.filter((t) => !month || t.date.startsWith(month));

  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="page-head">
        <h1 style={{ fontSize: 'clamp(1.9rem,4.4vw,2.8rem)' }}>Open Trip</h1>
        <p className="lead">Satu kali setiap bulan, satu hari penuh, dengan destinasi unggulan yang berbeda. Daftar sebagai peserta umum, kami yang mengatur jadwal dan perjalanannya.</p>
      </div>
      <div className="grid cols-3" style={{ marginBottom: 28 }}>
        <div className="card soft"><h3>Termasuk dalam paket</h3><p className="small muted">Transportasi, tiket masuk, dan makan sesuai paket yang tertulis di setiap trip. Harga per orang berada di kisaran Rp75.000 sampai Rp150.000.</p></div>
        <div className="card soft"><h3>Kursi sesuai data nyata</h3><p className="small muted">Jumlah kursi tersedia dihitung dari pemesanan aktual. Trip yang penuh tidak ditampilkan sebagai tersedia.</p></div>
        <div className="card soft"><h3>Minimum peserta</h3><p className="small muted">Keberangkatan pasti setelah kuota minimum terpenuhi. Statusnya terlihat di setiap kartu trip.</p></div>
      </div>

      {months.length > 1 && (
        <div className="row" role="group" aria-label="Filter bulan" style={{ marginBottom: 20 }}>
          <button className={`btn btn-sm ${month === '' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMonth('')}>Semua bulan</button>
          {months.map((m) => <button key={m} className={`btn btn-sm ${month === m ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMonth(m)}>{monthLabel(m)}</button>)}
        </div>
      )}

      {loading ? <Loading rows={1} height={380} /> : error ? <ErrorBox error={error} onRetry={reload} /> : shown.length === 0 ? (
        <Empty title="Belum ada Open Trip yang dijadwalkan" actions={<><Link className="btn btn-primary" to="/private-trip">Ajukan Private Trip</Link><Link className="btn btn-ghost" to="/planner">Susun itinerary sendiri</Link></>}>
          Jadwal bulan berikutnya akan muncul di sini setelah diterbitkan admin.
        </Empty>
      ) : <div className="grid cols-3">{shown.map((t) => <TripCard key={t.id} t={t} />)}</div>}
    </div>
  );
}

export function TripDetailPage() {
  const { slug } = useParams();
  const { meta } = useAuth();
  const { data: t, loading, error, reload } = useFetch<TripDetail>(`/api/trips/${slug}`);
  useTitle(t?.title ?? 'Open Trip');

  if (loading) return <div className="wrap section"><Loading rows={2} height={260} /></div>;
  if (error || !t) return <div className="wrap section"><ErrorBox error={error ?? 'Open Trip tidak ditemukan'} onRetry={reload} /><p style={{ marginTop: 16 }}><Link to="/open-trip">Kembali ke daftar Open Trip</Link></p></div>;

  const policy = meta?.settings.policy;
  const pts: MapPoint[] = t.itinerary.filter((s) => s.lat != null && s.lng != null).map((s, i) => ({ id: `${s.id}`, lat: s.lat!, lng: s.lng!, label: s.destinationName ?? s.title, sub: s.time, n: i + 1, approximate: !s.coordsVerified, href: s.destinationId ? `/destinasi/${s.destinationId}` : undefined }));
  const pct = Math.min(100, Math.round((t.seats.held / t.seats.capacity) * 100));
  const canJoin = t.state === 'tersedia';

  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="page-head">
        <nav className="breadcrumb" aria-label="Rincian halaman"><Link to="/open-trip">Open Trip</Link> / {t.title}</nav>
        <div className="row" style={{ marginBottom: 10 }}><span className="chip solid">{t.theme ?? 'Open Trip'}</span><TripStateChip state={t.state} />{t.isDemo && <span className="chip sun">Trip contoh (demo)</span>}</div>
        <h1 style={{ fontSize: 'clamp(1.9rem,4.4vw,2.8rem)' }}>{t.title}</h1>
        {t.summary && <p className="lead">{t.summary}</p>}
      </div>

      <div className="split">
        <div className="stack-lg">
          <div className="gallery"><div className="main" style={{ position: 'relative' }}>
            {t.imageUrl ? <img src={t.imageUrl} alt={`Foto ${t.title}`} /> : <><Scene kind={sceneKindFor({ theme: t.theme })} /><span className="chip paper chip-br xsmall" style={{ position: 'absolute', right: 10, bottom: 10 }}>Ilustrasi</span></>}
          </div></div>

          <section aria-labelledby="jadwal">
            <h2 id="jadwal" style={{ fontSize: '1.4rem', marginBottom: 14 }}>Itinerary</h2>
            <ol className="timeline">
              {t.itinerary.map((s) => (
                <li key={s.id} className="tl-item">
                  <div className="tl-time">{s.time}</div>
                  <span className="tl-rail" aria-hidden="true" /><span className="tl-dot" aria-hidden="true" />
                  <div className="tl-card" style={{ padding: '10px 0 18px' }}>
                    <h3 style={{ fontSize: '1.05rem' }}>{s.destinationId ? <Link to={`/destinasi/${s.destinationId}`} style={{ color: 'inherit' }}>{s.title}</Link> : s.title}</h3>
                    {s.note && <p className="small muted">{s.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <p className="small muted">Jam pada itinerary adalah rencana dan dapat bergeser sesuai kondisi lapangan.</p>
          </section>

          <section className="grid cols-2" aria-label="Fasilitas">
            <div className="card flat"><h3 style={{ marginBottom: 12 }}>Termasuk</h3><ul className="list-check">{t.included.map((i) => <li key={i}><Check />{i}</li>)}</ul></div>
            <div className="card flat"><h3 style={{ marginBottom: 12 }}>Tidak termasuk</h3><ul className="list-check no">{t.excluded.map((i) => <li key={i}><X />{i}</li>)}</ul></div>
          </section>

          <section aria-labelledby="kebijakan" className="stack">
            <h2 id="kebijakan" style={{ fontSize: '1.4rem' }}>Kebijakan dan ketentuan</h2>
            {policy?.isDemo && <Note kind="sun"><b>Teks kebijakan contoh.</b> Isi di bawah belum final dan akan diganti oleh admin sebelum layanan dibuka.</Note>}
            <div className="card flat"><h3>Kebijakan pembatalan</h3><p className="small" style={{ marginTop: 6 }}>{policy?.cancellation}</p></div>
            <div className="card flat"><h3>Ketentuan pembayaran</h3><p className="small" style={{ marginTop: 6 }}>{policy?.payment}</p></div>
            <div className="card flat"><h3>Jika kuota minimum belum terpenuhi</h3><p className="small" style={{ marginTop: 6 }}>{policy?.minParticipants}</p></div>
          </section>

          {t.safety.length > 0 && (
            <section aria-labelledby="aman">
              <h2 id="aman" style={{ fontSize: '1.4rem', marginBottom: 12 }}>Informasi keselamatan</h2>
              <ul className="list-check">{t.safety.map((s) => <li key={s}><Check />{s}</li>)}</ul>
            </section>
          )}
          {t.faq.length > 0 && (
            <section aria-labelledby="faq-trip">
              <h2 id="faq-trip" style={{ fontSize: '1.4rem', marginBottom: 12 }}>Pertanyaan tentang trip ini</h2>
              {t.faq.map((f) => <details className="faq" key={f.q}><summary>{f.q}</summary><div>{f.a}</div></details>)}
            </section>
          )}
        </div>

        <aside className="side stack">
          <div className="card stack">
            <div className="price num">{rupiah(t.price)} <small>/orang</small></div>
            <dl className="kv" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <dt><Clock size={14} style={{ display: 'inline' }} /> Tanggal</dt><dd style={{ textAlign: 'right' }}>{formatDate(t.date)}</dd>
              <dt>Berangkat</dt><dd style={{ textAlign: 'right' }}>{t.departTime}, selesai ±{t.endTime}</dd>
              <dt><MapPin size={14} style={{ display: 'inline' }} /> Titik kumpul</dt><dd style={{ textAlign: 'right' }}>{t.meetingPoint ?? 'Perlu konfirmasi'}</dd>
              {t.registrationDeadline && <><dt>Batas daftar</dt><dd style={{ textAlign: 'right' }}>{formatDate(t.registrationDeadline, { day: 'numeric', month: 'long' })}</dd></>}
            </dl>
            <div>
              <div className={`meter ${t.seats.left <= 5 ? 'low' : ''}`}><i style={{ width: `${pct}%` }} /></div>
              <p className="small" style={{ marginTop: 6 }}>{t.state === 'penuh' ? 'Kursi penuh.' : <><b>{t.seats.left}</b> dari {t.seats.capacity} kursi tersedia.</>}</p>
              <p className="small muted">{t.minimum.label}</p>
            </div>
            {canJoin ? <Link className="btn btn-primary btn-block" to={`/open-trip/${t.slug}/daftar`}>Daftar Trip</Link> : <button className="btn btn-primary btn-block" disabled>{t.state === 'penuh' ? 'Kursi penuh' : t.state === 'selesai' ? 'Trip sudah lewat' : t.state === 'dibatalkan' ? 'Trip dibatalkan' : 'Pendaftaran ditutup'}</button>}
            {t.state === 'penuh' && <Link className="btn btn-ghost btn-block" to="/private-trip">Ajukan Private Trip</Link>}
            <p className="xsmall muted">Kursi baru ditahan setelah pesanan dibuat dan dikonfirmasi setelah pembayaran diverifikasi admin.</p>
          </div>
          {pts.length > 0 && <MapView points={pts} route label="Peta rute trip" />}
        </aside>
      </div>
    </div>
  );
}
