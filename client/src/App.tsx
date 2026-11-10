import { Suspense, lazy } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading, useTitle } from './components/ui';
import { RequireAuth } from './lib/auth';
import BookingPage from './pages/BookingPage';
import Checkout from './pages/Checkout';
import DestinationDetail from './pages/DestinationDetail';
import Explore from './pages/Explore';
import Home from './pages/Home';
import { OpenTripList, TripDetailPage } from './pages/OpenTrips';
import Planner from './pages/Planner';
import PrivateTrip from './pages/PrivateTrip';
import { About, Help, Privacy, Terms } from './pages/Static';
import Login from './pages/Login';
import SharedItinerary from './pages/SharedItinerary';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Admin = lazy(() => import('./pages/admin/Admin'));

function NotFound() {
  useTitle('Halaman tidak ditemukan');
  return (
    <div className="wrap section">
      <div className="empty">
        <h3>Halaman tidak ditemukan</h3>
        <p className="muted">Alamat yang Anda buka tidak ada atau sudah dipindahkan.</p>
        <div className="row"><Link className="btn btn-primary" to="/">Ke beranda</Link><Link className="btn btn-ghost" to="/jelajah">Jelajahi Banyumas</Link></div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="wrap section"><Loading rows={2} height={200} /></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="jelajah" element={<Explore />} />
          <Route path="destinasi/:id" element={<DestinationDetail />} />
          <Route path="planner" element={<Planner />} />
          <Route path="planner/:id" element={<RequireAuth><Planner /></RequireAuth>} />
          <Route path="bagikan/:token" element={<SharedItinerary />} />
          <Route path="open-trip" element={<OpenTripList />} />
          <Route path="open-trip/:slug" element={<TripDetailPage />} />
          <Route path="open-trip/:slug/daftar" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="private-trip" element={<PrivateTrip />} />
          <Route path="pesanan/:code" element={<RequireAuth><BookingPage /></RequireAuth>} />
          <Route path="masuk" element={<Login />} />
          <Route path="dashboard/*" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="admin/*" element={<RequireAuth admin><Admin /></RequireAuth>} />
          <Route path="tentang" element={<About />} />
          <Route path="bantuan" element={<Help />} />
          <Route path="privasi" element={<Privacy />} />
          <Route path="syarat" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
