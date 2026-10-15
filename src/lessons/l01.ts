import { register, type Example } from './types';
import { hex } from '../sim/bits';

const ex: Example = { asm: 'add x5, x6, x7', pc: 0x10, regs: { 6: 23, 7: 19 } };

export default register({
  id: 1,
  title: 'Fetch',
  short: 'Fetch',
  goal: 'The PC, instruction memory and the PC + 4 adder.',
  level: 1,
  scope: [],
  steps: [
    {
      title: 'An empty circuit',
      text: 'A program is a list of 32-bit instruction words stored in memory, one after another. Before the processor can do anything, it must fetch the next instruction. We start with nothing and add parts only when a problem needs them.',
      fadeIdle: false,
    },
    {
      title: 'Problem: which instruction is next?',
      text: 'Something must remember the address of the current instruction from one cycle to the next. That is state, so it needs a register: the **program counter** (PC), 32 flip-flops sharing one clock.',
      reveal: ['pc'],
      focus: ['pc'],
      inside: 'pc',
    },
    {
      title: 'Instruction memory',
      text: 'Instruction memory takes an address on A and drives the 32-bit word stored there on RD. We treat the read as combinational: when A changes, RD follows after the access time, with no clock involved.',
      reveal: ['imem'],
      example: ex,
      flow: ['stage:pc', 'w_pc_imem'],
      focus: ['imem'],
      inside: 'imem',
    },
    {
      title: 'The fetched word',
      text: 'With PC = `0x00000010`, memory outputs the word stored at byte address 0x10. Here it is `0x007302b3`. Lesson 2 decodes it; for now it is just 32 bits on a bus.',
      flow: ['imem', 'w_instr'],
      route: 'The instruction leaves memory on RD as a 32-bit bus, Instr[31:0].',
    },
    {
      title: 'Where is the next instruction?',
      text: 'Memory is byte-addressed and every RV32I instruction is 4 bytes long, so instructions sit at addresses 0, 4, 8, 12 and so on.',
      predict: {
        q: 'The current instruction is at `0x00000010`. At which address does the next instruction start?',
        options: [
          { label: '0x00000011', value: '0x00000011' },
          { label: '0x00000014', value: '0x00000014' },
          { label: '0x00000020', value: '0x00000020' },
          { label: '0x00000050', value: '0x00000050' },
        ],
        answer: (t) => hex(t.PCPlus4),
        explain: () => 'Each instruction occupies 4 bytes, so the next one starts 4 bytes later: 0x10 + 4 = 0x14. Adding 1 would point into the middle of the current instruction.',
        concept: 'pc-plus-4',
      },
      reveal: ['pcadd'],
      flow: ['w_pc_up', 'w_four', 'pcadd', 'w_pcp4_direct'],
    },
    {
      title: 'A dedicated adder',
      text: 'A separate adder computes PC + 4 all the time. Its output goes back to the D input of the PC register. This adder never does anything else, so it can be a simple fixed adder.',
      flow: ['w_pc_up', 'w_four', 'pcadd', 'w_pcp4_direct'],
      focus: ['pcadd'],
      inside: 'pcadd',
    },
    {
      title: 'Why the PC must be a register',
      text: 'The adder\'s output depends on the PC, and the PC is fed by the adder. Without a register in that loop it would be a combinational loop with no stable value. The register breaks the loop: its output holds still for the whole cycle.',
      flow: ['pc', 'w_pc_up', 'pcadd', 'w_pcp4_direct'],
    },
    {
      title: 'One clock cycle, in signal order',
      text: 'Everything in this cycle happens at once in hardware. The steps only show the order in which signals become valid: PC, then the memory output and PC + 4. Nothing is stored yet.',
      flow: ['stage:pc', 'stage:fetch', 'stage:next'],
    },
    {
      title: 'The clock edge',
      text: 'At the rising clock edge, the PC register captures its D input, so the PC becomes `0x00000014`. The next cycle starts and the whole fetch repeats for the next address.',
      edge: true,
      flow: ['c_pc_clk'],
    },
    {
      title: 'Fetch is done',
      text: 'On reset the PC is loaded with a fixed start address and fetching begins. From now on the PC, instruction memory and this adder stay where they are. Every new part we add will sit to their right and below, in the same positions, until the full machine appears in Lesson 11.',
      flow: ['stage:pc', 'stage:fetch', 'stage:next'],
    },
  ],
  practice: [
    { kind: 'build', title: 'Build the fetch stage' },
    { kind: 'quiz', title: 'Fetch check', concepts: ['pc-plus-4', 'comb-vs-seq', 'pc-loop'] },
  ],
});
