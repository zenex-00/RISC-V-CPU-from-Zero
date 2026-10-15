// Control unit: main decoder (opcode -> control signals), ALU decoder
// (ALUOp, funct3, instr[30] -> ALU operation) and branch condition logic.

import { ALU } from './alu';
import { OPC } from './isa';
import type { ImmSrc } from './immgen';

export interface Ctrl {
  RegWrite: number; // 1: write Result into rd at the clock edge
  ImmSrc: ImmSrc; // which immediate layout the immediate generator uses
  ALUSrcA: number; // ALU input A: 0 = RD1 (rs1), 1 = PC, 2 = constant 0
  ALUSrc: number; // ALU input B: 0 = RD2 (rs2), 1 = ImmExt  (2 = constant 0, design-challenge mod)
  MemRead: number; // 1: the data memory read is used
  MemWrite: number; // 1: write data memory at the clock edge
  ResultSrc: number; // write-back source: 0 = ALUResult, 1 = load data, 2 = PC + 4  (3 = ImmExt, mod)
  Branch: number; // 1: conditional branch
  Jump: number; // 1: unconditional jump (jal, jalr)
  PCTargetSrc: number; // jump target: 0 = PC + ImmExt (branch adder), 1 = ALUResult with bit 0 cleared
  ALUOp: number; // 00 add, 01 subtract (compare), 10 R-type: use funct3 and instr[30], 11 I-type: use funct3
  // Signals that only exist in design-challenge datapaths (default 0):
  CondWrite?: number;
  RegDst?: number;
  AddrSrc?: number;
  ShA?: number;
}

export type CtrlKey = keyof Ctrl;

export const CTRL_KEYS: CtrlKey[] = [
  'RegWrite', 'ImmSrc', 'ALUSrcA', 'ALUSrc', 'MemRead', 'MemWrite', 'ResultSrc', 'Branch', 'Jump', 'PCTargetSrc', 'ALUOp',
];

export interface MainRow {
  name: string;
  opcode: number;
  ctrl: Ctrl;
  /** Signals whose value does not matter for this instruction class. */
  dc: CtrlKey[];
}

const base: Ctrl = {
  RegWrite: 0, ImmSrc: 'I', ALUSrcA: 0, ALUSrc: 0, MemRead: 0, MemWrite: 0,
  ResultSrc: 0, Branch: 0, Jump: 0, PCTargetSrc: 0, ALUOp: 0,
};

const row = (name: string, opcode: number, c: Partial<Ctrl>, dc: CtrlKey[]): MainRow => ({
  name, opcode, ctrl: { ...base, ...c }, dc,
});

/** The main decoder truth table. One row per opcode. */
export const MAIN_TABLE: MainRow[] = [
  row('R-type', OPC.OP, { RegWrite: 1, ALUOp: 2 }, ['ImmSrc', 'PCTargetSrc']),
  row('I-type ALU', OPC.OP_IMM, { RegWrite: 1, ImmSrc: 'I', ALUSrc: 1, ALUOp: 3 }, ['PCTargetSrc']),
  row('load', OPC.LOAD, { RegWrite: 1, ImmSrc: 'I', ALUSrc: 1, MemRead: 1, ResultSrc: 1, ALUOp: 0 }, ['PCTargetSrc']),
  row('store', OPC.STORE, { ImmSrc: 'S', ALUSrc: 1, MemWrite: 1, ALUOp: 0 }, ['ResultSrc', 'PCTargetSrc']),
  row('branch', OPC.BRANCH, { ImmSrc: 'B', Branch: 1, ALUOp: 1, PCTargetSrc: 0 }, ['ResultSrc']),
  row('jal', OPC.JAL, { RegWrite: 1, ImmSrc: 'J', ResultSrc: 2, Jump: 1, PCTargetSrc: 0 }, ['ALUSrcA', 'ALUSrc', 'ALUOp']),
  row('jalr', OPC.JALR, { RegWrite: 1, ImmSrc: 'I', ALUSrc: 1, ResultSrc: 2, Jump: 1, PCTargetSrc: 1, ALUOp: 0 }, []),
  row('lui', OPC.LUI, { RegWrite: 1, ImmSrc: 'U', ALUSrcA: 2, ALUSrc: 1, ALUOp: 0 }, ['PCTargetSrc']),
  row('auipc', OPC.AUIPC, { RegWrite: 1, ImmSrc: 'U', ALUSrcA: 1, ALUSrc: 1, ALUOp: 0 }, ['PCTargetSrc']),
];

/** Control word for an unrecognised opcode: nothing is written, PC advances. */
export const ILLEGAL_CTRL: Ctrl = { ...base };

export function mainDecode(opcode: number, extra?: MainRow[]): { ctrl: Ctrl; row: MainRow | null } {
  // Extra rows (design challenges) take precedence over the built-in table.
  const rows = extra ? [...extra, ...MAIN_TABLE] : MAIN_TABLE;
  const r = rows.find((x) => x.opcode === opcode);
  return r ? { ctrl: { ...r.ctrl }, row: r } : { ctrl: { ...ILLEGAL_CTRL }, row: null };
}

/** ALU decoder. b30 is instruction bit 30 (funct7 bit 5). */
export function aluDecode(aluOp: number, funct3: number, b30: number): number {
  switch (aluOp & 3) {
    case 0:
      return ALU.ADD;
    case 1:
      return ALU.SUB;
    case 2:
      return ((b30 & 1) << 3) | (funct3 & 7);
    default:
      // I-type: bit 30 is part of the immediate, except for shifts (funct3 = 101)
      // where it selects srai over srli.
      return (funct3 & 7) === 0b101 ? ((b30 & 1) << 3) | 0b101 : funct3 & 7;
  }
}

export interface BranchEval {
  cond: number; // the selected comparison before the optional inversion
  take: number;
}

/**
 * Branch condition from funct3:
 *   bit 2 picks the comparison: 0 = equality (Zero), 1 = less-than
 *   bit 1 picks signed or unsigned less-than: 0 = LT, 1 = LTU
 *   bit 0 inverts the result (beq/bne, blt/bge, bltu/bgeu)
 */
export function branchCond(funct3: number, zero: number, lt: number, ltu: number): BranchEval {
  const f2 = (funct3 >> 2) & 1;
  const f1 = (funct3 >> 1) & 1;
  const f0 = funct3 & 1;
  const cond = f2 ? (f1 ? ltu : lt) : zero;
  return { cond, take: cond ^ f0 };
}

export function fmtSignal(key: CtrlKey, v: number | string | undefined): string {
  if (v === undefined) return '-';
  if (key === 'ImmSrc') return String(v);
  if (key === 'ALUOp') return (Number(v) & 3).toString(2).padStart(2, '0');
  if (key === 'ResultSrc' || key === 'ALUSrcA') return (Number(v) & 3).toString(2).padStart(2, '0');
  return String(v);
}
