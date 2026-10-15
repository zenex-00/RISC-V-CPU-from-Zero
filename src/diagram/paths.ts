// Map a timing path (block ids from sim/timing) onto diagram parts.

import { WIRES } from './layout';

export const NODE_COMPS: Record<string, string[]> = {
  brlogic: ['brcond', 'andg', 'org'],
  'rf-write': ['rf'],
  'dmem-write': ['dmem'],
  'pc-write': ['pc'],
};

/** Diagram parts along a timing path: blocks plus the wires between consecutive blocks. */
export function pathParts(path: string[]): string[] {
  const out = path.flatMap((n) => NODE_COMPS[n] ?? [n]);
  for (let i = 1; i < path.length; i++) {
    const a = NODE_COMPS[path[i - 1]] ?? [path[i - 1]];
    const b = NODE_COMPS[path[i]] ?? [path[i]];
    for (const w of WIRES) {
      if (!w.src || !w.dst) continue;
      const s = w.src.split('.')[0];
      const d = w.dst.split('.')[0];
      if (a.includes(s) && b.includes(d)) out.push(w.id);
    }
    if (path[i - 1] === 'ctrl') for (const w of WIRES) if (w.id.startsWith('c_cu_')) out.push(w.id);
  }
  // A branch wire starts on a trunk of the same net: mark the trunk and the bus segments too,
  // so the highlighted path is continuous.
  const marked = new Set(out);
  for (const id of [...marked]) {
    const w = WIRES.find((x) => x.id === id);
    if (!w || !w.src) continue;
    const p = w.pts[0];
    for (const t of WIRES) {
      if (t === w || t.src !== w.src || marked.has(t.id)) continue;
      if (!t.dst || onWire(p, t.pts)) {
        out.push(t.id);
        marked.add(t.id);
      }
    }
  }
  return out;
}

function onWire(p: [number, number], pts: [number, number][]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (a[0] === b[0] && p[0] === a[0] && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])) return true;
    if (a[1] === b[1] && p[1] === a[1] && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])) return true;
  }
  return false;
}
