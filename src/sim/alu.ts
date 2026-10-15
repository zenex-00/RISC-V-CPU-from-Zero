// ALU. The operation code is 4 bits: {sub/arith bit, funct3}.
// This makes the ALU decoder almost a wire: for R-type it is {instr[30], funct3}.

import { u32 } from './bits';

export const ALU = {
  ADD: 0b0000,
  SUB: 0b1000,
  SLL: 0b0001,
  SLT: 0b0010,
  SLTU: 0b0011,
  XOR: 0b0100,
  SRL: 0b0101,
  SRA: 0b1101,
  OR: 0b0110,
  AND: 0b0111,
} as const;

export type AluCtl = (typeof ALU)[keyof typeof ALU];

export const ALU_NAME: Record<number, string> = {
  0b0000: 'add', 0b1000: 'sub', 0b0001: 'sll', 0b0010: 'slt', 0b0011: 'sltu',
  0b0100: 'xor', 0b0101: 'srl', 0b1101: 'sra', 0b0110: 'or', 0b0111: 'and',
};

export const ALU_OPS: AluCtl[] = [ALU.ADD, ALU.SUB, ALU.AND, ALU.OR, ALU.XOR, ALU.SLT, ALU.SLTU, ALU.SLL, ALU.SRL, ALU.SRA];

export interface AluOut {
  y: number; // unsigned 32-bit pattern
  zero: number;
  lt: number; // signed less-than from the subtractor: N xor V
  ltu: number; // unsigned less-than from the subtractor: not carry-out
  /** Internals for the "look inside" view. */
  sub: number; // 1 when the adder is in subtract mode (B inverted, carry-in 1)
  sum: number; // adder output
  cout: number;
  n: number;
  v: number;
}

/** True for operations that put the adder in subtract mode. */
export const usesSubtract = (ctl: number): boolean => ctl === ALU.SUB || ctl === ALU.SLT || ctl === ALU.SLTU;

export function alu(a: number, b: number, ctl: number): AluOut {
  a = u32(a);
  b = u32(b);
  const sub = usesSubtract(ctl) ? 1 : 0;
  const bb = sub ? u32(~b) : b;
  const full = a + bb + sub; // up to 33 bits, exact in a double
  const sum = u32(full);
  const cout = full > 0xffffffff ? 1 : 0;
  const n = sum >>> 31;
  // Overflow: operands (after inversion) have the same sign and the sum's sign differs.
  const v = ((a >>> 31) === (bb >>> 31) && (sum >>> 31) !== (a >>> 31)) ? 1 : 0;
  const lt = n ^ v;
  const ltu = 1 - cout; // meaningful only in subtract mode
  const sh = b & 31;
  let y: number;
  switch (ctl) {
    case ALU.ADD:
    case ALU.SUB:
      y = sum;
      break;
    case ALU.SLT:
      y = lt;
      break;
    case ALU.SLTU:
      y = ltu;
      break;
    case ALU.AND:
      y = a & b;
      break;
    case ALU.OR:
      y = a | b;
      break;
    case ALU.XOR:
      y = a ^ b;
      break;
    case ALU.SLL:
      y = a << sh;
      break;
    case ALU.SRL:
      y = a >>> sh;
      break;
    case ALU.SRA:
      y = (a | 0) >> sh;
      break;
    default:
      y = 0;
  }
  y = u32(y);
  return { y, zero: y === 0 ? 1 : 0, lt, ltu, sub, sum, cout, n, v };
}

/** Ripple-carry addition bit by bit, for the "look inside" adder view. */
export function rippleTrace(a: number, b: number, cin: number): { s: number[]; c: number[] } {
  const s: number[] = [];
  const c: number[] = [cin];
  for (let i = 0; i < 32; i++) {
    const ai = (a >>> i) & 1;
    const bi = (b >>> i) & 1;
    const ci = c[i];
    s.push(ai ^ bi ^ ci);
    c.push((ai & bi) | (ai & ci) | (bi & ci));
  }
  return { s, c };
}
