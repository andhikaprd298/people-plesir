import {
  Camera, Coffee, Landmark, LocateFixed, Mountain, Sprout, TreePine, Utensils, Users as UsersIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ItineraryView, itineraryText, planFrom } from '../components/ItineraryView';
import { Choice, ErrorBox, Field, Loading, Modal, Note, NumberStepper, SelectField, TextField, errMsg, fieldErr, useFetch, useTitle, useToast } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { INTEREST_LABEL, VEHICLE_LABEL, digitsOnly, rupiah, safeStorage, toInt } from '../lib/format';
import type { Dest, Interest, Itinerary, PlanEntry, PlannerInput, SavedItinerary } from '../lib/types';
import { useWishlist } from '../lib/wishlist';

const store = safeStorage('local');
const DRAFT = 'pp.planner.draft';
const RESULT = 'pp.planner.result';

interface StoredResult { itinerary: Itinerary; plan: PlanEntry[][]; savedId: number | null }

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

const INTEREST_ICON: Record<Interest, JSX.Element> = {
  alam: <Mountain />, kuliner: <Utensils />, budaya: <Landmark />, keluarga: <UsersIcon />, hidden_gems: <Sprout />, foto: <Camera />, kafe: <Coffee />,
};
const STEPS = ['Informasi perjalanan', 'Preferensi', 'Preferensi tambahan', 'Hasil itinerary'];

function defaults(today: string, origin?: PlannerInput['origin']): PlannerInput {
  return {
    participants: 4, startDate: addDays(today, 1), days: 1, dayStart: '08:00', dayEnd: '18:00',
    origin: origin ?? { label: 'Pusat kota Purwokerto', lat: -7.4255, lng: 109.2396 },
    vehicle: 'mobil_pribadi', budget: { mode: 'per_person', amount: null },
    interests: ['alam', 'kuliner'], pace: 'sedang', foodPrefs: [], maxLegMinutes: null, mustVisit: [], avoid: [], accessibility: [],
  };
}

export default function Planner() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user, meta } = useAuth();
  const toast = useToast();
  const wl = useWishlist();
  useTitle('AI Itinerary Planner');

  const today = meta?.today ?? new Date().toISOString().slice(0, 10);
  const dests = useFetch<{ items: Dest[] }>('/api/destinations');

  const [step, setStep] = useState(1);
  const [input, setInput] = useState<PlannerInput>(() => store.read<PlannerInput | null>(DRAFT, null) ?? defaults(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<StoredResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [originMode, setOriginMode] = useState<string>('preset');
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [shareState, setShareState] = useState<{ url: string | null; busy: boolean } | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(Boolean(id));
  const [savedErr, setSavedErr] = useState<string | null>(null);
  const hasStoredResult = useMemo(() => Boolean(store.read<StoredResult | null>(RESULT, null)), []);

  // Tanggal bawaan mengikuti tanggal server setelah meta termuat.
  useEffect(() => { setInput((p) => (p.startDate < today ? { ...p, startDate: addDays(today, 1) } : p)); }, [today]);
  // Destinasi yang ditandai di Jelajahi menjadi destinasi wajib.
  useEffect(() => { if (wl.ids.length && !id) setInput((p) => ({ ...p, mustVisit: Array.from(new Set([...p.mustVisit, ...wl.ids])).filter((x) => !p.avoid.includes(x)) })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { store.write(DRAFT, input); }, [input]);

  // Itinerary tersimpan (rute /itinerary/:id).
  useEffect(() => {
    if (!id) return;
    setLoadingSaved(true);
    api.get<SavedItinerary>(`/api/itineraries/${id}`)
      .then((s) => { setInput(s.itinerary.input); setResult({ itinerary: s.itinerary, plan: s.plan, savedId: s.id }); setStep(4); })
      .catch((e) => setSavedErr(errMsg(e)))
      .finally(() => setLoadingSaved(false));
  }, [id]);

  // Lanjut dari itinerary terakhir setelah login.
  useEffect(() => {
    if (id || sp.get('lanjut') !== '1') return;
    const r = store.read<StoredResult | null>(RESULT, null);
    if (r) { setInput(r.itinerary.input); setResult(r); setStep(4); }
  }, [id, sp]);

  const set = <K extends keyof PlannerInput>(k: K, v: PlannerInput[K]) => setInput((p) => ({ ...p, [k]: v }));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const persist = (r: StoredResult | null) => { setResult(r); if (r) store.write(RESULT, r); else store.remove(RESULT); };

  const validate = useCallback((s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!Number.isInteger(input.participants) || input.participants < 1) e.participants = 'Minimal 1 peserta';
      if (input.participants > 50) e.participants = 'Maksimal 50 peserta. Untuk rombongan besar, ajukan Private Trip.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) e.startDate = 'Pilih tanggal perjalanan';
      else if (input.startDate < today) e.startDate = 'Pilih tanggal hari ini atau setelahnya';
      if (!input.dayStart || !input.dayEnd) e.dayEnd = 'Isi jam mulai dan jam selesai';
      else if (toMin(input.dayEnd) - toMin(input.dayStart) < 180) e.dayEnd = 'Jam selesai minimal 3 jam setelah jam mulai';
      if (!input.origin.label) e.origin = 'Pilih titik keberangkatan';
      if (input.budget.amount != null && input.budget.amount < 0) e.budget = 'Anggaran tidak boleh negatif';
    }
    return e;
  }, [input, today]);

  const next = () => { const e = validate(step); setErrors(e); if (Object.keys(e).length === 0) setStep((s) => s + 1); else document.getElementById('wizard-top')?.scrollIntoView({ block: 'start' }); };

  const generate = async () => {
    const e = validate(1);
    if (Object.keys(e).length) { setErrors(e); setStep(1); return; }
    setBusy(true); setGenError(null); setStep(4); setResult(null);
    try {
      const it = await api.post<Itinerary>('/api/planner/generate', input);
      persist({ itinerary: it, plan: planFrom(it), savedId: null });
    } catch (err) {
      setGenError(errMsg(err));
      const f = fieldErr(err);
      if (Object.keys(f).length) { setErrors(f); setStep(1); }
    } finally { setBusy(false); }
  };

  const recompute = async (plan: PlanEntry[][], title?: string) => {
    if (!result) return;
    setBusy(true);
    try {
      const it = await api.post<Itinerary>('/api/planner/recompute', {
        input: result.itinerary.input, plan,
        meta: { title: title ?? result.itinerary.title, summary: result.itinerary.summary, engine: result.itinerary.engine },
      });
      persist({ itinerary: it, plan: planFrom(it), savedId: result.savedId });
    } catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); }
  };

  const doSave = async () => {
    if (!result) return;
    if (!user) { store.write(RESULT, result); nav(`/masuk?next=${encodeURIComponent('/planner?lanjut=1')}`); return; }
    if (!result.savedId) { setSaveTitle(result.itinerary.title); setSaveOpen(true); return; }
    await saveNow(result.itinerary.title);
  };
  const saveNow = async (title: string) => {
    if (!result) return;
    setBusy(true);
    const body = { title, summary: result.itinerary.summary, input: result.itinerary.input, plan: result.plan, engine: result.itinerary.engine };
    try {
      const s = result.savedId ? await api.put<SavedItinerary>(`/api/itineraries/${result.savedId}`, body) : await api.post<SavedItinerary>('/api/itineraries', body);
      persist({ itinerary: s.itinerary, plan: s.plan, savedId: s.id });
      setSaveOpen(false);
      toast('Itinerary tersimpan. Anda dapat menemukannya di dashboard.');
    } catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); }
  };

  const doShare = async () => {
    if (!result) return;
    if (!result.savedId) { setShareState({ url: null, busy: false }); return; }
    setShareState({ url: null, busy: true });
    try {
      const r = await api.post<{ shareToken: string | null }>(`/api/itineraries/${result.savedId}/share`, { enabled: true });
      setShareState({ url: r.shareToken ? `${window.location.origin}/bagikan/${r.shareToken}` : null, busy: false });
    } catch (err) { toast(errMsg(err), 'error'); setShareState(null); }
  };

  const useGeo = () => {
    if (!navigator.geolocation) { setGeoMsg('Peramban tidak mendukung lokasi. Pilih titik lain.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng } = p.coords;
        if (lat < -9 || lat > -6 || lng < 108 || lng > 111) { setGeoMsg('Lokasi Anda berada di luar sekitar Jawa Tengah. Pilih titik keberangkatan di Banyumas.'); return; }
        set('origin', { label: 'Lokasi saya', lat, lng }); setOriginMode('geo'); setGeoMsg(null);
      },
      () => setGeoMsg('Izin lokasi ditolak. Pilih titik keberangkatan dari daftar.'),
      { timeout: 10000 },
    );
  };

  const originValue = originMode === 'geo' ? '__geo' : originMode === 'dest' ? `dest:${input.origin.label}` : input.origin.label;
  const onOrigin = (v: string) => {
    if (v === '__geo') { useGeo(); return; }
    if (v.startsWith('dest:')) {
      const d = dests.data?.items.find((x) => `dest:${x.name}` === v);
      if (d) { setOriginMode('dest'); set('origin', { label: `Dekat ${d.name}`, lat: d.lat, lng: d.lng }); }
      return;
    }
    const o = meta?.origins.find((x) => x.label === v);
    if (o) { setOriginMode('preset'); set('origin', { label: o.label, lat: o.lat, lng: o.lng }); }
  };

  const startOver = () => { persist(null); setInput(defaults(today)); setStep(1); setErrors({}); wl.clear(); };

  const attractions = (dests.data?.items ?? []);
  const budgetText = input.budget.amount != null ? new Intl.NumberFormat('id-ID').format(input.budget.amount) : '';

  if (loadingSaved) return <div className="wrap section"><Loading rows={2} height={200} /></div>;
  if (savedErr) return <div className="wrap section"><ErrorBox error={savedErr} /><p style={{ marginTop: 16 }}><Link to="/dashboard/itinerary">Kembali ke itinerary tersimpan</Link></p></div>;

  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      <div className="page-head" id="wizard-top">
        <h1 style={{ fontSize: 'clamp(1.9rem,4.4vw,2.8rem)' }}>{id ? 'Ubah itinerary tersimpan' : 'AI Itinerary Planner'}</h1>
        <p className="lead">Ceritakan perjalananmu. Kami menyusun urutan tempat yang logis, lalu memeriksa jadwal, waktu tempuh, jam buka, dan anggaran.</p>
      </div>

      {meta && !meta.engine.ai && step < 4 && <div style={{ marginBottom: 16 }}><Note kind="sun"><b>Mode demo.</b> Model AI belum dihubungkan di server ini, jadi tempat dipilih dengan aturan skor dari data destinasi. Jadwal dan biaya tetap dihitung dan diperiksa sistem.</Note></div>}

      {step < 4 && (
        <ol className="wizard-steps" aria-label="Langkah">
          {STEPS.map((s, i) => <li key={s} className={i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''} aria-current={i + 1 === step ? 'step' : undefined}><i />{i + 1}. {s}</li>)}
        </ol>
      )}

      {step === 1 && hasStoredResult && !result && !id && (
        <div style={{ marginBottom: 16 }}>
          <Note>
            <b>Ada itinerary terakhir di perangkat ini.</b>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { const r = store.read<StoredResult | null>(RESULT, null); if (r) { setInput(r.itinerary.input); setResult(r); setStep(4); } }}>Lanjutkan</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { store.remove(RESULT); setInput(defaults(today)); location.reload(); }}>Mulai dari awal</button>
            </div>
          </Note>
        </div>
      )}

      {step === 1 && (
        <form className="wizard-card" noValidate onSubmit={(e) => { e.preventDefault(); next(); }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: 20 }}>Informasi perjalanan</h2>
          <div className="form-grid two">
            <Field label="Jumlah peserta" error={errors.participants}><NumberStepper label="peserta" value={input.participants} min={1} max={50} onChange={(n) => set('participants', n)} /></Field>
            <TextField label="Tanggal perjalanan" type="date" min={today} value={input.startDate} error={errors.startDate} onChange={(e) => set('startDate', e.target.value)} />
            <Field label="Jumlah hari"><NumberStepper label="hari" value={input.days} min={1} max={5} onChange={(n) => set('days', n)} /></Field>
            <div className="form-grid two" style={{ gap: 12 }}>
              <TextField label="Jam mulai" type="time" value={input.dayStart} onChange={(e) => set('dayStart', e.target.value)} />
              <TextField label="Jam selesai tiap hari" type="time" value={input.dayEnd} error={errors.dayEnd} onChange={(e) => set('dayEnd', e.target.value)} />
            </div>
            <div className="span2 stack-sm">
              <SelectField label="Lokasi penginapan atau titik keberangkatan" value={originValue} error={errors.origin} hint="Pencarian alamat bebas belum tersedia. Pilih titik terdekat atau gunakan lokasi Anda." onChange={(e) => onOrigin(e.target.value)}>
                <optgroup label="Titik populer">{meta?.origins.map((o) => <option key={o.label} value={o.label}>{o.label}{o.approximate ? ' (perkiraan)' : ''}</option>)}</optgroup>
                <optgroup label="Penginapan dekat destinasi">{attractions.filter((d) => d.kind === 'wisata').map((d) => <option key={d.id} value={`dest:${d.name}`}>Dekat {d.name}</option>)}</optgroup>
                <option value="__geo">{originMode === 'geo' ? 'Lokasi saya (terpilih)' : 'Gunakan lokasi saya sekarang'}</option>
              </SelectField>
              {originMode === 'geo' && <span className="chip ok"><LocateFixed /> Memakai lokasi perangkat Anda</span>}
              {geoMsg && <Note kind="warn">{geoMsg}</Note>}
            </div>
            <fieldset className="span2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="legend" style={{ marginBottom: 8 }}>Jenis kendaraan</legend>
              <div className="choice-grid">
                {(['motor', 'mobil_pribadi', 'sewa', 'umum'] as const).map((v) => (
                  <Choice key={v} type="radio" name="vehicle" checked={input.vehicle === v} onChange={() => set('vehicle', v)}>{VEHICLE_LABEL[v]}</Choice>
                ))}
              </div>
            </fieldset>
            <div className="span2 form-grid two" style={{ gap: 12 }}>
              <SelectField label="Anggaran dihitung" value={input.budget.mode} onChange={(e) => set('budget', { ...input.budget, mode: e.target.value as 'per_person' | 'total' })}>
                <option value="per_person">Per orang</option><option value="total">Total satu rombongan</option>
              </SelectField>
              <TextField label="Anggaran (Rp), opsional" inputMode="numeric" placeholder="Contoh: 250.000" value={budgetText} error={errors.budget}
                hint={input.budget.amount != null ? `Setara ${rupiah(input.budget.mode === 'per_person' ? input.budget.amount * input.participants : input.budget.amount)} untuk seluruh rombongan` : 'Kosongkan jika belum ada batas'}
                onChange={(e) => set('budget', { ...input.budget, amount: toInt(e.target.value) })} />
            </div>
          </div>
          <div className="wizard-nav"><span /><button className="btn btn-primary" type="submit">Lanjut ke preferensi</button></div>
        </form>
      )}

      {step === 2 && (
        <div className="wizard-card">
          <h2 style={{ fontSize: '1.4rem', marginBottom: 6 }}>Apa yang ingin kamu temukan?</h2>
          <p className="muted" style={{ marginBottom: 20 }}>Pilih satu atau beberapa. Kombinasi kategori akan diseimbangkan dalam rute.</p>
          <div className="choice-grid">
            {(Object.keys(INTEREST_LABEL) as Interest[]).map((k) => (
              <Choice key={k} checked={input.interests.includes(k)} onChange={() => set('interests', toggle(input.interests, k))}>{INTEREST_ICON[k]}{INTEREST_LABEL[k]}</Choice>
            ))}
          </div>
          {input.interests.length === 0 && <p className="hint" style={{ marginTop: 12 }}>Tidak memilih apa pun berarti jelajah umum.</p>}
          <div className="wizard-nav"><button className="btn btn-ghost" onClick={() => setStep(1)}>Kembali</button><button className="btn btn-primary" onClick={next}>Lanjut</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-card stack-lg">
          <h2 style={{ fontSize: '1.4rem' }}>Preferensi tambahan</h2>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="legend" style={{ marginBottom: 8 }}>Tempo perjalanan</legend>
            <div className="choice-grid">
              {([['santai', 'Santai', '3 tempat per hari'], ['sedang', 'Sedang', '4 tempat per hari'], ['padat', 'Padat', '5 tempat per hari']] as const).map(([k, l, s]) => (
                <Choice key={k} type="radio" name="pace" checked={input.pace === k} onChange={() => set('pace', k)} sub={s}>{l}</Choice>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="legend" style={{ marginBottom: 8 }}>Preferensi makanan</legend>
            <div className="choice-grid">
              {([['halal', 'Halal'], ['vegetarian', 'Vegetarian'], ['tidak_pedas', 'Tidak pedas']] as const).map(([k, l]) => (
                <Choice key={k} checked={input.foodPrefs.includes(k)} onChange={() => set('foodPrefs', toggle(input.foodPrefs, k))}>{l}</Choice>
              ))}
            </div>
          </fieldset>
          <SelectField label="Batas maksimal satu perjalanan" value={input.maxLegMinutes ?? ''} onChange={(e) => set('maxLegMinutes', e.target.value ? Number(e.target.value) : null)} hint="Tempat yang lebih jauh dari batas ini dari titik berangkat tidak dipilih otomatis.">
            <option value="">Tanpa batas</option><option value="30">30 menit</option><option value="45">45 menit</option><option value="60">1 jam</option><option value="90">1,5 jam</option>
          </SelectField>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="legend" style={{ marginBottom: 8 }}>Kebutuhan aksesibilitas</legend>
            <div className="choice-grid">
              {([['kursi_roda', 'Kursi roda'], ['lansia', 'Ada lansia'], ['anak_kecil', 'Ada anak kecil']] as const).map(([k, l]) => (
                <Choice key={k} checked={input.accessibility.includes(k)} onChange={() => set('accessibility', toggle(input.accessibility, k))}>{l}</Choice>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="legend" style={{ marginBottom: 4 }}>Destinasi yang ingin dikunjungi</legend>
            <p className="hint" style={{ marginBottom: 8 }}>Tempat ini pasti dimasukkan jika jadwal memungkinkan.</p>
            {dests.loading ? <Loading rows={1} height={80} /> : (
              <div className="choice-grid">
                {attractions.map((d) => (
                  <Choice key={d.id} checked={input.mustVisit.includes(d.id)} onChange={() => setInput((p) => ({ ...p, mustVisit: toggle(p.mustVisit, d.id), avoid: p.avoid.filter((x) => x !== d.id) }))}>{d.name}</Choice>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="legend" style={{ marginBottom: 4 }}>Destinasi yang ingin dihindari</legend>
            <div className="choice-grid">
              {attractions.map((d) => (
                <Choice key={d.id} checked={input.avoid.includes(d.id)} onChange={() => setInput((p) => ({ ...p, avoid: toggle(p.avoid, d.id), mustVisit: p.mustVisit.filter((x) => x !== d.id) }))}>{d.name}</Choice>
              ))}
            </div>
          </fieldset>
          <div className="wizard-nav" style={{ marginTop: 0 }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Kembali</button>
            <button className="btn btn-accent" onClick={generate}>Susun Itinerary</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          {busy && !result && (
            <div className="wizard-card" role="status" aria-live="polite">
              <h2 style={{ fontSize: '1.4rem', marginBottom: 8 }}>Menyusun itinerary…</h2>
              <p className="muted" style={{ marginBottom: 16 }}>Memilih tempat, mengurutkan rute, lalu memeriksa jadwal, jam buka, dan anggaran.</p>
              <Loading rows={3} height={90} />
            </div>
          )}
          {genError && !busy && (
            <div className="stack">
              <ErrorBox error={genError} onRetry={generate} />
              <div><button className="btn btn-ghost" onClick={() => setStep(1)}>Ubah preferensi</button></div>
            </div>
          )}
          {result && (
            <ItineraryView
              it={result.itinerary} plan={result.plan} busy={busy} savedId={result.savedId}
              onChangePlan={recompute} onRegenerate={generate} onSave={doSave} onShare={doShare}
              onEditPrefs={() => setStep(1)}
              privateHref="/private-trip?dari=planner"
            />
          )}
          {result && !id && <p className="small" style={{ marginTop: 24 }}><button className="btn btn-link" onClick={startOver}>Mulai itinerary baru</button></p>}
        </div>
      )}

      {saveOpen && (
        <Modal title="Simpan itinerary" onClose={() => setSaveOpen(false)} footer={<><button className="btn btn-ghost" onClick={() => setSaveOpen(false)}>Batal</button><button className="btn btn-primary" disabled={busy || saveTitle.trim().length < 2} onClick={() => saveNow(saveTitle.trim())}>Simpan itinerary</button></>}>
          <TextField label="Judul itinerary" value={saveTitle} maxLength={150} onChange={(e) => setSaveTitle(e.target.value)} data-autofocus />
        </Modal>
      )}

      {shareState && result && (
        <Modal title="Bagikan itinerary" onClose={() => setShareState(null)}>
          <div className="stack">
            {shareState.busy ? <Loading rows={1} height={60} /> : shareState.url ? (
              <>
                <p>Siapa pun yang memiliki tautan ini dapat melihat itinerary (tanpa data pribadi Anda). Anda bisa menghentikan berbagi dari dashboard.</p>
                <div className="row"><input className="input grow" readOnly value={shareState.url} aria-label="Tautan berbagi" onFocus={(e) => e.target.select()} />
                  <button className="btn btn-primary" onClick={() => { void navigator.clipboard?.writeText(shareState.url!).then(() => toast('Tautan disalin')); }}>Salin tautan</button></div>
              </>
            ) : (
              <>
                <p>Untuk membuat tautan berbagi, itinerary perlu disimpan ke akun Anda dulu. Sementara itu Anda bisa menyalin ringkasannya sebagai teks.</p>
                <div className="row">
                  <button className="btn btn-primary" onClick={() => { setShareState(null); void doSave(); }}>{user ? 'Simpan lalu bagikan' : 'Masuk untuk menyimpan'}</button>
                  <button className="btn btn-ghost" onClick={() => { void navigator.clipboard?.writeText(itineraryText(result.itinerary)).then(() => toast('Ringkasan disalin')); }}>Salin sebagai teks</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export { ApiError, digitsOnly };
