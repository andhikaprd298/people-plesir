import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { type AppCtx } from '../app.js';
import { get, run } from '../db.js';
import { COOKIE, HttpError, type AuthUser, bad, parse, setSessionCookie, signSession, wrap } from '../http.js';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Isi nama lengkap').max(100),
  email: z.string().trim().toLowerCase().email('Format email tidak valid').max(150),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(72, 'Kata sandi maksimal 72 karakter'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Format email tidak valid'),
  password: z.string().min(1, 'Isi kata sandi').max(72),
});

// Hash palsu untuk menyamakan waktu respons saat email tidak terdaftar.
const DUMMY_HASH = bcrypt.hashSync('tidak-dipakai', 10);

export function authRoutes(ctx: AppCtx) {
  const r = Router();
  const { db, config } = ctx;

  r.post('/register', wrap(async (req, res) => {
    const input = parse(registerSchema, req.body);
    if (get(db, 'SELECT 1 FROM users WHERE email = ?', input.email)) {
      throw new HttpError(409, 'email_terpakai', 'Email ini sudah terdaftar. Silakan masuk.', { email: 'Email sudah terdaftar' });
    }
    const hash = await bcrypt.hash(input.password, 10);
    const { lastInsertRowid } = run(db, "INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?, 'user')", input.name, input.email, input.phone ?? null, hash);
    const user: AuthUser = { id: lastInsertRowid, name: input.name, email: input.email, role: 'user' };
    setSessionCookie(config, res, signSession(config, user));
    res.status(201).json({ user });
  }));

  r.post('/login', wrap(async (req, res) => {
    const input = parse(loginSchema, req.body);
    const row = get<AuthUser & { password_hash: string }>(db, 'SELECT id, name, email, role, password_hash FROM users WHERE email = ?', input.email);
    const ok = await bcrypt.compare(input.password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) throw new HttpError(401, 'login_gagal', 'Email atau kata sandi salah.');
    const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role };
    setSessionCookie(config, res, signSession(config, user));
    res.json({ user });
  }));

  r.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  r.post('/change-password', wrap(async (req, res) => {
    if (!req.user) throw new HttpError(401, 'perlu_login', 'Silakan masuk terlebih dahulu.');
    const input = parse(z.object({ current: z.string().min(1).max(72), next: z.string().min(8, 'Kata sandi baru minimal 8 karakter').max(72) }), req.body);
    const row = get<{ password_hash: string }>(db, 'SELECT password_hash FROM users WHERE id = ?', req.user.id)!;
    if (!(await bcrypt.compare(input.current, row.password_hash))) throw bad('Kata sandi saat ini salah.', { current: 'Kata sandi salah' });
    run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(input.next, 10), req.user.id);
    res.json({ ok: true });
  }));

  return r;
}
