// Geometry checks for the datapath drawing: no wire through a block, labels
// clear of blocks and wires, junctions only between wires of the same net,
// and a count of wire crossings. Used by the unit tests at every build level.

import { type Comp, type Wire } from './layout';
import { LESSON_KEYS, visibleParts } from './visibility';
import { netTextMax } from './signals';
import { textWidth, compLabelBoxes, tagBox, netBox, bitsBox, TAG_CHARS, type Box } from './geom';

type Pt = [number, number];
interface Seg {
  a: Pt;
  b: Pt;
  wire: Wire;
}

export interface CheckIssue {
  kind: 'through-block' | 'label-overlap' | 'bad-junction' | 'dangling';
  msg: string;
}

export interface CheckReport {
  level: number;
  keys: string[];
  issues: CheckIssue[];
  crossings: { a: string; b: string; at: Pt }[];
}

const segs = (w: Wire): Seg[] => w.pts.slice(1).map((p, i) => ({ a: w.pts[i], b: p, wire: w }));

function segHitsBox(s: Seg, r: Box): boolean {
  // Orthogonal segments only.
  const x1 = Math.min(s.a[0], s.b[0]);
  const x2 = Math.max(s.a[0], s.b[0]);
  const y1 = Math.min(s.a[1], s.b[1]);
  const y2 = Math.max(s.a[1], s.b[1]);
  return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h;
}

const shrink = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d });
const boxesOverlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function onSeg(p: Pt, s: Seg): boolean {
  const [x, y] = p;
  if (s.a[0] === s.b[0]) return x === s.a[0] && y >= Math.min(s.a[1], s.b[1]) && y <= Math.max(s.a[1], s.b[1]);
  return y === s.a[1] && x >= Math.min(s.a[0], s.b[0]) && x <= Math.max(s.a[0], s.b[0]);
}

function properCross(s: Seg, t: Seg): Pt | null {
  const sv = s.a[0] === s.b[0];
  const tv = t.a[0] === t.b[0];
  if (sv === tv) return null;
  const v = sv ? s : t;
  const h = sv ? t : s;
  const x = v.a[0];
  const y = h.a[1];
  const inV = y > Math.min(v.a[1], v.b[1]) && y < Math.max(v.a[1], v.b[1]);
  const inH = x > Math.min(h.a[0], h.b[0]) && x < Math.max(h.a[0], h.b[0]);
  return inV && inH ? [x, y] : null;
}

/** Wires that belong to the same electrical net (share a source). */
export function sameNet(a: Wire, b: Wire): boolean {
  if (a.sig === b.sig) return true;
  const src = (w: Wire) => w.src?.split('.')[0] + '.' + w.src?.split('.')[1];
  return !!a.src && a.src === b.src && src(a) === src(b);
}

export function checkLevel(level: number, keys: string[]): CheckReport {
  const { comps, wires } = visibleParts(level, new Set(keys));
  const issues: CheckIssue[] = [];
  const crossings: CheckReport['crossings'] = [];
  const all = wires.flatMap(segs);
  const compBox = (c: Comp): Box => ({ x: c.x, y: c.y, w: c.w, h: c.h });

  // 1. No wire segment through a component (1 px tolerance at the boundary).
  const ends = (w: Wire) => [w.src, w.dst].filter(Boolean).map((p) => p!.split('.')[0]);
  for (const s of all) {
    for (const c of comps) {
      if (ends(s.wire).includes(c.id)) {
        // A wire may enter its own block only by ending exactly on one of its ports
        // (select ports sit on a mux's slanted edge, inside the bounding box).
        const box = compBox(c);
        const inside = (p: Pt) => p[0] > box.x && p[0] < box.x + box.w && p[1] > box.y && p[1] < box.y + box.h;
        const isPort = (p: Pt) => Object.values(c.ports).some((q) => q.x === p[0] && q.y === p[1]);
        const ok = (isPort(s.a) && !inside(s.b)) || (isPort(s.b) && !inside(s.a));
        if (!ok && segHitsBox(s, shrink(box, 1.5))) issues.push({ kind: 'through-block', msg: `${s.wire.id} runs inside ${c.id}` });
        continue;
      }
      if (segHitsBox(s, shrink(compBox(c), 1.5))) issues.push({ kind: 'through-block', msg: `${s.wire.id} passes through ${c.id}` });
    }
  }

  // 2. Labels clear of blocks, wires and each other.
  const labels: { id: string; box: Box; owner: string; wire?: Wire }[] = [];
  for (const c of comps) for (const b of compLabelBoxes(c)) labels.push({ id: `label:${c.id}`, box: b, owner: c.id });
  for (const w of wires) {
    if (w.tag) labels.push({ id: `tag:${w.id}`, box: tagBox(w.tag.at, TAG_CHARS[w.tag.fmt] ?? 10, w.tag.anchor ?? 'middle'), owner: w.id, wire: w });
    if (w.net) labels.push({ id: `net:${w.id}`, box: netBox(w.net, netTextMax(w.net.text, w.sig)), owner: w.id, wire: w });
    if (w.bits && w.bitsAt) labels.push({ id: `bits:${w.id}`, box: bitsBox(w.bits, w.bitsAt), owner: w.id, wire: w });
  }
  for (const l of labels) {
    if (l.id.startsWith('label:')) continue; // component labels are inside their own block
    for (const c of comps) if (boxesOverlap(l.box, compBox(c))) issues.push({ kind: 'label-overlap', msg: `${l.id} overlaps block ${c.id}` });
    for (const s of all) {
      if (s.wire.id === l.owner) continue;
      // A value tag may sit on a wire of its own net (same value, opaque background).
      if (l.wire && l.id.startsWith('tag:') && sameNet(l.wire, s.wire)) continue;
      if (segHitsBox(s, l.box)) issues.push({ kind: 'label-overlap', msg: `${l.id} overlaps wire ${s.wire.id}` });
    }
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      if (a.owner === b.owner) continue;
      if (a.id.startsWith('label:') && b.id.startsWith('label:')) continue;
      if (a.wire && b.wire && a.wire.sig === b.wire.sig && a.id.startsWith('tag:') && b.id.startsWith('tag:')) continue;
      if (boxesOverlap(a.box, b.box)) issues.push({ kind: 'label-overlap', msg: `${a.id} overlaps ${b.id}` });
    }

  // 3. Junctions: a wire endpoint touching another wire must be the same net.
  for (const w of wires) {
    for (const p of [w.pts[0], w.pts[w.pts.length - 1]]) {
      for (const s of all) {
        if (s.wire === w) continue;
        if (onSeg(p, s) && !sameNet(w, s.wire)) issues.push({ kind: 'bad-junction', msg: `${w.id} touches ${s.wire.id} at ${p}` });
      }
    }
  }

  // 4. Every wire end lands on a port of a visible block, on a wire of the same net,
  //    or is the free end of a labelled stub.
  const portAt = (p: Pt) => comps.some((c) => Object.values(c.ports).some((q) => q.x === p[0] && q.y === p[1]));
  for (const w of wires) {
    const ends: Pt[] = [w.pts[0], w.pts[w.pts.length - 1]];
    ends.forEach((p, i) => {
      if (portAt(p)) return;
      if (w.net && i === 0) return; // stub's labelled free end
      if (all.some((s) => s.wire !== w && sameNet(w, s.wire) && onSeg(p, s))) return;
      if (w.id === 'w_instr' && i === 1) return; // instruction bus end before the spine exists
      issues.push({ kind: 'dangling', msg: `${w.id} ${i ? 'end' : 'start'} at ${p} is not connected` });
    });
  }

  // 5. Crossings between different nets.
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const s = all[i];
      const t = all[j];
      if (s.wire === t.wire) continue;
      const p = properCross(s, t);
      if (p && !sameNet(s.wire, t.wire)) crossings.push({ a: s.wire.id, b: t.wire.id, at: p });
    }
  const uniq = new Map(crossings.map((c) => [`${c.a}|${c.b}|${c.at}`, c]));
  return { level, keys, issues: dedupe(issues), crossings: [...uniq.values()] };
}

const dedupe = (a: CheckIssue[]) => [...new Map(a.map((i) => [i.msg, i])).values()];

/** Check every intermediate reveal state of every lesson, plus the full machine. */
export function checkAll(): CheckReport[] {
  const out: CheckReport[] = [];
  for (let l = 1; l <= 10; l++) {
    const ks = LESSON_KEYS[l];
    for (let n = 0; n <= ks.length; n++) out.push(checkLevel(l, ks.slice(0, n)));
  }
  out.push(checkLevel(11, []));
  return out;
}

void textWidth;
