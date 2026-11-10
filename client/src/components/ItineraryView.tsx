import {
  AlertTriangle, ArrowDown, ArrowUp, Car, CheckCircle2, Clock, Copy, HelpCircle, MapPin, Pencil, Plus, Printer, RefreshCw, Repeat, Save, Share2, Trash2, Users, Wallet, XCircle,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatDuration, rupiah, rupiahRange, VEHICLE_LABEL } from '../lib/format';
import type { Check, Dest, Itinerary, Money, PlanEntry, StopPlan } from '../lib/types';
import { MapView, gmapsDirections, type MapPoint } from './MapView';
import { DestImage, sceneKindFor } from './Scene';
import { ConfirmTag, Modal, Note, useFetch } from './ui';

export const planFrom = (it: Itinerary): PlanEntry[][] => it.days.map((d) => d.stops.map((s) => ({ destinationId: s.destinationId, role: s.role })));

const moneyText = (m: Money | null) => (m ? (m.low === m.high ? rupiah(m.mid) : `${rupiah(m.mid)}`) : '—');
const moneyRange = (m: Money) => (m.low === m.high ? '' : `${rupiahRange(m.low, m.high)}`);

function CheckIcon({ s }: { s: Check['status'] }) {
  if (s === 'ok') return <CheckCircle2 />;
  if (s === 'gagal') return <XCircle />;
  if (s === 'perhatian') return <AlertTriangle />;
  return <HelpCircle />;
}

export function itineraryText(it: Itinerary): string {
  const lines = [it.title, it.summary, ''];
  for (const d of it.days) {
    lines.push(`Hari ${d.dayIndex + 1} (${formatDate(d.date)})`);
    for (const s of d.stops) lines.push(`${s.arrive} ${s.dest.name}${s.role === 'meal' ? ' (makan)' : ''}`);
    if (d.stops.length) lines.push(`${d.returnLeg.backAt} kembali ke ${it.input.origin.label}`);
    lines.push('');
  }
  lines.push(`Estimasi biaya: ${rupiah(it.budget.total.mid)} untuk ${it.input.participants} orang (sekitar ${rupiah(it.budget.perPerson.mid)}/orang).`);
  lines.push(it.disclaimer);
  return lines.join('\n');
}

/* ---------- pemilih destinasi (ganti / tambah) ---------- */
function DestPicker({ title, exclude, onPick, onClose }: { title: string; exclude: Set<string>; onPick: (d: Dest) => void; onClose: () => void }) {
  const { data, loading } = useFetch<{ items: Dest[] }>('/api/destinations');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const items = (data?.items ?? []).filter((d) => (!kind || d.kind === kind) && `${d.name} ${d.categoryName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={title} onClose={onClose}>
      <div className="form-grid two" style={{ marginBottom: 16 }}>
        <div className="field"><label htmlFor="pk-q">Cari</label><input id="pk-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama tempat" data-autofocus /></div>
        <div className="field"><label htmlFor="pk-k">Jenis</label>
          <select id="pk-k" className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Semua</option><option value="wisata">Wisata</option><option value="kuliner">Kuliner</option><option value="kafe">Kafe</option></select>
        </div>
      </div>
      {loading ? <div className="skeleton" style={{ height: 160 }} /> : items.length === 0 ? <p className="muted">Tidak ada tempat yang cocok.</p> : (
        <ul className="stack-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((d) => (
            <li key={d.id} className="panel row between" style={{ alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <b>{d.name}</b>
                <div className="small muted">{d.categoryName} · {formatDuration(d.avgDurationMin)}{d.price ? ` · ${d.price.max === 0 ? 'Gratis' : rupiahRange(d.price.min, d.price.max)}` : ''}</div>
              </div>
              <button className="btn btn-primary btn-sm" disabled={exclude.has(d.id)} onClick={() => onPick(d)}>{exclude.has(d.id) ? 'Sudah ada' : 'Pilih'}</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ---------- satu pemberhentian ---------- */
function StopCard({ s, idx, last, days, day, edit, busy, onUp, onDown, onRemove, onReplace, onMove }: {
  s: StopPlan; idx: number; last: boolean; days: number; day: number; edit: boolean; busy: boolean;
  onUp: () => void; onDown: () => void; onRemove: () => void; onReplace: () => void; onMove: (to: number) => void;
}) {
  const priceText = s.pricePerPerson ? (s.pricePerPerson.max === 0 ? 'Gratis' : `${rupiahRange(s.pricePerPerson.min, s.pricePerPerson.max)} /orang`) : null;
  return (
    <div className="stop-card">
      <div className="thumb" style={{ position: 'relative' }}>
        <DestImage src={s.dest.imageUrl} alt="" kind={sceneKindFor({ id: s.destinationId, kind: s.dest.kind, categoryId: s.dest.kind === 'kuliner' ? 'kuliner-banyumasan' : s.dest.kind === 'kafe' ? 'kafe-santai' : undefined, theme: s.dest.categoryName })} />
      </div>
      <div className="stop-body">
        <div className="row" style={{ gap: 6 }}>
          <span className={`chip ${s.role === 'meal' ? 'sun' : ''}`}>{s.role === 'meal' ? 'Makan' : s.dest.categoryName}</span>
          {s.dest.familyFriendly && <span className="chip"><Users /> Keluarga</span>}
        </div>
        <h3>{s.dest.name}</h3>
        <p className="small" style={{ color: 'var(--ink-2)' }}>{s.dest.summary}</p>
        <div className="dest-meta">
          <span><MapPin /> {s.dest.addressText ?? 'Banyumas'}{s.flags.includes('lokasi_perkiraan') && <> <ConfirmTag text="Lokasi perkiraan" /></>}</span>
          <span><Clock /> {s.arrive}–{s.depart} ({formatDuration(s.durationMin)})</span>
          <span><Wallet /> {priceText ?? 'Harga belum ada'} {s.flags.includes('harga_perlu_konfirmasi') && <ConfirmTag />}</span>
        </div>
        <div className="small">
          {s.hours ? <>Jam buka: <b>{s.hours.open}–{s.hours.close}</b> <ConfirmTag verified text="Terverifikasi" /></> : <>Jam operasional: <ConfirmTag /></>}
          {s.waitMin > 0 && <span className="muted"> · menunggu {s.waitMin} mnt hingga buka</span>}
        </div>
        {s.tip && <p className="small" style={{ background: 'var(--sage-50)', padding: '8px 12px', borderRadius: 12 }}>Tips: {s.tip}</p>}
        <div className="stop-tools">
          <Link className="btn btn-ghost btn-sm" to={`/destinasi/${s.destinationId}`}>Lihat Detail</Link>
          <a className="btn btn-ghost btn-sm no-print" href={gmapsDirections(s.dest.lat, s.dest.lng)} target="_blank" rel="noopener noreferrer">Lihat Rute</a>
          {edit && (
            <span className="row no-print" style={{ gap: 6, marginLeft: 'auto' }}>
              <button className="icon-btn" disabled={busy || idx === 0} onClick={onUp} aria-label={`Naikkan ${s.dest.name}`}><ArrowUp /></button>
              <button className="icon-btn" disabled={busy || last} onClick={onDown} aria-label={`Turunkan ${s.dest.name}`}><ArrowDown /></button>
              <button className="icon-btn" disabled={busy} onClick={onReplace} aria-label={`Ganti ${s.dest.name}`} title="Ganti destinasi"><Repeat /></button>
              <button className="icon-btn" disabled={busy} onClick={onRemove} aria-label={`Hapus ${s.dest.name}`} title="Hapus"><Trash2 /></button>
              {days > 1 && (
                <select className="select" style={{ minHeight: 40, width: 'auto', padding: '4px 10px' }} aria-label={`Pindahkan ${s.dest.name} ke hari`} value={day} disabled={busy} onChange={(e) => onMove(Number(e.target.value))}>
                  {Array.from({ length: days }, (_, i) => <option key={i} value={i}>Hari {i + 1}</option>)}
                </select>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export interface ItineraryViewProps {
  it: Itinerary;
  plan: PlanEntry[][];
  readOnly?: boolean;
  busy?: boolean;
  savedId?: number | null;
  onChangePlan?: (plan: PlanEntry[][], title?: string) => void;
  onRegenerate?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  onEditPrefs?: () => void;
  privateHref?: string;
}

export function ItineraryView({ it, plan, readOnly = false, busy = false, savedId, onChangePlan, onRegenerate, onSave, onShare, onEditPrefs, privateHref }: ItineraryViewProps) {
  const [dayIdx, setDayIdx] = useState(0);
  const [edit, setEdit] = useState(false);
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'replace'; day: number; idx: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const day = it.days[Math.min(dayIdx, it.days.length - 1)];
  const used = useMemo(() => new Set(plan.flat().map((p) => p.destinationId)), [plan]);

  const change = (next: PlanEntry[][]) => onChangePlan?.(next);
  const swap = (d: number, i: number, j: number) => { const n = plan.map((x) => [...x]); [n[d][i], n[d][j]] = [n[d][j], n[d][i]]; change(n); };
  const remove = (d: number, i: number) => { const n = plan.map((x) => [...x]); n[d].splice(i, 1); change(n); };
  const move = (d: number, i: number, to: number) => { const n = plan.map((x) => [...x]); const [e] = n[d].splice(i, 1); n[to].push(e); change(n); setDayIdx(to); };
  const roleOf = (d: Dest): PlanEntry['role'] => (d.kind === 'kuliner' ? 'meal' : 'visit');
  const pick = (d: Dest) => {
    if (!picker) return;
    const n = plan.map((x) => [...x]);
    if (picker.mode === 'add') n[dayIdx].push({ destinationId: d.id, role: roleOf(d) });
    else n[picker.day][picker.idx] = { destinationId: d.id, role: roleOf(d) };
    setPicker(null);
    change(n);
  };

  const points = useMemo<MapPoint[]>(() => {
    const o: MapPoint = { id: 'origin', lat: it.input.origin.lat, lng: it.input.origin.lng, label: it.input.origin.label, sub: 'Titik berangkat', kind: 'home' };
    return day && day.stops.length ? [o, ...day.stops.map((s, i): MapPoint => ({ id: s.destinationId, lat: s.dest.lat, lng: s.dest.lng, label: `${i + 1}. ${s.dest.name}`, sub: `${s.arrive}–${s.depart}`, n: i + 1, kind: s.role === 'meal' ? 'meal' : 'stop', approximate: s.flags.includes('lokasi_perkiraan'), href: `/destinasi/${s.destinationId}` })), { ...o, id: 'origin-end' }] : [o];
  }, [day, it.input.origin]);

  const copyText = async () => { try { await navigator.clipboard.writeText(itineraryText(it)); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard ditolak */ } };
  const issues = it.warnings.filter((w) => w.level !== 'info');
  const infos = it.warnings.filter((w) => w.level === 'info');
  const b = it.budget;
  const totalStops = it.days.reduce((n, d) => n + d.stops.length, 0);

  return (
    <div className="stack-lg" aria-busy={busy}>
      <header className="stack">
        <div className="row">
          <span className={`chip ${it.engine.mode === 'ai' ? 'solid' : 'sun'}`}>{it.engine.mode === 'ai' ? 'Disusun dengan AI' : 'Mode demo (tanpa AI)'}</span>
          <span className="chip">{it.engine.routing === 'osrm' ? 'Rute dari layanan peta' : 'Waktu tempuh estimasi'}</span>
          <span className="chip"><Users /> {it.input.participants} orang</span>
          <span className="chip"><Car /> {VEHICLE_LABEL[it.input.vehicle]}</span>
        </div>
        {edit && !readOnly ? (
          <div className="field"><label htmlFor="it-title">Judul perjalanan</label><input id="it-title" className="input" defaultValue={it.title} maxLength={150} onBlur={(e) => e.target.value.trim() && e.target.value !== it.title && onChangePlan?.(plan, e.target.value.trim())} /></div>
        ) : <h2 style={{ fontSize: 'clamp(1.7rem,4vw,2.5rem)' }}>{it.title}</h2>}
        <p className="lead">{it.summary}</p>
        <p className="small muted">{it.engine.note}</p>
      </header>

      {!readOnly && (
        <div className="action-bar no-print" role="toolbar" aria-label="Tindakan itinerary">
          <button className={`btn btn-sm ${edit ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setEdit((v) => !v)} aria-pressed={edit}><Pencil /> {edit ? 'Selesai mengubah' : 'Ubah itinerary'}</button>
          {edit && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPicker({ mode: 'add' })}><Plus /> Tambahkan destinasi (hari {dayIdx + 1})</button>}
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onRegenerate}><RefreshCw /> Buat ulang</button>
          <button className="btn btn-ghost btn-sm" onClick={onEditPrefs}>Ubah preferensi</button>
          <span className="grow" />
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={onSave}><Save /> {savedId ? 'Simpan perubahan' : 'Simpan itinerary'}</button>
          <button className="btn btn-ghost btn-sm" onClick={onShare}><Share2 /> Bagikan</button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer /> Cetak / PDF</button>
        </div>
      )}
      {readOnly && (
        <div className="action-bar no-print">
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer /> Cetak / PDF</button>
          <button className="btn btn-ghost btn-sm" onClick={copyText}><Copy /> {copied ? 'Tersalin' : 'Salin sebagai teks'}</button>
          <Link className="btn btn-primary btn-sm" to="/planner">Susun itinerary sendiri</Link>
        </div>
      )}

      {issues.length > 0 && (
        <Note kind={issues.some((w) => w.level === 'error') ? 'danger' : 'warn'}>
          <b>Perlu diperhatikan</b>
          <ul>{issues.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        </Note>
      )}

      <section aria-label="Pemeriksaan otomatis" className="stack-sm">
        <h3>Pemeriksaan otomatis</h3>
        <div className="checks">
          {it.checks.map((c) => (
            <div key={c.key} className={`check-item ${c.status}`}>
              <CheckIcon s={c.status} />
              <div><b>{c.label}</b>{c.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="result-grid">
        <div>
          {it.days.length > 1 && (
            <div className="day-tabs no-print" role="tablist" aria-label="Pilih hari">
              {it.days.map((d, i) => <button key={d.date} role="tab" className="day-tab" aria-selected={i === dayIdx} onClick={() => setDayIdx(i)}>Hari {i + 1}</button>)}
            </div>
          )}
          <section aria-label={`Hari ${dayIdx + 1}`}>
            <DayTimeline it={it} dIdx={dayIdx} edit={edit && !readOnly} busy={busy} onSwap={swap} onRemove={remove} onMove={move} onReplace={(i) => setPicker({ mode: 'replace', day: dayIdx, idx: i })} />
          </section>
          {/* Saat dicetak, hari lain ikut tampil agar PDF memuat seluruh perjalanan. */}
          <div className="print-only">
            {it.days.map((d, di) => (di === dayIdx ? null : <DayTimeline key={d.date} it={it} dIdx={di} edit={false} busy onSwap={swap} onRemove={remove} onMove={move} onReplace={() => undefined} />))}
          </div>
          {totalStops === 0 && <Note kind="warn">Itinerary ini belum memiliki destinasi. {readOnly ? '' : 'Pilih "Ubah itinerary" lalu tambahkan destinasi, atau buat ulang.'}</Note>}
          {infos.length > 0 && <details style={{ marginTop: 16 }}><summary className="small muted" style={{ cursor: 'pointer' }}>Catatan penyusunan ({infos.length})</summary><ul className="small muted">{infos.map((w, i) => <li key={i}>{w.message}</li>)}</ul></details>}
        </div>

        <aside className="result-side stack">
          <MapView points={points} route tall={false} label={`Peta rute hari ${dayIdx + 1}`} />
          <div className="card stack-sm" aria-label="Ringkasan anggaran">
            <h3>Ringkasan biaya</h3>
            <table className="budget-table"><tbody>
              <tr><td>Tiket masuk</td><td>{moneyText(b.tickets)}</td></tr>
              <tr><td>Makan</td><td>{moneyText(b.food)}</td></tr>
              <tr><td>Transportasi ({VEHICLE_LABEL[it.input.vehicle]})</td><td>{rupiah(b.transport)}</td></tr>
              <tr className="total"><td>Total kelompok ({it.input.participants} orang)</td><td>{rupiah(b.total.mid)}</td></tr>
              <tr><td>Per orang</td><td>{rupiah(b.perPerson.mid)}</td></tr>
            </tbody></table>
            {b.total.low !== b.total.high && <p className="small muted">Rentang: {rupiahRange(b.total.low + 0, b.total.high)} (batas bawah sampai atas harga tiket dan makan).</p>}
            {b.allowedTotal != null && <p className="small">Anggaran Anda: <b>{rupiah(b.allowedTotal)}</b> · <span className={`chip ${b.status === 'ok' ? 'ok' : b.status === 'melebihi' ? 'danger' : 'warn'}`}>{b.status === 'ok' ? 'Dalam anggaran' : b.status === 'melebihi' ? 'Melebihi anggaran' : 'Bisa melebihi'}</span></p>}
            <p className="small muted">{b.note}</p>
            {moneyRange(b.tickets) && <p className="xsmall muted">Tiket: {moneyRange(b.tickets)}</p>}
          </div>
          <div className="alert sun"><AlertTriangle /><div>{it.disclaimer}</div></div>
          {!readOnly && privateHref && <Link className="btn btn-accent btn-block no-print" to={privateHref}>Pesan sebagai Private Trip</Link>}
        </aside>
      </div>

      {picker && <DestPicker title={picker.mode === 'add' ? `Tambahkan ke hari ${dayIdx + 1}` : 'Ganti destinasi'} exclude={used} onPick={pick} onClose={() => setPicker(null)} />}
    </div>
  );
}

function DayTimeline({ it, dIdx, edit, busy, onSwap, onRemove, onMove, onReplace }: {
  it: Itinerary; dIdx: number; edit: boolean; busy: boolean;
  onSwap: (d: number, i: number, j: number) => void; onRemove: (d: number, i: number) => void; onMove: (d: number, i: number, to: number) => void; onReplace: (i: number) => void;
}) {
  const day = it.days[dIdx];
  return (
    <div className="stack">
      <div className="row between">
        <h3 style={{ fontSize: '1.3rem' }}>Hari {dIdx + 1} · {formatDate(day.date)}</h3>
        <span className="small muted">{day.totals.distanceKm} km · {formatDuration(day.totals.travelMin)} di jalan (estimasi)</span>
      </div>
      {day.stops.length === 0 ? <div className="empty"><p className="muted">Belum ada destinasi di hari ini.</p></div> : (
        <ol className="timeline">
          {day.stops.map((s, i) => (
            <Fragment key={`${s.destinationId}-${i}`}>
              <li className="travel-leg" style={{ listStyle: 'none' }}>
                <Car /> Dari {s.travel.from}: sekitar {s.travel.distanceKm} km, {formatDuration(s.travel.minutes)} <span className="xsmall">({s.travel.source === 'osrm' ? 'layanan rute' : 'estimasi'})</span>
              </li>
              <li className="tl-item">
                <div className="tl-time">{s.arrive}<small>tiba</small></div>
                <span className="tl-rail" aria-hidden="true" />
                <span className={`tl-dot ${s.role === 'meal' ? 'meal' : ''}`} aria-hidden="true" />
                <StopCard s={s} idx={i} last={i === day.stops.length - 1} days={it.days.length} day={dIdx} edit={edit} busy={busy}
                  onUp={() => onSwap(dIdx, i, i - 1)} onDown={() => onSwap(dIdx, i, i + 1)} onRemove={() => onRemove(dIdx, i)} onReplace={() => onReplace(i)} onMove={(to) => onMove(dIdx, i, to)} />
              </li>
            </Fragment>
          ))}
          <li className="travel-leg" style={{ listStyle: 'none' }}>
            <Car /> Kembali ke {it.input.origin.label}: sekitar {day.returnLeg.distanceKm} km, {formatDuration(day.returnLeg.minutes)}. Perkiraan tiba <b>{day.returnLeg.backAt}</b>.
          </li>
        </ol>
      )}
    </div>
  );
}
