import { Bell, Download, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Empty, ErrorBox, Loading, Note, StatusBadge, TextField, errMsg, fieldErr, useConfirm, useFetch, useTitle, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateShort, formatDateTime, rupiah } from '../lib/format';
import type { Booking, Notice, SavedItem } from '../lib/types';

function Bookings() {
  const { data, loading, error, reload } = useFetch<{ items: Booking[] }>('/api/bookings');
  const [tab, setTab] = useState<'open' | 'private' | 'riwayat'>('open');
  if (loading) return <Loading rows={3} height={90} />;
  if (error || !data) return <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} />;
  const active = (b: Booking) => !['selesai', 'dibatalkan'].includes(b.status);
  const list = data.items.filter((b) => tab === 'riwayat' ? !active(b) : b.type === tab && active(b));
  const count = (t: typeof tab) => data.items.filter((b) => t === 'riwayat' ? !active(b) : b.type === t && active(b)).length;
  return (
    <div className="stack">
      <div className="row" role="tablist" aria-label="Jenis pesanan">
        {([['open', 'Open Trip'], ['private', 'Private Trip'], ['riwayat', 'Riwayat']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(k)}>{l} ({count(k)})</button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title="Belum ada pesanan di sini" actions={tab === 'private' ? <Link className="btn btn-primary" to="/private-trip">Ajukan Private Trip</Link> : <Link className="btn btn-primary" to="/open-trip">Lihat Open Trip</Link>}>
          {tab === 'riwayat' ? 'Pesanan yang selesai atau dibatalkan akan muncul di sini.' : 'Pesanan aktif Anda akan muncul di sini beserta statusnya.'}
        </Empty>
      ) : list.map((b) => (
        <Link key={b.id} to={`/pesanan/${b.code}`} className="card flat" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="row between">
            <div>
              <div className="small muted">{b.code} · dibuat {formatDateShort(b.createdAt)}</div>
              <h3 style={{ fontSize: '1.1rem' }}>{b.type === 'open' ? b.trip?.title : 'Permintaan Private Trip'}</h3>
              <div className="small muted">{b.trip ? `${formatDate(b.trip.date)} · ` : ''}{b.participants} peserta · {b.total > 0 ? rupiah(b.total) : 'Harga menunggu penawaran'}</div>
            </div>
            <StatusBadge status={b.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function Itineraries() {
  const { data, loading, error, reload } = useFetch<{ items: SavedItem[] }>('/api/itineraries');
  const toast = useToast();
  const confirm = useConfirm();
  const del = async (it: SavedItem) => {
    if (!(await confirm.ask('Hapus itinerary?', <p>"{it.title}" akan dihapus permanen, termasuk tautan berbagi bila ada.</p>, { confirm: 'Hapus', danger: true }))) return;
    try { await api.del(`/api/itineraries/${it.id}`); toast('Itinerary dihapus.'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  if (loading) return <Loading rows={2} height={90} />;
  if (error || !data) return <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} />;
  if (!data.items.length) return <Empty title="Belum ada itinerary tersimpan" actions={<Link className="btn btn-primary" to="/planner">Rencanakan Trip</Link>}>Susun itinerary dengan AI Planner, lalu tekan Simpan.</Empty>;
  return (
    <div className="stack">
      {confirm.dialog}
      {data.items.map((it) => (
        <div key={it.id} className="card flat row between">
          <div>
            <h3 style={{ fontSize: '1.1rem' }}>{it.title}</h3>
            <div className="small muted">{formatDateShort(it.startDate)} · {it.days} hari · {it.participants} orang · {it.stops} perhentian{it.shared ? ' · dibagikan' : ''}</div>
            <div className="xsmall muted">Diperbarui {formatDateTime(it.updatedAt)}</div>
          </div>
          <div className="row">
            <Link className="btn btn-ghost btn-sm" to={`/planner/${it.id}`}>Buka dan ubah</Link>
            <Link className="btn btn-ghost btn-sm" to={`/planner/${it.id}`}><Download /> Unduh / cetak</Link>
            <button className="icon-btn" onClick={() => void del(it)} aria-label={`Hapus ${it.title}`}><Trash2 /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Notices() {
  const { data, loading, error, reload } = useFetch<{ items: Notice[] }>('/api/notifications');
  const toast = useToast();
  if (loading) return <Loading rows={3} height={64} />;
  if (error || !data) return <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} />;
  const unread = data.items.filter((n) => !n.readAt).length;
  return (
    <div className="stack">
      <div className="row between"><span className="muted small">{unread} belum dibaca</span>
        {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={async () => { try { await api.post('/api/notifications/read-all'); reload(); } catch (e) { toast(errMsg(e), 'error'); } }}>Tandai semua dibaca</button>}
      </div>
      {data.items.length === 0 ? <Empty title="Belum ada notifikasi">Pembaruan status pesanan muncul di sini.</Empty> : data.items.map((n) => (
        <div key={n.id} className="card flat" style={n.readAt ? undefined : { borderColor: 'var(--sunset)' }}>
          <div className="row between"><b><Bell size={14} /> {n.title}</b><span className="xsmall muted">{formatDateTime(n.createdAt)}</span></div>
          <p className="small" style={{ marginTop: 6 }}>{n.body}</p>
          {n.bookingId != null && <p className="xsmall muted">Notifikasi tampil di dashboard. Pengiriman email belum diaktifkan.</p>}
        </div>
      ))}
    </div>
  );
}

function Account() {
  const { user, meta } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.current) er.current = 'Isi kata sandi saat ini';
    if (f.next.length < 8) er.next = 'Kata sandi baru minimal 8 karakter';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try { await api.post('/api/auth/change-password', f); toast('Kata sandi diperbarui.'); setF({ current: '', next: '' }); }
    catch (err) { setErrors(fieldErr(err)); toast(errMsg(err), 'error'); } finally { setBusy(false); }
  };
  const c = meta?.settings.contact;
  return (
    <div className="grid cols-2">
      <div className="card"><h3>Akun</h3><p className="muted small" style={{ margin: '6px 0 16px' }}>{user?.name} · {user?.email}</p>
        <form className="stack" onSubmit={submit} noValidate>
          <TextField label="Kata sandi saat ini" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} error={errors.current} />
          <TextField label="Kata sandi baru" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} error={errors.next} />
          <button className="btn btn-primary" disabled={busy}>Ubah kata sandi</button>
        </form>
      </div>
      <div className="card soft"><h3>Bantuan</h3>
        <ul className="stack-sm" style={{ paddingLeft: 20, marginTop: 10 }}>
          <li>WhatsApp: {c?.whatsapp ? <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{c.whatsapp}</a> : <span className="muted">belum diatur</span>}</li>
          <li>Email: {c?.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="muted">belum diatur</span>}</li>
          <li><Link to="/bantuan">FAQ dan pusat bantuan</Link></li>
        </ul>
      </div>
    </div>
  );
}

export default function Dashboard() {
  useTitle('Dashboard');
  const { user } = useAuth();
  return (
    <div className="wrap" style={{ paddingBottom: 64 }}>
      <div className="page-head"><h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.5rem)' }}>Halo, {user?.name.split(' ')[0]}</h1><p className="lead">Pesanan, itinerary tersimpan, dan notifikasi Anda.</p></div>
      <Note>Status pesanan hanya berubah setelah verifikasi admin. Pembayaran yang baru dilaporkan belum berarti terkonfirmasi.</Note>
      <nav className="tabs" style={{ marginTop: 20 }} aria-label="Dashboard">
        <NavLink to="/dashboard" end className={({ isActive }) => (isActive ? 'active' : '')}>Pesanan</NavLink>
        <NavLink to="/dashboard/itinerary" className={({ isActive }) => (isActive ? 'active' : '')}>Itinerary tersimpan</NavLink>
        <NavLink to="/dashboard/notifikasi" className={({ isActive }) => (isActive ? 'active' : '')}>Notifikasi</NavLink>
        <NavLink to="/dashboard/akun" className={({ isActive }) => (isActive ? 'active' : '')}>Akun dan bantuan</NavLink>
      </nav>
      <Routes>
        <Route index element={<Bookings />} />
        <Route path="itinerary" element={<Itineraries />} />
        <Route path="notifikasi" element={<Notices />} />
        <Route path="akun" element={<Account />} />
      </Routes>
    </div>
  );
}
