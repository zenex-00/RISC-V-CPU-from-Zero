// Unit tests for the simulator. Runs in the browser (tests.html) and in Node.

import { group, test, eq, ok, throws, rng } from './harness';
import { encode, decode, disasm, type Instr } from '../sim/encode';
import { ISA, DEF, type Mnemonic } from '../sim/isa';
import { immGen, immFromMap, type ImmSrc, IMM_RANGE } from '../sim/immgen';
import { alu, ALU } from '../sim/alu';
import { aluDecode, branchCond, mainDecode, MAIN_TABLE } from '../sim/control';
import { evaluate, commit, newState, run, type MachineState } from '../sim/datapath';
import { assemble, assembleOne } from '../sim/assembler';
import { DMEM_BASE, loadExtend, storeAlign, checkAccess } from '../sim/memory';
import { refStep, type RefState } from './refsim';
import { PROGRAMS } from '../sim/programs';
import { timingFor, DEFAULT_DELAYS, criticalSummary } from '../sim/timing';

const asm1 = (s: string, addr = 0): number => {
  const r = assembleOne(s, addr);
  if (!r.ok) throw new Error(r.error);
  return r.line.word;
};

const stateWith = (program: number[], regs: Record<number, number> = {}): MachineState => {
  const s = newState(program);
  for (const [r, v] of Object.entries(regs)) s.regs[+r] = v >>> 0;
  return s;
};

group('Known encodings', () => {
  const cases: [string, number][] = [
    ['beq x5, x6, +16', 0x00628863],
    ['lw x5, 8(x6)', 0x00832283],
    ['sw x7, 12(x6)', 0x00732623],
    ['add x5, x6, x7', 0x007302b3],
    ['sub x5, x6, x7', 0x407302b3],
    ['addi x5, x6, -1', 0xfff30293],
    ['srai x5, x6, 3', 0x40335293],
    ['sb x7, -1(x6)', 0xfe730fa3],
    ['bne x1, x2, -4', 0xfe209ee3],
    ['lui x5, 0x12345', 0x123452b7],
    ['auipc x5, 0x1', 0x00001297],
    ['jalr x0, 0(x1)', 0x00008067],
    ['jal x0, 0', 0x0000006f],
    ['nop', 0x00000013],
    ['ret', 0x00008067],
    ['jal x1, +8', 0x008000ef],
  ];
  for (const [src, word] of cases) {
    test(`${src} = 0x${word.toString(16).padStart(8, '0')}`, () => {
      eq(asm1(src), word, 'encoding');
      const d = decode(word);
      ok(d.ok, 'decodes');
      if (d.ok) eq(encode(d.d), word, 're-encoding');
    });
  }
});

/** Random valid instruction of the given mnemonic. */
function randomInstr(r: ReturnType<typeof rng>, op: Mnemonic): Instr {
  const d = DEF[op];
  const reg = () => r.int(0, 31);
  let imm = 0;
  if (d.kind === 'shifti') imm = r.int(0, 31);
  else if (d.fmt === 'I' || d.fmt === 'S') imm = r.int(-2048, 2047);
  else if (d.fmt === 'B') imm = r.int(-2048, 2047) * 2;
  else if (d.fmt === 'J') imm = r.int(-524288, 524287) * 2;
  else if (d.fmt === 'U') imm = (r.u32() & 0xfffff000) | 0;
  const uses = { rd: d.fmt !== 'S' && d.fmt !== 'B', rs1: d.fmt !== 'U' && d.fmt !== 'J', rs2: d.fmt === 'R' || d.fmt === 'S' || d.fmt === 'B' };
  return { op, rd: uses.rd ? reg() : 0, rs1: uses.rs1 ? reg() : 0, rs2: uses.rs2 ? reg() : 0, imm };
}

group('Encode / decode round trips', () => {
  for (const def of ISA) {
    test(`${def.name}: 200 random encodings round-trip`, () => {
      const r = rng(0x1234 + def.opcode * 31 + (def.funct3 ?? 0) * 7 + (def.funct7 ?? 0));
      for (let k = 0; k < 200; k++) {
        const ins = randomInstr(r, def.name);
        const w = encode(ins);
        const d = decode(w);
        ok(d.ok, `decode ${w.toString(16)}`);
        if (!d.ok) return;
        eq(d.d.op, ins.op, 'op');
        eq(d.d.rd, ins.rd, 'rd');
        eq(d.d.rs1, ins.rs1, 'rs1');
        eq(d.d.rs2, ins.rs2, 'rs2');
        eq(d.d.imm, ins.imm, 'imm');
        // Text round trip through the assembler (PC-relative offsets).
        eq(asm1(disasm(ins)), w, `assemble(disasm) for ${disasm(ins)}`);
      }
    });
  }
  test('decode rejects SYSTEM and FENCE as out of scope', () => {
    const e = decode(0x00000073);
    ok(!e.ok && /out of scope/.test(e.error), 'ecall rejected');
    const f = decode(0x0ff0000f);
    ok(!f.ok && /out of scope/.test(f.error), 'fence rejected');
  });
  test('decode rejects 0x00000000 and bad funct7', () => {
    ok(!decode(0).ok, 'all-zero word is illegal');
    ok(!decode(0x207302b3).ok, 'funct7 0010000 with add is not RV32I');
    ok(!decode(0x40731293).ok, 'slli with funct7 0100000 is illegal');
  });
});

group('Immediates', () => {
  test('immGen formula and wire map agree on 5000 random words', () => {
    const r = rng(99);
    const srcs: ImmSrc[] = ['I', 'S', 'B', 'U', 'J'];
    for (let k = 0; k < 5000; k++) {
      const w = r.u32();
      for (const s of srcs) eq(immFromMap(w, s), immGen(w, s), `ImmSrc ${s} word ${w.toString(16)}`);
    }
  });
  test('negative immediates are sign-extended', () => {
    eq(immGen(asm1('addi x5, x6, -1'), 'I') >>> 0, 0xffffffff, 'I -1');
    eq(immGen(asm1('addi x5, x6, -2048'), 'I'), -2048, 'I -2048');
    eq(immGen(asm1('sw x7, -2048(x6)'), 'S'), -2048, 'S -2048');
    eq(immGen(asm1('sw x7, -12(x6)'), 'S'), -12, 'S -12');
    eq(immGen(asm1('beq x0, x0, -4096'), 'B'), -4096, 'B -4096');
    eq(immGen(asm1('jal x0, -1048576'), 'J'), -1048576, 'J min');
    eq(immGen(asm1('addi x5, x6, 2047'), 'I'), 2047, 'I max positive stays positive');
  });
  test('full-range B-type offsets encode and decode', () => {
    for (const off of [-4096, -4094, -2, 2, 4, 2046, 2048, 4094]) {
      const w = asm1(`bne x3, x4, ${off}`);
      const d = decode(w);
      ok(d.ok && d.d.imm === off, `offset ${off}`);
    }
    throws(() => asm1('beq x1, x2, 4096'), 'B +4096 out of range', /out of range/);
    throws(() => asm1('beq x1, x2, -4098'), 'B -4098 out of range', /out of range/);
    throws(() => asm1('beq x1, x2, 6+1'), 'B odd', /number|label/);
    throws(() => asm1('beq x1, x2, 7'), 'B odd offset', /even/);
  });
  test('full-range J-type offsets encode and decode', () => {
    for (const off of [-1048576, -1048574, -2, 2, 2048, 4096, 524288, 1048574]) {
      const w = asm1(`jal x1, ${off}`);
      const d = decode(w);
      ok(d.ok && d.d.imm === off, `offset ${off}`);
    }
    throws(() => asm1('jal x1, 1048576'), 'J +2^20 out of range', /out of range/);
    throws(() => asm1('jal x1, 3'), 'J odd', /even/);
  });
  test('I-type range is -2048..2047', () => {
    throws(() => asm1('addi x1, x1, 2048'), '2048', /out of range/);
    throws(() => asm1('addi x1, x1, -2049'), '-2049', /out of range/);
    eq(IMM_RANGE.I.max, 2047, 'max');
  });
});

group('ALU and comparisons', () => {
  test('signed versus unsigned less-than', () => {
    eq(alu(-1, 1, ALU.SLT).y, 1, 'slt -1 < 1');
    eq(alu(-1, 1, ALU.SLTU).y, 0, 'sltu 0xFFFFFFFF < 1 is false');
    eq(alu(1, -1, ALU.SLTU).y, 1, 'sltu 1 < 0xFFFFFFFF');
    eq(alu(0x80000000, 1, ALU.SLT).y, 1, 'slt most-negative < 1 (overflow case)');
    eq(alu(0x7fffffff, -1, ALU.SLT).y, 0, 'slt 0x7FFFFFFF < -1 is false (overflow case)');
    eq(alu(5, 5, ALU.SLT).y, 0, 'equal is not less');
  });
  test('branch conditions use funct3 bits correctly', () => {
    const r = rng(7);
    const ops: [Mnemonic, (a: number, b: number) => boolean][] = [
      ['beq', (a, b) => a === b], ['bne', (a, b) => a !== b],
      ['blt', (a, b) => (a | 0) < (b | 0)], ['bge', (a, b) => (a | 0) >= (b | 0)],
      ['bltu', (a, b) => a >>> 0 < b >>> 0], ['bgeu', (a, b) => a >>> 0 >= b >>> 0],
    ];
    const vals = [0, 1, -1, 0x7fffffff, 0x80000000, 2, -2];
    for (let k = 0; k < 400; k++) {
      const a = k < 49 ? vals[k % 7] : r.u32();
      const b = k < 49 ? vals[Math.floor(k / 7)] : r.int(0, 3) === 0 ? a : r.u32();
      const f = alu(a, b, ALU.SUB);
      for (const [op, ref] of ops) {
        eq(branchCond(DEF[op].funct3!, f.zero, f.lt, f.ltu).take, ref(a >>> 0, b >>> 0) ? 1 : 0, `${op} ${a} ${b}`);
      }
    }
  });
  test('sra copies the sign bit, srl fills with zeros', () => {
    eq(alu(0x80000000, 4, ALU.SRA).y, 0xf8000000, 'sra');
    eq(alu(0x80000000, 4, ALU.SRL).y, 0x08000000, 'srl');
    eq(alu(0x40000000, 4, ALU.SRA).y, 0x04000000, 'sra positive');
    eq(alu(1, 33, ALU.SLL).y, 2, 'shift amount uses low 5 bits');
  });
  test('sub is selected by funct7 bit 30 for R-type only', () => {
    const add = asm1('add x5, x6, x7');
    const sub = asm1('sub x5, x6, x7');
    eq((add ^ sub) >>> 0, 0x40000000, 'add and sub differ only in bit 30');
    eq(aluDecode(2, 0b000, 1), ALU.SUB, 'R-type, bit30 = 1 -> sub');
    eq(aluDecode(2, 0b000, 0), ALU.ADD, 'R-type, bit30 = 0 -> add');
    eq(aluDecode(3, 0b000, 1), ALU.ADD, 'addi with imm bit 10 set must still add');
    eq(aluDecode(3, 0b101, 1), ALU.SRA, 'srai');
    eq(aluDecode(3, 0b101, 0), ALU.SRL, 'srli');
    const s = stateWith([asm1('addi x5, x6, 1024')], { 6: 1 });
    const t = evaluate(s);
    eq(t.b30, 1, 'bit 30 is set by imm 1024');
    eq(t.ALUResult, 1025, 'addi x5, x6, 1024 adds');
  });
  test('add/sub trick: subtract is A + ~B + 1', () => {
    const r = rng(3);
    for (let k = 0; k < 200; k++) {
      const a = r.u32();
      const b = r.u32();
      const o = alu(a, b, ALU.SUB);
      eq(o.sum, (a + ((~b) >>> 0) + 1) >>> 0, 'sum');
      eq(o.y, (a - b) >>> 0, 'difference');
    }
  });
});

group('Datapath and state', () => {
  test('jalr clears bit 0 of the target and links PC + 4', () => {
    const s = stateWith([asm1('jalr x1, 1(x5)')], { 5: 0x100 });
    const t = evaluate(s);
    eq(t.ALUResult, 0x101, 'ALU computes rs1 + imm');
    eq(t.PCNext, 0x100, 'PC gets the sum with bit 0 cleared');
    commit(s, t);
    eq(s.regs[1], 4, 'x1 = PC + 4');
    eq(s.pc, 0x100, 'pc');
  });
  test('jalr with rd = rs1 uses the old value for the target', () => {
    const s = stateWith([asm1('jalr x5, 8(x5)')], { 5: 0x40 });
    const t = evaluate(s);
    commit(s, t);
    eq(s.pc, 0x48, 'target from old x5');
    eq(s.regs[5], 4, 'x5 = return address');
  });
  test('x0 is never written and always reads 0', () => {
    const s = stateWith([asm1('addi x0, x0, 5'), asm1('add x0, x1, x1'), asm1('lui x0, 0xfffff'), asm1('add x2, x0, x0')], { 1: 7 });
    for (let k = 0; k < 4; k++) commit(s, evaluate(s));
    eq(s.regs[0], 0, 'x0');
    eq(s.regs[2], 0, 'reads of x0 give 0');
    const t = evaluate(stateWith([asm1('addi x0, x0, 5')]));
    ok(t.regWrite && t.regWrite.ignored, 'trace marks the x0 write as ignored');
  });
  test('misaligned and out-of-range data accesses fault', () => {
    const lw = evaluate(stateWith([asm1('lw x5, 2(x6)')], { 6: DMEM_BASE }));
    ok(lw.fault && /misaligned/.test(lw.fault), 'lw at +2 is misaligned');
    const lh = evaluate(stateWith([asm1('lh x5, 1(x6)')], { 6: DMEM_BASE }));
    ok(lh.fault && /misaligned/.test(lh.fault), 'lh at odd address');
    const lb = evaluate(stateWith([asm1('lb x5, 1(x6)')], { 6: DMEM_BASE }));
    ok(!lb.fault, 'lb at odd address is fine');
    const sw = evaluate(stateWith([asm1('sw x5, 0(x0)')]));
    ok(sw.fault && /outside data memory/.test(sw.fault), 'store to 0 is outside DMEM');
    const top = evaluate(stateWith([asm1('lw x5, -4(x6)')], { 6: DMEM_BASE + 4096 }));
    ok(!top.fault, 'last word is in range');
    const over = evaluate(stateWith([asm1('lw x5, 0(x6)')], { 6: DMEM_BASE + 4096 }));
    ok(over.fault && /outside/.test(over.fault), 'one past the end faults');
    eq(checkAccess(DMEM_BASE + 4094, 0b001, false), null, 'lh at last halfword');
  });
  test('load extension and store byte enables', () => {
    eq(loadExtend(0x00008000, 0, 0b001), 0xffff8000, 'lh sign-extends');
    eq(loadExtend(0x00008000, 0, 0b101), 0x00008000, 'lhu zero-extends');
    eq(loadExtend(0x80000000, 3, 0b000), 0xffffff80, 'lb lane 3');
    eq(loadExtend(0x80000000, 3, 0b100), 0x80, 'lbu lane 3');
    eq(storeAlign(0x12345678, 1, 0b000).be, 0b0010, 'sb lane 1');
    eq(storeAlign(0x12345678, 1, 0b000).wd, 0x78787878, 'sb replicates the byte');
    eq(storeAlign(0x12345678, 2, 0b001).be, 0b1100, 'sh upper half');
    const s = stateWith([asm1('sb x7, 1(x6)')], { 6: DMEM_BASE, 7: 0xab });
    s.dmem.setWord(DMEM_BASE, 0x11223344);
    commit(s, evaluate(s));
    eq(s.dmem.readWord(DMEM_BASE), 0x1122ab44, 'only byte 1 changes');
  });
  test('datapath matches the reference model on 6000 random instructions', () => {
    const r = rng(2024);
    const ops = ISA.map((d) => d.name);
    for (let k = 0; k < 6000; k++) {
      const op = r.pick(ops);
      const ins = randomInstr(r, op);
      const def = DEF[op];
      // Keep memory accesses legal: point rs1 at data memory and align the immediate.
      const s = newState([]);
      for (let i = 1; i < 32; i++) s.regs[i] = r.int(0, 3) === 0 ? r.int(-8, 8) >>> 0 : r.u32();
      if (def.kind === 'load' || def.kind === 'store') {
        const size = 1 << ((def.funct3 ?? 0) & 3);
        ins.imm = Math.floor(ins.imm / size) * size;
        if (ins.rs1 === 0) ins.rs1 = 1;
        s.regs[ins.rs1] = (DMEM_BASE + 2048 - ins.imm + r.int(0, 255) * 4) >>> 0;
      }
      const pc = r.int(0, 255) * 4;
      s.pc = pc;
      s.imem[pc >>> 2] = encode(ins);
      for (let a = 0; a < 4096; a += 4) s.dmem.setWord(DMEM_BASE + a, (a * 2654435761) >>> 0);
      const ref: RefState = { pc, regs: Array.from(s.regs), mem: new Map() };
      for (let a = 0; a < 4096; a++) ref.mem.set(DMEM_BASE + a, s.dmem.bytes[a]);
      const t = evaluate(s);
      ok(!t.fault, `no fault for ${disasm(ins)}: ${t.fault}`);
      commit(s, t);
      refStep(ref, ins);
      eq(s.pc, ref.pc, `PC after ${disasm(ins)}`);
      for (let i = 0; i < 32; i++) if (s.regs[i] !== ref.regs[i]) eq(s.regs[i], ref.regs[i], `x${i} after ${disasm(ins)}`);
      if (def.kind === 'store')
        for (let a = 0; a < 4096; a++) if (s.dmem.bytes[a] !== ref.mem.get(DMEM_BASE + a)) eq(s.dmem.bytes[a], ref.mem.get(DMEM_BASE + a), `byte ${a} after ${disasm(ins)}`);
    }
  });
  test('every main-decoder row matches the opcode table', () => {
    for (const d of ISA) {
      const m = mainDecode(d.opcode);
      ok(m.row, `${d.name} has a control row`);
    }
    eq(MAIN_TABLE.length, 9, 'nine instruction classes');
  });
  test('stuck-at RegWrite = 0 stops every register write', () => {
    const s = stateWith([asm1('addi x5, x0, 9')]);
    const t = evaluate(s, { faults: [{ kind: 'stuck', signal: 'RegWrite', value: 0 }] });
    eq(t.regWrite, null, 'no write');
  });
  test('cut Zero wire: beq never taken', () => {
    const s = stateWith([asm1('beq x0, x0, +16')]);
    eq(evaluate(s).PCNext, 16, 'normal: taken');
    eq(evaluate(s, { faults: [{ kind: 'cut', wire: 'zero_to_branch' }] }).PCNext, 4, 'cut: not taken');
  });
});

group('Assembler', () => {
  test('labels resolve to PC-relative offsets', () => {
    const r = assemble('start: addi x1, x0, 1\nloop: beq x1, x0, start\n j loop\n');
    ok(r.ok, r.errors.map((e) => e.msg).join('; '));
    eq(decode(r.words[1]).ok && (decode(r.words[1]) as { ok: true; d: Instr }).d.imm, -4, 'beq back to start');
    eq((decode(r.words[2]) as { ok: true; d: Instr }).d.imm, -4, 'j loop');
  });
  test('li expands to addi or lui + addi', () => {
    const cases = [0, 5, -1, 2047, -2048, 2048, 0x12345678, 0x12345fff, 0x7ffff800, 0xffffffff, -2049, 0x80000000];
    for (const v of cases) {
      const r = assemble(`li x5, ${v}`);
      ok(r.ok, `li ${v}`);
      const s = newState(r.words);
      run(s, {}, r.words.length);
      eq(s.regs[5], v >>> 0, `li ${v} result`);
      eq(r.words.length, (v | 0) >= -2048 && (v | 0) <= 2047 ? 1 : 2, `li ${v} size`);
    }
  });
  test('pseudo-instructions mv, j, ret, nop, call', () => {
    const r = assemble('nop\nmv a0, t0\nj end\ncall f\nend: ret\nf: ret');
    ok(r.ok, r.errors.map((e) => e.msg).join('; '));
    eq(r.words[0], 0x13, 'nop');
    eq(r.words[1], asm1('addi x10, x5, 0'), 'mv');
    eq(r.words[2], asm1('jal x0, +8'), 'j');
    eq(r.words[3], asm1('jal x1, +8'), 'call');
    eq(r.words[4], 0x8067, 'ret');
  });
  test('errors name the line and the problem', () => {
    const r = assemble('addi x1, x0, 1\nfoo x1, x2\nadd x1, x2\nbeq x1, x2, nowhere\nlw x1, x2');
    eq(r.errors.length, 4, 'four errors');
    eq(r.errors[0].line, 2, 'line of unknown op');
    ok(/unknown instruction/.test(r.errors[0].msg), 'unknown instruction message');
    ok(/expects 3/.test(r.errors[1].msg), 'operand count');
    ok(/unknown label/.test(r.errors[2].msg), 'label');
    ok(/offset\(register\)/.test(r.errors[3].msg), 'memory operand form');
  });
  test('ecall is reported as out of scope', () => {
    const r = assemble('ecall');
    ok(!r.ok && /out of scope/.test(r.errors[0].msg), 'out of scope');
  });
});

group('Programs', () => {
  for (const p of PROGRAMS) {
    test(`${p.name} produces the expected result`, () => {
      const a = assemble(p.source);
      ok(a.ok, a.errors.map((e) => `line ${e.line}: ${e.msg}`).join('; '));
      const s = newState(a.words);
      p.setup?.(s);
      const res = run(s, {}, 5000);
      eq(res.halted, 'loop', 'halts at j .');
      const e = p.check(s);
      ok(!e, e ?? "");
    });
  }
});

group('Timing', () => {
  test('lw is the slowest instruction with default delays', () => {
    const sum = criticalSummary(DEFAULT_DELAYS);
    eq(sum.slowest, 'lw', 'slowest class');
    ok(sum.byInstr.lw > sum.byInstr.add, 'load slower than R-type');
  });
  test('critical path of lw goes through both memories and the ALU', () => {
    const t = timingFor('lw', DEFAULT_DELAYS);
    for (const n of ['imem', 'rf', 'alu', 'dmem', 'resmux']) ok(t.path.includes(n), `path includes ${n}`);
  });
  test('raising the ALU delay raises add and lw equally', () => {
    const d2 = { ...DEFAULT_DELAYS, alu: DEFAULT_DELAYS.alu + 100 };
    eq(timingFor('lw', d2).total - timingFor('lw', DEFAULT_DELAYS).total, 100, 'lw +100');
    eq(timingFor('add', d2).total - timingFor('add', DEFAULT_DELAYS).total, 100, 'add +100');
  });
});
