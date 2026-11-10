import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorBox, Loading, Note, StatusBadge, TextAreaField, TextField, errMsg, fieldErr, useConfirm, useFetch, useTitle, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PRIVATE_VEHICLE_LABEL, formatDate, formatDateTime, rupiah } from '../lib/format';
import type { Booking } from '../lib/types';

const NEXT_TEXT: Record<string, string> = {
  menunggu_konfirmasi: 'Tim kami sedang memeriksa ketersediaan mitra dan biaya aktual. Anda akan mendapat penawaran final di sini. Pesanan belum terkonfirmasi.',
  menunggu_pembayaran: 'Selesaikan pembayaran sebelum batas waktu agar kursi atau jadwal tetap ditahan.',
  menunggu_verifikasi: 'Laporan pembayaran Anda diterima. Admin akan memverifikasinya; pesanan belum terkonfirmasi sebelum itu.',
  dikonfirmasi: 'Pembayaran sudah diverifikasi dan pesanan Anda terkonfirmasi.',
  selesai: 'Perjalanan sudah selesai. Terima kasih sudah plesir bersama kami.',
  dibatalkan: 'Pesanan ini dibatalkan.',
};

export default function BookingPage() {
  const { code } = useParams();
  const { meta } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: b, loading, error, reload, setData } = useFetch<Booking>(`/api/bookings/${code}`);
  useTitle(b ? `Pesanan ${b.code}` : 'Pesanan');
  const [pay, setPay] = useState({ payerName: '', reference: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="wrap section"><Loading rows={2} height={180} /></div>;
  if (error || !b) return <div className="wrap section"><ErrorBox error={error ?? 'Pesanan tidak ditemukan'} onRetry={reload} /><p style={{ marginTop: 16 }}><Link to="/dashboard">Kembali ke dashboard</Link></p></div>;

  const payment = meta?.settings.payment;
  const copy = (txt: string) => { void navigator.clipboard?.writeText(txt).then(() => toast('Disalin')); };

  const report = async () => {
    setBusy(true); setErrors({});
    try { setData(await api.post<Booking>(`/api/bookings/${b.code}/payment`, pay)); toast('Laporan pembayaran terkirim. Menunggu verifikasi admin.'); }
    catch (e) { setErrors(fieldErr(e)); toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const cancel = async () => {
    const refundNote = ['menunggu_verifikasi', 'dikonfirmasi'].includes(b.status) ? ' Karena pembayaran sudah dilaporkan atau diverifikasi, permintaan pengembalian dana akan dicatat dan diproses sesuai kebijakan pembatalan.' : '';
    const ok = await confirm.ask('Batalkan pesanan?', <p>Pesanan {b.code} akan dibatalkan dan tidak dapat diaktifkan kembali.{refundNote}</p>, { confirm: 'Ya, batalkan pesanan', danger: true });
    if (!ok) return;
    setBusy(true);
    try { setData(await api.post<Booking>(`/api/bookings/${b.code}/cancel`, { reason: 'Dibatalkan oleh pemesan' })); toast('Pesanan dibatalkan.'); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  const d = b.details;
  const quote = d?.quote;

  return (
    <div className="wrap" style={{ paddingBottom: 56 }}>
      {confirm.dialog}
      <div className="page-head">
        <nav className="breadcrumb"><Link to="/dashboard">Dashboard</Link> / Pesanan</nav>
        <div className="row"><h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.4rem)' }}>Pesanan {b.code}</h1><StatusBadge status={b.status} /></div>
        <p className="lead">{b.type === 'open' ? b.trip?.title : 'Permintaan Private Trip'}</p>
      </div>

      <div className="split">
        <div className="stack-lg">
          <Note kind={b.status === 'dibatalkan' ? 'danger' : b.status === 'dikonfirmasi' || b.status === 'selesai' ? 'info' : 'warn'}>
            <b>{b.statusLabel}.</b> {NEXT_TEXT[b.status]}
            {b.cancelReason && b.status === 'dibatalkan' && <div style={{ marginTop: 4 }}>Alasan: {b.cancelReason}</div>}
            {b.refundStatus === 'diminta' && <div style={{ marginTop: 4 }}><b>Pengembalian dana diminta</b> dan sedang diproses admin.</div>}
            {b.refundStatus === 'selesai' && <div style={{ marginTop: 4 }}><b>Pengembalian dana selesai.</b></div>}
          </Note>

          {b.type === 'private' && d && (
            <section className="card stack" aria-labelledby="req">
              <h2 id="req" style={{ fontSize: '1.3rem' }}>Permintaan Anda</h2>
              <dl className="kv">
                <dt>Tanggal diinginkan</dt><dd>{formatDate(d.desiredDate)}{d.flexibleDates ? ' (fleksibel)' : ''}</dd>
                <dt>Peserta</dt><dd>{b.participants} orang</dd>
                <dt>Durasi</dt><dd>{d.days} hari</dd>
                <dt>Berangkat dari</dt><dd>{d.origin}</dd>
                <dt>Kendaraan</dt><dd>{PRIVATE_VEHICLE_LABEL[d.vehicle] ?? d.vehicle}</dd>
              </dl>
              {d.notes && <p className="small"><b>Catatan:</b> {d.notes}</p>}
              {d.itineraryDraft && <p className="small muted">Rancangan awal: {d.itineraryDraft.title} ({d.itineraryDraft.days.reduce((n, x) => n + x.stops.length, 0)} tempat)</p>}
              <div className="alert sun">
                <div><b>Estimasi awal, bukan harga final:</b> {rupiah(d.estimate.range.low)}–{rupiah(d.estimate.range.high).replace('Rp', '')} (≈ {rupiah(d.estimate.perPerson)}/orang). Harga final dikirim tim setelah memeriksa ketersediaan mitra dan biaya aktual.</div>
              </div>
            </section>
          )}

          {quote && (
            <section className="card stack" aria-labelledby="quote">
              <h2 id="quote" style={{ fontSize: '1.3rem' }}>Penawaran final dari People Plesir</h2>
              <p className="small muted">Dikirim {formatDateTime(quote.sentAt)} · berlaku {quote.validDays} hari</p>
              {quote.lines.length > 0 && <dl className="kv">{quote.lines.map((l) => <><dt key={`${l.label}t`}>{l.label}</dt><dd key={`${l.label}d`}>{rupiah(l.amount)}</dd></>)}</dl>}
              <p className="price num">{rupiah(b.total)}</p>
              {b.quoteNote && <p className="small">{b.quoteNote}</p>}
              <div className="grid cols-2">
                {quote.included.length > 0 && <div><h4>Termasuk</h4><ul className="list-check">{quote.included.map((i) => <li key={i}><Check />{i}</li>)}</ul></div>}
                {quote.excluded.length > 0 && <div><h4>Tidak termasuk</h4><ul className="list-check no">{quote.excluded.map((i) => <li key={i}><X />{i}</li>)}</ul></div>}
              </div>
            </section>
          )}

          {b.actions.canPay && (
            <section className="card stack" aria-labelledby="bayar">
              <h2 id="bayar" style={{ fontSize: '1.3rem' }}>Pembayaran</h2>
              {b.expiresAt && <p className="small">Selesaikan sebelum <b>{formatDateTime(b.expiresAt)}</b>. Setelah itu pesanan dibatalkan otomatis dan kursi dilepas.</p>}
              {payment?.configured ? (
                <div className="panel stack-sm">
                  <div className="small muted">Transfer manual ke</div>
                  <b style={{ fontSize: '1.1rem' }}>{payment.bankName}</b>
                  <div className="row"><span className="num" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{payment.accountNumber}</span><button className="btn btn-ghost btn-sm" onClick={() => copy(payment.accountNumber ?? '')}>Salin</button></div>
                  <div className="small">a.n. {payment.accountHolder}</div>
                  <div className="small">Jumlah: <b>{rupiah(b.total)}</b> <button className="btn btn-link" onClick={() => copy(String(b.total))}>salin angka</button></div>
                  <p className="xsmall muted">Cantumkan kode {b.code} pada berita transfer bila memungkinkan.</p>
                </div>
              ) : (
                <Note kind="warn"><b>Rekening pembayaran belum diatur admin.</b> Pesanan Anda tetap ditahan sampai batas waktu. Hubungi bantuan untuk instruksi pembayaran
                  {meta?.settings.contact.whatsapp ? <> lewat WhatsApp <b>{meta.settings.contact.whatsapp}</b></> : ''}
                  {meta?.settings.contact.email ? <> atau email <b>{meta.settings.contact.email}</b></> : ''}.</Note>
              )}
              {payment?.configured && (
                <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); void report(); }}>
                  <h3 style={{ fontSize: '1.05rem' }}>Sudah transfer? Laporkan di sini</h3>
                  <TextField label="Nama pemilik rekening pengirim" value={pay.payerName} error={errors.payerName} onChange={(e) => setPay({ ...pay, payerName: e.target.value })} />
                  <TextField label="Referensi transfer (opsional)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} hint="Nomor referensi atau 4 digit terakhir rekening pengirim" />
                  <TextAreaField label="Catatan (opsional)" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
                  <div><button className="btn btn-primary" type="submit" disabled={busy}>Saya sudah transfer</button></div>
                  <p className="xsmall muted">Menekan tombol ini hanya mengirim laporan. Pesanan dikonfirmasi setelah admin memeriksa pembayaran masuk.</p>
                </form>
              )}
            </section>
          )}

          {b.payment && b.payment.status !== 'pending' && (
            <section className="card stack-sm"><h3>Status pembayaran</h3>
              <p className="small">{b.payment.status === 'submitted' && 'Dilaporkan, menunggu verifikasi.'}{b.payment.status === 'verified' && `Terverifikasi ${formatDateTime(b.payment.verifiedAt)}.`}{b.payment.status === 'rejected' && `Belum dapat diverifikasi${b.payment.note ? `: ${b.payment.note}` : '.'}`}{b.payment.status === 'refunded' && 'Dikembalikan.'}</p>
            </section>
          )}
        </div>

        <aside className="side stack">
          <div className="card stack">
            <h3>Ringkasan</h3>
            {b.trip && <div className="small"><b>{b.trip.title}</b><br />{formatDate(b.trip.date)} · berangkat {b.trip.departTime}<br />{b.trip.meetingPoint}</div>}
            <dl className="kv">
              <dt>Peserta</dt><dd>{b.participants}</dd>
              {b.type === 'open' && <><dt>Harga per orang</dt><dd>{rupiah(b.unitPrice)}</dd><dt>Biaya layanan</dt><dd>{rupiah(b.fee)}</dd></>}
              <dt className="total">Total</dt><dd className="total">{b.total > 0 ? rupiah(b.total) : 'Menunggu penawaran'}</dd>
            </dl>
            <div className="small muted">Dibuat {formatDateTime(b.createdAt)}<br />Pemesan: {b.contact.name} · {b.contact.phone}</div>
            {b.actions.canCancel && <button className="btn btn-ghost btn-sm" onClick={cancel} disabled={busy}>Batalkan pesanan</button>}
            <p className="xsmall muted">{meta?.settings.policy.cancellation}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
