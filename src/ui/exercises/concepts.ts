// Concept question generators. Each call builds a fresh question with new
// numbers; answers are computed with the simulator, never typed in by hand.

import { alu, ALU, ALU_NAME } from '../../sim/alu';
import { hex, bin, signExtend, u32 } from '../../sim/bits';
import { aluDecode, branchCond, mainDecode } from '../../sim/control';
import { DEF, type Mnemonic } from '../../sim/isa';
import { encode } from '../../sim/encode';
import { checkAccess, loadExtend, storeAlign, DMEM_BASE } from '../../sim/memory';
import { pick, randomInstr, rnd } from './gen';
import { criticalSummary, timingFor, DEFAULT_DELAYS, type Delays } from '../../sim/timing';

export interface MCQ {
  q: string;
  options: { label: string; value: string }[];
  answer: string;
  explain: string;
}

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Build options from a correct value and distractors (deduplicated, shuffled). */
function opts(correct: string, distract: string[], keepOrder = false): { label: string; value: string }[] {
  const all = [correct, ...distract.filter((d) => d !== correct)];
  const uniq = [...new Set(all)].slice(0, 4);
  const o = uniq.map((v) => ({ label: v, value: v }));
  return keepOrder ? o : shuffle(o);
}

const sval = () => (Math.random() < 0.5 ? -rnd(1, 3000) : rnd(1, 3000));
const h = (x: number) => hex(x);

export const CONCEPT_TITLE: Record<string, string> = {
  'pc-plus-4': 'Next sequential PC', 'comb-vs-seq': 'Combinational or sequential', 'pc-loop': 'Why the PC is a register',
  'clock-edge': 'What a register does at the edge', 'setup-hold': 'Setup and hold', 'single-cycle': 'Single-cycle clock period',
  'alu-sub-bit30': 'sub and bit 30', 'signed-vs-unsigned': 'slt versus sltu', 'sra-vs-srl': 'sra versus srl', 'x0-write': 'Writes to x0',
  'sign-extension': 'Sign extension', alusrc: 'ALUSrc', 'itype-bit30': 'Bit 30 in I-type', sltiu: 'sltiu',
  'load-address': 'Load address', resultsrc: 'ResultSrc', 'lb-sign': 'lb versus lbu', misaligned: 'Alignment',
  'stype-imm': 'S-type immediate', 'store-regwrite': 'RegWrite for stores and branches', 'byte-enable': 'Byte enables',
  'zero-flag': 'Zero flag', 'branch-target': 'Branch target', 'branch-not-taken': 'Branch not taken', 'btype-bit0': 'Why bit 0 is not stored',
  'lt-flag': 'LT flag', 'signed-vs-unsigned-branch': 'blt versus bltu', 'overflow-lt': 'LT with overflow', 'branch-f3': 'funct3 for branches',
  'jal-link': 'jal link value', 'jalr-target': 'jalr target', 'jalr-bit0': 'jalr clears bit 0', 'jtype-imm': 'jal range',
  'alusrca-lui': 'ALUSrcA', auipc: 'auipc', 'li-rounding': 'li and the rounding trap',
  'main-decoder': 'Main decoder', 'alu-decoder': 'ALU decoder', 'critical-path': 'Critical path', 'clock-period': 'Minimum clock period',
  'imm-scatter': 'Why immediates are scattered', 'verilog-seq': 'Sequential Verilog', 'verilog-x0': 'x0 in RTL', 'verilog-latch': 'Latch inference', 'verilog-sra': 'Arithmetic shift in Verilog',
};

export const GENERATORS: Record<string, () => MCQ> = {
  'pc-plus-4': () => {
    const pc = rnd(1, 4000) * 4;
    return {
      q: `The instruction at ${h(pc)} is not a branch or jump. Where does the next instruction start?`,
      options: opts(h(pc + 4), [h(pc + 1), h(pc + 8), h(pc + 2)]),
      answer: h(pc + 4),
      explain: 'Memory is byte-addressed and RV32I instructions are 4 bytes, so the next one starts 4 bytes later.',
    };
  },
  'comb-vs-seq': () => {
    const blocks: [string, string][] = [['the ALU', 'Combinational'], ['a 2-to-1 multiplexer', 'Combinational'], ['the PC register', 'Sequential'], ['the PC + 4 adder', 'Combinational'], ['the immediate generator', 'Combinational'], ['the register file\'s write port', 'Sequential'], ['the control unit\'s main decoder', 'Combinational'], ['data memory when written', 'Sequential']];
    const [b, a] = pick(blocks);
    return {
      q: `Is ${b} combinational or sequential?`,
      options: [{ label: 'Combinational', value: 'Combinational' }, { label: 'Sequential', value: 'Sequential' }],
      answer: a,
      explain: a === 'Combinational' ? `${b} has no memory: its output is a function of its present inputs.` : `${b} stores state that changes only at a clock edge.`,
    };
  },
  'pc-loop': () => ({
    q: 'Why must there be a register between the PC + 4 adder output and its input?',
    options: shuffle([
      { label: 'Without it the loop is combinational and never settles to a stable value', value: 'a' },
      { label: 'The adder needs a clock to add', value: 'b' },
      { label: 'Registers are faster than wires', value: 'c' },
      { label: 'Instruction memory needs a registered address to work', value: 'd' },
    ]),
    answer: 'a',
    explain: 'A combinational feedback loop (PC = PC + 4 with no storage) has no stable state. The register holds the PC still for a whole cycle and updates it once per edge.',
  }),
  'clock-edge': () => {
    const a = rnd(0, 99), b = rnd(100, 199), c = rnd(200, 299);
    return {
      q: `A register holds Q = ${a}. Between two rising edges, its D input changes from ${b} to ${c} and stays there. What is Q just before the second edge?`,
      options: opts(String(a), [String(b), String(c), '0']),
      answer: String(a),
      explain: 'Q only changes at a rising edge. Between edges it keeps the value captured at the last edge, whatever D does. At the next edge it takes ' + c + '.',
    };
  },
  'setup-hold': () => {
    const setup = pick([20, 30, 40]), hold = pick([5, 10, 15]);
    const t = pick([-60, -45, -25, -10, -3, 2, 8, 25, 40]);
    const ans = t < -setup ? 'new' : t > hold ? 'old' : 'violation';
    return {
      q: `A flip-flop has setup ${setup} ps and hold ${hold} ps. D changes ${Math.abs(t)} ps ${t < 0 ? 'before' : 'after'} the rising edge. What happens?`,
      options: [
        { label: 'It captures the new value', value: 'new' },
        { label: 'It captures the old value', value: 'old' },
        { label: 'Timing violation: the result is not guaranteed', value: 'violation' },
      ],
      answer: ans,
      explain: ans === 'new' ? 'The change is before the setup window, so the new value is stable in time.' : ans === 'old' ? 'The change is after the hold window: the old value was captured.' : 'The change falls inside the setup/hold window, so the flip-flop may go metastable.',
    };
  },
  'single-cycle': () => {
    const d = { add: rnd(400, 600), lw: rnd(700, 900), sw: rnd(600, 750), beq: rnd(450, 650) };
    const m = Math.max(...Object.values(d));
    return {
      q: `Path delays: add ${d.add} ps, lw ${d.lw} ps, sw ${d.sw} ps, beq ${d.beq} ps (setup included). What is the shortest clock period for a single-cycle processor?`,
      options: opts(`${m} ps`, [`${d.add} ps`, `${Math.round((d.add + d.lw + d.sw + d.beq) / 4)} ps`, `${d.add + d.lw} ps`]),
      answer: `${m} ps`,
      explain: 'Every instruction gets the same cycle, so the period must cover the slowest one.',
    };
  },
  'alu-sub-bit30': () => {
    const a = sval(), b = sval();
    const r = alu(a, b, ALU.SUB).y | 0;
    return {
      q: `An R-type instruction has funct3 = 000 and bit 30 = 1. A = ${a}, B = ${b}. What is ALUResult?`,
      options: opts(String(r), [String((a + b) | 0), String((b - a) | 0), String(a | b)]),
      answer: String(r),
      explain: 'funct3 = 000 with bit 30 = 1 is sub: A − B.',
    };
  },
  'signed-vs-unsigned': () => {
    const a = -rnd(1, 500), b = rnd(1, 500);
    const useU = Math.random() < 0.5;
    const r = alu(a, b, useU ? ALU.SLTU : ALU.SLT).y;
    return {
      q: `x6 = ${h(a)} (${a} signed), x7 = ${b}. What does \`${useU ? 'sltu' : 'slt'} x5, x6, x7\` write?`,
      options: [{ label: '0', value: '0' }, { label: '1', value: '1' }],
      answer: String(r),
      explain: useU ? `Unsigned, ${h(a)} is a very large number, not less than ${b}.` : `Signed, ${a} < ${b}.`,
    };
  },
  'sra-vs-srl': () => {
    const a = -rnd(16, 4000), s = rnd(1, 8);
    const useA = Math.random() < 0.5;
    const r = alu(a, s, useA ? ALU.SRA : ALU.SRL).y;
    const other = alu(a, s, useA ? ALU.SRL : ALU.SRA).y;
    return {
      q: `x6 = ${h(a)}, x7 = ${s}. What does \`${useA ? 'sra' : 'srl'} x5, x6, x7\` produce?`,
      options: opts(h(r), [h(other), h(u32(a << s)), h(u32(a))]),
      answer: h(r),
      explain: useA ? 'sra copies the sign bit into the vacated bits.' : 'srl fills the vacated bits with zeros.',
    };
  },
  'x0-write': () => {
    const a = rnd(1, 99), b = rnd(1, 99);
    return {
      q: `x1 = ${a}, x2 = ${b}. After \`add x0, x1, x2\`, what does \`add x3, x0, x0\` write to x3?`,
      options: opts('0', [String(a + b), String(2 * (a + b)), String(a)]),
      answer: '0',
      explain: 'Writes to x0 are discarded and x0 always reads 0.',
    };
  },
  'sign-extension': () => {
    const v = pick([-1, -2, -12, -100, -2048, 5, 100, 2047, -512]);
    const field = v & 0xfff;
    return {
      q: `A 12-bit I-type immediate field holds ${hex(field, 3)}. What is ImmExt?`,
      options: opts(h(v), [h(field), h(u32(field << 20)), h(u32(-v))]),
      answer: h(v),
      explain: `Bit 11 is ${(field >> 11) & 1}, so the upper 20 bits are copies of it: ImmExt = ${h(v)} = ${v}.`,
    };
  },
  alusrc: () => {
    const op = pick<Mnemonic>(['add', 'addi', 'lw', 'sw', 'beq', 'sub', 'xori', 'jalr', 'sltu', 'lbu']);
    const c = mainDecode(DEF[op].opcode).ctrl;
    return {
      q: `What is ALUSrc for \`${op}\`?`,
      options: [{ label: '0: ALU input B = RD2', value: '0' }, { label: '1: ALU input B = ImmExt', value: '1' }],
      answer: String(c.ALUSrc),
      explain: c.ALUSrc ? `${op} adds or combines an immediate, so B is ImmExt.` : `${op} uses rs2 as the second operand${op === 'beq' ? ' (the comparison)' : ''}.`,
    };
  },
  'itype-bit30': () => {
    const imm = pick([1024, 1500, 2000, 1111, -1, -100]);
    const b30 = (imm >> 10) & 1;
    return {
      q: `\`addi x5, x6, ${imm}\` has instruction bit 30 = ${b30}. Which ALU operation does it need?`,
      options: [{ label: 'add', value: 'add' }, { label: 'sub', value: 'sub' }],
      answer: 'add',
      explain: 'For I-type, bit 30 is part of the immediate. The ALU decoder only looks at it for srli/srai (funct3 = 101).',
    };
  },
  sltiu: () => {
    const imm = pick([-1, -2, 5, 100, -100]);
    const x = pick([0, 3, 7, -1, -5, 200]);
    const r = alu(x, imm, ALU.SLTU).y;
    return {
      q: `x6 = ${h(x)}. What does \`sltiu x5, x6, ${imm}\` write?`,
      options: [{ label: '0', value: '0' }, { label: '1', value: '1' }],
      answer: String(r),
      explain: `The immediate is sign-extended to ${h(imm)} first, then compared as unsigned with ${h(x)}.`,
    };
  },
  'load-address': () => {
    const base = DMEM_BASE + rnd(20, 200) * 8, off = pick([-8, -4, 4, 8, 12, 20, 100]);
    return {
      q: `x6 = ${h(base)}. Which address does \`lw x5, ${off}(x6)\` read?`,
      options: opts(h(base + off), [h(base), h(base + off * 4), h(base - off)]),
      answer: h(base + off),
      explain: 'The address is R[rs1] + SignExt(offset), in bytes.',
    };
  },
  resultsrc: () => {
    const op = pick<Mnemonic>(['add', 'lw', 'jal', 'addi', 'lbu', 'jalr', 'lui', 'auipc']);
    const c = mainDecode(DEF[op].opcode).ctrl;
    return {
      q: `What is ResultSrc for \`${op}\`?`,
      options: [{ label: '00: ALUResult', value: '0' }, { label: '01: memory data', value: '1' }, { label: '10: PC + 4', value: '2' }],
      answer: String(c.ResultSrc),
      explain: c.ResultSrc === 1 ? 'Loads write the memory data.' : c.ResultSrc === 2 ? 'Jumps write the return address PC + 4.' : `${op} writes the ALU result.`,
    };
  },
  'lb-sign': () => {
    const byte = rnd(0x80, 0xff);
    const unsigned = Math.random() < 0.5;
    const r = loadExtend(byte, 0, unsigned ? 0b100 : 0b000);
    return {
      q: `The addressed byte is ${hex(byte, 2)}. What does \`${unsigned ? 'lbu' : 'lb'}\` write to rd?`,
      options: opts(h(r), [h(unsigned ? loadExtend(byte, 0, 0) : byte), h(u32(byte << 24)), h(byte * 0x01010101)]),
      answer: h(r),
      explain: unsigned ? 'lbu zero-extends.' : `lb sign-extends: bit 7 of ${hex(byte, 2)} is 1, so the upper bits become 1.`,
    };
  },
  misaligned: () => {
    const op = pick<Mnemonic>(['lw', 'lh', 'lb', 'sw', 'sh']);
    const addr = DMEM_BASE + rnd(0, 100) * 4 + rnd(0, 3);
    const e = checkAccess(addr, DEF[op].funct3!, DEF[op].kind === 'store');
    return {
      q: `Is \`${op}\` at address ${h(addr)} aligned?`,
      options: [{ label: 'Aligned', value: 'ok' }, { label: 'Misaligned', value: 'bad' }],
      answer: e ? 'bad' : 'ok',
      explain: `${op} accesses ${1 << (DEF[op].funct3! & 3)} byte(s); the address must be a multiple of that size.`,
    };
  },
  'stype-imm': () => {
    const imm = rnd(-2048, 2047);
    const w = encode({ op: 'sw', rd: 0, rs1: 6, rs2: 7, imm });
    return {
      q: `A store has bits [31:25] = ${bin(w >>> 25, 7)} and bits [11:7] = ${bin((w >>> 7) & 31, 5)}. What is the offset?`,
      options: opts(String(imm), [String((imm & 0xfe0) >> 5), String(imm & 31), String(-imm)]),
      answer: String(imm),
      explain: `imm[11:5] = ${bin(w >>> 25, 7)}, imm[4:0] = ${bin((w >>> 7) & 31, 5)}: together ${bin(imm & 0xfff, 12)} = ${imm} after sign extension.`,
    };
  },
  'store-regwrite': () => {
    const no = pick<Mnemonic>(['sw', 'sb', 'beq', 'bne', 'sh', 'bge']);
    const others = shuffle<Mnemonic>(['add', 'lw', 'jal', 'addi', 'lui', 'jalr']).slice(0, 3);
    return {
      q: 'Which instruction has RegWrite = 0?',
      options: shuffle([no, ...others].map((x) => ({ label: x, value: x }))),
      answer: no,
      explain: `${no} has no destination register; bits 11:7 hold ${DEF[no].fmt === 'S' ? 'imm[4:0]' : 'imm[4:1|11]'}, not rd.`,
    };
  },
  'byte-enable': () => {
    const op = pick<Mnemonic>(['sb', 'sh', 'sw']);
    const size = 1 << (DEF[op].funct3! & 3);
    const off = rnd(0, 3 / size | 0) * size;
    const be = storeAlign(0, off, DEF[op].funct3!).be;
    return {
      q: `\`${op}\` writes to an address whose bits [1:0] = ${bin(off, 2)}. What is BE[3:0]?`,
      options: opts(bin(be, 4), ['0001', '0010', '0100', '1000', '0011', '1100', '1111'].filter((x) => x !== bin(be, 4)).slice(0, 3)),
      answer: bin(be, 4),
      explain: `${op} writes ${size} byte(s) starting at lane ${off}.`,
    };
  },
  'zero-flag': () => {
    const a = sval(), b = Math.random() < 0.5 ? a : sval();
    return {
      q: `For a branch, the ALU computes ${a} − ${b}. What is Zero?`,
      options: [{ label: '0', value: '0' }, { label: '1', value: '1' }],
      answer: String(alu(a, b, ALU.SUB).zero),
      explain: 'Zero is 1 exactly when every bit of the result is 0, i.e. when the operands are equal.',
    };
  },
  'branch-target': () => {
    const pc = rnd(10, 1000) * 4, off = pick([-1, 1]) * rnd(1, 100) * 4;
    return {
      q: `A taken branch at ${h(pc)} has offset ${off}. Where does it go?`,
      options: opts(h(pc + off), [h(pc + 4 + off), h(pc + off * 2), h(pc + 4)]),
      answer: h(pc + off),
      explain: 'The target is PC + offset, relative to the branch itself.',
    };
  },
  'branch-not-taken': () => {
    const pc = rnd(10, 1000) * 4, off = rnd(2, 50) * 4;
    return {
      q: `\`beq x5, x6, +${off}\` at ${h(pc)} with x5 ≠ x6. What is the next PC?`,
      options: opts(h(pc + 4), [h(pc + off), h(pc), h(pc + off + 4)]),
      answer: h(pc + 4),
      explain: 'Not taken: PCSrc = 0 and the PC mux passes PC + 4.',
    };
  },
  'btype-bit0': () => ({
    q: 'Why is bit 0 of a branch offset not stored in the instruction?',
    options: shuffle([
      { label: 'Targets are always at least 2-byte aligned, so bit 0 is always 0', value: 'a' },
      { label: 'Bit 0 is the sign bit', value: 'b' },
      { label: 'Branches can only go forward', value: 'c' },
      { label: 'The ALU ignores bit 0', value: 'd' },
    ]),
    answer: 'a',
    explain: 'Instructions are 4-byte aligned (2-byte with the C extension), so offsets are even. Dropping the always-zero bit doubles the range.',
  }),
  'lt-flag': () => {
    const a = sval(), b = sval();
    const o = alu(a, b, ALU.SUB);
    return {
      q: `blt compares x5 = ${a} and x6 = ${b}. What is LT?`,
      options: [{ label: '0', value: '0' }, { label: '1', value: '1' }],
      answer: String(o.lt),
      explain: `LT = N ⊕ V from ${a} − ${b}: it is 1 exactly when ${a} < ${b} as signed numbers.`,
    };
  },
  'signed-vs-unsigned-branch': () => {
    const a = -rnd(1, 100), b = rnd(1, 100);
    const u = Math.random() < 0.5;
    const o = alu(a, b, ALU.SUB);
    const take = branchCond(u ? 0b110 : 0b100, o.zero, o.lt, o.ltu).take;
    return {
      q: `x5 = ${h(a)}, x6 = ${b}. Is \`${u ? 'bltu' : 'blt'} x5, x6, label\` taken?`,
      options: [{ label: 'Taken', value: '1' }, { label: 'Not taken', value: '0' }],
      answer: String(take),
      explain: u ? `Unsigned, ${h(a)} is larger than ${b}.` : `Signed, ${a} < ${b}.`,
    };
  },
  'overflow-lt': () => {
    const a = 0x7fffffff - rnd(0, 10), b = -rnd(1, 10);
    const o = alu(a, b, ALU.SUB);
    return {
      q: `blt with x5 = ${h(a)} and x6 = ${b}: the subtraction gives N = ${o.n}, V = ${o.v}. What is LT?`,
      options: [{ label: '0', value: '0' }, { label: '1', value: '1' }],
      answer: String(o.lt),
      explain: 'LT = N ⊕ V. Overflow flips the sign bit, so N alone would be wrong here.',
    };
  },
  'branch-f3': () => {
    const op = pick<Mnemonic>(['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu']);
    const f = DEF[op].funct3!;
    const name = (f & 4 ? (f & 2 ? 'LTU' : 'LT') : 'Zero');
    const ans = f & 1 ? `not ${name}` : name;
    return {
      q: `funct3 = ${bin(f, 3)} for a branch. What condition is it?`,
      options: opts(ans, ['Zero', 'not Zero', 'LT', 'not LT', 'LTU', 'not LTU'].filter((x) => x !== ans).sort(() => Math.random() - 0.5).slice(0, 3)),
      answer: ans,
      explain: `That is ${op}: bit 2 picks equality or less-than, bit 1 signed or unsigned, bit 0 inverts.`,
    };
  },
  'jal-link': () => {
    const pc = rnd(10, 1000) * 4, off = rnd(2, 100) * 4;
    return {
      q: `\`jal x1, +${off}\` is at ${h(pc)}. What is written to x1?`,
      options: opts(h(pc + 4), [h(pc), h(pc + off), h(pc + off + 4)]),
      answer: h(pc + 4),
      explain: 'The link value is the address of the next instruction, PC + 4.',
    };
  },
  'jalr-target': () => {
    const r = rnd(10, 400) * 4, off = pick([0, 4, 8, -4, 1, 3]);
    const t = u32((r + off) & ~1);
    return {
      q: `x5 = ${h(r)}. Where does \`jalr x1, ${off}(x5)\` jump?`,
      options: opts(h(t), [h(r + off), h(r), h(r + off + 4)]),
      answer: h(t),
      explain: `Target = (x5 + ${off}) with bit 0 cleared = ${h(t)}.`,
    };
  },
  'jalr-bit0': () => {
    const r = rnd(10, 400) * 4 + 1;
    const t = u32(r & ~1);
    return {
      q: `x5 = ${h(r)} (odd). Where does \`jalr x0, 0(x5)\` jump?`,
      options: opts(h(t), [h(r), h(r + 1), h(r + 3)]),
      answer: h(t),
      explain: 'jalr clears bit 0 of the computed target.',
    };
  },
  'jtype-imm': () => ({
    q: 'How far can jal reach from its own address?',
    options: shuffle([
      { label: '±1 MiB (21-bit signed byte offset)', value: 'a' },
      { label: '±4 KiB', value: 'b' },
      { label: '±2 KiB', value: 'c' },
      { label: 'Anywhere in the 4 GiB space', value: 'd' },
    ]),
    answer: 'a',
    explain: 'The J immediate is 20 stored bits plus an implicit 0: a 21-bit signed byte offset, −1,048,576 to +1,048,574.',
  }),
  'alusrca-lui': () => {
    const op = pick<Mnemonic>(['lui', 'auipc', 'add', 'lw', 'jalr']);
    const c = mainDecode(DEF[op].opcode).ctrl;
    return {
      q: `What is ALUSrcA for \`${op}\`?`,
      options: [{ label: '00: RD1', value: '0' }, { label: '01: PC', value: '1' }, { label: '10: constant 0', value: '2' }],
      answer: String(c.ALUSrcA),
      explain: op === 'lui' ? 'lui computes 0 + ImmExt.' : op === 'auipc' ? 'auipc computes PC + ImmExt.' : `${op} uses rs1 as operand A.`,
    };
  },
  auipc: () => {
    const pc = rnd(4, 1000) * 4, up = rnd(0, 0xff);
    const r = u32(pc + (up << 12));
    return {
      q: `\`auipc x5, ${hex(up, 2)}\` is at ${h(pc)}. What does x5 get?`,
      options: opts(h(r), [h(up << 12), h(r + 4), h(pc + up)]),
      answer: h(r),
      explain: 'auipc adds the immediate shifted left by 12 to the address of the auipc itself.',
    };
  },
  'li-rounding': () => {
    const v = ((rnd(0x100, 0xfff00) << 12) | rnd(0x800, 0xfff)) | 0;
    const hi = ((v + 0x800) >>> 12) & 0xfffff;
    return {
      q: `\`li x5, ${h(v)}\` becomes lui + addi. Which value does lui load (upper 20 bits)?`,
      options: opts(hex(hi, 5), [hex((v >>> 12) & 0xfffff, 5), hex((hi + 1) & 0xfffff, 5), hex(v & 0xfff, 5)]),
      answer: hex(hi, 5),
      explain: `The low 12 bits ${hex(v & 0xfff, 3)} have bit 11 set, so addi will add ${signExtend(v & 0xfff, 12)}. lui must load one more than the plain upper bits to compensate.`,
    };
  },
  'main-decoder': () => {
    const op = pick<Mnemonic>(['add', 'addi', 'lw', 'sw', 'beq', 'jal', 'jalr', 'lui', 'auipc']);
    const r = mainDecode(DEF[op].opcode);
    const sig = pick((['RegWrite', 'MemWrite', 'ALUSrc', 'Branch', 'Jump'] as const).filter((x) => !r.row!.dc.includes(x)));
    const v = String(r.ctrl[sig]);
    return {
      q: `In the main decoder row for ${r.row!.name} (opcode ${bin(DEF[op].opcode, 7)}), what is ${sig}?`,
      options: [{ label: '0', value: '0' }, { label: '1', value: '1' }],
      answer: v,
      explain: `${r.row!.name}: ${sig} = ${v}${r.row!.dc.includes(sig) ? ' (a don\'t-care, set to 0 here)' : ''}.`,
    };
  },
  'alu-decoder': () => {
    const op = pick<Mnemonic>(['sub', 'sra', 'srai', 'addi', 'add', 'srl', 'beq', 'lw', 'xori', 'sltu']);
    const d = DEF[op];
    const c = mainDecode(d.opcode).ctrl;
    const w = encode(randomInstr(op));
    const f3 = (w >>> 12) & 7;
    const b30 = (w >>> 30) & 1;
    const ans = ALU_NAME[aluDecode(c.ALUOp, f3, b30)];
    return {
      q: `ALUOp = ${bin(c.ALUOp, 2)}, funct3 = ${bin(f3, 3)}, bit 30 = ${b30}. Which operation does the ALU decoder choose?`,
      options: opts(ans, ['add', 'sub', 'sra', 'srl', 'xor', 'sltu'].filter((x) => x !== ans).slice(0, 3)),
      answer: ans,
      explain: (c.ALUOp === 0 ? 'ALUOp 00 always means add (address or link arithmetic).' : c.ALUOp === 1 ? 'ALUOp 01 means subtract, for comparing.' : c.ALUOp === 2 ? 'ALUOp 10 (R-type): the operation is {bit 30, funct3}.' : 'ALUOp 11 (I-type): funct3, and bit 30 only when funct3 = 101 (srli/srai).') + ` This is ${op}.`,
    };
  },
  'imm-scatter': () => ({
    q: 'Why does RISC-V scatter immediate bits across the instruction instead of keeping them contiguous?',
    options: shuffle([
      { label: 'So rs1, rs2, rd and funct3 stay in fixed positions and each immediate bit has few possible sources', value: 'a' },
      { label: 'To make the immediates harder to decode, for security', value: 'b' },
      { label: 'Because the ALU needs the bits in that order', value: 'c' },
      { label: 'To allow larger immediates than a contiguous field would', value: 'd' },
    ]),
    answer: 'a',
    explain: 'Fixed register-field positions let the register file read before decoding; overlapping immediate bit positions across formats keep the immediate mux small. The sign is always bit 31.',
  }),
  'critical-path': () => {
    const d: Delays = { ...DEFAULT_DELAYS, mem: pick([80, 120, 200, 300]), alu: pick([100, 150, 250, 400]), rf: pick([60, 100, 150]) };
    const sumd = criticalSummary(d);
    return {
      q: `Delays: memory ${d.mem} ps, register file ${d.rf} ps, ALU ${d.alu} ps, mux ${d.mux} ps, adder ${d.add} ps. Which instruction has the longest path?`,
      options: opts(sumd.slowest, ['add', 'lw', 'sw', 'beq', 'jal'].filter((x) => x !== sumd.slowest).slice(0, 3)),
      answer: sumd.slowest,
      explain: `Its path is ${sumd.byInstr[sumd.slowest]} ps. A load normally wins because it uses both memories plus the ALU.`,
    };
  },
  'clock-period': () => {
    const d: Delays = { ...DEFAULT_DELAYS, mem: pick([150, 200, 250]), alu: pick([120, 150, 200]) };
    const sumd = criticalSummary(d);
    const wrong = [timingFor('add', d).total, timingFor('beq', d).total, sumd.period + d.setup];
    return {
      q: `With memory ${d.mem} ps and ALU ${d.alu} ps (other delays at their defaults), what is the minimum clock period?`,
      options: opts(`${sumd.period} ps`, wrong.map((x) => `${x} ps`)),
      answer: `${sumd.period} ps`,
      explain: `The period is the slowest instruction's path, ${sumd.slowest}, including setup time.`,
    };
  },
  'verilog-seq': () => ({
    q: 'In Verilog, how should the register file write port be described?',
    options: shuffle([
      { label: 'always @(posedge clk) with non-blocking assignment (<=)', value: 'a' },
      { label: 'assign rf[a3] = wd3;', value: 'b' },
      { label: 'always @(*) with blocking assignment (=)', value: 'c' },
      { label: 'initial begin ... end', value: 'd' },
    ]),
    answer: 'a',
    explain: 'State changes only at the clock edge, so the write is in an edge-triggered always block; non-blocking assignments model all flip-flops updating at once.',
  }),
  'verilog-x0': () => ({
    q: 'How is "x0 always reads 0" usually implemented in RTL?',
    options: shuffle([
      { label: 'Read ports return 0 when the address is 0, and writes to address 0 are ignored', value: 'a' },
      { label: 'Register 0 is reset to 0 every cycle', value: 'b' },
      { label: 'The assembler never generates x0', value: 'c' },
      { label: 'The ALU ignores operands from x0', value: 'd' },
    ]),
    answer: 'a',
    explain: 'No storage is needed for x0: the read mux selects constant 0 and the write enable is gated off for address 0.',
  }),
  'verilog-latch': () => ({
    q: 'An always @(*) block assigns y only inside "if (sel)". What does synthesis produce?',
    options: shuffle([
      { label: 'A latch, because y must hold its value when sel = 0', value: 'a' },
      { label: 'A flip-flop clocked by sel', value: 'b' },
      { label: 'A mux with y = 0 when sel = 0', value: 'c' },
      { label: 'A syntax error', value: 'd' },
    ]),
    answer: 'a',
    explain: 'Every combinational output must be assigned on every path (or given a default at the top of the block); otherwise the tool infers a latch to remember the old value.',
  }),
  'verilog-sra': () => ({
    q: 'Which Verilog expression gives an arithmetic shift right of a 32-bit unsigned wire a by b[4:0]?',
    options: shuffle([
      { label: '$signed(a) >>> b[4:0]', value: 'a' },
      { label: 'a >>> b[4:0]', value: 'b' },
      { label: 'a >> b[4:0]', value: 'c' },
      { label: '-(a >> b[4:0])', value: 'd' },
    ]),
    answer: 'a',
    explain: '>>> is arithmetic only when the operand is signed. On an unsigned wire it shifts in zeros, like >>.',
  }),
};

export function hasGenerator(concept: string): boolean {
  return !!GENERATORS[concept];
}
