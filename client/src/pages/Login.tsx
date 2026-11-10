import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { TextField, Note, errMsg, fieldErr, useTitle } from '../components/ui';
import { useAuth } from '../lib/auth';

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);

export default function Login() {
  const { user, login, register, loading } = useAuth();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const mode: 'masuk' | 'daftar' = sp.get('mode') === 'daftar' ? 'daftar' : 'masuk';
  useTitle(mode === 'masuk' ? 'Masuk' : 'Daftar akun');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const next = safeNext(sp.get('next'));

  if (!loading && user) return <Navigate to={next ?? (user.role === 'admin' ? '/admin' : '/dashboard')} replace />;

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode === 'daftar' && f.name.trim().length < 2) e.name = 'Isi nama lengkap';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Format email tidak valid';
    if (mode === 'daftar' ? f.password.length < 8 : f.password.length < 1) e.password = mode === 'daftar' ? 'Kata sandi minimal 8 karakter' : 'Isi kata sandi';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e); setFormErr('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const u = mode === 'masuk'
        ? await login(f.email.trim(), f.password)
        : await register({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, password: f.password });
      nav(next ?? (u.role === 'admin' ? '/admin' : '/dashboard'), { replace: true });
    } catch (err) {
      setErrors(fieldErr(err)); setFormErr(errMsg(err));
    } finally { setBusy(false); }
  };

  const switchMode = () => { const p = new URLSearchParams(sp); if (mode === 'masuk') p.set('mode', 'daftar'); else p.delete('mode'); setSp(p); setErrors({}); setFormErr(''); };

  return (
    <div className="wrap section">
      <div className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.8rem' }}>{mode === 'masuk' ? 'Masuk ke People Plesir' : 'Buat akun'}</h1>
        <p className="muted" style={{ margin: '6px 0 18px' }}>
          {mode === 'masuk' ? 'Masuk untuk menyimpan itinerary dan memantau pesanan.' : 'Akun dibutuhkan hanya untuk menyimpan itinerary dan memesan trip. AI Planner tetap bisa dicoba tanpa akun.'}
        </p>
        <form onSubmit={submit} noValidate className="stack">
          {formErr && !Object.keys(errors).length && <Note kind="danger">{formErr}</Note>}
          {mode === 'daftar' && <TextField label="Nama lengkap" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} />}
          <TextField label="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} />
          {mode === 'daftar' && <TextField label="Nomor WhatsApp (opsional)" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={errors.phone} />}
          <TextField label="Kata sandi" type="password" autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={errors.password} hint={mode === 'daftar' ? 'Minimal 8 karakter' : undefined} />
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Memproses…' : mode === 'masuk' ? 'Masuk' : 'Daftar'}</button>
        </form>
        <p className="small center" style={{ marginTop: 16 }}>
          {mode === 'masuk' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
          <button type="button" className="btn-link" onClick={switchMode}>{mode === 'masuk' ? 'Daftar' : 'Masuk'}</button>
        </p>
        <p className="xsmall muted center">Dengan mendaftar, Anda menyetujui <Link to="/syarat">Syarat Layanan</Link> dan <Link to="/privasi">Kebijakan Privasi</Link>.</p>
      </div>
    </div>
  );
}
