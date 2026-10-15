// Two-pass assembler for the RV32I subset taught here.
// Supports labels, comments (# or //), x0..x31 and ABI register names,
// and the pseudo-instructions li, mv, j, jr, ret, nop, call, not, neg,
// beqz, bnez, bgt, ble, bgtu, bleu, seqz, snez.
// Branch and jal targets may be labels or explicit PC-relative offsets (+16, -8, 16).

import { ABI, DEF, type Mnemonic } from './isa';
import { encode, EncodeError, type Instr } from './encode';

export interface AsmLine {
  addr: number;
  word: number;
  instr: Instr;
  src: string; // source text of the line that produced it
  line: number; // 1-based source line
  pseudo: string | null; // original pseudo-instruction if expanded
}

export interface AsmError {
  line: number;
  msg: string;
}

export interface AsmResult {
  ok: boolean;
  lines: AsmLine[];
  words: number[];
  labels: Record<string, number>;
  errors: AsmError[];
}

const REG_ALIASES: Record<string, number> = (() => {
  const m: Record<string, number> = { fp: 8 };
  for (let i = 0; i < 32; i++) m['x' + i] = i;
  ABI.forEach((n, i) => (m[n] = i));
  return m;
})();

export function parseReg(tok: string): number | null {
  const r = REG_ALIASES[tok.trim().toLowerCase()];
  return r === undefined ? null : r;
}

export function parseImm(tok: string): number | null {
  const t = tok.trim().toLowerCase().replace(/_/g, '');
  if (!/^[+-]?(0x[0-9a-f]+|0b[01]+|\d+)$/.test(t)) return null;
  let neg = false;
  let s = t;
  if (s[0] === '+' || s[0] === '-') {
    neg = s[0] === '-';
    s = s.slice(1);
  }
  let v: number;
  if (s.startsWith('0x')) v = parseInt(s.slice(2), 16);
  else if (s.startsWith('0b')) v = parseInt(s.slice(2), 2);
  else v = parseInt(s, 10);
  if (!Number.isFinite(v) || v > 0xffffffff) return null;
  return neg ? -v : v;
}

interface Stmt {
  line: number;
  src: string;
  mn: string;
  args: string[];
  addr: number;
  size: number; // number of real instructions it expands to
}

class AsmFail extends Error {}

function splitArgs(s: string): string[] {
  if (!s.trim()) return [];
  return s.split(',').map((a) => a.trim());
}

/** Number of words `li` needs for a constant. */
function liSize(v: number): number {
  return v >= -2048 && v <= 2047 ? 1 : 2;
}

export function assemble(source: string): AsmResult {
  const errors: AsmError[] = [];
  const stmts: Stmt[] = [];
  const labels: Record<string, number> = {};
  let addr = 0;
  const srcLines = source.split(/\r?\n/);

  // Pass 1: labels and sizes
  srcLines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    let text = raw.replace(/(#|\/\/).*$/, '').trim();
    while (true) {
      const m = /^([A-Za-z_.][\w.]*)\s*:/.exec(text);
      if (!m) break;
      const name = m[1];
      if (labels[name] !== undefined) errors.push({ line: lineNo, msg: `label "${name}" is defined twice` });
      else if (parseReg(name) !== null) errors.push({ line: lineNo, msg: `"${name}" is a register name and cannot be a label` });
      else labels[name] = addr;
      text = text.slice(m[0].length).trim();
    }
    if (!text) return;
    const sp = text.search(/\s/);
    const mn = (sp < 0 ? text : text.slice(0, sp)).toLowerCase();
    const args = splitArgs(sp < 0 ? '' : text.slice(sp + 1));
    let size = 1;
    if (mn === 'li' && args.length === 2) {
      const v = parseImm(args[1]);
      size = v === null ? 1 : liSize(v | 0);
    }
    stmts.push({ line: lineNo, src: raw.trim(), mn, args, addr, size });
    addr += 4 * size;
  });

  // Pass 2: encode
  const lines: AsmLine[] = [];
  for (const st of stmts) {
    try {
      const instrs = expand(st, labels);
      instrs.forEach((ins, k) => {
        const word = encode(ins);
        lines.push({ addr: st.addr + 4 * k, word, instr: ins, src: st.src, line: st.line, pseudo: DEF[st.mn as Mnemonic] ? null : st.mn });
      });
    } catch (e) {
      if (e instanceof AsmFail || e instanceof EncodeError) errors.push({ line: st.line, msg: e.message });
      else throw e;
    }
  }
  return { ok: errors.length === 0, lines, words: lines.map((l) => l.word), labels, errors };
}

function expand(st: Stmt, labels: Record<string, number>): Instr[] {
  const { mn, args } = st;
  const need = (n: number, form: string) => {
    if (args.length !== n) throw new AsmFail(`${mn} expects ${n} operand${n === 1 ? '' : 's'}: ${form}`);
  };
  const reg = (t: string): number => {
    const r = parseReg(t);
    if (r === null) throw new AsmFail(`"${t}" is not a register (use x0..x31 or an ABI name such as t0, a0, sp)`);
    return r;
  };
  const imm = (t: string): number => {
    const v = parseImm(t);
    if (v === null) throw new AsmFail(`"${t}" is not a number`);
    return v;
  };
  /** Branch or jump target: label or PC-relative offset. */
  const target = (t: string, pc: number): number => {
    if (labels[t] !== undefined) return labels[t] - pc;
    const v = parseImm(t);
    if (v === null) throw new AsmFail(`unknown label "${t}"`);
    return v;
  };
  /** imm(rs1) operand. */
  const memop = (t: string): { imm: number; rs1: number } => {
    const m = /^(.*)\((.+)\)$/.exec(t.replace(/\s+/g, ''));
    if (!m) throw new AsmFail(`expected offset(register), for example 8(x6), got "${t}"`);
    return { imm: m[1] === '' ? 0 : imm(m[1]), rs1: reg(m[2]) };
  };
  const I = (op: Mnemonic, rd: number, rs1: number, rs2: number, im: number): Instr => ({ op, rd, rs1, rs2, imm: im });
  const pc = st.addr;
  const d = DEF[mn as Mnemonic];

  if (d) {
    switch (d.fmt) {
      case 'R':
        need(3, `${mn} rd, rs1, rs2`);
        return [I(d.name, reg(args[0]), reg(args[1]), reg(args[2]), 0)];
      case 'I':
        if (d.kind === 'load') {
          need(2, `${mn} rd, offset(rs1)`);
          const m = memop(args[1]);
          return [I(d.name, reg(args[0]), m.rs1, 0, m.imm)];
        }
        if (d.kind === 'jalr') {
          if (args.length === 1) return [I('jalr', 1, reg(args[0]), 0, 0)];
          if (args.length === 2) {
            const m = memop(args[1]);
            return [I('jalr', reg(args[0]), m.rs1, 0, m.imm)];
          }
          need(3, 'jalr rd, offset(rs1)');
          return [I('jalr', reg(args[0]), reg(args[1]), 0, imm(args[2]))];
        }
        need(3, `${mn} rd, rs1, imm`);
        return [I(d.name, reg(args[0]), reg(args[1]), 0, imm(args[2]))];
      case 'S': {
        need(2, `${mn} rs2, offset(rs1)`);
        const m = memop(args[1]);
        return [I(d.name, 0, m.rs1, reg(args[0]), m.imm)];
      }
      case 'B':
        need(3, `${mn} rs1, rs2, label`);
        return [I(d.name, 0, reg(args[0]), reg(args[1]), target(args[2], pc))];
      case 'U': {
        need(2, `${mn} rd, imm20`);
        const v = imm(args[1]);
        if (v < -524288 || v > 0xfffff) throw new AsmFail(`${mn} takes a 20-bit value (0..0xFFFFF), got ${args[1]}`);
        return [I(d.name, reg(args[0]), 0, 0, (v & 0xfffff) << 12)];
      }
      case 'J':
        if (args.length === 1) return [I('jal', 1, 0, 0, target(args[0], pc))];
        need(2, 'jal rd, label');
        return [I('jal', reg(args[0]), 0, 0, target(args[1], pc))];
    }
  }

  switch (mn) {
    case 'nop':
      need(0, 'nop');
      return [I('addi', 0, 0, 0, 0)];
    case 'mv':
      need(2, 'mv rd, rs');
      return [I('addi', reg(args[0]), reg(args[1]), 0, 0)];
    case 'not':
      need(2, 'not rd, rs');
      return [I('xori', reg(args[0]), reg(args[1]), 0, -1)];
    case 'neg':
      need(2, 'neg rd, rs');
      return [I('sub', reg(args[0]), 0, reg(args[1]), 0)];
    case 'seqz':
      need(2, 'seqz rd, rs');
      return [I('sltiu', reg(args[0]), reg(args[1]), 0, 1)];
    case 'snez':
      need(2, 'snez rd, rs');
      return [I('sltu', reg(args[0]), 0, reg(args[1]), 0)];
    case 'li': {
      need(2, 'li rd, value');
      const rd = reg(args[0]);
      const raw = imm(args[1]);
      if (raw < -2147483648 || raw > 0xffffffff) throw new AsmFail('li value must fit in 32 bits');
      const v = raw | 0;
      if (st.size === 1) return [I('addi', rd, 0, 0, v)];
      // lui loads the upper 20 bits; addi adds a sign-extended low 12 bits,
      // so round the upper part up when bit 11 of the value is set.
      const hi = ((v + 0x800) >>> 12) & 0xfffff;
      const lo = v - (hi << 12);
      return [I('lui', rd, 0, 0, hi << 12), I('addi', rd, rd, 0, ((lo << 20) >> 20))];
    }
    case 'j':
      need(1, 'j label');
      return [I('jal', 0, 0, 0, target(args[0], pc))];
    case 'call':
      need(1, 'call label');
      return [I('jal', 1, 0, 0, target(args[0], pc))];
    case 'jr':
      need(1, 'jr rs');
      return [I('jalr', 0, reg(args[0]), 0, 0)];
    case 'ret':
      need(0, 'ret');
      return [I('jalr', 0, 1, 0, 0)];
    case 'beqz':
      need(2, 'beqz rs, label');
      return [I('beq', 0, reg(args[0]), 0, target(args[1], pc))];
    case 'bnez':
      need(2, 'bnez rs, label');
      return [I('bne', 0, reg(args[0]), 0, target(args[1], pc))];
    case 'bgt':
    case 'ble':
    case 'bgtu':
    case 'bleu': {
      need(3, `${mn} rs1, rs2, label`);
      const op: Mnemonic = mn === 'bgt' ? 'blt' : mn === 'ble' ? 'bge' : mn === 'bgtu' ? 'bltu' : 'bgeu';
      return [I(op, 0, reg(args[1]), reg(args[0]), target(args[2], pc))];
    }
  }
  if (mn === 'ecall' || mn === 'ebreak' || mn === 'fence' || mn.startsWith('csr'))
    throw new AsmFail(`${mn} is out of scope for this course (no SYSTEM or FENCE instructions)`);
  throw new AsmFail(`unknown instruction "${mn}"`);
}

/** Assemble a single instruction at a given address. */
export function assembleOne(text: string, addr = 0): { ok: true; line: AsmLine } | { ok: false; error: string } {
  const pad = addr / 4;
  const src = 'nop\n'.repeat(pad) + text;
  const r = assemble(src);
  if (!r.ok) return { ok: false, error: r.errors[0].msg };
  const line = r.lines.find((l) => l.addr === addr);
  if (!line) return { ok: false, error: 'nothing to assemble' };
  return { ok: true, line };
}
