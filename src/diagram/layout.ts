// The datapath described as data. Every component and wire has a fixed
// position for the whole course; lessons only decide what is visible.
// `from` says in which lesson (and at which reveal key inside that lesson)
// a part first appears; `until` says when a temporary part is replaced.

import type { Trace } from '../sim/datapath';
import type { FieldKind } from '../sim/isa';

export interface Intro {
  l: number;
  k: string;
}

export type Shape = 'box' | 'mux' | 'adder' | 'alu' | 'and' | 'or' | 'reg' | 'mem' | 'rf' | 'small' | 'const';

export type Stage = 'pc' | 'fetch' | 'decode' | 'read' | 'alu' | 'mem' | 'wb' | 'next' | 'ctrl' | 'edge';

export const STAGE_ORDER: Stage[] = ['pc', 'fetch', 'decode', 'ctrl', 'read', 'alu', 'mem', 'wb', 'next', 'edge'];

export interface Port {
  x: number;
  y: number;
  label?: string;
}

export interface Comp {
  id: string;
  shape: Shape;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  ports: Record<string, Port>;
  from: Intro;
  until?: Intro;
  stage: Stage;
  /** Which "look inside" panel to offer. */
  inside?: string;
  /** Verilog module that implements it. */
  module?: string;
  /** Mux input labels: port name -> select value text. Shown only when the wire into it is visible. */
  muxIn?: Record<string, string>;
  /** Short description for screen readers and the build tray. */
  desc: string;
}

export type ValueFmt = 'hex' | 'dec' | 'udec' | 'bit' | 'reg' | 'bin2' | 'bin3' | 'imm' | 'alu' | 'be' | 'immsrc';

export interface Wire {
  id: string;
  pts: [number, number][];
  /** Signal name in the simulator trace (see SIGNALS). */
  sig: string;
  kind: 'data' | 'ctrl' | 'clk' | 'field';
  field?: FieldKind;
  /** Bit-slice label, e.g. [19:15], drawn at bitsAt. */
  bits?: string;
  bitsAt?: [number, number];
  from: Intro;
  until?: Intro;
  stage: Stage;
  /** Whether the wire carries a meaningful value for this instruction. */
  active?: (t: Trace) => boolean;
  tag?: { at: [number, number]; fmt: ValueFmt; anchor?: 'start' | 'middle' | 'end' };
  /** Net label for control and clock stubs. */
  net?: { text: string; at: [number, number]; anchor: 'start' | 'middle' | 'end' };
  src?: string; // "comp.port"
  dst?: string; // "comp.port"
  /** Short description: what this wire carries. */
  desc: string;
}

const I = (l: number, k: string): Intro => ({ l, k });

// Activity predicates (does this wire matter for the current instruction?)
const c = (t: Trace) => t.ctrl;
const usesRs1 = (t: Trace) => !!t.decoded && t.decoded.def.fmt !== 'U' && t.decoded.def.fmt !== 'J';
const usesRs2 = (t: Trace) => !!t.decoded && (t.decoded.def.fmt === 'R' || t.decoded.def.fmt === 'S' || t.decoded.def.fmt === 'B');
const writesRd = (t: Trace) => c(t).RegWrite === 1;
const usesImm = (t: Trace) => !!t.decoded && t.decoded.def.fmt !== 'R';
const aluUsed = (t: Trace) => !(c(t).Jump === 1 && c(t).PCTargetSrc === 0);
const srcAIsRs1 = (t: Trace) => aluUsed(t) && c(t).ALUSrcA === 0;
const srcBIsRs2 = (t: Trace) => aluUsed(t) && c(t).ALUSrc === 0;
const srcBIsImm = (t: Trace) => aluUsed(t) && c(t).ALUSrc === 1;
const memAccess = (t: Trace) => c(t).MemRead === 1 || c(t).MemWrite === 1;
const isLoad = (t: Trace) => c(t).MemRead === 1;
const isStore = (t: Trace) => c(t).MemWrite === 1;
const resALU = (t: Trace) => writesRd(t) && c(t).ResultSrc === 0;
const resMem = (t: Trace) => writesRd(t) && c(t).ResultSrc === 1;
const resPC4 = (t: Trace) => writesRd(t) && c(t).ResultSrc === 2;
const isBranch = (t: Trace) => c(t).Branch === 1;
const pcSel0 = (t: Trace) => t.PCSrc === 0;
const pcSel1 = (t: Trace) => t.PCSrc === 1;
const targetBr = (t: Trace) => (c(t).Branch === 1 || c(t).Jump === 1) && c(t).PCTargetSrc === 0;
const targetJr = (t: Trace) => c(t).Jump === 1 && c(t).PCTargetSrc === 1;
const always = () => true;

export const VIEW = { w: 1440, h: 850 };

export const COMPS: Comp[] = [
  {
    id: 'pcmux', shape: 'mux', x: 50, y: 370, w: 30, h: 90, label: '', stage: 'next', from: I(6, 'target'), inside: 'mux', module: 'mux2',
    ports: { in0: { x: 50, y: 390 }, in1: { x: 50, y: 440 }, out: { x: 80, y: 415 }, sel: { x: 65, y: 376 } },
    muxIn: { in0: '0', in1: '1' }, desc: 'PC mux: chooses PC + 4 or the jump/branch target as the next PC',
  },
  {
    id: 'pc', shape: 'reg', x: 105, y: 380, w: 50, h: 70, label: 'PC', stage: 'pc', from: I(1, 'pc'), inside: 'pcreg', module: 'pc_reg',
    ports: { d: { x: 105, y: 415 }, q: { x: 155, y: 415 }, clk: { x: 130, y: 450 } },
    desc: 'Program counter: a 32-bit register holding the address of the current instruction',
  },
  {
    id: 'imem', shape: 'mem', x: 205, y: 340, w: 130, h: 150, label: 'Instruction', sub: 'memory', stage: 'fetch', from: I(1, 'imem'), inside: 'imem', module: 'imem',
    ports: { a: { x: 205, y: 415, label: 'A' }, rd: { x: 335, y: 415, label: 'RD' } },
    desc: 'Instruction memory: outputs the 32-bit word at address A',
  },
  {
    id: 'pcadd', shape: 'adder', x: 205, y: 200, w: 55, h: 85, label: '+', stage: 'pc', from: I(1, 'pcadd'), inside: 'adder', module: 'adder',
    ports: { a: { x: 205, y: 220 }, b: { x: 205, y: 265 }, y: { x: 260, y: 242 } },
    desc: 'Adder that computes PC + 4',
  },
  {
    id: 'four', shape: 'const', x: 178, y: 212, w: 16, h: 16, label: '4', stage: 'pc', from: I(1, 'pcadd'),
    ports: { y: { x: 194, y: 220 } }, desc: 'Constant 4',
  },
  {
    id: 'rf', shape: 'rf', x: 440, y: 340, w: 160, h: 170, label: 'Register', sub: 'file', stage: 'read', from: I(2, 'rf'), inside: 'rf', module: 'regfile',
    ports: {
      a1: { x: 440, y: 365, label: 'A1' }, a2: { x: 440, y: 390, label: 'A2' }, a3: { x: 440, y: 440, label: 'A3' },
      wd3: { x: 470, y: 340, label: 'WD3' }, we3: { x: 560, y: 340, label: 'WE3' },
      rd1: { x: 600, y: 365, label: 'RD1' }, rd2: { x: 600, y: 450, label: 'RD2' }, clk: { x: 520, y: 510 },
    },
    desc: 'Register file: 32 registers, two combinational read ports, one write port written at the clock edge',
  },
  {
    id: 'immgen', shape: 'box', x: 440, y: 545, w: 160, h: 50, label: 'Immediate', sub: 'generator', stage: 'read', from: I(3, 'imm'), inside: 'immgen', module: 'imm_gen',
    ports: { in: { x: 440, y: 570 }, out: { x: 600, y: 570 }, src: { x: 520, y: 595 } },
    desc: 'Immediate generator: rebuilds and sign-extends the immediate from instruction bits [31:7]',
  },
  {
    id: 'srcamux', shape: 'mux', x: 690, y: 345, w: 30, h: 80, label: '', stage: 'alu', from: I(9, 'srca'), inside: 'mux', module: 'mux3',
    ports: { in0: { x: 690, y: 365 }, in1: { x: 690, y: 385 }, in2: { x: 690, y: 405 }, out: { x: 720, y: 385 }, sel: { x: 705, y: 351 } },
    muxIn: { in0: '0', in1: '1', in2: '2' }, desc: 'SrcA mux: ALU input A is rs1, the PC, or 0',
  },
  {
    id: 'zero', shape: 'const', x: 664, y: 397, w: 16, h: 16, label: '0', stage: 'alu', from: I(9, 'srca'),
    ports: { y: { x: 680, y: 405 } }, desc: 'Constant 0',
  },
  {
    id: 'srcbmux', shape: 'mux', x: 690, y: 432, w: 30, h: 76, label: '', stage: 'alu', from: I(3, 'srcb'), inside: 'mux', module: 'mux2',
    ports: { in0: { x: 690, y: 450 }, in1: { x: 690, y: 490 }, out: { x: 720, y: 470 }, sel: { x: 705, y: 502 } },
    muxIn: { in0: '0', in1: '1' }, desc: 'SrcB mux (ALUSrc): ALU input B is rs2 or the immediate',
  },
  {
    id: 'alu', shape: 'alu', x: 760, y: 340, w: 80, h: 170, label: 'ALU', stage: 'alu', from: I(2, 'alu'), inside: 'alu', module: 'alu',
    ports: {
      a: { x: 760, y: 385, label: 'A' }, b: { x: 760, y: 470, label: 'B' }, y: { x: 840, y: 445 },
      zero: { x: 840, y: 380 }, lt: { x: 840, y: 393 }, ltu: { x: 840, y: 406 }, ctl: { x: 800, y: 355 },
    },
    desc: 'Arithmetic logic unit: computes ALUResult and the Zero, LT, LTU flags',
  },
  {
    id: 'brcond', shape: 'box', x: 880, y: 266, w: 72, h: 54, label: 'Branch', sub: 'condition', stage: 'next', from: I(7, 'brcond'), inside: 'brcond', module: 'branch_unit',
    ports: { zero: { x: 880, y: 280 }, lt: { x: 880, y: 293 }, ltu: { x: 880, y: 306 }, take: { x: 952, y: 280 }, f3: { x: 916, y: 320 } },
    desc: 'Branch condition logic: picks Zero, LT or LTU with funct3 and optionally inverts it',
  },
  {
    id: 'andg', shape: 'and', x: 1010, y: 270, w: 36, h: 40, label: '', stage: 'next', from: I(6, 'branch'), inside: 'pclogic', module: 'riscv_single',
    ports: { a: { x: 1010, y: 280 }, b: { x: 1010, y: 300 }, y: { x: 1046, y: 290 } },
    desc: 'AND gate: Branch AND condition',
  },
  {
    id: 'org', shape: 'or', x: 1076, y: 280, w: 38, h: 40, label: '', stage: 'next', from: I(8, 'jump'), inside: 'pclogic', module: 'riscv_single',
    ports: { a: { x: 1079, y: 290 }, b: { x: 1079, y: 310 }, y: { x: 1114, y: 300 } },
    desc: 'OR gate: PCSrc = Jump OR (Branch AND condition)',
  },
  {
    id: 'dmem', shape: 'mem', x: 1010, y: 380, w: 140, h: 150, label: 'Data', sub: 'memory', stage: 'mem', from: I(4, 'dmem'), inside: 'dmem', module: 'dmem',
    ports: {
      a: { x: 1010, y: 445, label: 'A' }, wd: { x: 1010, y: 490, label: 'WD' }, be: { x: 1010, y: 512, label: 'BE' },
      rd: { x: 1150, y: 445, label: 'RD' }, we: { x: 1045, y: 380, label: 'WE' }, re: { x: 1120, y: 380, label: 'RE' }, clk: { x: 1080, y: 530 },
    },
    desc: 'Data memory: word-wide, read combinationally, written at the clock edge when WE = 1',
  },
  {
    id: 'stalign', shape: 'box', x: 900, y: 470, w: 70, h: 60, label: 'Store', sub: 'align', stage: 'mem', from: I(5, 'bytes'), inside: 'stalign', module: 'store_unit',
    ports: { addr: { x: 900, y: 485 }, d: { x: 900, y: 515 }, wd: { x: 970, y: 490 }, be: { x: 970, y: 512 }, f3: { x: 935, y: 530 } },
    desc: 'Store align: places the byte or halfword in the right lane and sets the byte enables BE[3:0]',
  },
  {
    id: 'ldext', shape: 'box', x: 1180, y: 405, w: 60, h: 60, label: 'Load', sub: 'extend', stage: 'mem', from: I(4, 'ldext'), inside: 'ldext', module: 'load_ext',
    ports: { d: { x: 1180, y: 445 }, addr: { x: 1200, y: 405 }, y: { x: 1240, y: 435 }, f3: { x: 1210, y: 465 } },
    desc: 'Load extend: picks the byte or halfword and sign- or zero-extends it',
  },
  {
    id: 'resmux', shape: 'mux', x: 1320, y: 372, w: 30, h: 126, label: '', stage: 'wb', from: I(4, 'resmux'), inside: 'mux', module: 'mux3',
    ports: { in0: { x: 1320, y: 395 }, in1: { x: 1320, y: 435 }, in2: { x: 1320, y: 475 }, out: { x: 1350, y: 435 }, sel: { x: 1335, y: 492 } },
    muxIn: { in0: '0', in1: '1', in2: '2' }, desc: 'Result mux (ResultSrc): write-back value is ALUResult, load data or PC + 4',
  },
  {
    id: 'bradd', shape: 'adder', x: 700, y: 640, w: 60, h: 80, label: '+', stage: 'next', from: I(6, 'target'), inside: 'adder', module: 'adder',
    ports: { a: { x: 700, y: 660 }, b: { x: 700, y: 700 }, y: { x: 760, y: 680 } },
    desc: 'Branch-target adder: PC + ImmExt',
  },
  {
    id: 'clr0', shape: 'small', x: 800, y: 588, w: 44, h: 24, label: '&~1', stage: 'next', from: I(8, 'jalr'),
    ports: { a: { x: 844, y: 600 }, y: { x: 800, y: 600 } }, desc: 'Clears bit 0 of the jalr target',
  },
  {
    id: 'tgtmux', shape: 'mux', x: 800, y: 622, w: 30, h: 76, label: '', stage: 'next', from: I(8, 'jalr'), inside: 'mux', module: 'mux2',
    ports: { in1: { x: 800, y: 640 }, in0: { x: 800, y: 680 }, out: { x: 830, y: 660 }, sel: { x: 815, y: 692 } },
    muxIn: { in1: '1', in0: '0' }, desc: 'Target mux (PCTargetSrc): jump target is PC + imm or (rs1 + imm) with bit 0 cleared',
  },
  {
    id: 'ctrl', shape: 'box', x: 440, y: 40, w: 180, h: 190, label: 'Control', sub: 'unit', stage: 'ctrl', from: I(10, 'cu'), inside: 'control', module: 'controller',
    ports: {
      op: { x: 440, y: 90, label: 'op' }, f3: { x: 440, y: 140, label: 'funct3' }, b30: { x: 440, y: 190, label: 'b30' },
      ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`o${i}`, { x: 620, y: 56 + i * 16 }])),
    },
    desc: 'Control unit: main decoder and ALU decoder',
  },
];

// Control-unit output stubs (lesson 10): one per signal, on its right edge.
const CU_OUT: [string, string][] = [
  ['RegWrite', 'ctrl.RegWrite'], ['ImmSrc', 'ctrl.ImmSrc'], ['ALUSrcA', 'ctrl.ALUSrcA'], ['ALUSrc', 'ctrl.ALUSrc'],
  ['ALUControl', 'ALUControl'], ['MemRead', 'ctrl.MemRead'], ['MemWrite', 'ctrl.MemWrite'], ['ResultSrc', 'ctrl.ResultSrc'],
  ['Branch', 'ctrl.Branch'], ['Jump', 'ctrl.Jump'], ['PCTargetSrc', 'ctrl.PCTargetSrc'],
];

const ctrlStub = (
  id: string, sig: string, name: string, p: [number, number], end: [number, number], from: Intro, anchor: 'start' | 'middle' | 'end', at: [number, number],
  dst: string, until?: Intro,
): Wire => ({
  id, sig, kind: sig === 'CLK' ? 'clk' : 'ctrl', pts: [end, p], from, until, stage: 'ctrl', dst,
  net: { text: name, at, anchor }, desc: sig === 'CLK' ? 'Clock' : `Control signal ${name}`,
});

export const WIRES: Wire[] = [
  // ---- Lesson 1: fetch ----
  { id: 'w_pc_imem', pts: [[155, 415], [205, 415]], sig: 'PC', kind: 'data', from: I(1, 'imem'), stage: 'pc', src: 'pc.q', dst: 'imem.a', tag: { at: [130, 372], fmt: 'hex' }, desc: 'PC to instruction memory address' },
  { id: 'w_pc_up', pts: [[180, 415], [180, 265], [205, 265]], sig: 'PC', kind: 'data', from: I(1, 'pcadd'), stage: 'pc', src: 'pc.q', dst: 'pcadd.b', desc: 'PC to the PC + 4 adder' },
  { id: 'w_four', pts: [[194, 220], [205, 220]], sig: 'FOUR', kind: 'data', from: I(1, 'pcadd'), stage: 'pc', src: 'four.y', dst: 'pcadd.a', desc: 'Constant 4' },
  { id: 'w_instr', pts: [[335, 415], [360, 415]], sig: 'Instr', kind: 'data', from: I(1, 'imem'), stage: 'fetch', src: 'imem.rd', tag: { at: [396, 409], fmt: 'hex' }, desc: 'The 32-bit instruction word' },
  // PC + 4 straight into the PC (lessons 1-5), later through the PC mux
  { id: 'w_pcp4_direct', pts: [[260, 242], [285, 242], [285, 170], [30, 170], [30, 390], [90, 390], [90, 415], [105, 415]], sig: 'PCPlus4', kind: 'data', from: I(1, 'pcadd'), until: I(6, 'target'), stage: 'next', src: 'pcadd.y', dst: 'pc.d', tag: { at: [160, 164], fmt: 'hex' }, desc: 'PC + 4 back to the PC register' },
  { id: 'w_pcp4', pts: [[260, 242], [285, 242], [285, 170], [30, 170], [30, 390], [50, 390]], sig: 'PCPlus4', kind: 'data', from: I(6, 'target'), stage: 'next', src: 'pcadd.y', dst: 'pcmux.in0', tag: { at: [160, 164], fmt: 'hex' }, active: pcSel0, desc: 'PC + 4 into PC mux input 0' },
  { id: 'w_pcnext', pts: [[80, 415], [105, 415]], sig: 'PCNext', kind: 'data', from: I(6, 'target'), stage: 'next', src: 'pcmux.out', dst: 'pc.d', desc: 'Next PC into the PC register' },
  ctrlStub('c_pc_clk', 'CLK', 'CLK', [130, 450], [130, 466], I(1, 'pc'), 'middle', [130, 478], 'pc.clk'),

  // ---- Lesson 2: register file, ALU ----
  { id: 'w_spine', pts: [[360, 365], [360, 440]], sig: 'Instr', src: 'imem.rd', kind: 'data', from: I(2, 'rf'), stage: 'decode', desc: 'Instruction bus (fields split off here)' },
  { id: 'w_a1', pts: [[360, 365], [440, 365]], sig: 'rs1', kind: 'field', field: 'rs1', bits: '[19:15]', bitsAt: [400, 360], from: I(2, 'rf'), stage: 'decode', src: 'imem.rd', dst: 'rf.a1', active: usesRs1, desc: 'Bits 19:15 (rs1) to read address 1' },
  { id: 'w_a2', pts: [[360, 390], [440, 390]], sig: 'rs2', kind: 'field', field: 'rs2', bits: '[24:20]', bitsAt: [400, 385], from: I(2, 'rf'), stage: 'decode', src: 'imem.rd', dst: 'rf.a2', active: usesRs2, desc: 'Bits 24:20 (rs2) to read address 2' },
  { id: 'w_a3', pts: [[360, 440], [440, 440]], sig: 'rd', kind: 'field', field: 'rd', bits: '[11:7]', bitsAt: [400, 435], from: I(2, 'rf'), stage: 'decode', src: 'imem.rd', dst: 'rf.a3', active: writesRd, desc: 'Bits 11:7 (rd) to the write address' },
  { id: 'w_rd1_direct', pts: [[600, 365], [740, 365], [740, 385], [760, 385]], sig: 'RD1', kind: 'data', from: I(2, 'alu'), until: I(9, 'srca'), stage: 'read', src: 'rf.rd1', dst: 'alu.a', active: srcAIsRs1, tag: { at: [602, 359], fmt: 'dec', anchor: 'start' }, desc: 'RD1 to ALU input A' },
  { id: 'w_rd2_direct', pts: [[600, 450], [740, 450], [740, 470], [760, 470]], sig: 'RD2', kind: 'data', from: I(2, 'alu'), until: I(3, 'srcb'), stage: 'read', src: 'rf.rd2', dst: 'alu.b', active: usesRs2, tag: { at: [602, 444], fmt: 'dec', anchor: 'start' }, desc: 'RD2 to ALU input B' },
  { id: 'w_res_direct', pts: [[840, 445], [985, 445], [985, 250], [470, 250], [470, 340]], sig: 'ALUResult', kind: 'data', from: I(2, 'wb'), until: I(4, 'resmux'), stage: 'wb', src: 'alu.y', dst: 'rf.wd3', active: writesRd, tag: { at: [924, 439], fmt: 'hex' }, desc: 'ALUResult back to write data WD3' },
  ctrlStub('c_regwrite', 'ctrl.RegWrite', 'RegWrite', [560, 340], [560, 324], I(2, 'rf'), 'middle', [560, 318], 'rf.we3'),
  ctrlStub('c_alucontrol', 'ALUControl', 'ALUControl', [800, 355], [800, 330], I(2, 'alu'), 'middle', [800, 324], 'alu.ctl'),
  ctrlStub('c_rf_clk', 'CLK', 'CLK', [520, 510], [520, 524], I(2, 'rf'), 'end', [514, 528], 'rf.clk'),

  // ---- Lesson 3: immediate, ALUSrc ----
  { id: 'w_spine_imm', pts: [[360, 440], [360, 570]], sig: 'Instr', src: 'imem.rd', kind: 'data', from: I(3, 'imm'), stage: 'decode', desc: 'Instruction bus to the immediate generator' },
  { id: 'w_immin', pts: [[360, 570], [440, 570]], sig: 'Instr31_7', kind: 'field', field: 'imm', bits: '[31:7]', bitsAt: [400, 565], from: I(3, 'imm'), stage: 'decode', src: 'imem.rd', dst: 'immgen.in', active: usesImm, desc: 'Bits 31:7 to the immediate generator' },
  { id: 'w_imm_srcb', pts: [[600, 570], [630, 570], [630, 490], [690, 490]], sig: 'ImmExt', kind: 'data', from: I(3, 'srcb'), stage: 'read', src: 'immgen.out', dst: 'srcbmux.in1', active: srcBIsImm, tag: { at: [626, 532], fmt: 'imm', anchor: 'end' }, desc: 'ImmExt to SrcB mux input 1' },
  { id: 'w_rd2_srcb', pts: [[600, 450], [690, 450]], sig: 'RD2', kind: 'data', from: I(3, 'srcb'), stage: 'read', src: 'rf.rd2', dst: 'srcbmux.in0', active: (t) => srcBIsRs2(t) || (usesRs2(t) && isStore(t)), tag: { at: [602, 444], fmt: 'dec', anchor: 'start' }, desc: 'RD2 to SrcB mux input 0' },
  { id: 'w_srcb_alu', pts: [[720, 470], [760, 470]], sig: 'SrcB', kind: 'data', from: I(3, 'srcb'), stage: 'alu', src: 'srcbmux.out', dst: 'alu.b', active: aluUsed, desc: 'SrcB into ALU input B' },
  ctrlStub('c_alusrc', 'ctrl.ALUSrc', 'ALUSrc', [705, 502], [705, 518], I(3, 'srcb'), 'middle', [705, 530], 'srcbmux.sel'),
  ctrlStub('c_immsrc', 'ctrl.ImmSrc', 'ImmSrc', [520, 595], [520, 612], I(3, 'imm'), 'middle', [520, 624], 'immgen.src'),

  // ---- Lesson 4: loads ----
  { id: 'w_alu_dmem', pts: [[840, 445], [1010, 445]], sig: 'ALUResult', kind: 'data', from: I(4, 'dmem'), stage: 'alu', src: 'alu.y', dst: 'dmem.a', active: (t) => aluUsed(t), tag: { at: [924, 439], fmt: 'hex' }, desc: 'ALUResult: the memory address, and the value for write-back' },
  ctrlStub('c_memread', 'ctrl.MemRead', 'MemRead', [1120, 380], [1120, 364], I(4, 'dmem'), 'middle', [1120, 358], 'dmem.re'),
  { id: 'w_alu_res', pts: [[985, 445], [985, 335], [1305, 335], [1305, 395], [1320, 395]], sig: 'ALUResult', kind: 'data', from: I(4, 'resmux'), stage: 'wb', src: 'alu.y', dst: 'resmux.in0', active: resALU, desc: 'ALUResult to Result mux input 0' },
  { id: 'w_rd_direct', pts: [[1150, 445], [1300, 445], [1300, 435], [1320, 435]], sig: 'ReadWord', kind: 'data', from: I(4, 'resmux'), until: I(4, 'ldext'), stage: 'mem', src: 'dmem.rd', dst: 'resmux.in1', active: isLoad, tag: { at: [1225, 439], fmt: 'hex' }, desc: 'ReadData to Result mux input 1' },
  { id: 'w_result', pts: [[1350, 435], [1370, 435], [1370, 250], [470, 250], [470, 340]], sig: 'Result', kind: 'data', from: I(4, 'resmux'), stage: 'wb', src: 'resmux.out', dst: 'rf.wd3', active: writesRd, tag: { at: [1100, 244], fmt: 'dec' }, desc: 'Result back to the register file write data WD3' },
  ctrlStub('c_resultsrc', 'ctrl.ResultSrc', 'ResultSrc', [1335, 492], [1335, 510], I(4, 'resmux'), 'middle', [1335, 522], 'resmux.sel'),
  { id: 'w_rd_ldext', pts: [[1150, 445], [1180, 445]], sig: 'ReadWord', kind: 'data', from: I(4, 'ldext'), stage: 'mem', src: 'dmem.rd', dst: 'ldext.d', active: isLoad, desc: 'Aligned word read from data memory' },
  { id: 'w_ldext_res', pts: [[1240, 435], [1320, 435]], sig: 'LoadData', kind: 'data', from: I(4, 'ldext'), stage: 'mem', src: 'ldext.y', dst: 'resmux.in1', active: resMem, tag: { at: [1280, 429], fmt: 'dec' }, desc: 'Extended load data to Result mux input 1' },
  { id: 'w_ldext_addr', pts: [[1200, 335], [1200, 405]], sig: 'Off', kind: 'data', bits: '[1:0]', bitsAt: [1218, 378], from: I(4, 'ldext'), stage: 'mem', src: 'alu.y', dst: 'ldext.addr', active: isLoad, desc: 'Address bits 1:0 select the byte lane' },
  ctrlStub('c_ld_f3', 'funct3', 'funct3', [1210, 465], [1210, 480], I(4, 'ldext'), 'middle', [1210, 492], 'ldext.f3'),

  // ---- Lesson 5: stores ----
  { id: 'w_rd2_store_direct', pts: [[650, 450], [650, 550], [880, 550], [880, 490], [1010, 490]], sig: 'RD2', kind: 'data', from: I(5, 'store'), until: I(5, 'bytes'), stage: 'mem', src: 'rf.rd2', dst: 'dmem.wd', active: isStore, tag: { at: [770, 544], fmt: 'dec' }, desc: 'RD2 (rs2) to data memory write data' },
  { id: 'w_rd2_store', pts: [[650, 450], [650, 550], [880, 550], [880, 515], [900, 515]], sig: 'RD2', kind: 'data', from: I(5, 'bytes'), stage: 'mem', src: 'rf.rd2', dst: 'stalign.d', active: isStore, tag: { at: [770, 544], fmt: 'dec' }, desc: 'RD2 (rs2) to the store-align unit' },
  { id: 'w_st_addr', pts: [[855, 445], [855, 485], [900, 485]], sig: 'Off', kind: 'data', bits: '[1:0]', bitsAt: [876, 480], from: I(5, 'bytes'), stage: 'mem', src: 'alu.y', dst: 'stalign.addr', active: isStore, desc: 'Address bits 1:0 select the byte lane' },
  { id: 'w_st_wd', pts: [[970, 490], [1010, 490]], sig: 'WD', kind: 'data', from: I(5, 'bytes'), stage: 'mem', src: 'stalign.wd', dst: 'dmem.wd', active: isStore, desc: 'Lane-aligned write data' },
  { id: 'w_st_be', pts: [[970, 512], [1010, 512]], sig: 'BE', kind: 'data', from: I(5, 'bytes'), stage: 'mem', src: 'stalign.be', dst: 'dmem.be', active: isStore, tag: { at: [990, 527], fmt: 'be' }, desc: 'Byte enables BE[3:0]' },
  ctrlStub('c_st_f3', 'funct3', 'funct3', [935, 530], [935, 545], I(5, 'bytes'), 'middle', [935, 557], 'stalign.f3'),
  ctrlStub('c_memwrite', 'ctrl.MemWrite', 'MemWrite', [1045, 380], [1045, 364], I(5, 'store'), 'middle', [1045, 358], 'dmem.we'),
  ctrlStub('c_dmem_clk', 'CLK', 'CLK', [1080, 530], [1080, 544], I(5, 'store'), 'start', [1088, 548], 'dmem.clk'),

  // ---- Lesson 6: beq ----
  { id: 'w_pc_down', pts: [[180, 415], [180, 700], [700, 700]], sig: 'PC', kind: 'data', from: I(6, 'target'), stage: 'pc', src: 'pc.q', dst: 'bradd.b', active: targetBr, desc: 'PC to the branch-target adder' },
  { id: 'w_imm_bradd', pts: [[630, 570], [630, 660], [700, 660]], sig: 'ImmExt', kind: 'data', from: I(6, 'target'), stage: 'read', src: 'immgen.out', dst: 'bradd.a', active: targetBr, tag: { at: [698, 654], fmt: 'imm', anchor: 'end' }, desc: 'ImmExt (the offset) to the branch-target adder' },
  { id: 'w_pctarget_direct', pts: [[760, 680], [850, 680], [850, 750], [40, 750], [40, 440], [50, 440]], sig: 'PCTarget', kind: 'data', from: I(6, 'target'), until: I(8, 'jalr'), stage: 'next', src: 'bradd.y', dst: 'pcmux.in1', active: pcSel1, tag: { at: [440, 744], fmt: 'hex' }, desc: 'PCTarget into PC mux input 1' },
  { id: 'w_zero_direct', pts: [[840, 380], [860, 380], [860, 300], [1010, 300]], sig: 'Zero', kind: 'data', from: I(6, 'branch'), until: I(7, 'brcond'), stage: 'alu', src: 'alu.zero', dst: 'andg.b', active: isBranch, tag: { at: [935, 294], fmt: 'bit' }, desc: 'ALU Zero flag to the AND gate' },
  { ...ctrlStub('c_branch', 'ctrl.Branch', 'Branch', [1010, 280], [1000, 268], I(6, 'branch'), 'middle', [1000, 264], 'andg.a'), pts: [[1000, 268], [1000, 280], [1010, 280]] },
  ctrlStub('c_pcsrc_and', 'PCSrc', 'PCSrc', [1046, 290], [1066, 290], I(6, 'branch'), 'start', [1070, 294], 'andg.y', I(8, 'jump')),
  ctrlStub('c_pcsrc_mux', 'PCSrc', 'PCSrc', [65, 376], [65, 358], I(6, 'target'), 'middle', [65, 352], 'pcmux.sel'),

  // ---- Lesson 7: branch condition ----
  { id: 'w_zero', pts: [[840, 380], [860, 380], [860, 280], [880, 280]], sig: 'Zero', kind: 'data', from: I(7, 'brcond'), stage: 'alu', src: 'alu.zero', dst: 'brcond.zero', active: isBranch, desc: 'Zero flag' },
  { id: 'w_lt', pts: [[840, 393], [866, 393], [866, 293], [880, 293]], sig: 'LT', kind: 'data', from: I(7, 'brcond'), stage: 'alu', src: 'alu.lt', dst: 'brcond.lt', active: isBranch, desc: 'LT flag (signed less-than)' },
  { id: 'w_ltu', pts: [[840, 406], [872, 406], [872, 306], [880, 306]], sig: 'LTU', kind: 'data', from: I(7, 'brcond'), stage: 'alu', src: 'alu.ltu', dst: 'brcond.ltu', active: isBranch, desc: 'LTU flag (unsigned less-than)' },
  { id: 'w_take', pts: [[952, 280], [980, 280], [980, 300], [1010, 300]], sig: 'Take', kind: 'data', from: I(7, 'brcond'), stage: 'next', src: 'brcond.take', dst: 'andg.b', active: isBranch, tag: { at: [966, 274], fmt: 'bit' }, desc: 'Branch condition result' },
  ctrlStub('c_br_f3', 'funct3', 'funct3', [916, 320], [916, 330], I(7, 'brcond'), 'middle', [916, 342], 'brcond.f3'),

  // ---- Lesson 8: jal, jalr ----
  { id: 'w_and_or', pts: [[1046, 290], [1079, 290]], sig: 'BranchTaken', kind: 'data', from: I(8, 'jump'), stage: 'next', src: 'andg.y', dst: 'org.a', desc: 'Branch AND condition' },
  ctrlStub('c_jump', 'ctrl.Jump', 'Jump', [1079, 310], [1062, 310], I(8, 'jump'), 'end', [1060, 322], 'org.b'),
  ctrlStub('c_pcsrc_or', 'PCSrc', 'PCSrc', [1114, 300], [1134, 300], I(8, 'jump'), 'start', [1138, 304], 'org.y'),
  { id: 'w_pcp4_res', pts: [[30, 390], [30, 820], [1295, 820], [1295, 475], [1320, 475]], sig: 'PCPlus4', kind: 'data', from: I(8, 'jump'), stage: 'wb', src: 'pcadd.y', dst: 'resmux.in2', active: resPC4, tag: { at: [640, 814], fmt: 'hex' }, desc: 'PC + 4 to Result mux input 2 (the link value)' },
  { id: 'w_jt', pts: [[855, 485], [855, 600], [844, 600]], sig: 'ALUResult', kind: 'data', from: I(8, 'jalr'), stage: 'next', src: 'alu.y', dst: 'clr0.a', active: targetJr, desc: 'ALUResult (rs1 + imm) toward the target mux' },
  { id: 'w_jt2', pts: [[800, 600], [785, 600], [785, 640], [800, 640]], sig: 'JumpTarget', kind: 'data', from: I(8, 'jalr'), stage: 'next', src: 'clr0.y', dst: 'tgtmux.in1', active: targetJr, tag: { at: [756, 594], fmt: 'hex' }, desc: 'jalr target with bit 0 cleared' },
  { id: 'w_bradd_tgt', pts: [[760, 680], [800, 680]], sig: 'PCTarget', kind: 'data', from: I(8, 'jalr'), stage: 'next', src: 'bradd.y', dst: 'tgtmux.in0', active: targetBr, desc: 'PC + imm to target mux input 0' },
  { id: 'w_tgt_pcmux', pts: [[830, 660], [850, 660], [850, 750], [40, 750], [40, 440], [50, 440]], sig: 'TargetOut', kind: 'data', from: I(8, 'jalr'), stage: 'next', src: 'tgtmux.out', dst: 'pcmux.in1', active: pcSel1, tag: { at: [440, 744], fmt: 'hex' }, desc: 'Selected target into PC mux input 1' },
  ctrlStub('c_pctargetsrc', 'ctrl.PCTargetSrc', 'PCTargetSrc', [815, 692], [815, 728], I(8, 'jalr'), 'end', [846, 740], 'tgtmux.sel'),

  // ---- Lesson 9: lui, auipc ----
  { id: 'w_pc_top', pts: [[180, 265], [180, 300], [680, 300], [680, 385], [690, 385]], sig: 'PC', kind: 'data', from: I(9, 'srca'), stage: 'pc', src: 'pc.q', dst: 'srcamux.in1', active: (t) => c(t).ALUSrcA === 1, desc: 'PC to SrcA mux input 1 (for auipc)' },
  { id: 'w_rd1_srca', pts: [[600, 365], [690, 365]], sig: 'RD1', kind: 'data', from: I(9, 'srca'), stage: 'read', src: 'rf.rd1', dst: 'srcamux.in0', active: srcAIsRs1, tag: { at: [602, 359], fmt: 'dec', anchor: 'start' }, desc: 'RD1 to SrcA mux input 0' },
  { id: 'w_zero_srca', pts: [[680, 405], [690, 405]], sig: 'ZERO', kind: 'data', from: I(9, 'srca'), stage: 'alu', src: 'zero.y', dst: 'srcamux.in2', active: (t) => c(t).ALUSrcA === 2, desc: 'Constant 0 to SrcA mux input 2' },
  { id: 'w_srca_alu', pts: [[720, 385], [760, 385]], sig: 'SrcA', kind: 'data', from: I(9, 'srca'), stage: 'alu', src: 'srcamux.out', dst: 'alu.a', active: aluUsed, desc: 'SrcA into ALU input A' },
  ctrlStub('c_alusrca', 'ctrl.ALUSrcA', 'ALUSrcA', [705, 351], [705, 334], I(9, 'srca'), 'start', [709, 338], 'srcamux.sel'),

  // ---- Lesson 10: control unit ----
  { id: 'w_spine_cu', pts: [[360, 365], [360, 90]], sig: 'Instr', src: 'imem.rd', kind: 'data', from: I(10, 'cu'), stage: 'decode', desc: 'Instruction bus up to the control unit' },
  { id: 'w_op', pts: [[360, 90], [440, 90]], sig: 'opcode', kind: 'field', field: 'opcode', bits: '[6:0]', bitsAt: [400, 85], from: I(10, 'cu'), stage: 'decode', src: 'imem.rd', dst: 'ctrl.op', desc: 'Bits 6:0 (opcode) to the main decoder' },
  { id: 'w_f3', pts: [[360, 140], [440, 140]], sig: 'funct3', kind: 'field', field: 'funct3', bits: '[14:12]', bitsAt: [400, 135], from: I(10, 'cu'), stage: 'decode', src: 'imem.rd', dst: 'ctrl.f3', desc: 'Bits 14:12 (funct3) to the ALU decoder' },
  { id: 'w_b30', pts: [[360, 190], [440, 190]], sig: 'b30', kind: 'field', field: 'funct7', bits: '[30]', bitsAt: [400, 185], from: I(10, 'cu'), stage: 'decode', src: 'imem.rd', dst: 'ctrl.b30', desc: 'Bit 30 (funct7 bit 5) to the ALU decoder' },
  ...CU_OUT.map(([name, sig], i): Wire => ctrlStub(`c_cu_${name}`, sig, name, [620, 56 + i * 16], [640, 56 + i * 16], I(10, 'cu'), 'start', [644, 60 + i * 16], `ctrl.o${i}`)),
];

// Control stubs light up together with the block that uses them; clock stubs at the edge.
const STUB_STAGE: Record<string, Stage> = {
  c_regwrite: 'wb', c_alucontrol: 'alu', c_alusrc: 'alu', c_immsrc: 'read', c_memread: 'mem', c_memwrite: 'mem',
  c_resultsrc: 'wb', c_branch: 'next', c_pcsrc_and: 'next', c_pcsrc_mux: 'next', c_pcsrc_or: 'next', c_jump: 'next',
  c_pctargetsrc: 'next', c_alusrca: 'alu', c_ld_f3: 'mem', c_st_f3: 'mem', c_br_f3: 'next',
  c_pc_clk: 'edge', c_rf_clk: 'edge', c_dmem_clk: 'edge',
};
for (const w of WIRES) {
  if (STUB_STAGE[w.id]) w.stage = STUB_STAGE[w.id];
  else if (w.id.startsWith('c_cu_')) w.stage = 'ctrl';
}

/** Wire roles that the clock edge writes. */
export const STATE_ELEMENTS = ['pc', 'rf', 'dmem'];

export const compById: Record<string, Comp> = Object.fromEntries(COMPS.map((x) => [x.id, x]));
export const wireById: Record<string, Wire> = Object.fromEntries(WIRES.map((x) => [x.id, x]));

void always;
void memAccess;

/** Human names for blocks (tray, ports, screen readers). */
export const COMP_NAME: Record<string, string> = {
  pcmux: 'PC mux', pc: 'PC register', imem: 'Instruction memory', pcadd: 'PC + 4 adder', four: 'constant 4', rf: 'Register file',
  immgen: 'Immediate generator', srcamux: 'SrcA mux', zero: 'constant 0', srcbmux: 'ALUSrc mux', alu: 'ALU', brcond: 'Branch condition',
  andg: 'AND gate', org: 'OR gate', dmem: 'Data memory', stalign: 'Store align', ldext: 'Load extend', resmux: 'Result mux',
  bradd: 'Branch-target adder', clr0: 'Clear-bit-0 block', tgtmux: 'Target mux', ctrl: 'Control unit',
};

const PORT_WORD: Record<string, string> = {
  in0: 'input 0', in1: 'input 1', in2: 'input 2', out: 'output', sel: 'select', y: 'output', q: 'output Q', d: 'input D',
  a: 'input A', b: 'input B', clk: 'clock', take: 'output', zero: 'Zero', lt: 'LT', ltu: 'LTU', f3: 'funct3', addr: 'address bits 1:0',
  ctl: 'ALUControl', in: 'input',
};

export function portName(ref: string): string {
  const [c, p] = ref.split('.');
  const comp = compById[c];
  const lbl = comp?.ports[p]?.label;
  return `${COMP_NAME[c] ?? c} ${lbl ?? PORT_WORD[p] ?? p}`;
}
