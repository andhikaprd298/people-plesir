import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { ConfirmTag, Choice, Empty, ErrorBox, Loading, Modal, SelectField, TextAreaField, TextField, errMsg, fieldErr, useConfirm, useFetch, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { KIND_LABEL, rupiahRange, toInt } from '../../lib/format';
import type { AdminDest, Category, DayKey } from '../../lib/types';

const DAYS: [DayKey, string][] = [['mon', 'Senin'], ['tue', 'Selasa'], ['wed', 'Rabu'], ['thu', 'Kamis'], ['fri', 'Jumat'], ['sat', 'Sabtu'], ['sun', 'Minggu']];
const ACCESS: [string, string][] = [['kursi_roda', 'Kursi roda'], ['lansia', 'Lansia'], ['anak_kecil', 'Anak kecil']];
type Hours = Record<DayKey, { open: boolean; from: string; to: string }>;

interface Form {
  id: string | null; name: string; kind: 'wisata' | 'kuliner' | 'kafe'; categoryId: string; summary: string; description: string; addressText: string;
  lat: string; lng: string; coordsVerified: boolean; priceMin: string; priceMax: string; priceVerified: boolean; avgDurationMin: string;
  useHours: boolean; hours: Hours; hoursVerified: boolean; familyFriendly: boolean; accessibility: string[];
  facilities: string; tags: string; foodTags: string; imageUrl: string; gallery: string; dataStatus: 'demo' | 'verified'; isPublished: boolean;
}

const blankHours = (): Hours => Object.fromEntries(DAYS.map(([k]) => [k, { open: true, from: '08:00', to: '17:00' }])) as Hours;
const empty = (cat: string): Form => ({
  id: null, name: '', kind: 'wisata', categoryId: cat, summary: '', description: '', addressText: '', lat: '', lng: '', coordsVerified: false, priceMin: '', priceMax: '', priceVerified: false,
  avgDurationMin: '60', useHours: false, hours: blankHours(), hoursVerified: false, familyFriendly: false, accessibility: [], facilities: '', tags: '', foodTags: '', imageUrl: '', gallery: '', dataStatus: 'demo', isPublished: true,
});
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function fromDest(d: AdminDest): Form {
  const hours = blankHours();
  if (d.openHours) for (const [k] of DAYS) { const h = d.openHours[k]; hours[k] = h ? { open: true, from: h[0], to: h[1] } : { open: false, from: '08:00', to: '17:00' }; }
  return {
    id: d.id, name: d.name, kind: d.kind, categoryId: d.categoryId, summary: d.summary, description: d.description ?? '', addressText: d.addressText ?? '', lat: String(d.lat), lng: String(d.lng),
    coordsVerified: d.verified.coords, priceMin: d.price ? String(d.price.min) : '', priceMax: d.price ? String(d.price.max) : '', priceVerified: d.verified.price,
    avgDurationMin: String(d.avgDurationMin), useHours: Boolean(d.openHours), hours, hoursVerified: d.verified.hours, familyFriendly: d.familyFriendly, accessibility: d.accessibility,
    facilities: d.facilities.join(', '), tags: d.tags.join(', '), foodTags: d.foodTags.join(', '), imageUrl: d.imageUrl ?? '', gallery: d.gallery.join('\n'), dataStatus: d.dataStatus, isPublished: d.isPublished,
  };
}

function DestForm({ initial, cats, onClose, onSaved }: { initial: Form; cats: Category[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const up = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try { const r = await api.upload<{ url: string }>('/api/admin/upload', file); up('imageUrl', r.url); toast('Foto diunggah.'); } catch (e) { toast(errMsg(e), 'error'); }
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = 'Isi nama destinasi';
    if (f.summary.trim().length < 10) e.summary = 'Ringkasan minimal 10 karakter';
    const lat = Number(f.lat); const lng = Number(f.lng);
    if (f.lat === '' || !Number.isFinite(lat)) e.lat = 'Isi latitude (contoh -7.3)'; 
    if (f.lng === '' || !Number.isFinite(lng)) e.lng = 'Isi longitude (contoh 109.2)';
    if (!toInt(f.avgDurationMin)) e.avgDurationMin = 'Isi durasi (menit)';
    setErrors(e);
    if (Object.keys(e).length) { toast('Periksa kolom yang ditandai.', 'error'); return; }
    const openHours = f.useHours ? Object.fromEntries(DAYS.map(([k]) => [k, f.hours[k].open ? [f.hours[k].from, f.hours[k].to] : null])) : null;
    const body = {
      id: f.id ?? undefined, name: f.name, kind: f.kind, categoryId: f.categoryId, summary: f.summary, description: f.description, addressText: f.addressText, lat, lng, coordsVerified: f.coordsVerified,
      priceMin: toInt(f.priceMin), priceMax: toInt(f.priceMax ?? '') ?? toInt(f.priceMin), priceVerified: f.priceVerified, avgDurationMin: toInt(f.avgDurationMin), openHours, hoursVerified: f.hoursVerified,
      familyFriendly: f.familyFriendly, accessibility: f.accessibility, facilities: csv(f.facilities), tags: csv(f.tags), foodTags: csv(f.foodTags),
      imageUrl: f.imageUrl.trim() || null, gallery: f.gallery.split('\n').map((x) => x.trim()).filter(Boolean), dataStatus: f.dataStatus, isPublished: f.isPublished,
    };
    setBusy(true);
    try {
      if (f.id) await api.put(`/api/admin/destinations/${f.id}`, body); else await api.post('/api/admin/destinations', body);
      toast('Destinasi disimpan.'); onSaved();
    } catch (err) { setErrors(fieldErr(err)); toast(errMsg(err), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title={f.id ? `Ubah ${initial.name}` : 'Destinasi baru'} onClose={onClose} wide footer={<><button className="btn btn-ghost" onClick={onClose}>Batal</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <div className="stack">
        <div className="form-grid">
          <TextField label="Nama" value={f.name} onChange={(e) => up('name', e.target.value)} error={errors.name} />
          <SelectField label="Jenis" value={f.kind} onChange={(e) => up('kind', e.target.value as Form['kind'])}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
          <SelectField label="Kategori" value={f.categoryId} onChange={(e) => up('categoryId', e.target.value)} error={errors.categoryId}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
        </div>
        <TextAreaField label="Ringkasan (kartu)" rows={2} value={f.summary} onChange={(e) => up('summary', e.target.value)} error={errors.summary} />
        <TextAreaField label="Deskripsi" rows={4} value={f.description} onChange={(e) => up('description', e.target.value)} error={errors.description} />
        <TextField label="Alamat atau area" value={f.addressText} onChange={(e) => up('addressText', e.target.value)} />

        <h3>Lokasi</h3>
        <div className="form-grid">
          <TextField label="Latitude" inputMode="decimal" value={f.lat} onChange={(e) => up('lat', e.target.value)} error={errors.lat} />
          <TextField label="Longitude" inputMode="decimal" value={f.lng} onChange={(e) => up('lng', e.target.value)} error={errors.lng} />
        </div>
        <Choice checked={f.coordsVerified} onChange={(v) => up('coordsVerified', v)} sub="Centang hanya jika titik sudah dicek langsung atau di peta resmi.">Koordinat terverifikasi</Choice>

        <h3>Harga dan durasi</h3>
        <div className="form-grid">
          <TextField label="Harga minimum (Rp)" inputMode="numeric" value={f.priceMin} onChange={(e) => up('priceMin', e.target.value)} error={errors.priceMin} hint="Kosongkan bila belum diketahui. 0 berarti gratis." />
          <TextField label="Harga maksimum (Rp)" inputMode="numeric" value={f.priceMax} onChange={(e) => up('priceMax', e.target.value)} error={errors.priceMax} />
          <TextField label="Durasi kunjungan (menit)" inputMode="numeric" value={f.avgDurationMin} onChange={(e) => up('avgDurationMin', e.target.value)} error={errors.avgDurationMin} />
        </div>
        <Choice checked={f.priceVerified} onChange={(v) => up('priceVerified', v)} sub="Harga dicek langsung ke pengelola.">Harga terverifikasi</Choice>
        {errors.priceVerified && <p className="err">{errors.priceVerified}</p>}

        <h3>Jam operasional</h3>
        <Choice checked={f.useHours} onChange={(v) => up('useHours', v)} sub="Jika tidak diisi, planner menandai “Perlu konfirmasi”.">Isi jam operasional</Choice>
        {f.useHours && (
          <div className="stack-sm">
            {DAYS.map(([k, label]) => (
              <div key={k} className="row" style={{ gap: 10 }}>
                <label className="check" style={{ minWidth: 100 }}><input type="checkbox" checked={f.hours[k].open} onChange={(e) => up('hours', { ...f.hours, [k]: { ...f.hours[k], open: e.target.checked } })} /> {label}</label>
                {f.hours[k].open ? <>
                  <input className="input" style={{ width: 120 }} type="time" aria-label={`${label} buka`} value={f.hours[k].from} onChange={(e) => up('hours', { ...f.hours, [k]: { ...f.hours[k], from: e.target.value } })} />
                  <span>–</span>
                  <input className="input" style={{ width: 120 }} type="time" aria-label={`${label} tutup`} value={f.hours[k].to} onChange={(e) => up('hours', { ...f.hours, [k]: { ...f.hours[k], to: e.target.value } })} />
                </> : <span className="muted small">Tutup</span>}
              </div>
            ))}
            <Choice checked={f.hoursVerified} onChange={(v) => up('hoursVerified', v)}>Jam operasional terverifikasi</Choice>
            {errors.openHours && <p className="err">{errors.openHours}</p>}{errors.hoursVerified && <p className="err">{errors.hoursVerified}</p>}
          </div>
        )}

        <h3>Fasilitas dan atribut</h3>
        <Choice checked={f.familyFriendly} onChange={(v) => up('familyFriendly', v)}>Ramah keluarga</Choice>
        <div className="row">{ACCESS.map(([k, l]) => <Choice key={k} checked={f.accessibility.includes(k)} onChange={(v) => up('accessibility', v ? [...f.accessibility, k] : f.accessibility.filter((x) => x !== k))}>{l}</Choice>)}</div>
        <TextField label="Fasilitas (pisahkan koma)" value={f.facilities} onChange={(e) => up('facilities', e.target.value)} hint="mis. parkir, toilet, musala" />
        <TextField label="Tag (pisahkan koma)" value={f.tags} onChange={(e) => up('tags', e.target.value)} hint="hidden_gem, foto, santai, trek_berat" />
        <TextField label="Tag makanan (pisahkan koma)" value={f.foodTags} onChange={(e) => up('foodTags', e.target.value)} hint="halal, vegetarian_friendly, tidak_pedas" />

        <h3>Foto</h3>
        <TextField label="URL foto utama" value={f.imageUrl} onChange={(e) => up('imageUrl', e.target.value)} error={errors.imageUrl} hint="Gunakan foto yang Anda miliki haknya. Kosong = ilustrasi berlabel." />
        <div className="row"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} /><button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Unggah foto (maks. 3 MB)</button></div>
        <TextAreaField label="Galeri (satu URL per baris)" rows={3} value={f.gallery} onChange={(e) => up('gallery', e.target.value)} />

        <h3>Status data</h3>
        <div className="form-grid">
          <SelectField label="Status data" value={f.dataStatus} onChange={(e) => up('dataStatus', e.target.value as Form['dataStatus'])}><option value="demo">Contoh (demo)</option><option value="verified">Terverifikasi</option></SelectField>
        </div>
        <Choice checked={f.isPublished} onChange={(v) => up('isPublished', v)}>Tampilkan di publik</Choice>
      </div>
    </Modal>
  );
}

export function AdminDestinations() {
  const { data, loading, error, reload } = useFetch<{ items: AdminDest[] }>('/api/admin/destinations');
  const meta = useFetch<{ categories: Category[] }>('/api/meta');
  const [form, setForm] = useState<Form | null>(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const cats = meta.data?.categories ?? [];

  const del = async (d: AdminDest) => {
    if (!(await confirm.ask('Hapus destinasi?', <p>"{d.name}" dihapus permanen. Jika hanya ingin menyembunyikan, ubah lalu matikan “Tampilkan di publik”.</p>, { confirm: 'Hapus', danger: true }))) return;
    try { await api.del(`/api/admin/destinations/${d.id}`); toast('Destinasi dihapus.'); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  const items = (data?.items ?? []).filter((d) => (!q || d.name.toLowerCase().includes(q.toLowerCase())) && (!only || !(d.verified.price && d.verified.hours && d.verified.coords)));

  return (
    <div className="stack">
      {confirm.dialog}
      <div className="filters">
        <input className="input" type="search" aria-label="Cari destinasi" placeholder="Cari nama" value={q} onChange={(e) => setQ(e.target.value)} />
        <Choice checked={only} onChange={setOnly}>Hanya yang belum terverifikasi penuh</Choice>
        <button className="btn btn-primary" disabled={!cats.length} onClick={() => setForm(empty(cats[0]?.id ?? ''))}><Plus /> Destinasi baru</button>
      </div>
      {loading ? <Loading rows={4} height={54} /> : error || !data ? <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} /> : items.length === 0 ? <Empty title="Tidak ada destinasi yang cocok" /> : (
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Nama</th><th>Jenis</th><th>Harga</th><th>Verifikasi</th><th>Tampil</th><th /></tr></thead>
          <tbody>{items.map((d) => (
            <tr key={d.id}>
              <td><b>{d.name}</b><div className="xsmall muted">{d.categoryName}</div></td><td>{KIND_LABEL[d.kind]}</td>
              <td>{d.price ? (d.price.max === 0 ? 'Gratis' : rupiahRange(d.price.min, d.price.max)) : '—'}</td>
              <td><div className="row" style={{ gap: 4 }}><ConfirmTag verified={d.verified.price} text={d.verified.price ? 'Harga ✓' : 'Harga ?'} /><ConfirmTag verified={d.verified.hours} text={d.verified.hours ? 'Jam ✓' : 'Jam ?'} /><ConfirmTag verified={d.verified.coords} text={d.verified.coords ? 'Lokasi ✓' : 'Lokasi ?'} /></div></td>
              <td>{d.isPublished ? 'Ya' : 'Tidak'}</td>
              <td><div className="row" style={{ gap: 6 }}><button className="btn btn-ghost btn-sm" onClick={() => setForm(fromDest(d))}>Ubah</button><button className="btn btn-ghost btn-sm" onClick={() => void del(d)}>Hapus</button></div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      {form && <DestForm initial={form} cats={cats} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
