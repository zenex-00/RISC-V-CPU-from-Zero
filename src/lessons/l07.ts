import { register, type Example } from './types';
import { hex } from '../sim/bits';

const bne: Example = { asm: 'bne x5, x6, +12', pc: 0x10, regs: { 5: 7, 6: 9 } };
const blt: Example = { asm: 'blt x5, x6, +12', pc: 0x10, regs: { 5: -3, 6: 2 } };
const bltu: Example = { asm: 'bltu x5, x6, +12', pc: 0x10, regs: { 5: -3, 6: 2 } };
const ovf: Example = { asm: 'blt x5, x6, +12', pc: 0x10, regs: { 5: 0x7fffffff, 6: -1 } };
const bge: Example = { asm: 'bge x5, x6, -16', pc: 0x30, regs: { 5: 5, 6: 5 } };

const front = ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu'];
const cycle = [...front, 'stage:mem', 'stage:wb', 'stage:next'];

export default register({
  id: 7,
  title: 'Branches, part 2',
  short: 'All branches',
  goal: 'How funct3 drives the condition logic; signed versus unsigned.',
  level: 7,
  scope: ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra', 'addi', 'andi', 'ori', 'xori', 'slti', 'sltiu', 'slli', 'srli', 'srai', 'lw', 'lb', 'lh', 'lbu', 'lhu', 'sw', 'sb', 'sh', 'beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu'],
  steps: [
    {
      title: 'Problem: only one condition',
      text: 'RV32I has six branches: beq, bne, blt, bge, bltu, bgeu. Our AND gate only sees Zero, so every branch would behave like beq. `bne x5, x6, +12` would branch on equality, the opposite of what it means.',
      example: bne,
      flow: front,
    },
    {
      title: 'Two more flags from the subtraction',
      text: 'The ALU already computes x5 − x6 for every branch. Besides Zero it can report **LT** (signed less-than, N ⊕ V) and **LTU** (unsigned less-than, no carry out). These come almost for free from the same adder.',
      reveal: ['brcond'],
      flow: ['w_zero', 'w_lt', 'w_ltu'],
      inside: 'alu',
    },
    {
      title: 'funct3 picks the condition',
      text: 'A small condition block chooses with {funct3}: bit 2 picks equality or less-than, bit 1 picks signed or unsigned, bit 0 inverts the result. The opcode is the same for all six branches.',
      fields: ['funct3'],
      flow: ['brcond', 'c_br_f3'],
      focus: ['brcond'],
      inside: 'brcond',
      panel: 'branch-f3',
    },
    {
      text: 'For bne, funct3 = 001: equality, inverted. Zero = 0 because 7 − 9 ≠ 0, so the condition is true and the branch is taken.',
      flow: ['stage:next'],
    },
    {
      title: 'Signed: blt',
      text: '`blt x5, x6, +12` with x5 = −3 and x6 = 2.',
      example: blt,
      flow: front,
      fields: ['funct3'],
      predict: {
        q: 'x5 = −3 (0xFFFFFFFD) and x6 = 2. What is the LT flag?',
        options: [
          { label: 'LT = 1', value: '1' },
          { label: 'LT = 0', value: '0' },
        ],
        answer: (t) => String(t.LT),
        explain: () => '−3 − 2 = −5: the sign bit N = 1 and there is no overflow (V = 0), so LT = N ⊕ V = 1. As signed numbers −3 < 2.',
        concept: 'lt-flag',
      },
    },
    {
      text: 'funct3 = 100 picks LT without inversion, so the branch is taken to 0x1C.',
      flow: ['stage:next'],
    },
    {
      title: 'Same bits, unsigned: bltu',
      text: '`bltu` compares the same register contents as unsigned numbers. 0xFFFFFFFD is then 4,294,967,293.',
      example: bltu,
      flow: front,
      predict: {
        q: 'Is `bltu x5, x6, +12` taken with x5 = 0xFFFFFFFD and x6 = 2?',
        options: [
          { label: 'Taken: next PC = 0x1C', value: '0x0000001c' },
          { label: 'Not taken: next PC = 0x14', value: '0x00000014' },
        ],
        answer: (t) => hex(t.PCNext),
        explain: () => 'Unsigned, 0xFFFFFFFD is huge, so it is not less than 2. The subtraction produces a carry out (no borrow), LTU = 0, and the PC goes to PC + 4. The hardware is identical; only funct3 bit 1 changed.',
        concept: 'signed-vs-unsigned-branch',
      },
      fields: ['funct3'],
    },
    {
      text: 'funct3 = 110 picks LTU = 0, so PCSrc = 0.',
      flow: ['stage:next'],
    },
    {
      title: 'Why LT needs the overflow bit',
      text: '`blt x5, x6` with x5 = 0x7FFFFFFF (the largest positive number) and x6 = −1. The true difference 2,147,483,648 does not fit in 32 bits, so the subtraction overflows and its sign bit N reads 1.',
      example: ovf,
      flow: front,
      inside: 'alu',
      predict: {
        q: 'N = 1 and the overflow flag V = 1. What is LT = N ⊕ V, and is the branch taken?',
        options: [
          { label: 'LT = 1, taken', value: '1' },
          { label: 'LT = 0, not taken', value: '0' },
        ],
        answer: (t) => String(t.LT),
        explain: () => 'N ⊕ V = 1 ⊕ 1 = 0: correctly, 2,147,483,647 is not less than −1. Using N alone would have branched wrongly.',
        concept: 'overflow-lt',
      },
    },
    {
      title: 'bge closes a loop',
      text: '`bge x5, x6, -16` is blt inverted (funct3 = 101). With x5 = x6, "greater than or equal" holds, so it branches back 16 bytes.',
      example: bge,
      flow: cycle,
      fields: ['funct3'],
    },
    {
      edge: true,
      text: 'At the edge the PC becomes 0x20. The assembler also offers bgt, ble, bgtu and bleu: they are blt, bge, bltu and bgeu with rs1 and rs2 swapped, so no extra hardware is needed.',
      flow: ['c_pc_clk'],
    },
  ],
  practice: [
    { kind: 'encode', ops: ['bne', 'blt', 'bge', 'bltu', 'bgeu'], title: 'Encode branches' },
    { kind: 'decode', ops: ['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu'], title: 'Decode branches' },
    { kind: 'control', ops: ['bne', 'blt', 'bgeu', 'sw'], title: 'Set the control signals' },
    { kind: 'trace', ops: ['blt', 'bne'], title: 'Trace a branch' },
    { kind: 'build', title: 'Build: the condition logic' },
    { kind: 'break', title: 'Break the circuit', faults: ['stuck:PCSrc:0', 'cut:zero_to_branch', 'stuck:Branch:0', 'stuck:Branch:1'] },
    { kind: 'quiz', title: 'Branch check', concepts: ['lt-flag', 'signed-vs-unsigned-branch', 'overflow-lt', 'branch-f3'] },
  ],
});
