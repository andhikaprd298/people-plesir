import { AlertTriangle, CheckCircle2, Info, Minus, Plus, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, api } from '../lib/api';
import { STATUS_LABEL, TRIP_STATE_LABEL } from '../lib/format';

/* ---------- judul halaman ---------- */
export function useTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} | People Plesir` : 'People Plesir — Wisata Banyumas';
    return () => { document.title = prev; };
  }, [title]);
}

/* ---------- toast ---------- */
interface ToastItem { id: number; text: string; kind: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.kind === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- ambil data ---------- */
export function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) { setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api.get<T>(url, ctrl.signal)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { if ((e as Error).name === 'AbortError') return; setError(e as ApiError); setLoading(false); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/* ---------- status & muat ---------- */
export function Loading({ rows = 3, height = 120 }: { rows?: number; height?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height }} />)}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: ApiError | Error | string; onRetry?: () => void }) {
  const msg = typeof error === 'string' ? error : error.message;
  return (
    <div className="alert danger" role="alert">
      <AlertTriangle />
      <div className="grow">
        <b>Gagal memuat data.</b> {msg}
        {onRetry && <div style={{ marginTop: 8 }}><button className="btn btn-ghost btn-sm" onClick={onRetry}>Coba lagi</button></div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted" style={{ maxWidth: '48ch', margin: '0 auto' }}>{children}</p>}
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'sun'; children: ReactNode }) {
  return (
    <div className={`alert ${kind === 'info' ? '' : kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      {kind === 'danger' || kind === 'warn' ? <AlertTriangle /> : <Info />}
      <div className="grow">{children}</div>
    </div>
  );
}

export const ConfirmTag = ({ verified = false, text }: { verified?: boolean; text?: string }) =>
  verified ? <span className="confirm-tag ok">{text ?? 'Terverifikasi'}</span> : <span className="confirm-tag">{text ?? 'Perlu konfirmasi'}</span>;

export const StatusBadge = ({ status }: { status: string }) => <span className={`status ${status}`}>{STATUS_LABEL[status] ?? status}</span>;
export const TripStateChip = ({ state }: { state: string }) => (
  <span className={`chip ${state === 'tersedia' ? 'ok' : state === 'penuh' || state === 'dibatalkan' ? 'danger' : 'warn'}`}>{TRIP_STATE_LABEL[state] ?? state}</span>
);

/* ---------- formulir ---------- */
export function Field({ label, error, hint, children, className = '', htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={`field ${error ? 'invalid' : ''} ${className}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}

/** Input dengan id otomatis sehingga label terhubung dan error terbaca pembaca layar. */
export function TextField({ label, error, hint, className, ...rest }: { label: string; error?: string; hint?: ReactNode; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id}>
      <input id={id} className="input" aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

export function SelectField({ label, error, hint, className, children, ...rest }: { label: string; error?: string; hint?: ReactNode; className?: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id}>
      <select id={id} className="select" aria-invalid={Boolean(error)} {...rest}>{children}</select>
    </Field>
  );
}

export function TextAreaField({ label, error, hint, className, ...rest }: { label: string; error?: string; hint?: ReactNode; className?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id}>
      <textarea id={id} className="textarea" aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

export function NumberStepper({ value, onChange, min = 1, max = 50, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Kurangi ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}><Minus size={16} /></button>
      <input inputMode="numeric" aria-label={label} value={value} onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, ''))))} />
      <button type="button" aria-label={`Tambah ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}><Plus size={16} /></button>
    </div>
  );
}

export function Choice({ type = 'checkbox', name, checked, onChange, children, sub }: { type?: 'checkbox' | 'radio'; name?: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: string }) {
  return (
    <label className="choice">
      <input type={type} name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}{sub && <small>{sub}</small>}</span>
    </label>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('[data-autofocus],input,select,textarea')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: ReactNode; confirm: string; danger: boolean; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback((title: string, body: ReactNode, opts: { confirm?: string; danger?: boolean } = {}) =>
    new Promise<boolean>((resolve) => setState({ title, body, confirm: opts.confirm ?? 'Ya, lanjutkan', danger: opts.danger ?? false, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const dialog = state ? (
    <Modal title={state.title} onClose={() => close(false)} footer={<>
      <button className="btn btn-ghost" onClick={() => close(false)}>Batal</button>
      <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} data-autofocus>{state.confirm}</button>
    </>}>{state.body}</Modal>
  ) : null;
  return { ask, dialog };
}

export const fieldErr = (e: unknown): Record<string, string> => (e instanceof ApiError ? e.fields : {});
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Terjadi kesalahan. Coba lagi.');
