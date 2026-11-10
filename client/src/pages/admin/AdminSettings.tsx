import { useEffect, useState } from 'react';
import { ErrorBox, Loading, Note, errMsg, useFetch, useToast } from '../../components/ui';
import { api } from '../../lib/api';

interface Setting { key: string; value: string; verified: boolean; note: string | null }

const GROUPS: [string, RegExp][] = [
  ['Kontak dan bisnis', /^contact\./], ['Pembayaran manual', /^payment\./], ['Pemesanan', /^booking\./],
  ['Harga Private Trip', /^private\./], ['Kecepatan dan biaya AI Planner', /^(speed|cost|route)\./], ['Kebijakan', /^policy\./],
];
const LONG = /^(policy\.(cancellation|payment|min_participants)|contact\.business_info)$/;

export function AdminSettings() {
  const { data, loading, error, reload } = useFetch<{ items: Setting[] }>('/api/admin/settings');
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, Setting>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setDraft(Object.fromEntries(data.items.map((s) => [s.key, s]))); }, [data]);
  if (loading) return <Loading rows={3} height={140} />;
  if (error || !data) return <ErrorBox error={error ?? 'Tidak ada data'} onRetry={reload} />;

  const set = (k: string, patch: Partial<Setting>) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...patch } }));
  const save = async () => {
    const changed = data.items.filter((s) => draft[s.key] && (draft[s.key].value !== s.value || draft[s.key].verified !== s.verified));
    if (!changed.length) { toast('Tidak ada perubahan.'); return; }
    setBusy(true);
    try {
      await api.put('/api/admin/settings', { items: changed.map((s) => ({ key: s.key, value: draft[s.key].value, verified: draft[s.key].verified })) });
      toast(`${changed.length} pengaturan disimpan.`); reload();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="stack-lg">
      <Note kind="sun">Tarif dan kecepatan di sini adalah <b>asumsi</b> untuk estimasi. Centang "Terverifikasi" hanya setelah angkanya dicek ke mitra atau lokasi. Rekening pembayaran harus diisi sebelum pesanan Open Trip dapat dibayar.</Note>
      {GROUPS.map(([title, re]) => {
        const items = data.items.filter((s) => re.test(s.key));
        if (!items.length) return null;
        return (
          <section key={title} className="card">
            <h3 style={{ marginBottom: 14 }}>{title}</h3>
            <div className="stack">
              {items.map((s) => {
                const d = draft[s.key] ?? s;
                return (
                  <div key={s.key} className="field">
                    <label htmlFor={`st-${s.key}`}>{s.note ?? s.key} <span className="xsmall muted">({s.key})</span></label>
                    {LONG.test(s.key)
                      ? <textarea id={`st-${s.key}`} className="textarea" rows={3} value={d.value} onChange={(e) => set(s.key, { value: e.target.value })} />
                      : <input id={`st-${s.key}`} className="input" value={d.value} onChange={(e) => set(s.key, { value: e.target.value })} />}
                    {!/^(contact|policy)\./.test(s.key) && !/^payment\./.test(s.key) && (
                      <label className="check"><input type="checkbox" checked={d.verified} onChange={(e) => set(s.key, { verified: e.target.checked })} /> Terverifikasi</label>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <div className="action-bar"><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</button></div>
    </div>
  );
}
