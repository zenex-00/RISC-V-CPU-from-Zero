import { register, type Example } from './types';
import { timingFor, DEFAULT_DELAYS, criticalSummary } from '../sim/timing';
import { pathParts } from '../diagram/paths';

const lw: Example = { asm: 'lw x5, 8(x6)', regs: { 6: 0x1000 }, mem: { 0x1008: 1234 } };
const crit = (op: 'lw' | 'add' | 'beq' | 'sw') => ({ 'mark-crit': pathParts(timingFor(op, DEFAULT_DELAYS).path) });
const T = (op: 'lw' | 'add' | 'beq' | 'sw' | 'jal') => timingFor(op, DEFAULT_DELAYS).total;
const period = criticalSummary(DEFAULT_DELAYS).period;

export default register({
  id: 12,
  title: 'Timing',
  short: 'Timing',
  goal: 'Critical paths, the minimum clock period and why single-cycle is slow.',
  level: 11,
  scope: [],
  tool: 'timing',
  steps: [
    {
      title: 'Every block takes time',
      text: 'Each block has a propagation delay: memory reads, register reads, the ALU, adders and muxes. A register\'s output appears a clock-to-Q delay after the edge, and its input must be stable a setup time before the next edge.',
      panel: 'delays',
      noDiagram: true,
    },
    {
      title: 'Arrival times',
      text: 'A block\'s output is valid once its latest relevant input is valid, plus its own delay. Starting from the PC at the clock edge, we can compute when every wire settles for a given instruction.',
      panel: 'delays',
      noDiagram: true,
    },
    {
      title: 'The critical path of lw',
      text: `PC clock-to-Q, instruction memory, register file read, SrcA mux, ALU, data memory, load extend, result mux, then the register file setup: ${T('lw')} ps with the default delays. Nothing else in the cycle takes longer.`,
      example: lw,
      marks: crit('lw'),
      fadeIdle: false,
      camera: 'fit',
    },
    {
      title: 'add is shorter',
      text: `add skips the data memory: ${T('add')} ps. The register read and the ALU are still on its path.`,
      marks: crit('add'),
      fadeIdle: false,
      camera: 'fit',
    },
    {
      title: 'beq ends at the PC',
      text: `beq writes no register; its path ends at the PC register. The ALU must finish comparing before the branch logic can choose the next PC: ${T('beq')} ps.`,
      marks: crit('beq'),
      fadeIdle: false,
      camera: 'fit',
    },
    {
      title: 'One clock for everyone',
      text: `A single-cycle processor has one clock period for all instructions, so it must be at least the slowest path: ${period} ps here, set by lw. An add that is done after ${T('add')} ps still waits for the full ${period} ps.`,
      panel: 'single-cycle',
      noDiagram: true,
      predict: {
        q: 'Suppose the data memory got twice as fast. Would add instructions run faster?',
        options: [
          { label: 'Yes: everything gets faster', value: 'a' },
          { label: 'Only if the clock period is shortened, which the new slowest path then limits', value: 'b' },
          { label: 'No: add never uses memory, so nothing changes', value: 'c' },
        ],
        answer: () => 'b',
        explain: () => 'add\'s own path does not change, but every instruction runs at the clock period. A faster memory shortens lw\'s path, so the clock can be faster, and add benefits through the shorter period.',
        concept: 'clock-period',
      },
    },
    {
      title: 'Beyond single-cycle',
      text: 'A multi-cycle processor breaks each instruction into short steps, so simple instructions take fewer cycles. A pipelined processor splits the datapath into stages with registers between them and overlaps instructions, finishing about one per short cycle. The Timing lab estimates the gain.',
      panel: 'single-cycle',
      noDiagram: true,
    },
  ],
  practice: [{ kind: 'quiz', title: 'Timing check', concepts: ['critical-path', 'clock-period', 'single-cycle', 'setup-hold'] }],
});
