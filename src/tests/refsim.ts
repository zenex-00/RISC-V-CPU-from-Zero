// Independent instruction-set reference model written straight from the ISA
// specification. It shares no code with the datapath, so comparing the two
// checks the control unit, muxes, ALU decoder and immediate generator.

import type { Instr } from '../sim/encode';

export interface RefState {
  pc: number;
  regs: number[]; // unsigned values
  mem: Map<number, number>; // byte address -> byte
}

const U = (x: number) => x >>> 0;
const S = (x: number) => x | 0;

function ld(m: Map<number, number>, a: number, n: number): number {
  let v = 0;
  for (let i = n - 1; i >= 0; i--) v = v * 256 + (m.get(U(a + i)) ?? 0);
  return v;
}
function st(m: Map<number, number>, a: number, n: number, v: number) {
  for (let i = 0; i < n; i++) m.set(U(a + i), (v >>> (8 * i)) & 0xff);
}

export function refStep(s: RefState, i: Instr): void {
  const x = (r: number) => (r === 0 ? 0 : s.regs[r]);
  const w = (r: number, v: number) => {
    if (r !== 0) s.regs[r] = U(v);
  };
  const a = x(i.rs1);
  const b = x(i.rs2);
  const imm = i.imm | 0;
  let next = U(s.pc + 4);
  switch (i.op) {
    case 'add': w(i.rd, a + b); break;
    case 'sub': w(i.rd, a - b); break;
    case 'sll': w(i.rd, a << (b & 31)); break;
    case 'slt': w(i.rd, S(a) < S(b) ? 1 : 0); break;
    case 'sltu': w(i.rd, a < b ? 1 : 0); break;
    case 'xor': w(i.rd, a ^ b); break;
    case 'srl': w(i.rd, a >>> (b & 31)); break;
    case 'sra': w(i.rd, S(a) >> (b & 31)); break;
    case 'or': w(i.rd, a | b); break;
    case 'and': w(i.rd, a & b); break;
    case 'addi': w(i.rd, a + imm); break;
    case 'slti': w(i.rd, S(a) < imm ? 1 : 0); break;
    case 'sltiu': w(i.rd, a < U(imm) ? 1 : 0); break;
    case 'xori': w(i.rd, a ^ imm); break;
    case 'ori': w(i.rd, a | imm); break;
    case 'andi': w(i.rd, a & imm); break;
    case 'slli': w(i.rd, a << imm); break;
    case 'srli': w(i.rd, a >>> imm); break;
    case 'srai': w(i.rd, S(a) >> imm); break;
    case 'lb': w(i.rd, (ld(s.mem, a + imm, 1) << 24) >> 24); break;
    case 'lh': w(i.rd, (ld(s.mem, a + imm, 2) << 16) >> 16); break;
    case 'lw': w(i.rd, ld(s.mem, a + imm, 4)); break;
    case 'lbu': w(i.rd, ld(s.mem, a + imm, 1)); break;
    case 'lhu': w(i.rd, ld(s.mem, a + imm, 2)); break;
    case 'sb': st(s.mem, a + imm, 1, b); break;
    case 'sh': st(s.mem, a + imm, 2, b); break;
    case 'sw': st(s.mem, a + imm, 4, b); break;
    case 'beq': if (a === b) next = U(s.pc + imm); break;
    case 'bne': if (a !== b) next = U(s.pc + imm); break;
    case 'blt': if (S(a) < S(b)) next = U(s.pc + imm); break;
    case 'bge': if (S(a) >= S(b)) next = U(s.pc + imm); break;
    case 'bltu': if (a < b) next = U(s.pc + imm); break;
    case 'bgeu': if (a >= b) next = U(s.pc + imm); break;
    case 'jal': w(i.rd, s.pc + 4); next = U(s.pc + imm); break;
    case 'jalr': { const t = U((a + imm) & ~1); w(i.rd, s.pc + 4); next = t; break; }
    case 'lui': w(i.rd, imm); break;
    case 'auipc': w(i.rd, s.pc + imm); break;
  }
  s.pc = next;
}
