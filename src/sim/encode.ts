// Encoder and decoder for RV32I words.

import { bits, bit, hex, signed } from './bits';
import { DEF, ISA, OPC, type InstrDef, type Mnemonic, type Fmt } from './isa';
import { immGen, IMM_RANGE } from './immgen';

/** An instruction in architectural terms. imm is the ImmExt value the hardware builds. */
export interface Instr {
  op: Mnemonic;
  rd: number;
  rs1: number;
  rs2: number;
  imm: number;
}

export class EncodeError extends Error {}

function checkReg(r: number, what: string) {
  if (!Number.isInteger(r) || r < 0 || r > 31) throw new EncodeError(`${what} must be a register x0..x31`);
}

export function immError(def: InstrDef, imm: number): string | null {
  if (!Number.isInteger(imm)) return 'immediate must be an integer';
  if (def.kind === 'shifti') {
    return imm < 0 || imm > 31 ? `shift amount must be 0..31 (RV32I), got ${imm}` : null;
  }
  const r = IMM_RANGE[def.fmt as Exclude<Fmt, 'R'>];
  if (!r) return null;
  if (def.fmt === 'U') {
    return (imm & 0xfff) !== 0 ? 'U-type immediate must have its low 12 bits zero' : null;
  }
  if (imm < r.min || imm > r.max) return `immediate ${imm} is out of range ${r.min}..${r.max} (${r.note})`;
  if (imm % r.align !== 0) return `offset ${signed(imm)} must be even: bit 0 of a ${def.fmt}-type offset is not stored`;
  return null;
}

export function encode(i: Instr): number {
  const d = DEF[i.op];
  if (!d) throw new EncodeError(`unknown instruction ${i.op}`);
  const e = d.fmt === 'R' ? null : immError(d, i.imm);
  if (e) throw new EncodeError(e);
  const op = d.opcode;
  const f3 = (d.funct3 ?? 0) << 12;
  const rd = () => (checkReg(i.rd, 'rd'), i.rd << 7);
  const rs1 = () => (checkReg(i.rs1, 'rs1'), i.rs1 << 15);
  const rs2 = () => (checkReg(i.rs2, 'rs2'), i.rs2 << 20);
  const imm = i.imm | 0;
  let w: number;
  switch (d.fmt) {
    case 'R':
      w = ((d.funct7 ?? 0) << 25) | rs2() | rs1() | f3 | rd() | op;
      break;
    case 'I':
      if (d.kind === 'shifti') w = ((d.funct7 ?? 0) << 25) | ((imm & 0x1f) << 20) | rs1() | f3 | rd() | op;
      else w = ((imm & 0xfff) << 20) | rs1() | f3 | rd() | op;
      break;
    case 'S':
      w = (bits(imm, 11, 5) << 25) | rs2() | rs1() | f3 | (bits(imm, 4, 0) << 7) | op;
      break;
    case 'B':
      w =
        (bit(imm, 12) << 31) | (bits(imm, 10, 5) << 25) | rs2() | rs1() | f3 |
        (bits(imm, 4, 1) << 8) | (bit(imm, 11) << 7) | op;
      break;
    case 'U':
      w = (imm & 0xfffff000) | rd() | op;
      break;
    case 'J':
      w = (bit(imm, 20) << 31) | (bits(imm, 10, 1) << 21) | (bit(imm, 11) << 20) | (bits(imm, 19, 12) << 12) | rd() | op;
      break;
  }
  return w >>> 0;
}

export interface Fields {
  opcode: number;
  rd: number;
  funct3: number;
  rs1: number;
  rs2: number;
  funct7: number;
}

export function fields(word: number): Fields {
  return {
    opcode: bits(word, 6, 0),
    rd: bits(word, 11, 7),
    funct3: bits(word, 14, 12),
    rs1: bits(word, 19, 15),
    rs2: bits(word, 24, 20),
    funct7: bits(word, 31, 25),
  };
}

export interface Decoded extends Instr {
  def: InstrDef;
  word: number;
  f: Fields;
}

export type DecodeResult = { ok: true; d: Decoded } | { ok: false; error: string };

export function decode(word: number): DecodeResult {
  word >>>= 0;
  const f = fields(word);
  const fail = (error: string): DecodeResult => ({ ok: false, error });
  if ((f.opcode & 0b11) !== 0b11) {
    if (word === 0) return fail('0x00000000 is defined as an illegal instruction');
    return fail(`opcode bits [1:0] = ${f.opcode & 3}; 32-bit RISC-V instructions end in 11`);
  }
  if (f.opcode === OPC.SYSTEM) return fail('SYSTEM opcode (ecall, ebreak, CSRs) is out of scope for this course');
  if (f.opcode === OPC.MISC_MEM) return fail('MISC-MEM opcode (fence) is out of scope for this course');
  let def: InstrDef | undefined;
  for (const d of ISA) {
    if (d.opcode !== f.opcode) continue;
    if (d.funct3 !== undefined && d.funct3 !== f.funct3) continue;
    if (d.fmt === 'R' || d.kind === 'shifti') {
      if (d.funct7 !== f.funct7) continue;
    }
    def = d;
    break;
  }
  if (!def) {
    const known = ISA.some((d) => d.opcode === f.opcode);
    if (!known) return fail(`opcode ${f.opcode.toString(2).padStart(7, '0')} is not an RV32I opcode taught here`);
    if (f.opcode === OPC.OP || (f.opcode === OPC.OP_IMM && (f.funct3 === 1 || f.funct3 === 5)))
      return fail(`funct3 ${f.funct3.toString(2).padStart(3, '0')} with funct7 ${f.funct7.toString(2).padStart(7, '0')} is not a valid combination`);
    return fail(`funct3 ${f.funct3.toString(2).padStart(3, '0')} is not defined for this opcode`);
  }
  const imm = def.fmt === 'R' ? 0 : def.kind === 'shifti' ? f.rs2 : immGen(word, def.fmt);
  const uses = usesFields(def);
  return {
    ok: true,
    d: {
      op: def.name,
      def,
      word,
      f,
      rd: uses.rd ? f.rd : 0,
      rs1: uses.rs1 ? f.rs1 : 0,
      rs2: uses.rs2 ? f.rs2 : 0,
      imm,
    },
  };
}

export function usesFields(def: InstrDef): { rd: boolean; rs1: boolean; rs2: boolean; imm: boolean } {
  const fmt = def.fmt;
  return {
    rd: fmt === 'R' || fmt === 'I' || fmt === 'U' || fmt === 'J',
    rs1: fmt === 'R' || fmt === 'I' || fmt === 'S' || fmt === 'B',
    rs2: fmt === 'R' || fmt === 'S' || fmt === 'B',
    imm: fmt !== 'R',
  };
}

/** Canonical assembly text. Branch and jal offsets are shown PC-relative with a sign. */
export function disasm(i: Instr): string {
  const d = DEF[i.op];
  const x = (r: number) => 'x' + r;
  switch (d.fmt) {
    case 'R':
      return `${d.name} ${x(i.rd)}, ${x(i.rs1)}, ${x(i.rs2)}`;
    case 'I':
      if (d.kind === 'load' || d.kind === 'jalr') return `${d.name} ${x(i.rd)}, ${i.imm}(${x(i.rs1)})`;
      return `${d.name} ${x(i.rd)}, ${x(i.rs1)}, ${i.imm}`;
    case 'S':
      return `${d.name} ${x(i.rs2)}, ${i.imm}(${x(i.rs1)})`;
    case 'B':
      return `${d.name} ${x(i.rs1)}, ${x(i.rs2)}, ${signed(i.imm)}`;
    case 'U':
      return `${d.name} ${x(i.rd)}, ${hex(i.imm >>> 12, 5)}`;
    case 'J':
      return `${d.name} ${x(i.rd)}, ${signed(i.imm)}`;
  }
}

/** Fill the English template with concrete register names and immediate. */
export function english(i: Instr): string {
  const d = DEF[i.op];
  let imm: string;
  if (d.fmt === 'B' || d.fmt === 'J') imm = signed(i.imm);
  else if (d.fmt === 'U') imm = hex(i.imm >>> 12, 5);
  else imm = String(i.imm);
  return d.english
    .replace(/\{rd\}/g, 'x' + i.rd)
    .replace(/\{rs1\}/g, 'x' + i.rs1)
    .replace(/\{rs2\}/g, 'x' + i.rs2)
    .replace(/\{imm\}/g, imm);
}

/** Register-transfer line with concrete register numbers substituted. */
export function rtlConcrete(i: Instr): string {
  const d = DEF[i.op];
  return d.rtl
    .replace(/R\[rd\]/g, 'x' + i.rd)
    .replace(/R\[rs1\]/g, 'x' + i.rs1)
    .replace(/R\[rs2\]/g, 'x' + i.rs2)
    .replace(/SignExt\(imm\)/g, d.fmt === 'I' || d.fmt === 'S' ? String(i.imm) : 'imm')
    .replace(/shamt/g, String(i.imm))
    .replace(/PC \+ imm/g, d.fmt === 'B' || d.fmt === 'J' ? `PC ${i.imm < 0 ? '−' : '+'} ${Math.abs(i.imm)}` : 'PC + imm');
}
