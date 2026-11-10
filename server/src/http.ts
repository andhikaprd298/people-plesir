import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { type Config } from './config.js';
import { type Db, get } from './db.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export const bad = (message: string, fields?: Record<string, string>) => new HttpError(400, 'validasi', message, fields);
export const notFound = (message = 'Data tidak ditemukan') => new HttpError(404, 'tidak_ditemukan', message);
export const conflict = (message: string, code = 'konflik') => new HttpError(409, code, message);

export interface AuthUser { id: number; name: string; email: string; role: 'user' | 'admin' }

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw zodToHttp(r.error);
}

function zodToHttp(err: ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join('.') || '_';
    if (!fields[k]) fields[k] = i.message;
  }
  const first = Object.values(fields)[0] ?? 'Data tidak valid';
  return bad(first, fields);
}

export const wrap = (fn: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};

export const COOKIE = 'pp_session';

export function signSession(config: Config, user: AuthUser) {
  return jwt.sign({}, config.jwtSecret, { subject: String(user.id), expiresIn: '7d', algorithm: 'HS256' });
}

export function setSessionCookie(config: Config, res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

/** Membaca sesi dari cookie httpOnly dan memuat pengguna dari database (peran selalu diambil dari DB, bukan dari token). */
export function sessionLoader(config: Config, db: Db): RequestHandler {
  return (req, _res, next) => {
    const token = req.cookies?.[COOKIE];
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
        const u = get<AuthUser>(db, 'SELECT id, name, email, role FROM users WHERE id = ?', Number(payload.sub));
        if (u) req.user = u;
      } catch { /* token tidak valid/kedaluwarsa: anggap tamu */ }
    }
    next();
  };
}

export const requireUser: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'perlu_login', 'Silakan masuk terlebih dahulu.'));
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'perlu_login', 'Silakan masuk terlebih dahulu.'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'dilarang', 'Akses khusus admin.'));
  next();
};

/** Perlindungan CSRF dasar: tolak permintaan mengubah data dari origin yang tidak dikenal (cookie SameSite=Lax sebagai lapis kedua). */
export function originGuard(config: Config): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    const host = req.headers.host;
    let ok = config.clientOrigins.includes(origin);
    try { if (host && new URL(origin).host === host) ok = true; } catch { ok = false; }
    if (!ok) return next(new HttpError(403, 'origin_ditolak', 'Permintaan ditolak karena asal tidak dikenal.'));
    next();
  };
}

export function errorHandler(config: Config) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    }
    if (err instanceof ZodError) {
      const h = zodToHttp(err);
      return res.status(400).json({ error: { code: h.code, message: h.message, fields: h.fields } });
    }
    const e = err as { type?: string; message?: string; code?: string };
    if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'json_tidak_valid', message: 'Format data tidak valid.' } });
    if (e?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'file_terlalu_besar', message: 'Ukuran file melebihi 3 MB.' } });
    if (!config.isTest) console.error('[error]', err);
    return res.status(500).json({ error: { code: 'server', message: 'Terjadi kesalahan di server. Coba lagi sebentar.' } });
  };
}

export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Cegah CSV/formula injection di Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
