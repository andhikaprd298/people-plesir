import { BadgeCheck, Compass, Search, Sparkles, Ticket, Users, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DestCard, TripCard } from '../components/Cards';
import { HeroScene } from '../components/Scene';
import { ErrorBox, Loading, Empty, useFetch, useTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { Dest, Trip } from '../lib/types';

const HERO_IMAGE = import.meta.env.VITE_HERO_IMAGE as string | undefined;

const HOME_FAQ = [
  { q: 'Apakah saya harus membuat akun untuk memakai AI Planner?', a: 'Tidak. Anda bisa menyusun dan melihat itinerary tanpa akun. Akun hanya dibutuhkan untuk menyimpan itinerary atau menyelesaikan pemesanan.' },
  { q: 'Apakah harga dan jam buka di itinerary sudah pasti?', a: 'Belum tentu. Informasi yang belum diverifikasi tim kami diberi label "Perlu konfirmasi". Estimasi waktu dan biaya juga dapat berubah sesuai kondisi lapangan.' },
  { q: 'Bagaimana cara membayar Open Trip?', a: 'Saat ini lewat transfer manual. Pesanan dikonfirmasi setelah admin memverifikasi pembayaran, bukan saat Anda menekan tombol.' },
];

export default function Home() {
  useTitle('');
  const nav = useNavigate();
  const { meta } = useAuth();
  const [q, setQ] = useState('');
  const dests = useFetch<{ items: Dest[] }>('/api/destinations?kind=wisata');
  const food = useFetch<{ items: Dest[] }>('/api/destinations?kind=kuliner');
  const trips = useFetch<{ items: Trip[] }>('/api/trips');

  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/jelajah${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); };

  const thisMonth = meta?.today.slice(0, 7);
  const monthTrips = (trips.data?.items ?? []).filter((t) => t.date.startsWith(thisMonth ?? ''));
  const shownTrips = monthTrips.length ? monthTrips : (trips.data?.items ?? []).slice(0, 3);

  return (
    <>
      <section className="hero">
        <div className="hero-art">{HERO_IMAGE ? <img src={HERO_IMAGE} alt="" /> : <HeroScene />}</div>
        <div className="wrap hero-in">
          <h1>Your Next Story Starts in Banyumas.</h1>
          <p className="lead">Temukan tempat baru, susun perjalanan sesuai caramu, dan jelajahi Banyumas bersama People Plesir.</p>
          <div className="hero-cta">
            <Link className="btn btn-accent" to="/planner"><Sparkles /> Susun Itinerary dengan AI</Link>
            <Link className="btn btn-light" to="/open-trip"><Ticket /> Jelajahi Open Trip</Link>
          </div>
          <div>
            <form className="search-bar" role="search" onSubmit={submit}>
              <label className="sr" htmlFor="hero-q">Cari destinasi atau kuliner</label>
              <input id="hero-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari curug, hutan pinus, sroto…" maxLength={80} />
              <button className="btn btn-primary" type="submit"><Search /> Cari</button>
            </form>
            {!HERO_IMAGE && <p className="hero-note">Ilustrasi sementara. Foto destinasi asli akan menggantikannya setelah diunggah.</p>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Destinasi pilihan</h2>
              <p>Alam, budaya, dan keluarga di sekitar Baturraden hingga kota lama Banyumas.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/jelajah">Lihat semua destinasi</Link>
          </div>
          {dests.loading ? <Loading rows={1} height={320} /> : dests.error ? <ErrorBox error={dests.error} onRetry={dests.reload} /> : (
            <div className="grid cols-3">{(dests.data?.items ?? []).slice(0, 6).map((d) => <DestCard key={d.id} d={d} />)}</div>
          )}
        </div>
      </section>

      <section className="section tinted">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>{monthTrips.length ? 'Open Trip bulan ini' : 'Open Trip terdekat'}</h2>
              <p>Satu hari, satu tema, berangkat bersama peserta lain. Kursi yang tampil adalah data pemesanan aktual.</p>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/open-trip">Semua jadwal</Link>
          </div>
          {trips.loading ? <Loading rows={1} height={320} /> : trips.error ? <ErrorBox error={trips.error} onRetry={trips.reload} /> : shownTrips.length === 0 ? (
            <Empty title="Belum ada jadwal Open Trip" actions={<Link className="btn btn-primary" to="/private-trip">Ajukan Private Trip</Link>}>
              Jadwal bulan berikutnya belum diterbitkan. Anda tetap bisa menyusun itinerary sendiri atau mengajukan Private Trip.
            </Empty>
          ) : <div className="grid cols-3">{shownTrips.map((t) => <TripCard key={t.id} t={t} />)}</div>}
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head"><div><h2>Cara kerja People Plesir</h2><p>Dari ide sampai berangkat, dalam tiga langkah.</p></div></div>
          <ol className="route-steps">
            <li><span className="pin" aria-hidden="true">1</span><h3>Ceritakan perjalananmu</h3><p className="muted">Isi jumlah peserta, tanggal, kendaraan, anggaran, dan jenis wisata yang kamu suka.</p></li>
            <li><span className="pin" aria-hidden="true">2</span><h3>Dapatkan rencana yang masuk akal</h3><p className="muted">Urutan tempat disusun berdasarkan lokasi. Jadwal, waktu tempuh, dan biaya diperiksa sebelum ditampilkan.</p></li>
            <li><span className="pin" aria-hidden="true">3</span><h3>Berangkat dengan caramu</h3><p className="muted">Jalan sendiri dengan itinerary, ikut Open Trip, atau minta tim kami menyiapkan Private Trip.</p></li>
          </ol>
        </div>
      </section>

      <section className="section tinted">
        <div className="wrap">
          <div className="section-head"><div><h2>Kenapa People Plesir</h2></div></div>
          <div className="grid cols-2" style={{ gap: 28 }}>
            <div className="feature"><span className="ico"><Compass /></span><div><h3>Itinerary dari data, bukan karangan</h3><p className="muted">Setiap rekomendasi berasal dari data destinasi terstruktur. Model AI hanya memilih dan menulis ringkasan; jadwal dan biaya dihitung sistem.</p></div></div>
            <div className="feature"><span className="ico"><BadgeCheck /></span><div><h3>Jujur soal data</h3><p className="muted">Harga, jam buka, dan lokasi yang belum diverifikasi diberi label &quot;Perlu konfirmasi&quot;, tidak ditampilkan seolah pasti.</p></div></div>
            <div className="feature"><span className="ico"><Wallet /></span><div><h3>Harga transparan</h3><p className="muted">Rincian biaya terlihat jelas. Estimasi awal Private Trip dibedakan dari harga final.</p></div></div>
            <div className="feature"><span className="ico"><Users /></span><div><h3>Ikut rombongan atau pergi privat</h3><p className="muted">Open Trip sehari dengan harga terjangkau, atau Private Trip untuk grupmu sendiri.</p></div></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div><h2>Rekomendasi kuliner lokal</h2><p>Sroto, mendoan, getuk goreng, dan jajanan khas Banyumasan.</p></div>
            <Link className="btn btn-ghost btn-sm" to="/jelajah?kind=kuliner">Lihat kuliner</Link>
          </div>
          {food.loading ? <Loading rows={1} height={300} /> : food.error ? <ErrorBox error={food.error} onRetry={food.reload} /> : (
            <div className="grid cols-4">{(food.data?.items ?? []).slice(0, 4).map((d) => <DestCard key={d.id} d={d} />)}</div>
          )}
        </div>
      </section>

      <section className="section tinted">
        <div className="wrap" style={{ maxWidth: 820 }}>
          <div className="section-head"><div><h2>Pertanyaan singkat</h2></div><Link className="btn btn-link" to="/bantuan">Semua FAQ</Link></div>
          {HOME_FAQ.map((f) => <details className="faq" key={f.q}><summary>{f.q}</summary><div>{f.a}</div></details>)}
        </div>
      </section>

      <section className="section forest">
        <div className="wrap row between" style={{ gap: 24 }}>
          <div><h2>Siap menyusun trip pertamamu?</h2><p style={{ color: '#d9e6d8', marginTop: 8 }}>Tanpa akun, tanpa biaya untuk mencoba AI Planner.</p></div>
          <Link className="btn btn-accent" to="/planner">Rencanakan Trip</Link>
        </div>
      </section>
    </>
  );
}
