import { register, type Example } from './types';
import { ALU_NAME } from '../sim/alu';

const add: Example = { asm: 'add x5, x6, x7', regs: { 6: 23, 7: 19 } };
const sub: Example = { asm: 'sub x5, x6, x7', regs: { 6: 23, 7: 19 } };
const slt: Example = { asm: 'slt x5, x6, x7', regs: { 6: -5, 7: 3 } };
const sltu: Example = { asm: 'sltu x5, x6, x7', regs: { 6: -5, 7: 3 } };
const sra: Example = { asm: 'sra x5, x6, x7', regs: { 6: -64, 7: 2 } };
const srl: Example = { asm: 'srl x5, x6, x7', regs: { 6: -64, 7: 2 } };
const x0: Example = { asm: 'add x0, x6, x7', regs: { 6: 23, 7: 19 } };

const cycle = ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu', 'stage:wb', 'stage:next'];

export default register({
  id: 2,
  title: 'R-type instructions',
  short: 'R-type',
  goal: 'Register file, ALU, write-back, RegWrite and ALU operation selection.',
  level: 2,
  scope: ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra'],
  steps: [
    {
      title: 'Problem: the fetched word does nothing yet',
      text: 'We fetch `add x5, x6, x7`, but nothing executes it. It needs the values held in x6 and x7, an adder, and a way to put the sum into x5.',
      example: add,
      flow: ['stage:pc', 'stage:fetch'],
    },
    {
      title: 'The R-type format',
      text: 'The {opcode} `0110011` means "register-register ALU operation". {funct3} and {funct7} choose which operation. {rs1}, {rs2} and {rd} are 5-bit register numbers, enough to name x0 to x31.',
      fields: ['opcode', 'funct3', 'funct7'],
    },
    {
      title: 'The register file',
      text: 'The register file holds the 32 registers. It has two read ports, so two registers can be read in the same cycle, and one write port. Reads are combinational; the write happens only at the clock edge.',
      reveal: ['rf'],
      focus: ['rf'],
      inside: 'rf',
    },
    {
      text: 'The {rs1} field goes straight from the instruction to read address A1. No decoding is needed first: rs1 sits in the same bits in every format that has it.',
      fields: ['rs1'],
      flow: ['w_spine', 'w_a1'],
      route: 'Bits 19:15 (rs1 = 6) go to the register file as read address A1.',
    },
    {
      text: 'The {rs2} field goes to read address A2 in the same way.',
      fields: ['rs2'],
      flow: ['w_a2'],
      route: 'Bits 24:20 (rs2 = 7) go to the register file as read address A2.',
    },
    {
      title: 'The ALU',
      text: 'The arithmetic logic unit computes a function of inputs A and B. RD1 drives A and RD2 drives B. As soon as the addresses settle, RD1 = 23 and RD2 = 19 appear on the outputs.',
      reveal: ['alu'],
      flow: ['rf', 'stage:read'],
      focus: ['alu'],
    },
    {
      title: 'Choosing the operation',
      text: 'The ALU has to know which operation to do. For R-type, the operation is fully named by {funct3} and bit 30, which is bit 5 of {funct7}. Here funct3 = 000 and bit 30 = 0: add.',
      fields: ['funct3', 'funct7'],
      flow: ['alu', 'c_alucontrol', 'w_rd1_direct', 'w_rd2_direct'],
      inside: 'alu',
      route: 'ALUControl = {bit 30, funct3} = 0000 means add. The control unit that produces it is built in Lesson 10; for now we read the signal.',
    },
    {
      title: 'sub differs by one bit',
      text: '`sub x5, x6, x7` is identical to add except bit 30 = 1. Inside the ALU, subtraction is addition of the inverted B plus a carry-in of 1, so the same adder does both.',
      example: sub,
      fields: ['funct7'],
      flow: ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu'],
      predict: {
        q: 'x6 = 23 and x7 = 19. What does the ALU output for `sub x5, x6, x7`?',
        options: [
          { label: '42', value: '42' },
          { label: '4', value: '4' },
          { label: '-4', value: '-4' },
          { label: '23', value: '23' },
        ],
        answer: (t) => String(t.ALUResult | 0),
        explain: (t) => `Bit 30 = 1 selects ${ALU_NAME[t.ALUControl]}: A + ~B + 1 = 23 - 19 = 4. Only funct7 bit 5 changed between add and sub.`,
        concept: 'alu-sub-bit30',
      },
    },
    {
      title: 'Write-back',
      text: 'The result must go into {rd}. ALUResult is wired to the write data port WD3, and the {rd} field selects the register through write address A3.',
      reveal: ['wb'],
      example: add,
      fields: ['rd'],
      flow: ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu', 'stage:wb'],
      route: 'Bits 11:7 (rd = 5) go to the register file as write address A3.',
    },
    {
      title: 'RegWrite',
      text: '<ctl>RegWrite</ctl> = 1 enables the write port. Without an enable, every instruction would overwrite some register at every clock edge. Stores and branches will set RegWrite = 0.',
      flow: ['c_regwrite'],
      focus: ['rf'],
    },
    {
      title: 'The clock edge',
      text: 'At the rising edge two state elements update at the same instant: x5 becomes 42 and the PC becomes PC + 4. Until then the old x5 is still readable, which is why reading and writing the same register in one instruction is safe.',
      edge: true,
      flow: ['c_pc_clk', 'c_rf_clk'],
    },
    {
      title: 'Signed comparison: slt',
      text: '`slt` writes 1 when rs1 < rs2 as signed numbers. The ALU subtracts and looks at the sign of the true difference, correcting for overflow.',
      example: slt,
      flow: cycle,
      fields: ['funct3'],
    },
    {
      title: 'Same bits, unsigned',
      text: '`sltu` compares the same bit patterns as unsigned numbers. x6 holds `0xFFFFFFFB`.',
      example: sltu,
      flow: ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu'],
      predict: {
        q: 'x6 = 0xFFFFFFFB (-5 as signed) and x7 = 3. What does `sltu x5, x6, x7` write to x5?',
        options: [
          { label: '1', value: '1' },
          { label: '0', value: '0' },
        ],
        answer: (t) => String(t.ALUResult),
        explain: () => 'As an unsigned number 0xFFFFFFFB is 4,294,967,291, which is not less than 3, so sltu gives 0. slt on the same bits gives 1 because -5 < 3.',
        concept: 'signed-vs-unsigned',
      },
    },
    {
      text: 'For sltu the ALU uses the carry out of A + ~B + 1: no carry out means A < B as unsigned numbers. For slt it uses the sign of the difference corrected for overflow (N xor V).',
      flow: ['stage:wb'],
      inside: 'alu',
    },
    {
      title: 'Shifts use only 5 bits of rs2',
      text: '`sra x5, x6, x7` shifts x6 right by x7[4:0]. A 32-bit value can only be shifted by 0 to 31, so the upper 27 bits of rs2 are ignored. sra copies the sign bit into the vacated bits.',
      example: sra,
      flow: cycle,
    },
    {
      text: 'srl differs from sra only in bit 30, and fills the vacated bits with zeros instead.',
      example: srl,
      flow: ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu'],
      predict: {
        q: 'x6 = -64 = 0xFFFFFFC0 and x7 = 2. What does `srl x5, x6, x7` produce?',
        options: [
          { label: '-16 (0xFFFFFFF0)', value: '0xfffffff0' },
          { label: '0x3FFFFFF0', value: '0x3ffffff0' },
          { label: '-256', value: '0xffffff00' },
          { label: '16', value: '0x00000010' },
        ],
        answer: (t) => '0x' + t.ALUResult.toString(16).padStart(8, '0'),
        explain: () => 'A logical shift brings in zeros at the top: 0xFFFFFFC0 >> 2 = 0x3FFFFFF0. sra would give 0xFFFFFFF0 = -16.',
        concept: 'sra-vs-srl',
      },
    },
    {
      text: 'Write-back works exactly as for add. Note that the shift amount came from a register here; slli, srli and srai in Lesson 3 take it from the instruction.',
      flow: ['stage:wb', 'stage:next'],
    },
    {
      title: 'x0 is always zero',
      text: '`add x0, x6, x7` computes 42 and asks to write x0. The register file ignores writes to x0, and reading x0 always gives 0. That gives a free constant zero and a place to discard results.',
      example: x0,
      flow: cycle,
      fields: ['rd'],
      inside: 'rf',
    },
    {
      text: 'At the edge only the PC changes. Every R-type instruction uses exactly this path; only the ALU operation differs.',
      edge: true,
      flow: ['c_pc_clk', 'c_rf_clk'],
      panel: 'rtype-table',
    },
  ],
  practice: [
    { kind: 'encode', ops: ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra'], title: 'Encode R-type by hand' },
    { kind: 'decode', ops: ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra'], title: 'Decode R-type words' },
    { kind: 'trace', ops: ['add', 'sub', 'xor'], title: 'Trace the R-type path' },
    { kind: 'build', title: 'Build the R-type datapath' },
    { kind: 'quiz', title: 'R-type check', concepts: ['alu-sub-bit30', 'signed-vs-unsigned', 'sra-vs-srl', 'x0-write'] },
  ],
});
