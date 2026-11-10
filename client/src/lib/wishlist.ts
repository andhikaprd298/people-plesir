import { useCallback, useEffect, useState } from 'react';
import { safeStorage } from './format';

const KEY = 'pp.wishlist';
const store = safeStorage('local');
const EVT = 'pp:wishlist';

/** Daftar destinasi yang ditandai pengguna lewat "Tambahkan ke Itinerary"; dibaca AI Planner sebagai destinasi wajib. */
export function useWishlist() {
  const [ids, setIds] = useState<string[]>(() => store.read<string[]>(KEY, []));
  useEffect(() => {
    const sync = () => setIds(store.read<string[]>(KEY, []));
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const write = (next: string[]) => { store.write(KEY, next); setIds(next); window.dispatchEvent(new Event(EVT)); };
  const toggle = useCallback((id: string) => write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 20)), [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback(() => write([]), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { ids, has: (id: string) => ids.includes(id), toggle, clear };
}
