import { register, type Example } from './types';
import { hex } from '../sim/bits';

const lw: Example = { asm: 'lw x5, 8(x6)', regs: { 6: 0x1000 }, mem: { 0x1008: 1234 } };
const add: Example = { asm: 'add x5, x6, x7', regs: { 6: 23, 7: 19 } };
const sw: Example = { asm: 'sw x7, 12(x6)', regs: { 6: 0x1000, 7: 0x12345678 } };
const beq: Example = { asm: 'beq x5, x6, +16', pc: 0x10, regs: { 5: 7, 6: 7 } };
const jal: Example = { asm: 'jal x1, +64', pc: 0x10 };
const auipc: Example = { asm: 'auipc x5, 0x1', pc: 0x10 };

const all = ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:ctrl', 'stage:read', 'stage:alu', 'stage:mem', 'stage:wb', 'stage:next'];

export default register({
  id: 11,
  title: 'The complete machine',
  short: 'Complete machine',
  goal: 'The full single-cycle datapath running real programs.',
  level: 11,
  scope: ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra', 'addi', 'andi', 'ori', 'xori', 'slti', 'sltiu', 'slli', 'srli', 'srai', 'lw', 'lb', 'lh', 'lbu', 'lhu', 'sw', 'sb', 'sh', 'beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'jal', 'jalr', 'lui', 'auipc'],
  tool: 'machine',
  steps: [
    {
      title: 'The full datapath',
      text: 'This is the complete single-cycle RV32I processor: every block you added, in the place it was added, with the control unit driving every orange stub. It runs all 37 instructions of the course.',
      camera: 'fit',
      fadeIdle: false,
    },
    {
      title: 'One load, start to finish',
      text: 'Follow `lw x5, 8(x6)` through the whole machine. The PC drives instruction memory, and in parallel the PC + 4 adder starts.',
      example: lw,
      flow: ['stage:pc', 'stage:fetch'],
      camera: 'fit',
    },
    {
      text: 'The instruction fields fan out: {rs1} to the register file, bits 31:7 to the immediate generator, and {opcode}, {funct3}, bit 30 to the control unit.',
      flow: ['stage:decode'],
      fields: ['opcode', 'rs1', 'rd', 'imm'],
      camera: 'fit',
    },
    {
      text: 'The control unit settles: ImmSrc = I, ALUSrcA = 00, ALUSrc = 1, ALUControl = add, MemRead = 1, ResultSrc = 01, RegWrite = 1. The register file reads x6 and the immediate generator produces 8.',
      flow: ['stage:ctrl', 'stage:read'],
      camera: 'fit',
    },
    {
      text: 'The ALU adds 0x1000 + 8 = 0x1008, the data memory reads that word, the load-extend unit passes it unchanged (lw), and the result mux picks it.',
      flow: ['stage:alu', 'stage:mem', 'stage:wb'],
      camera: 'fit',
    },
    {
      text: 'The next PC is chosen: Branch = Jump = 0, so PCSrc = 0 and PC + 4 goes to the PC register. The branch adder and target mux compute values nobody uses.',
      flow: ['stage:next'],
      camera: 'fit',
    },
    {
      edge: true,
      text: 'Clock edge: x5 = 1234 and PC = 0x14, at the same instant. That was one cycle and one instruction.',
      flow: ['c_pc_clk', 'c_rf_clk', 'c_dmem_clk'],
      camera: 'fit',
    },
    {
      title: 'Same hardware, different paths',
      text: 'add uses the register file, ALU and write-back; the memory output and both target paths are idle.',
      example: add,
      flow: all,
      camera: 'fit',
    },
    {
      text: 'sw uses the address path and the store path, writes memory, and writes no register.',
      example: sw,
      flow: all,
      camera: 'fit',
    },
    {
      text: 'beq uses the ALU only to compare, the branch adder for the target, and the PC mux.',
      example: beq,
      flow: all,
      camera: 'fit',
      predict: {
        q: 'x5 = x6 = 7. What does the PC register receive?',
        options: [
          { label: '0x00000014', value: '0x00000014' },
          { label: '0x00000020', value: '0x00000020' },
        ],
        answer: (t) => hex(t.PCNext),
        explain: () => 'Zero = 1 with funct3 = 000 (beq) gives Take = 1; Branch = 1, so PCSrc = 1 and the target 0x10 + 16 = 0x20 is selected.',
        concept: 'branch-target',
      },
    },
    {
      text: 'jal does not use the ALU at all: the target comes from the branch adder and the link value PC + 4 goes through the result mux.',
      example: jal,
      flow: all,
      camera: 'fit',
    },
    {
      text: 'auipc sends the PC into the ALU through the SrcA mux.',
      example: auipc,
      flow: all,
      camera: 'fit',
    },
    {
      title: 'Run real programs',
      text: 'Open the Run programs tab. Step through a loop that sums 1 to 10 and a program that calls a function with jal and returns with jalr. You can set breakpoints, step back, and watch registers, memory and the PC trail.',
      example: add,
      flow: all,
      camera: 'fit',
    },
  ],
  practice: [
    { kind: 'trace', ops: ['lw', 'sw', 'beq', 'jal', 'jalr', 'auipc', 'lui', 'add', 'bltu'], title: 'Trace any instruction on the full machine' },
    { kind: 'control', ops: ['add', 'addi', 'lw', 'sw', 'beq', 'bne', 'jal', 'jalr', 'lui', 'auipc', 'lb', 'sh'], title: 'Set the control signals' },
    { kind: 'draw', subset: 'full', title: 'Draw the datapath from memory' },
    { kind: 'break', title: 'Break the circuit', faults: ['cut:a3', 'cut:imm_to_srcb', 'stuck:PCTargetSrc:1', 'stuck:MemRead:0', 'stuck:ALUSrcA:0', 'cut:result_to_wd3'] },
    { kind: 'design', challenge: 'sh1add', title: 'Design challenges' },
  ],
});
