import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import type { Meta, User } from './types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  meta: Meta | null;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; phone?: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshMeta: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<Meta | null>(null);

  const refreshMeta = useCallback(async () => {
    try { setMeta(await api.get<Meta>('/api/meta')); } catch { /* ditangani halaman yang membutuhkan */ }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get<{ user: User | null }>('/api/auth/me').then((r) => alive && setUser(r.user)).catch(() => undefined),
      refreshMeta(),
    ]).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshMeta]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ user: User }>('/api/auth/login', { email, password });
    setUser(r.user);
    return r.user;
  }, []);
  const register = useCallback(async (input: { name: string; email: string; phone?: string; password: string }) => {
    const r = await api.post<{ user: User }>('/api/auth/register', input);
    setUser(r.user);
    return r.user;
  }, []);
  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, meta, login, register, logout, refreshMeta }), [user, loading, meta, login, register, logout, refreshMeta]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return c;
}

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="wrap section"><div className="skeleton" style={{ height: 240 }} /></div>;
  if (!user) return <Navigate to={`/masuk?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && user.role !== 'admin') {
    return (
      <div className="wrap section">
        <div className="empty">
          <h3>Halaman ini khusus admin</h3>
          <p className="muted">Akun Anda tidak memiliki akses ke dashboard admin.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
