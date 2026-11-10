import { Link } from 'react-router-dom';
import { ErrorBox, Loading, TripStateChip, useFetch } from '../../components/ui';
import { STATUS_LABEL, formatDate, monthLabel, rupiah } from '../../lib/format';
import type { Trip } from '../../lib/types';

interface Summary {
  range: { from: string; to: string };
  totals: { revenue: number; refunds: number; expenses: number; net: number };
  byStatus: Record<string, number>;
  attention: { awaitingVerification: number; privateAwaitingQuote: number; refundsPending: number; unverifiedDestinations: number };
  byMonth: { month: string; revenue: number; refunds: number; expenses: number }[];
  upcoming: Trip[];
}

export function AdminOverview() {
  const { data, loading, error, reload } = useFetch<Summary>('/api/admin/summary');
  if (loading) return <Loading rows={2} height={140} />;
  if (error || !data) return <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} />;
  const a = data.attention;
  const todo: [string, number, string][] = [
    ['Pembayaran menunggu verifikasi', a.awaitingVerification, '/admin/pesanan?status=menunggu_verifikasi'],
    ['Private Trip menunggu penawaran', a.privateAwaitingQuote, '/admin/pesanan?status=menunggu_konfirmasi'],
    ['Pengembalian dana diminta', a.refundsPending, '/admin/pesanan'],
    ['Destinasi belum terverifikasi penuh', a.unverifiedDestinations, '/admin/destinasi'],
  ];
  return (
    <div className="stack-lg">
      <section>
        <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Perlu tindakan</h2>
        <div className="stat-grid">
          {todo.map(([l, n, to]) => <Link key={l} to={to} className="stat" style={{ textDecoration: 'none', color: 'inherit' }}><b>{n}</b><span>{l}</span></Link>)}
        </div>
      </section>
      <section>
        <h2 style={{ fontSize: '1.2rem', marginBottom: 4 }}>Keuangan bulan ini</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>{formatDate(data.range.from)} sampai {formatDate(data.range.to)}. Pendapatan hanya dari pembayaran yang sudah diverifikasi.</p>
        <div className="stat-grid">
          <div className="stat"><b>{rupiah(data.totals.revenue)}</b><span>Pendapatan terverifikasi</span></div>
          <div className="stat"><b>{rupiah(data.totals.refunds)}</b><span>Pengembalian dana</span></div>
          <div className="stat"><b>{rupiah(data.totals.expenses)}</b><span>Pengeluaran tercatat</span></div>
          <div className="stat"><b>{rupiah(data.totals.net)}</b><span>Selisih</span></div>
        </div>
      </section>
      <section className="grid cols-2">
        <div className="card">
          <h3>Pesanan per status</h3>
          <table className="budget-table" style={{ marginTop: 10 }}><tbody>
            {Object.keys(STATUS_LABEL).map((s) => <tr key={s}><td>{STATUS_LABEL[s]}</td><td className="num">{data.byStatus[s] ?? 0}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <h3>Trip mendatang</h3>
          {data.upcoming.length === 0 ? <p className="muted small" style={{ marginTop: 10 }}>Belum ada trip terjadwal. Buat di menu Open Trip.</p> : (
            <div className="stack-sm" style={{ marginTop: 10 }}>
              {data.upcoming.map((t) => (
                <div key={t.id} className="row between">
                  <div><b>{t.title}</b><div className="small muted">{formatDate(t.date)} · {t.seats.held}/{t.seats.capacity} kursi · {t.seats.confirmed} terkonfirmasi</div></div>
                  <TripStateChip state={t.state} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      {data.byMonth.length > 0 && (
        <section>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Per bulan</h2>
          <div className="table-wrap"><table className="data"><thead><tr><th>Bulan</th><th className="r">Pendapatan</th><th className="r">Pengembalian</th><th className="r">Pengeluaran</th></tr></thead>
            <tbody>{data.byMonth.map((m) => <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="r num">{rupiah(m.revenue)}</td><td className="r num">{rupiah(m.refunds)}</td><td className="r num">{rupiah(m.expenses)}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </div>
  );
}
