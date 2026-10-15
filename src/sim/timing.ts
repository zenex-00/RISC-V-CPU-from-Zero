// Static timing model of the single-cycle datapath.
// Each block has a propagation delay. For one instruction class we compute
// when every block's output becomes valid (arrival time), following only the
// inputs that the control signals actually select. The cycle must cover the
// latest arrival at any state element that is written, plus its setup time.

import { mainDecode } from './control';
import { DEF, type Mnemonic } from './isa';

export interface Delays {
  pcq: number; // PC register clock-to-Q
  mem: number; // instruction or data memory read
  rf: number; // register file read
  alu: number;
  add: number; // the PC + 4 and branch-target adders
  mux: number;
  dec: number; // control unit (main + ALU decoder)
  ext: number; // immediate generator
  br: number; // branch condition + AND/OR gates
  ldst: number; // load-extend or store-align logic
  setup: number; // setup time of PC register and data memory write
  rfsetup: number; // register file write setup
}

export const DEFAULT_DELAYS: Delays = {
  pcq: 30, mem: 200, rf: 100, alu: 150, add: 80, mux: 25, dec: 40, ext: 30, br: 20, ldst: 25, setup: 30, rfsetup: 40,
};

export const DELAY_INFO: { key: keyof Delays; label: string; main: boolean }[] = [
  { key: 'mem', label: 'Memory read (instruction or data)', main: true },
  { key: 'rf', label: 'Register file read', main: true },
  { key: 'alu', label: 'ALU', main: true },
  { key: 'add', label: 'Adder (PC + 4, branch target)', main: true },
  { key: 'mux', label: 'Multiplexer', main: true },
  { key: 'pcq', label: 'PC clock-to-Q', main: false },
  { key: 'dec', label: 'Control decode', main: false },
  { key: 'ext', label: 'Immediate generator', main: false },
  { key: 'br', label: 'Branch condition + gates', main: false },
  { key: 'ldst', label: 'Load extend / store align', main: false },
  { key: 'setup', label: 'PC and memory setup', main: false },
  { key: 'rfsetup', label: 'Register file setup', main: false },
];

export interface Timing {
  op: Mnemonic;
  total: number;
  endpoint: 'rf' | 'dmem' | 'pc';
  /** Block ids on the critical path, in signal order. */
  path: string[];
  arrival: Record<string, number>;
  endpoints: { rf: number | null; dmem: number | null; pc: number };
}

export function timingFor(op: Mnemonic, d: Delays): Timing {
  const def = DEF[op];
  const c = mainDecode(def.opcode).ctrl;
  const arr: Record<string, number> = {};
  const from: Record<string, string | null> = {};
  const node = (id: string, inputs: (string | null)[], delay: number) => {
    let best: string | null = null;
    let t = 0;
    for (const i of inputs) {
      if (!i) continue;
      if (best === null || arr[i] > t) {
        best = i;
        t = arr[i];
      }
    }
    arr[id] = t + delay;
    from[id] = best;
  };
  arr.pc = d.pcq;
  from.pc = null;
  node('imem', ['pc'], d.mem);
  node('ctrl', ['imem'], d.dec);
  node('rf', ['imem'], d.rf);
  node('immgen', ['imem', 'ctrl'], d.ext);
  node('pcadd', ['pc'], d.add);
  node('bradd', ['pc', 'immgen'], d.add);
  node('srcamux', [c.ALUSrcA === 0 ? 'rf' : c.ALUSrcA === 1 ? 'pc' : null, 'ctrl'], d.mux);
  node('srcbmux', [c.ALUSrc ? 'immgen' : 'rf', 'ctrl'], d.mux);
  node('alu', ['srcamux', 'srcbmux', 'ctrl'], d.alu);
  node('brlogic', c.Branch ? ['alu', 'ctrl'] : ['ctrl'], d.br);
  node('tgtmux', [c.PCTargetSrc ? 'alu' : 'bradd', 'ctrl'], d.mux);
  const pcInputs = c.Jump ? ['tgtmux', 'brlogic'] : c.Branch ? ['pcadd', 'tgtmux', 'brlogic'] : ['pcadd', 'brlogic'];
  node('pcmux', pcInputs, d.mux);
  if (c.MemRead) {
    node('dmem', ['alu'], d.mem);
    node('ldext', ['dmem', 'alu'], d.ldst);
  }
  if (c.MemWrite) node('stalign', ['rf', 'alu'], d.ldst);
  node('resmux', [c.ResultSrc === 0 ? 'alu' : c.ResultSrc === 1 ? 'ldext' : 'pcadd', 'ctrl'], d.mux);

  const eRf = c.RegWrite ? arr.resmux + d.rfsetup : null;
  let eMem: number | null = null;
  let memLast = 'alu';
  if (c.MemWrite) {
    memLast = arr.stalign >= arr.alu ? 'stalign' : 'alu';
    eMem = arr[memLast] + d.setup;
  }
  const ePc = arr.pcmux + d.setup;
  let endpoint: Timing['endpoint'] = 'pc';
  let total = ePc;
  let last = 'pcmux';
  if (eRf !== null && eRf > total) {
    total = eRf;
    endpoint = 'rf';
    last = 'resmux';
  }
  if (eMem !== null && eMem > total) {
    total = eMem;
    endpoint = 'dmem';
    last = memLast;
  }
  const path: string[] = [];
  for (let n: string | null = last; n; n = from[n]) path.unshift(n);
  if (endpoint === 'rf') path.push('rf-write');
  if (endpoint === 'dmem') path.push('dmem-write');
  if (endpoint === 'pc') path.push('pc-write');
  return { op, total, endpoint, path, arrival: arr, endpoints: { rf: eRf, dmem: eMem, pc: ePc } };
}

export const TIMING_CLASSES: Mnemonic[] = ['add', 'addi', 'lw', 'sw', 'beq', 'jal', 'jalr', 'lui', 'auipc'];

export function criticalSummary(d: Delays) {
  const byInstr: Record<string, number> = {};
  let slowest: Mnemonic = 'add';
  for (const op of TIMING_CLASSES) {
    byInstr[op] = timingFor(op, d).total;
    if (byInstr[op] > byInstr[slowest]) slowest = op;
  }
  return { byInstr, slowest, period: byInstr[slowest] };
}
