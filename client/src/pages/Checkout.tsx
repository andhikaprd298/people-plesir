import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorBox, Loading, Note, NumberStepper, Field, TextField, errMsg, fieldErr, useFetch, useTitle, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, rupiah } from '../lib/format';
import type { Booking, TripDetail } from '../lib/types';

const PHONE = /^(\+62|62|0)8\d{7,12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Checkout() {
  const { slug } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user, meta } = useAuth();
  const { data: t, loading, error, reload } = useFetch<TripDetail>(`/api/trips/${slug}`);
  useTitle(t ? `Daftar ${t.title}` : 'Daftar Open Trip');

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ contactName: user?.name ?? '', contactPhone: '', contactEmail: user?.email ?? '', participants: 1, agree: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading) return <div className="wrap section"><Loading rows={2} height={200} /></div>;
  if (error || !t) return <div className="wrap section"><ErrorBox error={error ?? 'Open Trip tidak ditemukan'} onRetry={reload} /></div>;

  const maxPer = Math.max(1, Math.min(t.seats.left, meta?.settings.booking.maxPerOrder ?? 10));
  const fee = meta?.settings.booking.feeFlat ?? 0;
  const subtotal = t.price * form.participants;
  const total = subtotal + fee;
  const bookable = t.state === 'tersedia';

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.contactName.trim().length < 2) e.contactName = 'Isi nama pemesan';
    if (!PHONE.test(form.contactPhone.replace(/[\s\-().]/g, ''))) e.contactPhone = 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx)';
    if (!EMAIL.test(form.contactEmail.trim())) e.contactEmail = 'Format email tidak valid';
    if (form.participants < 1) e.participants = 'Minimal 1 peserta';
    if (form.participants > maxPer) e.participants = `Maksimal ${maxPer} peserta untuk pesanan ini`;
    return e;
  };

  const toReview = () => { const e = validate(); setErrors(e); if (!Object.keys(e).length) setStep(2); };

  const submit = async () => {
    if (!form.agree) { setErrors({ agree: 'Setujui kebijakan pembatalan dan ketentuan pembayaran' }); return; }
    setBusy(true); setFormError(null);
    try {
      const b = await api.post<Booking>('/api/bookings/open', { tripId: t.id, contactName: form.contactName.trim(), contactPhone: form.contactPhone, contactEmail: form.contactEmail.trim(), participants: form.participants, agreeTerms: true });
      toast('Pesanan dibuat. Lanjutkan ke pembayaran.');
      nav(`/pesanan/${b.code}`, { replace: true });
    } catch (err) {
      const f = fieldErr(err);
      if (Object.keys(f).length) { setErrors(f); setStep(1); }
      setFormError(errMsg(err));
      reload();
    } finally { setBusy(false); }
  };

  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="page-head">
        <nav className="breadcrumb"><Link to="/open-trip">Open Trip</Link> / <Link to={`/open-trip/${t.slug}`}>{t.title}</Link> / Daftar</nav>
        <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.5rem)' }}>Daftar {t.title}</h1>
      </div>

      {!bookable && <Note kind="danger"><b>Trip ini tidak dapat dipesan.</b> Status saat ini: {t.state}. <Link to="/open-trip">Lihat jadwal lain</Link></Note>}

      {bookable && (
        <div className="split">
          <div className="wizard-card">
            <ol className="wizard-steps" aria-label="Langkah pemesanan">
              <li className={step > 1 ? 'done' : 'now'}><i />1. Data pemesan</li>
              <li className={step === 2 ? 'now' : ''}><i />2. Periksa pesanan</li>
              <li><i />3. Pembayaran</li>
            </ol>
            {formError && <div style={{ marginBottom: 16 }}><Note kind="danger">{formError}</Note></div>}

            {step === 1 && (
              <form noValidate onSubmit={(e) => { e.preventDefault(); toReview(); }} className="form-grid two">
                <TextField className="span2" label="Nama pemesan" autoComplete="name" value={form.contactName} error={errors.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                <TextField label="Nomor WhatsApp" type="tel" autoComplete="tel" inputMode="tel" placeholder="0812xxxxxxx" value={form.contactPhone} error={errors.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
                <TextField label="Email" type="email" autoComplete="email" value={form.contactEmail} error={errors.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                <Field label="Jumlah peserta" error={errors.participants} hint={`Tersisa ${t.seats.left} kursi. Maksimal ${maxPer} per pesanan.`}>
                  <NumberStepper label="peserta" value={form.participants} min={1} max={maxPer} onChange={(n) => setForm({ ...form, participants: n })} />
                </Field>
                <div className="span2"><button className="btn btn-primary" type="submit">Periksa pesanan</button></div>
              </form>
            )}

            {step === 2 && (
              <div className="stack">
                <div className="panel"><b>{form.contactName}</b><div className="small muted">{form.contactPhone} · {form.contactEmail}</div></div>
                <Note><b>Pembayaran lewat transfer manual.</b> Kami belum memakai gateway pembayaran. Setelah pesanan dibuat Anda akan melihat rekening tujuan. Kursi ditahan {meta?.settings.booking.holdHours ?? 24} jam; pesanan menjadi <b>Dikonfirmasi</b> hanya setelah admin memverifikasi pembayaran.</Note>
                {meta?.settings.policy.isDemo && <Note kind="sun">Kebijakan di bawah masih teks contoh.</Note>}
                <details className="faq"><summary>Kebijakan pembatalan</summary><div>{meta?.settings.policy.cancellation}</div></details>
                <details className="faq"><summary>Ketentuan pembayaran</summary><div>{meta?.settings.policy.payment}</div></details>
                <div className={`field ${errors.agree ? 'invalid' : ''}`}>
                  <label className="check"><input type="checkbox" checked={form.agree} onChange={(e) => { setForm({ ...form, agree: e.target.checked }); setErrors({}); }} /> Saya sudah membaca dan menyetujui kebijakan pembatalan dan ketentuan pembayaran.</label>
                  {errors.agree && <span className="err" role="alert">{errors.agree}</span>}
                </div>
                <div className="row"><button className="btn btn-ghost" onClick={() => setStep(1)}>Ubah data</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Membuat pesanan…' : 'Buat pesanan'}</button></div>
              </div>
            )}
          </div>

          <aside className="side card stack">
            <h3>Rincian pesanan</h3>
            <div className="small muted">{formatDate(t.date)} · berangkat {t.departTime}<br />{t.meetingPoint ?? 'Titik kumpul perlu konfirmasi'}</div>
            <dl className="kv">
              <dt>{rupiah(t.price)} × {form.participants} peserta</dt><dd>{rupiah(subtotal)}</dd>
              <dt>Biaya layanan</dt><dd>{fee ? rupiah(fee) : 'Rp0'}</dd>
              <dt className="total">Total</dt><dd className="total">{rupiah(total)}</dd>
            </dl>
            <p className="xsmall muted">Tidak ada biaya tambahan lain di luar rincian ini. Total akhir dihitung ulang oleh server saat pesanan dibuat.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
