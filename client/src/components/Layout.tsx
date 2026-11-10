import { Info, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill="#245C45" />
      <path d="M10 46 25 25l9 12 7-9 13 18z" fill="#A8C3A0" />
      <path d="M12 52c10-6 18 2 26-4s10-8 14-14" fill="none" stroke="#FAF8F1" strokeWidth="3" strokeDasharray="1 5" strokeLinecap="round" />
      <circle cx="46" cy="18" r="6.5" fill="#E99555" />
    </svg>
  );
}

const LINKS: [string, string][] = [['/', 'Beranda'], ['/jelajah', 'Jelajahi'], ['/planner', 'AI Planner'], ['/open-trip', 'Open Trip'], ['/private-trip', 'Private Trip']];

function MainNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {LINKS.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate} className={({ isActive }) => (onNavigate ? `nav-link ${isActive ? 'active' : ''}` : isActive ? 'active' : '')}>
          {label}
        </NavLink>
      ))}
    </>
  );
}

function UserArea({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  if (!user) return <Link className="btn btn-ghost btn-sm" to="/masuk" onClick={onNavigate}>Masuk</Link>;
  return (
    <>
      <Link className="userchip" to={user.role === 'admin' ? '/admin' : '/dashboard'} onClick={onNavigate}>
        <span className="av" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
        {user.role === 'admin' ? 'Admin' : 'Dashboard'}
      </Link>
      <button className="icon-btn" onClick={() => { void logout(); onNavigate?.(); }} aria-label="Keluar"><LogOut /></button>
    </>
  );
}

export function Layout() {
  const { meta } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); setOpen(false); }, [loc.pathname]);
  const c = meta?.settings.contact;

  return (
    <>
      <a className="skip" href="#konten">Lewati ke konten</a>
      {meta?.demoData && (
        <div className="demo-ribbon no-print">
          <div className="wrap">
            <Info />
            <span><b>Data contoh.</b> Harga, jam buka, dan lokasi destinasi masih perkiraan dan bertanda <b>Perlu konfirmasi</b> sampai diverifikasi tim People Plesir.</span>
          </div>
        </div>
      )}
      <header className="site-header">
        <div className="wrap header-in">
          <Link to="/" className="brand" aria-label="People Plesir, ke beranda"><Logo />People Plesir</Link>
          <nav className="nav" aria-label="Navigasi utama"><MainNav /></nav>
          <div className="header-cta">
            <UserArea />
            <Link className="btn btn-ghost btn-sm" to="/open-trip">Lihat Open Trip</Link>
            <Link className="btn btn-primary btn-sm" to="/planner">Rencanakan Trip</Link>
          </div>
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Buka menu" aria-expanded={open}><Menu /></button>
        </div>
      </header>
      {open && (
        <div className="drawer" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="drawer-panel" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="brand"><Logo />People Plesir</span>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Tutup menu"><X /></button>
            </div>
            <MainNav onNavigate={() => setOpen(false)} />
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%', margin: '10px 0' }} />
            <Link className="btn btn-primary btn-block" to="/planner">Rencanakan Trip</Link>
            <Link className="btn btn-ghost btn-block" to="/open-trip">Lihat Open Trip</Link>
            <div className="row" style={{ marginTop: 10 }}><UserArea onNavigate={() => setOpen(false)} /></div>
          </div>
        </div>
      )}
      <main id="konten" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <span className="brand" style={{ color: '#fff' }}><Logo />People Plesir</span>
              <p style={{ marginTop: 14, maxWidth: '34ch' }}>Your Way to Plesir, Your Way to Explore. Platform perencanaan perjalanan di Kabupaten Banyumas, Jawa Tengah.</p>
            </div>
            <div>
              <h4>Jelajah</h4>
              <ul className="foot-list">
                <li><Link to="/jelajah">Jelajahi wisata dan kuliner</Link></li>
                <li><Link to="/planner">AI Itinerary Planner</Link></li>
                <li><Link to="/open-trip">Open Trip</Link></li>
                <li><Link to="/private-trip">Private Trip</Link></li>
              </ul>
            </div>
            <div>
              <h4>Bantuan</h4>
              <ul className="foot-list">
                <li><Link to="/bantuan">FAQ dan pusat bantuan</Link></li>
                <li><Link to="/tentang">Tentang People Plesir</Link></li>
                <li><Link to="/privasi">Kebijakan privasi</Link></li>
                <li><Link to="/syarat">Syarat layanan</Link></li>
              </ul>
            </div>
            <div>
              <h4>Kontak</h4>
              <ul className="foot-list">
                <li>WhatsApp: {c?.whatsapp ? <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{c.whatsapp}</a> : <span>belum diatur</span>}</li>
                <li>Email: {c?.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span>belum diatur</span>}</li>
                <li>Instagram: {c?.instagram ? <a href={`https://instagram.com/${c.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer">{c.instagram}</a> : <span>belum diatur</span>}</li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <p>{c?.businessInfo ?? 'Informasi badan usaha belum diisi. Admin dapat mengisinya di Dashboard Admin, bagian Pengaturan.'}</p>
            <p>© {new Date().getFullYear()} People Plesir. Estimasi waktu dan biaya dapat berubah sesuai kondisi lapangan.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
