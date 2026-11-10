import { NavLink, Route, Routes } from 'react-router-dom';
import { Note, useTitle } from '../../components/ui';
import { AdminBookings } from './AdminBookings';
import { AdminDestinations } from './AdminDestinations';
import { AdminFinance, AdminPartners } from './AdminOps';
import { AdminOverview } from './AdminOverview';
import { AdminSettings } from './AdminSettings';
import { AdminTrips } from './AdminTrips';

const TABS: [string, string, boolean][] = [
  ['/admin', 'Ringkasan', true], ['/admin/pesanan', 'Pesanan', false], ['/admin/trip', 'Open Trip', false], ['/admin/destinasi', 'Destinasi', false],
  ['/admin/mitra', 'Mitra', false], ['/admin/keuangan', 'Keuangan', false], ['/admin/pengaturan', 'Pengaturan', false],
];

export default function Admin() {
  useTitle('Dashboard Admin');
  return (
    <div className="wrap" style={{ paddingBottom: 64 }}>
      <div className="page-head"><h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.5rem)' }}>Dashboard Admin</h1></div>
      <nav className="tabs" aria-label="Menu admin">
        {TABS.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>)}
      </nav>
      <Routes>
        <Route index element={<AdminOverview />} />
        <Route path="pesanan" element={<AdminBookings />} />
        <Route path="trip" element={<AdminTrips />} />
        <Route path="destinasi" element={<AdminDestinations />} />
        <Route path="mitra" element={<AdminPartners />} />
        <Route path="keuangan" element={<AdminFinance />} />
        <Route path="pengaturan" element={<AdminSettings />} />
        <Route path="*" element={<Note kind="warn">Halaman admin tidak ditemukan.</Note>} />
      </Routes>
    </div>
  );
}
