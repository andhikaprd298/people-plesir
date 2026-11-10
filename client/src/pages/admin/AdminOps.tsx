import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Choice, Empty, ErrorBox, Loading, Modal, SelectField, TextAreaField, TextField, errMsg, fieldErr, useConfirm, useFetch, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateShort, rupiah, toInt } from '../../lib/format';
import type { TripDetail } from '../../lib/types';

interface Partner { id: number; type: 'kendaraan' | 'pemandu' | 'kuliner' | 'lainnya'; name: string; contact: string | null; notes: string | null; rateNote: string | null; isActive: boolean }
const PTYPE: Record<string, string> = { kendaraan: 'Kendaraan', pemandu: 'Pemandu', kuliner: 'Kuliner', lainnya: 'Lainnya' };

export function AdminPartners() {
  const { data, loading, error, reload } = useFetch<{ items: Partner[] }>('/api/admin/partners');
  const [edit, setEdit] = useState<(Partial<Partner> & { type: Partner['type'] }) | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const confirm = useConfirm();

  const save = async () => {
    if (!edit) return;
    const body = { type: edit.type, name: edit.name ?? '', contact: edit.contact ?? '', notes: edit.notes ?? '', rateNote: edit.rateNote ?? '', isActive: edit.isActive ?? true };
    try { if (edit.id) await api.put(`/api/admin/partners/${edit.id}`, body); else await api.post('/api/admin/partners', body); toast('Mitra disimpan.'); setEdit(null); setErrors({}); reload(); }
    catch (e) { setErrors(fieldErr(e)); toast(errMsg(e), 'error'); }
  };
  const del = async (p: Partner) => {
    if (!(await confirm.ask('Hapus mitra?', <p>"{p.name}" dihapus dari daftar mitra.</p>, { confirm: 'Hapus', danger: true }))) return;
    try { await api.del(`/api/admin/partners/${p.id}`); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <div className="stack">
      {confirm.dialog}
      <div className="row between"><p className="muted small">Mitra kendaraan, pemandu, dan kuliner. Catatan tarif hanya untuk internal.</p><button className="btn btn-primary" onClick={() => setEdit({ type: 'kendaraan', isActive: true })}><Plus /> Mitra baru</button></div>
      {loading ? <Loading rows={3} height={50} /> : error || !data ? <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} /> : data.items.length === 0 ? <Empty title="Belum ada mitra" /> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Nama</th><th>Jenis</th><th>Kontak</th><th>Tarif (catatan)</th><th>Aktif</th><th /></tr></thead>
          <tbody>{data.items.map((p) => (
            <tr key={p.id}><td><b>{p.name}</b>{p.notes && <div className="xsmall muted">{p.notes}</div>}</td><td>{PTYPE[p.type]}</td><td>{p.contact || '—'}</td><td>{p.rateNote || '—'}</td><td>{p.isActive ? 'Ya' : 'Tidak'}</td>
              <td><div className="row" style={{ gap: 6 }}><button className="btn btn-ghost btn-sm" onClick={() => setEdit(p)}>Ubah</button><button className="btn btn-ghost btn-sm" onClick={() => void del(p)}>Hapus</button></div></td></tr>))}</tbody></table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Ubah mitra' : 'Mitra baru'} onClose={() => { setEdit(null); setErrors({}); }} footer={<><button className="btn btn-ghost" onClick={() => setEdit(null)}>Batal</button><button className="btn btn-primary" onClick={save}>Simpan</button></>}>
          <div className="stack">
            <SelectField label="Jenis" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as Partner['type'] })}>{Object.entries(PTYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
            <TextField label="Nama" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={errors.name} />
            <TextField label="Kontak" value={edit.contact ?? ''} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} />
            <TextField label="Catatan tarif" value={edit.rateNote ?? ''} onChange={(e) => setEdit({ ...edit, rateNote: e.target.value })} />
            <TextAreaField label="Catatan" rows={2} value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <Choice checked={edit.isActive ?? true} onChange={(v) => setEdit({ ...edit, isActive: v })}>Aktif</Choice>
          </div>
        </Modal>
      )}
    </div>
  );
}

interface Expense { id: number; spentOn: string; category: string; description: string | null; amount: number; tripId: number | null }

export function AdminFinance() {
  const { data, loading, error, reload } = useFetch<{ items: Expense[] }>('/api/admin/expenses');
  const trips = useFetch<{ items: TripDetail[] }>('/api/admin/trips');
  const [edit, setEdit] = useState<{ id?: number; spentOn: string; category: string; description: string; amount: string; tripId: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const confirm = useConfirm();
  const total = data?.items.reduce((n, e) => n + e.amount, 0) ?? 0;

  const save = async () => {
    if (!edit) return;
    const e: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.spentOn)) e.spentOn = 'Pilih tanggal';
    if (edit.category.trim().length < 2) e.category = 'Isi kategori';
    if (toInt(edit.amount) == null) e.amount = 'Isi jumlah';
    setErrors(e); if (Object.keys(e).length) return;
    const body = { spentOn: edit.spentOn, category: edit.category, description: edit.description, amount: toInt(edit.amount), tripId: edit.tripId ? Number(edit.tripId) : null };
    try { if (edit.id) await api.put(`/api/admin/expenses/${edit.id}`, body); else await api.post('/api/admin/expenses', body); toast('Pengeluaran disimpan.'); setEdit(null); reload(); }
    catch (err) { setErrors(fieldErr(err)); toast(errMsg(err), 'error'); }
  };
  const del = async (x: Expense) => {
    if (!(await confirm.ask('Hapus pengeluaran?', <p>{x.category} {rupiah(x.amount)} dihapus dari catatan.</p>, { confirm: 'Hapus', danger: true }))) return;
    try { await api.del(`/api/admin/expenses/${x.id}`); reload(); } catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <div className="stack">
      {confirm.dialog}
      <div className="row between">
        <p className="muted small">Pendapatan dihitung otomatis dari pembayaran terverifikasi (lihat Ringkasan). Di sini Anda mencatat pengeluaran.</p>
        <div className="row"><a className="btn btn-ghost btn-sm" href="/api/admin/export/expenses">Ekspor CSV pengeluaran</a><button className="btn btn-primary" onClick={() => setEdit({ spentOn: new Date().toISOString().slice(0, 10), category: '', description: '', amount: '', tripId: '' })}><Plus /> Catat pengeluaran</button></div>
      </div>
      {loading ? <Loading rows={3} height={50} /> : error || !data ? <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} /> : data.items.length === 0 ? <Empty title="Belum ada pengeluaran tercatat" /> : (
        <div className="table-wrap"><table className="data"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Deskripsi</th><th className="r">Jumlah</th><th /></tr></thead>
          <tbody>{data.items.map((x) => (
            <tr key={x.id}><td className="nowrap">{formatDateShort(x.spentOn)}</td><td>{x.category}</td><td>{x.description || '—'}</td><td className="r num">{rupiah(x.amount)}</td>
              <td><div className="row" style={{ gap: 6 }}><button className="btn btn-ghost btn-sm" onClick={() => setEdit({ id: x.id, spentOn: x.spentOn, category: x.category, description: x.description ?? '', amount: String(x.amount), tripId: x.tripId ? String(x.tripId) : '' })}>Ubah</button><button className="btn btn-ghost btn-sm" onClick={() => void del(x)}>Hapus</button></div></td></tr>))}
            <tr><td colSpan={3}><b>Total (300 terbaru)</b></td><td className="r num"><b>{rupiah(total)}</b></td><td /></tr></tbody></table></div>
      )}
      {edit && (
        <Modal title={edit.id ? 'Ubah pengeluaran' : 'Catat pengeluaran'} onClose={() => { setEdit(null); setErrors({}); }} footer={<><button className="btn btn-ghost" onClick={() => setEdit(null)}>Batal</button><button className="btn btn-primary" onClick={save}>Simpan</button></>}>
          <div className="stack">
            <TextField label="Tanggal" type="date" value={edit.spentOn} onChange={(e) => setEdit({ ...edit, spentOn: e.target.value })} error={errors.spentOn} />
            <TextField label="Kategori" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} error={errors.category} hint="mis. Transportasi, Tiket, Konsumsi, Pemandu" />
            <TextField label="Jumlah (Rp)" inputMode="numeric" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} error={errors.amount} />
            <SelectField label="Trip terkait (opsional)" value={edit.tripId} onChange={(e) => setEdit({ ...edit, tripId: e.target.value })}><option value="">—</option>{(trips.data?.items ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</SelectField>
            <TextAreaField label="Deskripsi" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </div>
        </Modal>
      )}
    </div>
  );
}
