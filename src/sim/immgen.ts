// Immediate generator: rebuilds the 32-bit immediate (ImmExt) from the
// scattered instruction bits. Two implementations are kept on purpose:
// immGen() is the direct formula, immMap() is the wire-level map that the
// diagrams draw. The tests check that both always agree.

import { bit, bits, signExtend } from './bits';

export type ImmSrc = 'I' | 'S' | 'B' | 'U' | 'J';

/** 3-bit ImmSrc encoding used by the control unit. */
export const IMMSRC_CODE: Record<ImmSrc, number> = { I: 0b000, S: 0b001, B: 0b010, J: 0b011, U: 0b100 };
export const IMMSRC_FROM_CODE: Record<number, ImmSrc> = { 0: 'I', 1: 'S', 2: 'B', 3: 'J', 4: 'U' };

export function immGen(word: number, src: ImmSrc): number {
  switch (src) {
    case 'I':
      return signExtend(bits(word, 31, 20), 12);
    case 'S':
      return signExtend((bits(word, 31, 25) << 5) | bits(word, 11, 7), 12);
    case 'B':
      return signExtend(
        (bit(word, 31) << 12) | (bit(word, 7) << 11) | (bits(word, 30, 25) << 5) | (bits(word, 11, 8) << 1),
        13,
      );
    case 'U':
      return (bits(word, 31, 12) << 12) | 0;
    case 'J':
      return signExtend(
        (bit(word, 31) << 20) | (bits(word, 19, 12) << 12) | (bit(word, 20) << 11) | (bits(word, 30, 21) << 1),
        21,
      );
  }
}

export interface ImmBitSource {
  /** Bit position in ImmExt (31..0). */
  immBit: number;
  /** Instruction bit that drives it, or null for a constant 0. */
  instBit: number | null;
  /** True when this bit is a copy of the sign bit (sign extension). */
  signExt: boolean;
}

/** For each ImmExt bit 31..0, which instruction bit drives it. Index = immBit. */
export function immMap(src: ImmSrc): ImmBitSource[] {
  const out: ImmBitSource[] = [];
  for (let k = 0; k < 32; k++) {
    let inst: number | null = null;
    let sx = false;
    switch (src) {
      case 'I':
        if (k <= 11) inst = 20 + k;
        else { inst = 31; sx = true; }
        break;
      case 'S':
        if (k <= 4) inst = 7 + k;
        else if (k <= 11) inst = 25 + (k - 5);
        else { inst = 31; sx = true; }
        break;
      case 'B':
        if (k === 0) inst = null;
        else if (k <= 4) inst = 8 + (k - 1);
        else if (k <= 10) inst = 25 + (k - 5);
        else if (k === 11) inst = 7;
        else if (k === 12) inst = 31;
        else { inst = 31; sx = true; }
        break;
      case 'U':
        inst = k <= 11 ? null : k;
        break;
      case 'J':
        if (k === 0) inst = null;
        else if (k <= 10) inst = 21 + (k - 1);
        else if (k === 11) inst = 20;
        else if (k <= 19) inst = k;
        else if (k === 20) inst = 31;
        else { inst = 31; sx = true; }
        break;
    }
    out.push({ immBit: k, instBit: inst, signExt: sx });
  }
  return out;
}

/** Evaluate an immMap against a word (used by tests and the rebuild view). */
export function immFromMap(word: number, src: ImmSrc): number {
  let v = 0;
  for (const m of immMap(src)) {
    if (m.instBit !== null && bit(word, m.instBit)) v |= 1 << m.immBit;
  }
  return v | 0;
}

/** Width of the stored immediate and the range it can express. */
export const IMM_RANGE: Record<ImmSrc, { min: number; max: number; align: number; note: string }> = {
  I: { min: -2048, max: 2047, align: 1, note: '12-bit signed' },
  S: { min: -2048, max: 2047, align: 1, note: '12-bit signed' },
  B: { min: -4096, max: 4094, align: 2, note: '13-bit signed, bit 0 always 0' },
  J: { min: -1048576, max: 1048574, align: 2, note: '21-bit signed, bit 0 always 0' },
  U: { min: -2147483648, max: 2147483647, align: 4096, note: 'upper 20 bits, low 12 bits 0' },
};
