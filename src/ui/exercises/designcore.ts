// Design challenges: data and the pure test runner (shared by the UI and the unit tests).

import { evaluate, commit, newState, type Mods, type MachineState } from '../../sim/datapath';
import { OPC } from '../../sim/isa';
import { hex, u32 } from '../../sim/bits';
import type { Ctrl } from '../../sim/control';
import type { ImmSrc } from '../../sim/immgen';
import { DMEM_BASE } from '../../sim/memory';
import { TESTS } from './tests-data';
import { machineFor } from '../engine';
import { describeDiff } from './diff';

export type ModKey = keyof Mods | 'srcAZero';

export interface ModOption {
  key: ModKey;
  label: string;
  adds?: string; // new control signal it introduces
}

interface Case {
  label: string;
  word: number;
  regs: Record<number, number>;
  mem?: Record<number, number>;
}

export interface Challenge {
  id: string;
  title: string;
  syntax: string;
  meaning: string;
  encoding: string;
  opcode: number;
  base: Mods;
  options: ModOption[];
  cases: Case[];
  /** Reference semantics: mutate a copy of the state. */
  ref: (s: MachineState, w: number) => void;
  solution: string;
  /** A working configuration (used by the tests and to check the model answer). */
  model: { mods: ModKey[]; vals: Record<string, string> };
}

const R = (op: number, f3: number, rd: number, rs1: number, rs2: number) => u32((rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op);
const S = (op: number, f3: number, rs1: number, rs2: number, imm: number) => u32((((imm >> 5) & 0x7f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 31) << 7) | op);
const field = (w: number) => ({ rd: (w >>> 7) & 31, rs1: (w >>> 15) & 31, rs2: (w >>> 20) & 31, immS: ((((w >>> 25) << 5) | ((w >>> 7) & 31)) << 20) >> 20 });
const wr = (s: MachineState, r: number, v: number) => { if (r) s.regs[r] = u32(v); };

const OPT_SRCA0: ModOption = { key: 'srcAZero', label: 'Add a constant-0 input (input 2) to the SrcA mux' };
const OPT_RESIMM: ModOption = { key: 'resultImm', label: 'Add ImmExt as a fourth input (ResultSrc = 11) of the result mux' };
const OPT_SRCB0: ModOption = { key: 'srcBZero', label: 'Add a constant-0 input (ALUSrc = 2) to the ALUSrc mux' };
const OPT_SHA: ModOption = { key: 'shA', label: 'Add a shift-left-by-1 unit on ALU input A, enabled by a new signal ShA', adds: 'ShA' };
const OPT_SHB: ModOption = { key: 'shB', label: 'Add a shift-left-by-1 unit on ALU input B, enabled by a new signal ShA', adds: 'ShA' };
const OPT_RS2Z: ModOption = { key: 'rs2Zero', label: 'Add a zero detector on RD2 and a signal CondWrite that blocks the register write when RD2 = 0', adds: 'CondWrite' };
const OPT_REGDST: ModOption = { key: 'regDst', label: 'Add a RegDst mux: write address A3 = rd field (0) or rs1 field (1)', adds: 'RegDst' };
const OPT_ADDR: ModOption = { key: 'addrSrc', label: 'Add an AddrSrc mux: data memory address = ALUResult (0) or RD1 (1)', adds: 'AddrSrc' };

export const CHALLENGES: Record<string, Challenge> = {
  lui: {
    id: 'lui',
    title: 'lui without a constant-0 input',
    syntax: 'lui rd, imm20',
    meaning: 'R[rd] ← imm20 << 12. Suppose the SrcA mux had only two inputs (RD1 and PC), so there is no constant 0. Make lui work.',
    encoding: 'U-type, opcode 0110111 (the real lui).',
    opcode: OPC.LUI,
    base: { noSrcAZero: true },
    options: [OPT_SRCA0, OPT_RESIMM, OPT_SRCB0, OPT_SHA],
    cases: [
      { label: 'lui x5, 0x12345', word: 0x123452b7, regs: {} },
      { label: 'lui x9, 0xFFFFF', word: u32((0xfffff << 12) | (9 << 7) | 0x37), regs: {} },
      { label: 'lui x1, 0x00800', word: u32((0x800 << 12) | (1 << 7) | 0x37), regs: {} },
    ],
    ref: (s, w) => wr(s, field(w).rd, w & 0xfffff000),
    solution: 'Two designs work. (1) Add the constant-0 input to the SrcA mux: ALUSrcA = 10, ALUSrc = 1, ALU add, ResultSrc = 00. (2) Route ImmExt straight to the result mux: ResultSrc = 11, and the ALU settings become don\'t-cares. Either way ImmSrc = U and RegWrite = 1.',
    model: { mods: ['srcAZero'], vals: { RegWrite: '1', ImmSrc: 'U', ALUSrcA: '2', ALUSrc: '1', ALU: '0', MemRead: '0', MemWrite: '0', ResultSrc: '0', Branch: '0', Jump: '0', PCTargetSrc: '0' } },
  },
  sh1add: {
    id: 'sh1add',
    title: 'Shift-and-add: sh1add',
    syntax: 'sh1add rd, rs1, rs2',
    meaning: 'R[rd] ← (R[rs1] << 1) + R[rs2]. Useful for indexing arrays of halfwords. (The Zba extension has this instruction; here we put it in the custom-0 opcode space.)',
    encoding: 'R-type layout, opcode 0001011 (custom-0), funct3 = 000, funct7 = 0000000.',
    opcode: OPC.CUSTOM0,
    base: {},
    options: [OPT_SHA, OPT_SHB, OPT_SRCB0, OPT_RESIMM],
    cases: [
      { label: 'sh1add x5, x6, x7', word: R(OPC.CUSTOM0, 0, 5, 6, 7), regs: { 6: 10, 7: 3 } },
      { label: 'sh1add x5, x7, x6', word: R(OPC.CUSTOM0, 0, 5, 7, 6), regs: { 6: 10, 7: 3 } },
      { label: 'sh1add x9, x9, x8', word: R(OPC.CUSTOM0, 0, 9, 9, 8), regs: { 9: -7, 8: 100 } },
    ],
    ref: (s, w) => { const f = field(w); wr(s, f.rd, (s.regs[f.rs1] << 1) + s.regs[f.rs2]); },
    solution: 'Add the shifter on input A (not B, which would compute rs1 + 2·rs2). Control: RegWrite = 1, ALUSrcA = 00, ALUSrc = 0, ALU add, ShA = 1, ResultSrc = 00, no memory, no branch or jump.',
    model: { mods: ['shA'], vals: { RegWrite: '1', ImmSrc: 'I', ALUSrcA: '0', ALUSrc: '0', ALU: '0', MemRead: '0', MemWrite: '0', ResultSrc: '0', Branch: '0', Jump: '0', PCTargetSrc: '0', ShA: '1' } },
  },
  cmov: {
    id: 'cmov',
    title: 'Conditional move: cmovnz',
    syntax: 'cmovnz rd, rs1, rs2',
    meaning: 'if (R[rs2] ≠ 0) R[rd] ← R[rs1]; otherwise rd keeps its value. A branch-free way to select a value.',
    encoding: 'R-type layout, opcode 0001011 (custom-0), funct3 = 001.',
    opcode: OPC.CUSTOM0,
    base: {},
    options: [OPT_RS2Z, OPT_SRCB0, OPT_REGDST, OPT_RESIMM],
    cases: [
      { label: 'cmovnz x5, x6, x7 (x7 ≠ 0)', word: R(OPC.CUSTOM0, 1, 5, 6, 7), regs: { 5: 111, 6: 42, 7: 9 } },
      { label: 'cmovnz x5, x6, x7 (x7 = 0)', word: R(OPC.CUSTOM0, 1, 5, 6, 7), regs: { 5: 111, 6: 42, 7: 0 } },
      { label: 'cmovnz x8, x9, x0', word: R(OPC.CUSTOM0, 1, 8, 9, 0), regs: { 8: 5, 9: 77 } },
      { label: 'cmovnz x8, x9, x10 (x10 = −1)', word: R(OPC.CUSTOM0, 1, 8, 9, 10), regs: { 8: 5, 9: -77, 10: -1 } },
    ],
    ref: (s, w) => { const f = field(w); if (s.regs[f.rs2] !== 0) wr(s, f.rd, s.regs[f.rs1]); },
    solution: 'The ALU must pass rs1 through unchanged: give it B = 0 (constant-0 input on the ALUSrc mux) and add or OR. The write must depend on rs2, so add the zero detector and gate RegWrite with CondWrite. Control: RegWrite = 1, CondWrite = 1, ALUSrcA = 00, ALUSrc = 2, ALU add, ResultSrc = 00.',
    model: { mods: ['rs2Zero', 'srcBZero'], vals: { RegWrite: '1', ImmSrc: 'I', ALUSrcA: '0', ALUSrc: '2', ALU: '0', MemRead: '0', MemWrite: '0', ResultSrc: '0', Branch: '0', Jump: '0', PCTargetSrc: '0', CondWrite: '1' } },
  },
  swinc: {
    id: 'swinc',
    title: 'Store with post-increment: swinc',
    syntax: 'swinc rs2, imm(rs1)',
    meaning: 'M[R[rs1]] ← R[rs2]; then R[rs1] ← R[rs1] + imm. Walks a pointer through an array in one instruction.',
    encoding: 'S-type layout, opcode 0101011 (custom-1), funct3 = 010 (word).',
    opcode: OPC.CUSTOM1,
    base: {},
    options: [OPT_ADDR, OPT_REGDST, OPT_SRCB0, OPT_RESIMM],
    cases: [
      { label: 'swinc x7, 4(x6)', word: S(OPC.CUSTOM1, 2, 6, 7, 4), regs: { 6: DMEM_BASE + 0x40, 7: 0x1234 } },
      { label: 'swinc x7, -8(x6)', word: S(OPC.CUSTOM1, 2, 6, 7, -8), regs: { 6: DMEM_BASE + 0x80, 7: 99 } },
      { label: 'swinc x6, 4(x6)', word: S(OPC.CUSTOM1, 2, 6, 6, 4), regs: { 6: DMEM_BASE + 0x100 } },
    ],
    ref: (s, w) => {
      const f = field(w);
      s.dmem.setWord(s.regs[f.rs1], s.regs[f.rs2]);
      wr(s, f.rs1, s.regs[f.rs1] + f.immS);
    },
    solution: 'The memory needs the old rs1 as its address while the ALU computes rs1 + imm, so add the AddrSrc mux (address = RD1). The result goes to rs1, not rd (bits 11:7 hold imm[4:0]), so add the RegDst mux. Control: ImmSrc = S, ALUSrc = 1, ALU add, MemWrite = 1, AddrSrc = 1, RegWrite = 1, RegDst = 1, ResultSrc = 00, MemRead = 0.',
    model: { mods: ['addrSrc', 'regDst'], vals: { RegWrite: '1', ImmSrc: 'S', ALUSrcA: '0', ALUSrc: '1', ALU: '0', MemRead: '0', MemWrite: '1', ResultSrc: '0', Branch: '0', Jump: '0', PCTargetSrc: '0', AddrSrc: '1', RegDst: '1' } },
  },
};


export interface DesignResult {
  rows: { label: string; ok: boolean; why: string }[];
  reg: { label: string; ok: boolean; why: string }[];
  ok: boolean;
}

export function effectiveMods(ch: Challenge, mods: Set<ModKey>): Mods {
  const m: Mods = { ...ch.base };
  for (const k of mods) {
    if (k === 'srcAZero') m.noSrcAZero = false;
    else (m as Record<string, boolean>)[k] = true;
  }
  return m;
}

/** Run the challenge's tests and the regression tests on a learner design. */
export function runDesign(ch: Challenge, mods: Set<ModKey>, vals: Record<string, string>): DesignResult {
  const m = effectiveMods(ch, mods);
  const ctrl: Ctrl = {
    RegWrite: +vals.RegWrite, ImmSrc: vals.ImmSrc as ImmSrc, ALUSrcA: +vals.ALUSrcA, ALUSrc: +vals.ALUSrc, MemRead: +vals.MemRead, MemWrite: +vals.MemWrite,
    ResultSrc: +vals.ResultSrc, Branch: +vals.Branch, Jump: +vals.Jump, PCTargetSrc: +vals.PCTargetSrc, ALUOp: 0,
    CondWrite: +(vals.CondWrite ?? 0), RegDst: +(vals.RegDst ?? 0), AddrSrc: +(vals.AddrSrc ?? 0), ShA: +(vals.ShA ?? 0),
  };
  const row = { name: ch.syntax.split(' ')[0], opcode: ch.opcode, ctrl, dc: [] };
  const rows = ch.cases.map((c) => {
    const s = newState([], 0x40);
    s.imem[0x40 >>> 2] = c.word;
    for (let r = 1; r < 32; r++) s.regs[r] = u32(0x1000 * r + 0x11 * r);
    for (const [r, v] of Object.entries(c.regs)) s.regs[+r] = u32(v);
    for (let a = 0; a < 512; a += 4) s.dmem.setWord(DMEM_BASE + a, 0xdead0000 + a);
    const ref = { pc: s.pc, regs: new Uint32Array(s.regs), dmem: s.dmem.clone(), imem: s.imem };
    ch.ref(ref, c.word);
    ref.pc = u32(ref.pc + 4);
    const t = evaluate(s, { extraRows: [row], mods: m, aluControl: +vals.ALU });
    if (t.fault) return { label: c.label, ok: false, why: `fault: ${t.fault}` };
    commit(s, t);
    const why: string[] = [];
    for (let r = 1; r < 32; r++) if (s.regs[r] !== ref.regs[r]) why.push(`x${r} should be ${hex(ref.regs[r])} but is ${hex(s.regs[r])}`);
    for (let a = 0; a < 4096; a += 4) {
      const x = s.dmem.readWord(DMEM_BASE + a), y = ref.dmem.readWord(DMEM_BASE + a);
      if (x !== y) why.push(`memory ${hex(DMEM_BASE + a)} should be ${hex(y)} but is ${hex(x)}`);
    }
    if (s.pc !== ref.pc) why.push(`next PC should be ${hex(ref.pc)} but is ${hex(s.pc)}`);
    return { label: c.label, ok: why.length === 0, why: why.slice(0, 3).join('; ') };
  });
  const reg = TESTS.filter((x) => !(ch.id === 'lui' && x.op === 'lui')).map((x) => {
    const st = machineFor(x.e).state;
    const d = describeDiff(evaluate(st), evaluate(st, { mods: m }));
    return { label: x.name, ok: d.length === 0, why: d.join('; ') };
  });
  return { rows, reg, ok: rows.every((r) => r.ok) && reg.every((r) => r.ok) };
}
