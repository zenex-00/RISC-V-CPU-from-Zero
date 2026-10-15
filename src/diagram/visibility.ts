// Which parts of the datapath exist at a given point in the course.

import { COMPS, WIRES, type Comp, type Intro, type Wire } from './layout';

/** Reveal keys in the order each lesson introduces them. */
export const LESSON_KEYS: Record<number, string[]> = {
  1: ['pc', 'imem', 'pcadd'],
  2: ['rf', 'alu', 'wb'],
  3: ['imm', 'srcb'],
  4: ['dmem', 'resmux', 'ldext'],
  5: ['store', 'bytes'],
  6: ['target', 'branch'],
  7: ['brcond'],
  8: ['jump', 'jalr'],
  9: ['srca'],
  10: ['cu'],
};

export const FULL_LEVEL = 11;

function introduced(i: Intro, level: number, revealed: Set<string>): boolean {
  return i.l < level || (i.l === level && revealed.has(i.k));
}

export function isVisible(p: { from: Intro; until?: Intro }, level: number, revealed: Set<string>): boolean {
  if (!introduced(p.from, level, revealed)) return false;
  if (p.until && introduced(p.until, level, revealed)) return false;
  return true;
}

/** Part exists somewhere in this lesson (possibly revealed later in it). */
export function inLesson(p: { from: Intro; until?: Intro }, level: number): boolean {
  if (p.from.l > level) return false;
  if (p.until && p.until.l < level) return false;
  return true;
}

export function allKeys(level: number): Set<string> {
  return new Set(LESSON_KEYS[level] ?? []);
}

export function visibleParts(level: number, revealed: Set<string>): { comps: Comp[]; wires: Wire[] } {
  return {
    comps: COMPS.filter((c) => isVisible(c, level, revealed)),
    wires: WIRES.filter((w) => isVisible(w, level, revealed)),
  };
}

/** Is the part new in this lesson (introduced at this level)? */
export const isNew = (p: { from: Intro }, level: number): boolean => p.from.l === level;
