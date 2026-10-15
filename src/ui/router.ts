// Hash routing (works from file://).

import { useEffect, useState } from 'preact/hooks';

export interface Route {
  page: 'home' | 'lesson' | 'sandbox' | 'review' | 'progress' | 'final';
  lesson: number;
  step: number;
  tab: string;
}

export function parseHash(h: string): Route {
  const parts = h.replace(/^#\/?/, '').split('/').filter(Boolean);
  const r: Route = { page: 'home', lesson: 0, step: 0, tab: 'walk' };
  if (parts[0] === 'lesson') {
    r.page = 'lesson';
    r.lesson = Math.max(0, Math.min(14, parseInt(parts[1] ?? '0', 10) || 0));
    const s = parts[2];
    if (s === 'practice' || s === 'tool') r.tab = s;
    else r.step = Math.max(0, (parseInt(s ?? '1', 10) || 1) - 1);
  } else if (parts[0] === 'sandbox' || parts[0] === 'review' || parts[0] === 'progress' || parts[0] === 'final') r.page = parts[0];
  return r;
}

export function navigate(hash: string, replace = false) {
  if (location.hash === hash) return;
  if (replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else location.hash = hash;
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const f = () => setR(parseHash(location.hash));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
