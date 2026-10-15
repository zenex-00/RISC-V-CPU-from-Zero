import { register, type Example } from './types';
import { bin } from '../sim/bits';

const sw: Example = { asm: 'sw x7, 12(x6)', regs: { 6: 0x1000, 7: 0x12345678 }, mem: { 0x100c: 0xaaaaaaaa } };
const sb: Example = { asm: 'sb x7, 13(x6)', regs: { 6: 0x1000, 7: 0x12345678 }, mem: { 0x100c: 0xaaaaaaaa } };
const sh: Example = { asm: 'sh x7, 14(x6)', regs: { 6: 0x1000, 7: 0x12345678 }, mem: { 0x100c: 0xaaaaaaaa } };
const swNeg: Example = { asm: 'sw x7, -8(x6)', regs: { 6: 0x1010, 7: 5 } };

const front = ['stage:pc', 'stage:fetch', 'stage:decode', 'stage:read', 'stage:alu'];
const cycle = [...front, 'stage:mem', 'stage:wb', 'stage:next'];

export default register({
  id: 5,
  title: 'Stores',
  short: 'Stores',
  goal: 'The split S-type immediate, MemWrite and byte enables.',
  level: 5,
  scope: ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra', 'addi', 'andi', 'ori', 'xori', 'slti', 'sltiu', 'slli', 'srli', 'srai', 'lw', 'lb', 'lh', 'lbu', 'lhu', 'sw', 'sb', 'sh'],
  steps: [
    {
      title: 'Problem: writing memory',
      text: '`sw x7, 12(x6)` stores the value of x7 at address x6 + 12. It needs two registers, a base and a value, and it has no destination register.',
      example: sw,
      flow: ['stage:pc', 'stage:fetch'],
    },
    {
      title: 'The S-type format',
      text: 'Both source registers stay exactly where R-type has them: {rs1} in 19:15 and {rs2} in 24:20. With no rd, the 12-bit immediate is split: imm[11:5] takes the funct7 slot and imm[4:0] takes the rd slot.',
      fields: ['imm', 'rs1', 'rs2'],
      imm: 'S',
    },
    {
      title: 'Why split the immediate?',
      text: 'Keeping rs1 and rs2 in fixed positions lets the register file start reading at once, in every format, before the instruction is decoded. The cost is a little wiring in the immediate generator, which is cheap. <ctl>ImmSrc</ctl> = S tells it this layout.',
      fields: ['imm'],
      imm: 'S',
      flow: ['stage:decode', 'stage:read'],
      predict: {
        q: 'Bits 31:25 are 0000000 and bits 11:7 are 01100. What offset does the immediate generator produce?',
        options: [
          { label: '12', value: '12' },
          { label: '6', value: '6' },
          { label: '384', value: '384' },
          { label: '-12', value: '-12' },
        ],
        answer: (t) => String(t.ImmExt | 0),
        explain: () => 'imm[11:5] = 0000000 and imm[4:0] = 01100, so imm = 0b000000001100 = 12.',
        concept: 'stype-imm',
      },
    },
    {
      text: 'The address is computed exactly as for a load: R[rs1] + ImmExt = 0x1000 + 12 = 0x100C.',
      flow: ['stage:alu'],
    },
    {
      title: 'Write data and MemWrite',
      text: 'RD2, the value of {rs2}, goes to the memory write-data port WD. <ctl>MemWrite</ctl> = 1 tells the memory to store it at the clock edge.',
      reveal: ['store'],
      flow: ['stage:mem'],
      focus: ['dmem'],
      fields: ['rs2'],
      route: 'Bits 24:20 (rs2 = 7) select RD2, which now also feeds data memory.',
    },
    {
      title: 'Nothing goes to the register file',
      text: 'Bits 11:7 hold imm[4:0] = 01100 here, not a register number.',
      predict: {
        q: 'What must RegWrite be for `sw`?',
        options: [
          { label: 'RegWrite = 0', value: '0' },
          { label: 'RegWrite = 1', value: '1' },
        ],
        answer: (t) => String(t.ctrl.RegWrite),
        explain: () => 'A store has no destination. If RegWrite were 1, bits 11:7 = 01100 would be taken as rd and x12 would be overwritten with garbage. ResultSrc does not matter for a store: it is a "don\'t care".',
        concept: 'store-regwrite',
      },
      flow: ['c_regwrite'],
      fields: ['imm'],
    },
    {
      edge: true,
      text: 'At the rising edge the memory writes 0x12345678 at address 0x100C and the PC advances. The register file does not change. Like registers, memory only changes at the edge.',
      flow: ['c_pc_clk', 'c_dmem_clk'],
    },
    {
      title: 'Negative offsets',
      text: 'imm[11] is instruction bit 31 again, so negative offsets sign-extend like every other immediate: `sw x7, -8(x6)` writes below x6.',
      example: swNeg,
      flow: cycle,
      imm: 'S',
    },
    {
      title: 'Problem: storing one byte',
      text: '`sb x7, 13(x6)` must change only the byte at 0x100D. The memory writes whole words through byte lanes, so it must be told which lanes to write.',
      example: sb,
      flow: [...front],
    },
    {
      title: 'Store alignment and byte enables',
      text: 'A store-align unit copies the low byte of rs2 into all four lanes and raises one byte-enable bit, chosen by address bits [1:0]. The memory writes only the enabled lanes.',
      reveal: ['bytes'],
      focus: ['stalign'],
      inside: 'stalign',
      predict: {
        q: 'The address is 0x100D, so address bits [1:0] = 01. Which byte enable pattern BE[3:0] does sb produce?',
        options: [
          { label: '0001', value: '0001' },
          { label: '0010', value: '0010' },
          { label: '0100', value: '0100' },
          { label: '1111', value: '1111' },
        ],
        answer: (t) => bin(t.BE, 4),
        explain: () => 'Lane 1 holds the byte at offset 1 within the word (little-endian), so BE = 0010. WD = 0x78787878, but only lane 1 is written; the other three bytes of the word keep their old values.',
        concept: 'byte-enable',
      },
      flow: ['stage:mem'],
    },
    {
      edge: true,
      text: 'At the edge only byte 0x100D changes: the word at 0x100C goes from 0xAAAAAAAA to 0xAAAA78AA.',
      flow: ['c_pc_clk', 'c_dmem_clk'],
    },
    {
      title: 'Halfword stores',
      text: '`sh` copies the low halfword into both halves and enables two lanes. At address 0x100E, BE = 1100. A halfword store to an odd address is misaligned.',
      example: sh,
      flow: cycle,
      panel: 'store-be',
    },
  ],
  practice: [
    { kind: 'encode', ops: ['sw', 'sb', 'sh'], title: 'Encode stores (split immediate)' },
    { kind: 'decode', ops: ['sw', 'sb', 'sh', 'lw', 'addi'], title: 'Decode stores and loads' },
    { kind: 'control', ops: ['sw', 'lw', 'add'], title: 'Set the control signals' },
    { kind: 'trace', ops: ['sw', 'sb'], title: 'Trace a store' },
    { kind: 'build', title: 'Build: the store path' },
    { kind: 'break', title: 'Break the circuit', faults: ['stuck:MemWrite:1', 'stuck:RegWrite:1', 'cut:rd2_to_store', 'stuck:ResultSrc:0'] },
    { kind: 'quiz', title: 'Store check', concepts: ['stype-imm', 'store-regwrite', 'byte-enable'] },
  ],
});
