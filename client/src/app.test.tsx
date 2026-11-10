import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ToastProvider } from './components/ui';
import { AuthProvider } from './lib/auth';
import { formatDuration, rupiah, rupiahRange, toInt } from './lib/format';

const META = {
  categories: [], origins: [], today: '2026-10-20', demoData: true,
  engine: { ai: false, aiName: null, routing: 'estimate' },
  settings: { contact: { whatsapp: null, email: null, instagram: null, businessInfo: null }, policy: { isDemo: true, cancellation: 'x', payment: 'y', minParticipants: 'z' }, payment: { configured: false, bankName: null, accountNumber: null, accountHolder: null }, booking: { holdHours: 24, maxPerOrder: 10, feeFlat: 0 } },
};

function mockApi(user: null | { id: number; name: string; email: string; role: 'user' | 'admin' }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const SUMMARY = { range: { from: '2026-10-01', to: '2026-10-20' }, totals: { revenue: 0, refunds: 0, expenses: 0, net: 0 }, byStatus: {}, attention: { awaitingVerification: 0, privateAwaitingQuote: 0, refundsPending: 0, unverifiedDestinations: 0 }, byMonth: [], upcoming: [] };
    const body = url.includes('/api/admin/summary') ? SUMMARY : url.includes('/api/meta') ? META : url.includes('/api/auth/me') ? { user } : url.includes('/api/trips') ? { items: [] } : url.includes('/api/destinations') ? { items: [], total: 0, distanceNote: null } : { items: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></MemoryRouter>,
);

beforeEach(() => { window.scrollTo = vi.fn(); });
afterEach(() => vi.unstubAllGlobals());

describe('format', () => {
  it('rupiah, rentang, durasi, dan angka', () => {
    expect(rupiah(75000)).toBe('Rp75.000');
    expect(rupiah(null)).toBe('—');
    expect(rupiahRange(10000, 10000)).toBe('Rp10.000');
    expect(rupiahRange(10000, 25000)).toBe('Rp10.000–25.000');
    expect(formatDuration(45)).toBe('45 mnt');
    expect(formatDuration(90)).toBe('1 jam 30 mnt');
    expect(toInt('Rp 1.500.000')).toBe(1500000);
    expect(toInt('')).toBeNull();
  });
});

describe('navigasi', () => {
  it('beranda menampilkan navigasi utama, CTA, dan label data contoh', async () => {
    mockApi(null);
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    for (const label of ['Beranda', 'Jelajahi', 'AI Planner', 'Open Trip', 'Private Trip']) expect(nav).toHaveTextContent(label);
    expect(screen.getAllByRole('link', { name: 'Rencanakan Trip' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Lihat Open Trip' }).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Your Next Story Starts in Banyumas/)).toBeInTheDocument();
    expect(await screen.findByText('Data contoh.')).toBeInTheDocument();
  });

  it('berpindah halaman lewat menu', async () => {
    mockApi(null);
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    await userEvent.click(nav.querySelector('a[href="/open-trip"]')!);
    expect(await screen.findByRole('heading', { name: 'Open Trip' })).toBeInTheDocument();
  });

  it('halaman statis dan 404 tampil', async () => {
    mockApi(null);
    const a = renderAt('/bantuan');
    expect(await screen.findByRole('heading', { name: /FAQ dan pusat bantuan/ })).toBeInTheDocument();
    a.unmount();
    renderAt('/tidak-ada');
    expect(await screen.findByText('Halaman tidak ditemukan')).toBeInTheDocument();
  });

  it('dashboard mengarahkan tamu ke halaman masuk', async () => {
    mockApi(null);
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: /Masuk ke People Plesir/ })).toBeInTheDocument();
  });

  it('dashboard admin ditolak untuk pengguna biasa', async () => {
    mockApi({ id: 2, name: 'Biasa', email: 'b@x.id', role: 'user' });
    renderAt('/admin');
    expect(await screen.findByText('Halaman ini khusus admin')).toBeInTheDocument();
  });

  it('admin dapat membuka dashboard admin', async () => {
    mockApi({ id: 1, name: 'Admin', email: 'a@x.id', role: 'admin' });
    renderAt('/admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard Admin' })).toBeInTheDocument();
  });
});

describe('formulir masuk dan daftar', () => {
  it('validasi sisi klien sebelum mengirim', async () => {
    mockApi(null);
    renderAt('/masuk?mode=daftar');
    await userEvent.click(await screen.findByRole('button', { name: 'Daftar' }));
    expect(await screen.findByText('Isi nama lengkap')).toBeInTheDocument();
    expect(screen.getByText('Format email tidak valid')).toBeInTheDocument();
    expect(screen.getAllByText('Kata sandi minimal 8 karakter').length).toBeGreaterThan(0);
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/api/auth/register'))).toBe(false);
  });

  it('login berhasil memanggil API dengan data yang benar', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/meta')) return json(META);
      if (u.includes('/api/auth/me')) return json({ user: null });
      if (u.includes('/api/auth/login')) { expect(JSON.parse(String(init?.body))).toEqual({ email: 'a@b.id', password: 'rahasia123' }); return json({ user: { id: 3, name: 'Ani', email: 'a@b.id', role: 'user' } }); }
      return json({ items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/masuk');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.id');
    await userEvent.type(screen.getByLabelText('Kata sandi'), 'rahasia123');
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/auth/login'))).toBe(true));
    expect(await screen.findByRole('heading', { name: /Halo, Ani/ })).toBeInTheDocument();
  });
});
