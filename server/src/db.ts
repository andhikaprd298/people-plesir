import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Dimuat lewat require agar tetap berjalan di bawah Vitest (Vite belum mengenali "node:sqlite" sebagai modul bawaan).
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export type Db = DatabaseSyncType;

type Param = string | number | null | undefined | boolean | bigint;

const norm = (params: Param[]) =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p)) as (string | number | null | bigint)[];

export function all<T = Record<string, unknown>>(db: Db, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...norm(params)) as T[];
}

export function get<T = Record<string, unknown>>(db: Db, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...norm(params)) as T | undefined;
}

export function run(db: Db, sql: string, ...params: Param[]) {
  const r = db.prepare(sql).run(...norm(params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/** Transaksi dengan penguncian tulis (BEGIN IMMEDIATE) agar cek kapasitas dan insert bersifat atomik. */
export function tx<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function openDb(path: string): Db {
  return configure(new DatabaseSync(path));
}

export function openMemoryDb(): Db {
  return configure(new DatabaseSync(':memory:'));
}

function configure(db: Db): Db {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  initSchema(db);
  return db;
}

export function initSchema(db: Db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('wisata','kuliner','kafe')),
  category_id TEXT NOT NULL REFERENCES categories(id),
  summary TEXT NOT NULL,
  description TEXT,
  address_text TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  coords_verified INTEGER NOT NULL DEFAULT 0,
  price_min INTEGER,
  price_max INTEGER,
  price_verified INTEGER NOT NULL DEFAULT 0,
  avg_duration_min INTEGER NOT NULL DEFAULT 60,
  open_hours TEXT,            -- JSON: {"mon":["08:00","17:00"],...} atau NULL bila belum diketahui
  hours_verified INTEGER NOT NULL DEFAULT 0,
  family_friendly INTEGER NOT NULL DEFAULT 0,
  accessibility TEXT NOT NULL DEFAULT '[]',   -- JSON array: kursi_roda, lansia, anak_kecil
  facilities TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',            -- hidden_gem, foto, santai, trek_berat, ...
  food_tags TEXT NOT NULL DEFAULT '[]',       -- halal, vegetarian_friendly, tidak_pedas
  image_url TEXT,
  gallery TEXT NOT NULL DEFAULT '[]',
  data_status TEXT NOT NULL DEFAULT 'demo' CHECK (data_status IN ('demo','verified')),
  is_published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('kendaraan','pemandu','kuliner','lainnya')),
  name TEXT NOT NULL,
  contact TEXT,
  notes TEXT,
  rate_note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  theme TEXT,
  summary TEXT,
  trip_date TEXT NOT NULL,            -- YYYY-MM-DD
  depart_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  meeting_point TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  min_participants INTEGER NOT NULL DEFAULT 1 CHECK (min_participants > 0),
  registration_deadline TEXT,         -- YYYY-MM-DD
  included TEXT NOT NULL DEFAULT '[]',
  excluded TEXT NOT NULL DEFAULT '[]',
  safety TEXT NOT NULL DEFAULT '[]',
  faq TEXT NOT NULL DEFAULT '[]',
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed','cancelled')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_itineraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  time TEXT NOT NULL,
  title TEXT NOT NULL,
  destination_id TEXT REFERENCES destinations(id) ON DELETE SET NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('open','private')),
  user_id INTEGER NOT NULL REFERENCES users(id),
  trip_id INTEGER REFERENCES trips(id),
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  participants INTEGER NOT NULL CHECK (participants > 0),
  status TEXT NOT NULL CHECK (status IN ('menunggu_konfirmasi','menunggu_pembayaran','menunggu_verifikasi','dikonfirmasi','selesai','dibatalkan')),
  unit_price INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  details TEXT,                      -- JSON: permintaan Private Trip, estimasi, penawaran
  quote_note TEXT,
  expires_at TEXT,
  cancel_reason TEXT,
  refund_status TEXT NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none','diminta','selesai')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'transfer_manual',
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','verified','rejected','refunded')),
  payer_name TEXT,
  reference TEXT,
  note TEXT,
  submitted_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_itineraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  share_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spent_on TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Antrean email: terkirim hanya jika SMTP dikonfigurasi (belum diimplementasikan di MVP).
CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
}

export const nowIso = () => new Date().toISOString();
