// Loads lesson bundles on demand with a classic <script> tag. This works from
// file:// (unlike fetch() or dynamic import()).

import type { LessonDef } from '../lessons/types';

const cache = new Map<number, LessonDef>();
const pending = new Map<number, Promise<LessonDef>>();

window.__rvLesson = (l: LessonDef) => {
  cache.set(l.id, l);
};

export function cachedLesson(id: number): LessonDef | undefined {
  return cache.get(id);
}

export function loadLesson(id: number): Promise<LessonDef> {
  const c = cache.get(id);
  if (c) return Promise.resolve(c);
  const p = pending.get(id);
  if (p) return p;
  const prom = new Promise<LessonDef>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `assets/lessons/l${String(id).padStart(2, '0')}.js`;
    s.async = true;
    s.onload = () => {
      const l = cache.get(id);
      if (l) resolve(l);
      else reject(new Error(`lesson ${id} did not register`));
    };
    s.onerror = () => reject(new Error(`could not load lesson ${id} (${s.src})`));
    document.head.appendChild(s);
  });
  pending.set(id, prom);
  prom.catch(() => pending.delete(id));
  return prom;
}

/** Warm the cache for the next lesson in idle time. */
export function prefetchLesson(id: number) {
  if (cache.has(id) || pending.has(id) || id > 14) return;
  const run = () => loadLesson(id).catch(() => undefined);
  const w = window as unknown as { requestIdleCallback?: (f: () => void) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(run);
  else setTimeout(run, 300);
}

