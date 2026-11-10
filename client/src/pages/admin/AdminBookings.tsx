import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, ErrorBox, Loading, Modal, Note, StatusBadge, TextAreaField, TextField, errMsg, fieldErr, useConfirm, useFetch, useToast } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { PRIVATE_VEHICLE_LABEL, STATUS_LABEL, formatDateShort, formatDateTime, rupiah, toInt } from '../../lib/format';
import type { Booking } from '../../lib/types';

function QuoteForm({ b, onDone }: { b: Booking; onDone: (b: Booking) => void }) {
  const est = b.details?.estimate;
  const [price, setPrice] = useState(est ? String(est.estimate) : '');
  const [note, setNote] = useState('');
  const [inc, setInc] = useState('');
  const [exc, setExc] = useState('');
  const [days, setDays] = useState('3');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const send = async () => {
    const finalPrice = toInt(price);
    if (!finalPrice) { setErrors({ finalPrice: 'Isi harga final' }); return; }
    setBusy(true); setErrors({});
    try { onDone(await api.post<Booking>(`/api/admin/bookings/${b.id}/quote`, { finalPrice, note, included: lines(inc), excluded: lines(exc), validDays: toInt(days) ?? 3 })); toast('Penawaran final terkirim ke pemesan.'); }
    catch (e) { setErrors(fieldErr(e)); toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="card soft stack">
      <h3>Kirim penawaran final</h3>
      {est && <p className="small muted">Estimasi awal sistem: {rupiah(est.range.low)} sampai {rupiah(est.range.high)}. Ini hanya acuan. Isi harga final setelah ketersediaan mitra dan biaya aktual dicek.</p>}
      <TextField label="Harga final (Rp)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.finalPrice} />
      <TextAreaField label="Catatan untuk pemesan" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="form-grid">
        <TextAreaField label="Termasuk (satu per baris)" rows={3} value={inc} onChange={(e) => setInc(e.target.value)} />
        <TextAreaField label="Tidak termasuk (satu per baris)" rows={3} value={exc} onChange={(e) => setExc(e.target.value)} />
      </div>
      <TextField label="Berlaku (hari)" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      <button className="btn btn-primary" onClick={send} disabled={busy}>Kirim penawaran</button>
    </div>
  );
}

function Detail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data: b, loading, error, setData } = useFetch<Booking>(`/api/admin/bookings/${id}`);
  const toast = useToast();
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<Booking>, ok: string) => {
    setBusy(true); setErrors({});
    try { setData(await fn()); toast(ok); onChanged(); } catch (e) { setErrors(fieldErr(e)); toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal title={b ? `Pesanan ${b.code}` : 'Pesanan'} onClose={onClose} wide>
      {confirm.dialog}
      {loading ? <Loading rows={2} height={100} /> : error || !b ? <ErrorBox error={error ?? 'Tidak ditemukan'} /> : (
        <div className="stack">
          <div className="row between"><StatusBadge status={b.status} /><span className="small muted">Dibuat {formatDateTime(b.createdAt)}</span></div>
          <div className="grid cols-2">
            <div className="card flat"><b>Pemesan</b><div className="small">{b.contact.name}<br />{b.contact.phone}<br />{b.contact.email}</div></div>
            <div className="card flat"><b>{b.type === 'open' ? 'Open Trip' : 'Private Trip'}</b>
              <div className="small">{b.trip ? <>{b.trip.title}<br />{formatDateShort(b.trip.date)} · {b.trip.departTime}<br /></> : null}{b.participants} peserta<br />Total: <b>{b.total > 0 ? rupiah(b.total) : 'belum ada'}</b>{b.fee > 0 && ` (termasuk biaya layanan ${rupiah(b.fee)})`}</div></div>
          </div>

          {b.type === 'private' && b.details && (
            <div className="card flat small">
              <b>Permintaan</b>
              <div>Tanggal: {b.details.desiredDate}{b.details.flexibleDates ? ' (fleksibel)' : ''} · {b.details.days} hari · {PRIVATE_VEHICLE_LABEL[b.details.vehicle] ?? b.details.vehicle}</div>
              <div>Titik jemput: {b.details.origin}</div>
              <div>Fasilitas: {Object.entries(b.details.facilities).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'}</div>
              <div>Anggaran: {b.details.budget.amount ? `${rupiah(b.details.budget.amount)} (${b.details.budget.mode === 'per_person' ? 'per orang' : 'total'})` : 'tidak diisi'}</div>
              {b.details.notes && <div>Catatan: {b.details.notes}</div>}
              {b.details.estimate && <div>Estimasi awal: {rupiah(b.details.estimate.range.low)} sampai {rupiah(b.details.estimate.range.high)}</div>}
            </div>
          )}

          {b.payment && <div className="card flat small"><b>Pembayaran:</b> {b.payment.status} · {rupiah(b.payment.amount)}{b.payment.payerName && <> · pengirim {b.payment.payerName}</>}{b.payment.reference && <> · ref {b.payment.reference}</>}{b.payment.submittedAt && <> · dilaporkan {formatDateTime(b.payment.submittedAt)}</>}</div>}
          {b.cancelReason && <Note kind="warn">Alasan pembatalan: {b.cancelReason}{b.refundStatus === 'diminta' && ' — pengembalian dana diminta.'}{b.refundStatus === 'selesai' && ' — pengembalian dana selesai.'}</Note>}

          {b.type === 'private' && b.status === 'menunggu_konfirmasi' && <QuoteForm b={b} onDone={(nb) => { setData(nb); onChanged(); }} />}

          {['menunggu_pembayaran', 'menunggu_verifikasi'].includes(b.status) && b.total > 0 && (
            <div className="card soft stack">
              <h3>Verifikasi pembayaran</h3>
              <p className="small muted">Cocokkan dengan mutasi rekening sebelum mengonfirmasi. Pesanan baru terkonfirmasi setelah tombol di bawah ditekan.</p>
              <div className="form-grid">
                <TextField label="Jumlah diterima (Rp)" inputMode="numeric" value={amount} placeholder={String(b.total)} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
                <TextField label="Referensi transfer (opsional)" value={ref} onChange={(e) => setRef(e.target.value)} />
              </div>
              <div className="row">
                <button className="btn btn-primary" disabled={busy} onClick={() => act(() => api.post<Booking>(`/api/admin/bookings/${b.id}/verify-payment`, { amount: toInt(amount) ?? b.total, reference: ref || undefined }), 'Pembayaran diverifikasi. Pesanan dikonfirmasi.')}>Verifikasi dan konfirmasi</button>
              </div>
              <TextField label="Alasan jika ditolak" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
              <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api.post<Booking>(`/api/admin/bookings/${b.id}/reject-payment`, { reason }), 'Pembayaran ditolak. Pemesan diberi tahu.')}>Tolak pembayaran</button>
            </div>
          )}

          {b.refundStatus === 'diminta' && <RefundForm b={b} onDone={(nb) => { setData(nb); onChanged(); }} />}

          <div className="row">
            {b.status === 'dikonfirmasi' && <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => api.post<Booking>(`/api/admin/bookings/${b.id}/status`, { status: 'selesai' }), 'Pesanan ditandai selesai.')}>Tandai selesai</button>}
            {!['selesai', 'dibatalkan'].includes(b.status) && (
              <button className="btn btn-danger" disabled={busy} onClick={async () => {
                if (await confirm.ask('Batalkan pesanan ini?', <p>Pesanan {b.code} dibatalkan{['menunggu_verifikasi', 'dikonfirmasi'].includes(b.status) ? ' dan permintaan pengembalian dana dicatat' : ''}.</p>, { confirm: 'Ya, batalkan', danger: true }))
                  await act(() => api.post<Booking>(`/api/admin/bookings/${b.id}/status`, { status: 'dibatalkan', reason: 'Dibatalkan oleh admin' }), 'Pesanan dibatalkan.');
              }}>Batalkan pesanan</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function RefundForm({ b, onDone }: { b: Booking; onDone: (b: Booking) => void }) {
  const [amount, setAmount] = useState(String(b.payment?.amount ?? b.total));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  return (
    <div className="card soft stack">
      <h3>Pengembalian dana</h3>
      <p className="small muted">Catat setelah dana benar-benar dikirim ke pemesan. Jumlah tidak boleh melebihi pembayaran terverifikasi.</p>
      <TextField label="Jumlah dikembalikan (Rp)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} error={err} />
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setErr('');
        try { onDone(await api.post<Booking>(`/api/admin/bookings/${b.id}/refund-complete`, { amount: toInt(amount) ?? 0 })); toast('Pengembalian dana dicatat.'); }
        catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
      }}>Catat pengembalian selesai</button>
    </div>
  );
}

export function AdminBookings() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') ?? '';
  const type = sp.get('type') ?? '';
  const q = sp.get('q') ?? '';
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, loading, error, reload } = useFetch<{ items: Booking[] }>(`/api/admin/bookings${qs({ status, type, q })}`);
  const set = (k: string, v: string) => { const p = new URLSearchParams(sp); if (v) p.set(k, v); else p.delete(k); setSp(p, { replace: true }); };

  return (
    <div className="stack">
      <div className="filters">
        <input className="input" type="search" aria-label="Cari kode, nama, atau email" placeholder="Cari kode, nama, email" value={q} onChange={(e) => set('q', e.target.value)} />
        <select className="select" aria-label="Status" value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" aria-label="Jenis" value={type} onChange={(e) => set('type', e.target.value)}>
          <option value="">Open dan Private</option><option value="open">Open Trip</option><option value="private">Private Trip</option>
        </select>
        <a className="btn btn-ghost btn-sm" href="/api/admin/export/bookings">Ekspor CSV pesanan</a>
        <a className="btn btn-ghost btn-sm" href="/api/admin/export/payments">Ekspor CSV pembayaran</a>
      </div>
      {loading ? <Loading rows={3} height={56} /> : error || !data ? <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} /> : data.items.length === 0 ? <Empty title="Tidak ada pesanan">Ubah filter atau tunggu pesanan baru masuk.</Empty> : (
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Kode</th><th>Pemesan</th><th>Jenis</th><th>Peserta</th><th className="r">Total</th><th>Status</th><th /></tr></thead>
          <tbody>{data.items.map((b) => (
            <tr key={b.id}>
              <td className="nowrap">{b.code}</td><td>{b.contact.name}<div className="xsmall muted">{b.contact.phone}</div></td>
              <td>{b.type === 'open' ? b.trip?.title ?? 'Open Trip' : 'Private Trip'}</td><td>{b.participants}</td>
              <td className="r num">{b.total > 0 ? rupiah(b.total) : '—'}</td><td><StatusBadge status={b.status} /></td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => setOpenId(b.id)}>Kelola</button></td>
            </tr>))}</tbody>
        </table></div>
      )}
      {openId != null && <Detail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
}
