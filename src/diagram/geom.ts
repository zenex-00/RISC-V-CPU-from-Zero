// Text metrics and label boxes shared by the renderer and the checker.
// Widths are estimated from character counts so the renderer never has to
// measure text (no layout reads, no thrashing).

import type { Comp, Wire } from './layout';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FONT = {
  tag: 11, // value tags, monospace
  net: 11.5, // control / net labels, sans
  bits: 10.5, // bit-slice labels, monospace
  port: 10,
  title: 13.5,
};

export const MONO_EM = 0.61;
export const SANS_EM = 0.56;

export function textWidth(s: string, size: number, mono: boolean): number {
  return s.length * size * (mono ? MONO_EM : SANS_EM);
}

const anchorX = (x: number, w: number, a: 'start' | 'middle' | 'end') => (a === 'start' ? x : a === 'end' ? x - w : x - w / 2);

/** Longest text each tag format can produce (decimal falls back to hex beyond 8 characters). */
export const TAG_CHARS: Record<string, number> = {
  hex: 10, dec: 10, udec: 10, imm: 10, bit: 1, reg: 3, bin2: 2, bin3: 3, alu: 4, be: 4, immsrc: 1,
};

/** Value tags: the box used for both rendering and checking. */
export function tagBox(at: [number, number], chars: number, anchor: 'start' | 'middle' | 'end'): Box {
  const w = textWidth('x'.repeat(chars), FONT.tag, true) + 6;
  return { x: anchorX(at[0], w, anchor), y: at[1] - 11, w, h: 14 };
}

/** Box of a net label; pass the longest text it can show (name=value). */
export function netBox(n: NonNullable<Wire['net']>, text = n.text): Box {
  const w = textWidth(text, FONT.net, false);
  return { x: anchorX(n.at[0], w, n.anchor), y: n.at[1] - 10, w, h: 12 };
}

export function bitsBox(text: string, at: [number, number]): Box {
  const w = textWidth(text, FONT.bits, true);
  return { x: at[0] - w / 2, y: at[1] - 9, w, h: 10 };
}

export function compLabelBoxes(c: Comp): Box[] {
  if (!c.label) return [];
  const w = textWidth(c.label, FONT.title, false);
  return [{ x: c.x + c.w / 2 - w / 2, y: c.y + c.h / 2 - 10, w, h: 13 }];
}
