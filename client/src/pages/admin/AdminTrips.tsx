import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Choice, Empty, ErrorBox, Loading, Modal, SelectField, StatusBadge, TextAreaField, TextField, TripStateChip, errMsg, fieldErr, useConfirm, useFetch, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, rupiah, toInt } from '../../lib/format';
import type { AdminDest, Booking, TripDetail } from '../../lib/types';

interface Form {
  id: number | null; title: string; theme: string; summary: string; date: string; departTime: string; endTime: string; meetingPoint: string;
  price: string; capacity: string; minParticipants: string; registrationDeadline: string; included: string; excluded: string; safety: string;
  faq: { q: string; a: string }[]; imageUrl: string; status: 'draft' | 'published' | 'closed'; isDemo: boolean;
  itinerary: { time: string; title: string; destinationId: string; note: string }[];
}

const empty = (): Form => ({
  id: null, title: '', theme: '', summary: '', date: '', departTime: '07:00', endTime: '17:00', meetingPoint: '', price: '', capacity: '20', minParticipants: '10',
  registrationDeadline: '', included: '', excluded: '', safety: '', faq: [], imageUrl: '', status: 'draft', isDemo: false, itinerary: [{ time: '07:00', title: 'Kumpul dan berangkat', destinationId: '', note: '' }],
});
const toLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function fromTrip(t: TripDetail): Form {
  return {
    id: t.id, title: t.title, theme: t.theme ?? '', summary: t.summary ?? '', date: t.date, departTime: t.departTime, endTime: t.endTime, meetingPoint: t.meetingPoint ?? '',
    price: String(t.price), capacity: String(t.capacity), minParticipants: String(t.minParticipants), registrationDeadline: t.registrationDeadline ?? '',
    included: t.included.join('\n'), excluded: t.excluded.join('\n'), safety: t.safety.join('\n'), faq: t.faq, imageUrl: t.imageUrl ?? '',
    status: (['draft', 'published', 'closed'].includes(t.status) ? t.status : 'draft') as Form['status'], isDemo: t.isDemo,
    itinerary: t.itinerary.map((i) => ({ time: i.time, title: i.title, destinationId: i.destinationId ?? '', note: i.note ?? '' })),
  };
}

function TripForm({ initial, dests, onClose, onSaved }: { initial: Form; dests: AdminDest[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const up = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 3) e.title = 'Isi nama trip';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) e.date = 'Pilih tanggal';
    if (toInt(f.price) == null) e.price = 'Isi harga per orang';
    if (!toInt(f.capacity)) e.capacity = 'Isi kapasitas';
    if (!toInt(f.minParticipants)) e.minParticipants = 'Isi minimum peserta';
    setErrors(e);
    if (Object.keys(e).length) { toast('Periksa kolom yang ditandai.', 'error'); return; }
    const body = {
      title: f.title, theme: f.theme, summary: f.summary, date: f.date, departTime: f.departTime, endTime: f.endTime, meetingPoint: f.meetingPoint,
      price: toInt(f.price), capacity: toInt(f.capacity), minParticipants: toInt(f.minParticipants), registrationDeadline: f.registrationDeadline || null,
      included: toLines(f.included), excluded: toLines(f.excluded), safety: toLines(f.safety), faq: f.faq.filter((x) => x.q.trim() && x.a.trim()),
      imageUrl: f.imageUrl.trim() || null, status: f.status, isDemo: f.isDemo,
      itinerary: f.itinerary.filter((i) => i.title.trim()).map((i) => ({ time: i.time, title: i.title, destinationId: i.destinationId || null, note: i.note || null })),
    };
    setBusy(true);
    try {
      if (f.id) await api.put(`/api/admin/trips/${f.id}`, body); else await api.post('/api/admin/trips', body);
      toast('Trip disimpan.'); onSaved();
    } catch (err) { setErrors(fieldErr(err)); toast(errMsg(err), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title={f.id ? 'Ubah Open Trip' : 'Open Trip baru'} onClose={onClose} wide footer={<><button className="btn btn-ghost" onClick={onClose}>Batal</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <div className="stack">
        <div className="form-grid">
          <TextField label="Nama trip" value={f.title} onChange={(e) => up('title', e.target.value)} error={errors.title} />
          <TextField label="Tema" value={f.theme} onChange={(e) => up('theme', e.target.value)} />
        </div>
        <TextAreaField label="Ringkasan" rows={2} value={f.summary} onChange={(e) => up('summary', e.target.value)} error={errors.summary} />
        <div className="form-grid">
          <TextField label="Tanggal" type="date" value={f.date} onChange={(e) => up('date', e.target.value)} error={errors.date} />
          <TextField label="Batas pendaftaran" type="date" value={f.registrationDeadline} onChange={(e) => up('registrationDeadline', e.target.value)} error={errors.registrationDeadline} />
          <TextField label="Jam berangkat" type="time" value={f.departTime} onChange={(e) => up('departTime', e.target.value)} error={errors.departTime} />
          <TextField label="Perkiraan selesai" type="time" value={f.endTime} onChange={(e) => up('endTime', e.target.value)} error={errors.endTime} />
        </div>
        <TextField label="Titik kumpul" value={f.meetingPoint} onChange={(e) => up('meetingPoint', e.target.value)} />
        <div className="form-grid">
          <TextField label="Harga per orang (Rp)" inputMode="numeric" value={f.price} onChange={(e) => up('price', e.target.value)} error={errors.price} hint="Target Rp75.000 sampai Rp150.000" />
          <TextField label="Kapasitas" inputMode="numeric" value={f.capacity} onChange={(e) => up('capacity', e.target.value)} error={errors.capacity} />
          <TextField label="Minimum peserta" inputMode="numeric" value={f.minParticipants} onChange={(e) => up('minParticipants', e.target.value)} error={errors.minParticipants} />
          <SelectField label="Status" value={f.status} onChange={(e) => up('status', e.target.value as Form['status'])}>
            <option value="draft">Draf (tidak tampil)</option><option value="published">Terbit</option><option value="closed">Pendaftaran ditutup</option>
          </SelectField>
        </div>
        <TextField label="URL foto utama (/uploads/… atau https://…)" value={f.imageUrl} onChange={(e) => up('imageUrl', e.target.value)} error={errors.imageUrl} hint="Kosongkan untuk memakai ilustrasi berlabel. Unggah foto asli di menu Destinasi." />
        <Choice checked={f.isDemo} onChange={(v) => up('isDemo', v)} sub="Trip tampil dengan label “Trip contoh (demo)”.">Tandai sebagai trip contoh</Choice>

        <h3>Itinerary hari trip</h3>
        {errors.itinerary && <p className="err">{errors.itinerary}</p>}
        <div className="stack-sm">
          {f.itinerary.map((it, i) => (
            <div key={i} className="card flat" style={{ padding: 12 }}>
              <div className="form-grid">
                <TextField label="Jam" type="time" value={it.time} onChange={(e) => up('itinerary', f.itinerary.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} />
                <TextField label="Kegiatan" value={it.title} onChange={(e) => up('itinerary', f.itinerary.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <SelectField label="Destinasi (opsional)" value={it.destinationId} onChange={(e) => up('itinerary', f.itinerary.map((x, j) => (j === i ? { ...x, destinationId: e.target.value } : x)))}>
                  <option value="">—</option>{dests.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </SelectField>
                <TextField label="Catatan" value={it.note} onChange={(e) => up('itinerary', f.itinerary.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => up('itinerary', f.itinerary.filter((_, j) => j !== i))}><Trash2 /> Hapus baris</button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => up('itinerary', [...f.itinerary, { time: '', title: '', destinationId: '', note: '' }])}><Plus /> Tambah baris</button>
        </div>

        <div className="form-grid">
          <TextAreaField label="Termasuk (satu per baris)" rows={4} value={f.included} onChange={(e) => up('included', e.target.value)} />
          <TextAreaField label="Tidak termasuk (satu per baris)" rows={4} value={f.excluded} onChange={(e) => up('excluded', e.target.value)} />
        </div>
        <TextAreaField label="Informasi keselamatan (satu per baris)" rows={3} value={f.safety} onChange={(e) => up('safety', e.target.value)} />
        <h3>FAQ trip</h3>
        <div className="stack-sm">
          {f.faq.map((x, i) => (
            <div key={i} className="form-grid">
              <TextField label="Pertanyaan" value={x.q} onChange={(e) => up('faq', f.faq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} />
              <TextField label="Jawaban" value={x.a} onChange={(e) => up('faq', f.faq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} />
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => up('faq', [...f.faq, { q: '', a: '' }])}><Plus /> Tambah FAQ</button>
        </div>
      </div>
    </Modal>
  );
}

function Participants({ trip, onClose }: { trip: TripDetail; onClose: () => void }) {
  const { data, loading, error } = useFetch<{ items: Booking[] }>(`/api/admin/trips/${trip.id}/participants`);
  const total = data?.items.reduce((n, b) => n + b.participants, 0) ?? 0;
  return (
    <Modal title={`Peserta: ${trip.title}`} onClose={onClose} wide>
      {loading ? <Loading rows={2} height={50} /> : error || !data ? <ErrorBox error={error ?? 'Tidak ada data'} /> : data.items.length === 0 ? <Empty title="Belum ada peserta" /> : (
        <>
          <p className="small muted" style={{ marginBottom: 10 }}>{total} kursi dipesan dari kapasitas {trip.capacity}. Pesanan menunggu pembayaran tetap menahan kursi sampai batas waktunya.</p>
          <div className="table-wrap"><table className="data"><thead><tr><th>Kode</th><th>Nama</th><th>WhatsApp</th><th>Peserta</th><th>Status</th></tr></thead>
            <tbody>{data.items.map((b) => <tr key={b.id}><td>{b.code}</td><td>{b.contact.name}</td><td>{b.contact.phone}</td><td>{b.participants}</td><td><StatusBadge status={b.status} /></td></tr>)}</tbody></table></div>
        </>
      )}
    </Modal>
  );
}

export function AdminTrips() {
  const { data, loading, error, reload } = useFetch<{ items: TripDetail[] }>('/api/admin/trips');
  const dests = useFetch<{ items: AdminDest[] }>('/api/admin/destinations');
  const [form, setForm] = useState<Form | null>(null);
  const [parts, setParts] = useState<TripDetail | null>(null);
  const [cancelFor, setCancelFor] = useState<TripDetail | null>(null);
  const [reason, setReason] = useState('');
  const toast = useToast();
  const confirm = useConfirm();

  const doCancel = async () => {
    if (!cancelFor) return;
    if (reason.trim().length < 3) { toast('Isi alasan pembatalan.', 'error'); return; }
    if (!(await confirm.ask('Batalkan trip?', <p>Semua pesanan pada trip ini ikut dibatalkan dan peserta yang sudah membayar masuk antrean pengembalian dana. Tindakan ini tidak dapat dibatalkan.</p>, { confirm: 'Ya, batalkan trip', danger: true }))) return;
    try { await api.post(`/api/admin/trips/${cancelFor.id}/cancel`, { reason }); toast('Trip dibatalkan.'); setCancelFor(null); setReason(''); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <div className="stack">
      {confirm.dialog}
      <div className="row between"><p className="muted small">Satu Open Trip per bulan. Trip berstatus draf tidak tampil di publik.</p><button className="btn btn-primary" onClick={() => setForm(empty())}><Plus /> Trip baru</button></div>
      {loading ? <Loading rows={3} height={70} /> : error || !data ? <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} /> : data.items.length === 0 ? <Empty title="Belum ada Open Trip">Buat trip pertama dengan tombol di atas.</Empty> : (
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Trip</th><th>Tanggal</th><th className="r">Harga</th><th>Kursi</th><th>Status</th><th /></tr></thead>
          <tbody>{data.items.map((t) => (
            <tr key={t.id}>
              <td><b>{t.title}</b>{t.isDemo && <div className="xsmall muted">contoh (demo)</div>}</td>
              <td className="nowrap">{formatDate(t.date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
              <td className="r num">{rupiah(t.price)}</td>
              <td>{t.seats.held}/{t.seats.capacity}<div className="xsmall muted">{t.seats.confirmed} terkonfirmasi · min {t.minParticipants}</div></td>
              <td><TripStateChip state={t.state} /></td>
              <td><div className="row" style={{ gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setParts(t)}>Peserta</button>
                {t.status !== 'cancelled' && <button className="btn btn-ghost btn-sm" onClick={() => setForm(fromTrip(t))}>Ubah</button>}
                {t.status !== 'cancelled' && <button className="btn btn-ghost btn-sm" onClick={() => setCancelFor(t)}>Batalkan</button>}
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      {form && <TripForm initial={form} dests={dests.data?.items ?? []} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      {parts && <Participants trip={parts} onClose={() => setParts(null)} />}
      {cancelFor && (
        <Modal title={`Batalkan ${cancelFor.title}`} onClose={() => setCancelFor(null)} footer={<><button className="btn btn-ghost" onClick={() => setCancelFor(null)}>Kembali</button><button className="btn btn-danger" onClick={doCancel}>Lanjutkan</button></>}>
          <TextAreaField label="Alasan pembatalan" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} hint="Alasan ini dikirim ke peserta sebagai notifikasi." />
        </Modal>
      )}
    </div>
  );
}
