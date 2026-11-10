import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Choice, ErrorBox, Field, Loading, Note, NumberStepper, SelectField, TextAreaField, TextField, errMsg, fieldErr, useFetch, useTitle, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { INTEREST_LABEL, PRIVATE_VEHICLE_LABEL, formatDate, rupiah, rupiahRange, safeStorage, toInt } from '../lib/format';
import type { Booking, Dest, Itinerary, PrivateEstimate } from '../lib/types';

const FORM_KEY = 'pp.private.form';
const RESULT_KEY = 'pp.planner.result';
const sess = safeStorage('session');
const local = safeStorage('local');

interface Form {
  desiredDate: string; flexibleDates: boolean; participants: number; days: number; origin: string; destinationIds: string[]; tourTypes: string[];
  vehicle: 'motor' | 'mobil_sopir' | 'minibus'; budgetMode: 'per_person' | 'total'; budgetAmount: number | null;
  facilities: { transport: boolean; tickets: boolean; meals: boolean; guide: boolean }; mealsPerDay: number; notes: string;
  contactName: string; contactPhone: string; contactEmail: string; agree: boolean; itineraryDraft: { title: string; days: { date: string; stops: { destinationId: string; name: string }[] }[] } | null;
}

const PRESETS: { key: string; label: string; sub: string; f: Form['facilities'] }[] = [
  { key: 'transport', label: 'Transportasi saja', sub: 'Kendaraan dan sopir', f: { transport: true, tickets: false, meals: false, guide: false } },
  { key: 'tiket', label: 'Transportasi + tiket', sub: 'Tanpa makan dan pemandu', f: { transport: true, tickets: true, meals: false, guide: false } },
  { key: 'lengkap', label: 'Paket lengkap', sub: 'Transportasi, tiket, makan, pemandu', f: { transport: true, tickets: true, meals: true, guide: true } },
];
const vehicleFromPlanner = (v: string): Form['vehicle'] => (v === 'motor' ? 'motor' : 'mobil_sopir');

export default function PrivateTrip() {
  useTitle('Private Trip');
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const toast = useToast();
  const { user, meta } = useAuth();
  const dests = useFetch<{ items: Dest[] }>('/api/destinations');
  const today = meta?.today ?? new Date().toISOString().slice(0, 10);

  const [f, setF] = useState<Form>(() => sess.read<Form | null>(FORM_KEY, null) ?? {
    desiredDate: '', flexibleDates: false, participants: 6, days: 1, origin: '', destinationIds: [], tourTypes: [], vehicle: 'mobil_sopir',
    budgetMode: 'per_person', budgetAmount: null, facilities: { transport: true, tickets: true, meals: false, guide: false }, mealsPerDay: 2, notes: '',
    contactName: '', contactPhone: '', contactEmail: '', agree: false, itineraryDraft: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [est, setEst] = useState<PrivateEstimate | null>(null);
  const [estErr, setEstErr] = useState<string | null>(null);
  const [estBusy, setEstBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const planner = useMemo(() => local.read<{ itinerary: Itinerary } | null>(RESULT_KEY, null), []);

  useEffect(() => { sess.write(FORM_KEY, f); }, [f]);
  useEffect(() => { if (user) setF((p) => ({ ...p, contactName: p.contactName || user.name, contactEmail: p.contactEmail || user.email })); }, [user]);

  // Estimasi awal dihitung server dari tarif internal dan harga tiket di database.
  useEffect(() => {
    const t = setTimeout(() => {
      setEstBusy(true);
      api.post<PrivateEstimate>('/api/private-trips/estimate', { participants: f.participants, days: f.days, vehicle: f.vehicle, facilities: f.facilities, mealsPerDay: f.mealsPerDay, destinationIds: f.destinationIds })
        .then((r) => { setEst(r); setEstErr(null); })
        .catch((e) => setEstErr(errMsg(e)))
        .finally(() => setEstBusy(false));
    }, 350);
    return () => clearTimeout(t);
  }, [f.participants, f.days, f.vehicle, f.facilities, f.mealsPerDay, f.destinationIds]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const importPlanner = () => {
    if (!planner) return;
    const it = planner.itinerary;
    setF((p) => ({
      ...p, desiredDate: it.input.startDate, participants: Math.min(60, it.input.participants), days: it.input.days, origin: it.input.origin.label,
      vehicle: vehicleFromPlanner(it.input.vehicle), destinationIds: Array.from(new Set(it.days.flatMap((d) => d.stops.map((s) => s.destinationId)))),
      tourTypes: it.input.interests, budgetMode: it.input.budget.mode, budgetAmount: it.input.budget.amount,
      itineraryDraft: { title: it.title, days: it.days.map((d) => ({ date: d.date, stops: d.stops.map((s) => ({ destinationId: s.destinationId, name: s.dest.name })) })) },
    }));
    toast('Itinerary dari AI Planner dimasukkan ke formulir.');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.desiredDate) e.desiredDate = 'Pilih tanggal yang diinginkan';
    else if (f.desiredDate < today) e.desiredDate = 'Pilih tanggal hari ini atau setelahnya';
    if (f.participants < 1 || f.participants > 60) e.participants = 'Peserta 1–60 orang';
    if (f.origin.trim().length < 2) e.origin = 'Isi titik keberangkatan atau penginapan';
    if (f.contactName.trim().length < 2) e.contactName = 'Isi nama';
    if (!/^(\+62|62|0)8\d{7,12}$/.test(f.contactPhone.replace(/[\s\-().]/g, ''))) e.contactPhone = 'Nomor WhatsApp tidak valid (contoh: 0812xxxxxxx)';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) e.contactEmail = 'Format email tidak valid';
    if (!Object.values(f.facilities).some(Boolean)) e.facilities = 'Pilih minimal satu fasilitas';
    if (!f.agree) e.agree = 'Setujui bahwa estimasi awal bukan harga final';
    return e;
  };

  const submit = async () => {
    const e = validate(); setErrors(e); setFormErr(null);
    if (Object.keys(e).length) { document.querySelector('.invalid')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (!user) { nav(`/masuk?next=${encodeURIComponent('/private-trip')}`); return; }
    setBusy(true);
    try {
      const b = await api.post<Booking>('/api/bookings/private', {
        desiredDate: f.desiredDate, flexibleDates: f.flexibleDates, participants: f.participants, days: f.days, origin: f.origin.trim(), destinationIds: f.destinationIds,
        tourTypes: f.tourTypes, vehicle: f.vehicle, budget: { mode: f.budgetMode, amount: f.budgetAmount }, facilities: f.facilities, mealsPerDay: f.mealsPerDay, notes: f.notes,
        itineraryDraft: f.itineraryDraft, contactName: f.contactName.trim(), contactPhone: f.contactPhone, contactEmail: f.contactEmail.trim(), agreeTerms: true,
      });
      sess.remove(FORM_KEY);
      toast('Permintaan terkirim. Tim kami akan menyiapkan penawaran.');
      nav(`/pesanan/${b.code}`);
    } catch (err) { setErrors(fieldErr(err)); setFormErr(errMsg(err)); } finally { setBusy(false); }
  };

  const budgetTotal = f.budgetAmount == null ? null : f.budgetMode === 'total' ? f.budgetAmount : f.budgetAmount * f.participants;
  const items = dests.data?.items ?? [];

  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="page-head">
        <h1 style={{ fontSize: 'clamp(1.9rem,4.4vw,2.8rem)' }}>Your Group. Your Route. Your Plesir.</h1>
        <p className="lead">Perjalanan khusus untuk grupmu: tanggal, rute, dan fasilitas sesuai kebutuhan. Isi formulir, lihat estimasi awal, lalu tim kami mengirim penawaran final.</p>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 28 }}>
        <div className="card soft"><h3>1. Ajukan</h3><p className="small muted">Isi kebutuhan perjalananmu. Bisa dimulai dari itinerary AI.</p></div>
        <div className="card soft"><h3>2. Kami periksa</h3><p className="small muted">Tim memeriksa ketersediaan mitra dan biaya aktual.</p></div>
        <div className="card soft"><h3>3. Terima penawaran final</h3><p className="small muted">Pesanan terkonfirmasi hanya setelah jadwal, harga, dan ketersediaan disetujui tim dan pembayaran diverifikasi.</p></div>
      </div>

      <div className="split">
        <form className="stack-lg" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <section className="card stack" aria-labelledby="mulai">
            <h2 id="mulai" style={{ fontSize: '1.3rem' }}>Mulai dari mana?</h2>
            <div className="grid cols-2">
              <div className="panel stack-sm">
                <b>Buat itinerary dengan AI dulu</b>
                <p className="small muted">{planner ? `Ada itinerary terakhir: “${planner.itinerary.title}”.` : 'Susun rute di AI Planner, lalu bawa ke sini.'}</p>
                <div className="row">
                  {planner && <button type="button" className="btn btn-primary btn-sm" onClick={importPlanner}>Pakai itinerary ini</button>}
                  <Link className="btn btn-ghost btn-sm" to="/planner">{planner ? 'Buat yang baru' : 'Buka AI Planner'}</Link>
                </div>
                {f.itineraryDraft && <span className="chip ok">Terlampir: {f.itineraryDraft.title}</span>}
              </div>
              <div className="panel stack-sm">
                <b>Minta People Plesir menyusun penawaran</b>
                <p className="small muted">Isi formulir di bawah. Rute dan pemilihan mitra kami yang atur.</p>
              </div>
            </div>
          </section>

          <section className="card form-grid two" aria-labelledby="detail">
            <h2 id="detail" className="span2" style={{ fontSize: '1.3rem' }}>Detail perjalanan</h2>
            <TextField label="Tanggal yang diinginkan" type="date" min={today} value={f.desiredDate} error={errors.desiredDate} onChange={(e) => set('desiredDate', e.target.value)} />
            <div className="field" style={{ justifyContent: 'flex-end' }}><label className="check"><input type="checkbox" checked={f.flexibleDates} onChange={(e) => set('flexibleDates', e.target.checked)} /> Tanggal bisa fleksibel</label></div>
            <Field label="Jumlah peserta" error={errors.participants}><NumberStepper label="peserta" value={f.participants} min={1} max={60} onChange={(n) => set('participants', n)} /></Field>
            <Field label="Durasi (hari)"><NumberStepper label="hari" value={f.days} min={1} max={7} onChange={(n) => set('days', n)} /></Field>
            <TextField className="span2" label="Titik keberangkatan atau penginapan" value={f.origin} error={errors.origin} placeholder="Contoh: Hotel di Purwokerto, Stasiun Purwokerto" onChange={(e) => set('origin', e.target.value)} />
            <SelectField label="Jenis kendaraan" value={f.vehicle} onChange={(e) => set('vehicle', e.target.value as Form['vehicle'])}>
              {Object.entries(PRIVATE_VEHICLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField>
            <div className="form-grid two" style={{ gap: 12 }}>
              <SelectField label="Anggaran" value={f.budgetMode} onChange={(e) => set('budgetMode', e.target.value as Form['budgetMode'])}><option value="per_person">Per orang</option><option value="total">Total</option></SelectField>
              <TextField label="Jumlah (Rp), opsional" inputMode="numeric" value={f.budgetAmount != null ? new Intl.NumberFormat('id-ID').format(f.budgetAmount) : ''} onChange={(e) => set('budgetAmount', toInt(e.target.value))} />
            </div>
            <fieldset className="span2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="legend" style={{ marginBottom: 8 }}>Jenis wisata</legend>
              <div className="choice-grid">{Object.entries(INTEREST_LABEL).map(([k, v]) => <Choice key={k} checked={f.tourTypes.includes(k)} onChange={() => set('tourTypes', toggle(f.tourTypes, k))}>{v}</Choice>)}</div>
            </fieldset>
            <fieldset className="span2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="legend" style={{ marginBottom: 8 }}>Destinasi yang diinginkan</legend>
              {dests.loading ? <Loading rows={1} height={60} /> : dests.error ? <ErrorBox error={dests.error} onRetry={dests.reload} /> : (
                <div className="choice-grid">{items.map((d) => <Choice key={d.id} checked={f.destinationIds.includes(d.id)} onChange={() => set('destinationIds', toggle(f.destinationIds, d.id))}>{d.name}</Choice>)}</div>
              )}
            </fieldset>
          </section>

          <section className="card stack" aria-labelledby="fasilitas">
            <h2 id="fasilitas" style={{ fontSize: '1.3rem' }}>Fasilitas</h2>
            <div className="choice-grid" role="group" aria-label="Paket fasilitas siap pakai">
              {PRESETS.map((p) => <Choice key={p.key} type="radio" name="preset" sub={p.sub} checked={JSON.stringify(f.facilities) === JSON.stringify(p.f)} onChange={() => set('facilities', p.f)}>{p.label}</Choice>)}
            </div>
            <div className={`field ${errors.facilities ? 'invalid' : ''}`}>
              <span className="legend">Atau pilih sendiri</span>
              <div className="choice-grid">
                {([['transport', 'Transportasi'], ['tickets', 'Tiket masuk'], ['meals', 'Makan'], ['guide', 'Pemandu']] as const).map(([k, l]) => <Choice key={k} checked={f.facilities[k]} onChange={(v) => set('facilities', { ...f.facilities, [k]: v })}>{l}</Choice>)}
              </div>
              {errors.facilities && <span className="err" role="alert">{errors.facilities}</span>}
            </div>
            {f.facilities.meals && <Field label="Makan per hari"><NumberStepper label="kali makan per hari" value={f.mealsPerDay} min={1} max={3} onChange={(n) => set('mealsPerDay', n)} /></Field>}
            <TextAreaField label="Catatan tambahan (opsional)" value={f.notes} maxLength={1500} onChange={(e) => set('notes', e.target.value)} hint="Misalnya kebutuhan lansia, anak kecil, atau tempat yang ingin dihindari." />
          </section>

          <section className="card form-grid two" aria-labelledby="kontak">
            <h2 id="kontak" className="span2" style={{ fontSize: '1.3rem' }}>Kontak pemesan</h2>
            <TextField className="span2" label="Nama" autoComplete="name" value={f.contactName} error={errors.contactName} onChange={(e) => set('contactName', e.target.value)} />
            <TextField label="Nomor WhatsApp" type="tel" inputMode="tel" autoComplete="tel" placeholder="0812xxxxxxx" value={f.contactPhone} error={errors.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            <TextField label="Email" type="email" autoComplete="email" value={f.contactEmail} error={errors.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            <div className={`field span2 ${errors.agree ? 'invalid' : ''}`}>
              <label className="check"><input type="checkbox" checked={f.agree} onChange={(e) => set('agree', e.target.checked)} /> Saya memahami bahwa angka di halaman ini adalah estimasi awal. Harga final dan ketersediaan ditetapkan tim People Plesir, dan pesanan belum terkonfirmasi sebelum itu.</label>
              {errors.agree && <span className="err" role="alert">{errors.agree}</span>}
            </div>
            {formErr && <div className="span2"><Note kind="danger">{formErr}</Note></div>}
            <div className="span2 row">
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Ajukan Private Trip'}</button>
              {!user && <span className="small muted">Anda akan diminta masuk atau mendaftar sebelum permintaan dikirim. Isi formulir tidak hilang.</span>}
            </div>
          </section>
        </form>

        <aside className="side stack">
          <div className="card stack" aria-live="polite">
            <div className="row between"><h3>Estimasi awal</h3><span className="chip sun">Bukan harga final</span></div>
            {estErr ? <Note kind="danger">{estErr}</Note> : !est ? <Loading rows={1} height={160} /> : (
              <>
                <div style={{ opacity: estBusy ? 0.6 : 1 }}>
                  <div className="price num">{rupiahRange(est.range.low, est.range.high)}</div>
                  <div className="small muted">≈ {rupiah(est.perPerson)} per orang · titik tengah {rupiah(est.estimate)}</div>
                </div>
                <table className="budget-table"><tbody>
                  {est.lines.map((l) => (
                    <tr key={l.key}><td>{l.label}<div className="xsmall muted">{l.basis}</div></td><td>{l.included ? (l.amount != null ? rupiah(l.amount) : 'Perlu konfirmasi') : 'Tidak termasuk'}</td></tr>
                  ))}
                  <tr><td>Margin layanan</td><td>{rupiah(est.margin)}</td></tr>
                </tbody></table>
                {budgetTotal != null && <p className="small">Anggaran Anda {rupiah(budgetTotal)}: <b>{est.range.high <= budgetTotal ? 'estimasi masih dalam anggaran' : est.range.low > budgetTotal ? 'estimasi di atas anggaran' : 'estimasi mungkin melebihi anggaran'}</b>.</p>}
                {est.unknown.length > 0 && <Note kind="warn">{est.unknown.join(' ')}</Note>}
                {est.notes.map((n) => <p key={n} className="xsmall muted">{n}</p>)}
              </>
            )}
            {f.desiredDate && <p className="xsmall muted">Tanggal diinginkan: {formatDate(f.desiredDate)}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
