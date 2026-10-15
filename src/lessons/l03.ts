import { register, type Example } from './types';
import { hex } from '../sim/bits';
import { ALU_NAME } from '../sim/alu';

const addi: Example = { asm: 'addi x5, x6, -12', regs: { 6: 40 } };
const addiBig: Example = { asm: 'addi x5, x6, 1024', regs: { 6: 1 } };
const srai: Example = { asm: 'srai x5, x6, 4', regs: { 6: -256 } };
const sltiu: Example = { asm: 'sltiu x5, x6, -1', regs: { 6: 7 } };
const add: Example = { asm: 'add x5, x6, x7', regs: { 6: 23, 7: 19 } };

const cycle = ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu', 'stage:wb', 'stage:next'];

export default register({
  id: 3,
  title: 'I-type ALU instructions',
  short: 'I-type ALU',
  goal: 'Immediate generator, sign extension and the ALUSrc mux.',
  level: 3,
  scope: ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra', 'addi', 'andi', 'ori', 'xori', 'slti', 'sltiu', 'slli', 'srli', 'srai'],
  steps: [
    {
      title: 'Problem: a constant operand',
      text: '`addi x5, x6, -12` has one register source. The second operand is a constant stored inside the instruction itself. Our circuit can only feed the ALU from registers.',
      example: addi,
      flow: ['stage:pc', 'stage:fetch'],
    },
    {
      title: 'The I-type format',
      text: 'The 12-bit {imm} occupies bits 31:20, where R-type has funct7 and rs2. {rs1}, {funct3}, {rd} and {opcode} stay exactly where they were. The opcode `0010011` means "ALU operation with an immediate".',
      fields: ['imm'],
    },
    {
      title: 'The immediate generator',
      text: 'A new block takes bits 31:7 of the instruction and builds a 32-bit operand, ImmExt. It receives all of 31:7 because other formats (later lessons) keep immediate bits in different places.',
      reveal: ['imm'],
      fields: ['imm'],
      flow: ['w_spine', 'w_spine_imm', 'w_immin'],
      focus: ['immgen'],
      route: 'Bits 31:7 go to the immediate generator; for I-type it uses bits 31:20.',
    },
    {
      title: 'Sign extension',
      text: 'The 12-bit field holds -12 in two\'s complement: `0xFF4`. To use it as a 32-bit operand, the generator copies bit 11 of the immediate, which is instruction bit 31, into all 20 upper bits.',
      imm: 'I',
      predict: {
        q: 'The 12-bit immediate is 0xFF4 (-12). What 32-bit value is ImmExt?',
        options: [
          { label: '0x00000FF4', value: '0x00000ff4' },
          { label: '0xFFFFFFF4', value: '0xfffffff4' },
          { label: '0x0000000C', value: '0x0000000c' },
          { label: '0xFF400000', value: '0xff400000' },
        ],
        answer: (t) => hex(t.ImmExt),
        explain: () => 'Bit 11 of 0xFF4 is 1, so all upper bits become 1: 0xFFFFFFF4, which is still -12. Zero-extending would give 4084 and break every negative constant.',
        concept: 'sign-extension',
      },
      flow: ['immgen', 'c_immsrc'],
      inside: 'immgen',
    },
    {
      title: 'ImmSrc',
      text: 'The generator needs to know the format, because each format scatters its immediate bits differently. A control signal, <ctl>ImmSrc</ctl>, tells it. For every I-type instruction ImmSrc = I.',
      flow: ['immgen', 'c_immsrc'],
      focus: ['immgen'],
    },
    {
      title: 'Two sources for ALU input B',
      text: 'Input B must now come from RD2 for R-type and from ImmExt for I-type. A 2-to-1 multiplexer chooses between them, steered by the control signal <ctl>ALUSrc</ctl>.',
      reveal: ['srcb'],
      flow: ['stage:read'],
      focus: ['srcbmux'],
      inside: 'srcbmux',
    },
    {
      text: 'The mux input labelled 0 is RD2; input 1 is ImmExt.',
      predict: {
        q: 'For `addi x5, x6, -12`, what must ALUSrc be?',
        options: [
          { label: 'ALUSrc = 0 (pass RD2)', value: '0' },
          { label: 'ALUSrc = 1 (pass ImmExt)', value: '1' },
        ],
        answer: (t) => String(t.ctrl.ALUSrc),
        explain: () => 'addi adds the immediate, so the mux must pass ImmExt. RD2 still holds some register value (whatever bits 24:20 name) but it is not used.',
        concept: 'alusrc',
      },
      flow: ['stage:alu'],
    },
    {
      text: 'The ALU adds 40 + (-12) = 28. Write-back is the same as for R-type, so RegWrite = 1.',
      flow: ['stage:wb', 'stage:next'],
    },
    {
      edge: true,
      text: 'At the clock edge x5 becomes 28 and the PC advances by 4.',
      flow: ['c_pc_clk', 'c_rf_clk'],
    },
    {
      title: 'Bit 30 is now part of the immediate',
      text: '`addi x5, x6, 1024` has immediate bit 10 = 1, which lands in instruction bit 30. For R-type, bit 30 meant "subtract".',
      example: addiBig,
      fields: ['imm'],
      flow: ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu'],
      predict: {
        q: 'Instruction bit 30 is 1. Which operation must the ALU perform for this addi?',
        options: [
          { label: 'add', value: 'add' },
          { label: 'sub', value: 'sub' },
        ],
        answer: (t) => ALU_NAME[t.ALUControl],
        explain: () => 'For I-type the ALU decoder ignores bit 30, because it is an immediate bit. The only I-type exception is funct3 = 101, where bit 30 picks srai over srli. So ALUControl = {0, funct3}.',
        concept: 'itype-bit30',
      },
    },
    {
      title: 'Shifts by an immediate',
      text: 'slli, srli and srai can only shift by 0 to 31, so they use just imm[4:0] (called shamt). The upper immediate bits act like funct7: bit 30 = 1 selects srai.',
      example: srai,
      fields: ['funct7', 'imm'],
      flow: cycle,
      route: 'ALUSrc = 1 still passes ImmExt; the ALU uses only its low 5 bits as the shift amount.',
    },
    {
      title: 'sltiu: sign-extend, then compare unsigned',
      text: '`sltiu x5, x6, -1` sign-extends the immediate to `0xFFFFFFFF`, the largest unsigned value, then compares unsigned. So it is 1 for every x6 except 0xFFFFFFFF.',
      example: sltiu,
      flow: cycle,
    },
    {
      title: 'R-type still works',
      text: 'For `add x5, x6, x7`, ALUSrc = 0 passes RD2, and the immediate generator still produces some value from bits 31:7 that nobody uses. Unused outputs are normal in a datapath.',
      example: add,
      flow: cycle,
      panel: 'itype-table',
    },
  ],
  practice: [
    { kind: 'encode', ops: ['addi', 'andi', 'ori', 'xori', 'slti', 'sltiu', 'slli', 'srli', 'srai'], title: 'Encode I-type by hand' },
    { kind: 'decode', ops: ['addi', 'andi', 'ori', 'xori', 'slti', 'sltiu', 'slli', 'srli', 'srai', 'add', 'sub'], title: 'Decode I-type and R-type words' },
    { kind: 'trace', ops: ['addi', 'srai', 'add'], title: 'Trace the path' },
    { kind: 'build', title: 'Build: add the immediate path' },
    { kind: 'quiz', title: 'I-type check', concepts: ['sign-extension', 'alusrc', 'itype-bit30', 'sltiu'] },
  ],
});
