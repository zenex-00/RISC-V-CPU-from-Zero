// The single-cycle datapath. evaluate() computes every wire value for the
// instruction at the current PC (pure combinational logic, no state change).
// commit() applies the clock edge: register write, memory write, PC update.
// The diagram only ever shows values produced here.

import { alu, type AluOut } from './alu';
import { bits, bit, u32 } from './bits';
import { aluDecode, branchCond, mainDecode, type Ctrl, type CtrlKey, type MainRow } from './control';
import { decode, type Decoded, fields, type Fields } from './encode';
import { immGen } from './immgen';
import { checkAccess, DataMemory, IMEM_BASE, IMEM_WORDS, loadExtend, storeAlign } from './memory';

export interface MachineState {
  pc: number;
  regs: Uint32Array; // regs[0] is never written
  dmem: DataMemory;
  imem: Uint32Array;
}

/** Wires that the "break the circuit" exercise can cut. A cut input reads as 0. */
export type CutId =
  | 'pcplus4_to_pcmux'
  | 'imm_to_srcb'
  | 'zero_to_branch'
  | 'rd2_to_store'
  | 'readdata_to_result'
  | 'a3'
  | 'pctarget_to_pcmux'
  | 'result_to_wd3';

export type Fault =
  | { kind: 'stuck'; signal: CtrlKey | 'PCSrc'; value: number }
  | { kind: 'cut'; wire: CutId };

/** Optional datapath modifications used by the design challenges. */
export interface Mods {
  noSrcAZero?: boolean; // remove the constant-0 input of the ALUSrcA mux
  srcBZero?: boolean; // ALUSrc = 2 selects constant 0
  resultImm?: boolean; // ResultSrc = 3 selects ImmExt
  rs2Zero?: boolean; // zero detector on RD2 plus CondWrite gating of RegWrite
  regDst?: boolean; // RegDst mux: A3 = rd (0) or rs1 field (1)
  addrSrc?: boolean; // AddrSrc mux: memory address = ALUResult (0) or RD1 (1)
  shA?: boolean; // ShA: SrcA shifted left by 1 when ShA = 1
  shB?: boolean; // ShB (re-uses the ShA signal): SrcB shifted left by 1
}

export interface EvalOptions {
  /** Replace the decoded control word (fields given here win). */
  ctrl?: Partial<Ctrl>;
  /** Force the ALU operation (bypasses the ALU decoder). */
  aluControl?: number;
  faults?: Fault[];
  mods?: Mods;
  /** Extra main-decoder rows, e.g. a custom-0 instruction in a design challenge. */
  extraRows?: MainRow[];
}

export interface Trace {
  PC: number;
  Instr: number;
  f: Fields;
  b30: number;
  decoded: Decoded | null;
  decodeError: string | null;
  ctrl: Ctrl;
  ctrlRow: string | null;
  ALUControl: number;
  A1: number;
  A2: number;
  A3: number;
  RD1: number;
  RD2: number;
  ImmExt: number;
  SrcA: number;
  SrcB: number;
  alu: AluOut;
  ALUResult: number;
  Zero: number;
  LT: number;
  LTU: number;
  Cond: number;
  Take: number;
  BranchTaken: number;
  PCSrc: number;
  PCPlus4: number;
  PCTarget: number;
  JumpTarget: number;
  TargetOut: number;
  PCNext: number;
  MemAddr: number;
  ReadWord: number;
  LoadData: number;
  WD: number;
  BE: number;
  Result: number;
  RegWriteEff: number;
  Rs2Zero: number;
  fault: string | null;
  /** What the clock edge will do. */
  regWrite: { r: number; v: number; ignored: boolean } | null;
  memWrite: { addr: number; data: number; be: number } | null;
}

export function newState(program: number[] = [], pc = 0): MachineState {
  const imem = new Uint32Array(IMEM_WORDS);
  program.forEach((w, i) => (imem[i] = w >>> 0));
  return { pc, regs: new Uint32Array(32), dmem: new DataMemory(), imem };
}

export function cloneState(s: MachineState): MachineState {
  return { pc: s.pc, regs: new Uint32Array(s.regs), dmem: s.dmem.clone(), imem: s.imem };
}

export function evaluate(s: MachineState, opts: EvalOptions = {}): Trace {
  const faults = opts.faults ?? [];
  const mods = opts.mods ?? {};
  const cut = (w: CutId) => faults.some((f) => f.kind === 'cut' && f.wire === w);
  const stuck = (sig: string): number | undefined => {
    const f = faults.find((x) => x.kind === 'stuck' && x.signal === sig);
    return f && f.kind === 'stuck' ? f.value : undefined;
  };
  let fault: string | null = null;

  // Fetch
  const PC = u32(s.pc);
  let Instr = 0;
  if (PC % 4 !== 0) fault = `instruction fetch from misaligned PC ${hex8(PC)}`;
  else if (PC < IMEM_BASE || PC >= IMEM_BASE + IMEM_WORDS * 4) fault = `PC ${hex8(PC)} is outside instruction memory`;
  else Instr = s.imem[(PC - IMEM_BASE) >>> 2];
  const f = fields(Instr);
  const b30 = bit(Instr, 30);
  const dr = decode(Instr);
  let decoded: Decoded | null = dr.ok ? dr.d : null;
  let decodeError: string | null = dr.ok ? null : dr.error;
  const custom = opts.extraRows?.find((r) => r.opcode === f.opcode);
  if (custom) {
    decoded = null;
    decodeError = null;
  }

  // Control
  const md = mainDecode(f.opcode, opts.extraRows);
  const ctrl: Ctrl = { ...md.ctrl, ...(opts.ctrl ?? {}) };
  for (const k of Object.keys(ctrl) as CtrlKey[]) {
    const v = stuck(k);
    if (v !== undefined) (ctrl as unknown as Record<string, number | string>)[k] = v;
  }
  if (decodeError && !fault && !opts.ctrl) fault = `illegal instruction ${hex8(Instr)}: ${decodeError}`;
  const ALUControl = opts.aluControl ?? aluDecode(ctrl.ALUOp, f.funct3, b30);

  // Register file read
  const A1 = f.rs1;
  const A2 = f.rs2;
  const RD1 = A1 === 0 ? 0 : s.regs[A1];
  const RD2 = A2 === 0 ? 0 : s.regs[A2];

  // Immediate
  const ImmExt = u32(immGen(Instr, ctrl.ImmSrc));

  // ALU operands
  let SrcA: number;
  if (ctrl.ALUSrcA === 1) SrcA = PC;
  // Without the constant-0 input the mux is 2:1 and only looks at select bit 0.
  else if (ctrl.ALUSrcA === 2) SrcA = mods.noSrcAZero ? RD1 : 0;
  else SrcA = RD1;
  if (mods.shA && ctrl.ShA) SrcA = u32(SrcA << 1);
  let SrcB: number;
  if (ctrl.ALUSrc === 1) SrcB = cut('imm_to_srcb') ? 0 : ImmExt;
  else if (ctrl.ALUSrc === 2 && mods.srcBZero) SrcB = 0;
  else SrcB = RD2;
  if (mods.shB && ctrl.ShA) SrcB = u32(SrcB << 1);

  const a = alu(SrcA, SrcB, ALUControl);
  const ALUResult = a.y;

  // Next PC
  const PCPlus4 = u32(PC + 4);
  const PCTarget = u32(PC + ImmExt);
  const JumpTarget = u32(ALUResult & ~1);
  const TargetOut = ctrl.PCTargetSrc ? JumpTarget : PCTarget;
  const zeroIn = cut('zero_to_branch') ? 0 : a.zero;
  const bc = branchCond(f.funct3, zeroIn, a.lt, a.ltu);
  const BranchTaken = ctrl.Branch & bc.take;
  let PCSrc = (ctrl.Jump | BranchTaken) & 1;
  const sp = stuck('PCSrc');
  if (sp !== undefined) PCSrc = sp;
  const pcIn0 = cut('pcplus4_to_pcmux') ? 0 : PCPlus4;
  const pcIn1 = cut('pctarget_to_pcmux') ? 0 : TargetOut;
  const PCNext = PCSrc ? pcIn1 : pcIn0;

  // Data memory
  const MemAddr = mods.addrSrc && ctrl.AddrSrc ? RD1 : ALUResult;
  let ReadWord = 0;
  if (ctrl.MemRead) {
    const e = checkAccess(MemAddr, f.funct3, false);
    if (e) fault = fault ?? e;
    else ReadWord = s.dmem.readWord(MemAddr);
  }
  let LoadData = loadExtend(ReadWord, MemAddr & 3, f.funct3);
  if (cut('readdata_to_result')) LoadData = 0;
  const st = storeAlign(cut('rd2_to_store') ? 0 : RD2, MemAddr & 3, f.funct3);
  let memWrite: Trace['memWrite'] = null;
  if (ctrl.MemWrite) {
    const e = checkAccess(MemAddr, f.funct3, true);
    if (e) fault = fault ?? e;
    else memWrite = { addr: u32(MemAddr & ~3), data: st.wd, be: st.be };
  }

  // Write-back
  let Result: number;
  switch (ctrl.ResultSrc) {
    case 1:
      Result = LoadData;
      break;
    case 2:
      Result = PCPlus4;
      break;
    case 3:
      // A 3:1 mux built as s[1] ? d2 : (s[0] ? d1 : d0) treats 11 as 10.
      Result = mods.resultImm ? ImmExt : PCPlus4;
      break;
    default:
      Result = ALUResult;
  }
  if (cut('result_to_wd3')) Result = 0;
  const Rs2Zero = RD2 === 0 ? 1 : 0;
  let RegWriteEff = ctrl.RegWrite & 1;
  if (mods.rs2Zero && ctrl.CondWrite) RegWriteEff = RegWriteEff & (1 - Rs2Zero);
  let A3 = mods.regDst && ctrl.RegDst ? f.rs1 : f.rd;
  if (cut('a3')) A3 = 0;
  const regWrite = RegWriteEff ? { r: A3, v: u32(Result), ignored: A3 === 0 } : null;

  return {
    PC, Instr, f, b30, decoded, decodeError, ctrl, ctrlRow: md.row?.name ?? null, ALUControl,
    A1, A2, A3, RD1, RD2, ImmExt, SrcA, SrcB, alu: a, ALUResult,
    Zero: zeroIn, LT: a.lt, LTU: a.ltu, Cond: bc.cond, Take: bc.take, BranchTaken, PCSrc,
    PCPlus4, PCTarget, JumpTarget, TargetOut, PCNext,
    MemAddr: u32(MemAddr), ReadWord, LoadData, WD: st.wd, BE: st.be, Result: u32(Result),
    RegWriteEff, Rs2Zero, fault, regWrite, memWrite,
  };
}

export interface Undo {
  pc: number;
  reg: [number, number] | null;
  mem: [number, number] | null;
}

/** Clock edge. Mutates the state and returns how to undo it. */
export function commit(s: MachineState, t: Trace): Undo {
  const u: Undo = { pc: s.pc, reg: null, mem: null };
  if (t.regWrite && t.regWrite.r !== 0) {
    u.reg = [t.regWrite.r, s.regs[t.regWrite.r]];
    s.regs[t.regWrite.r] = t.regWrite.v;
  }
  if (t.memWrite) {
    u.mem = [t.memWrite.addr, s.dmem.readWord(t.memWrite.addr)];
    s.dmem.writeWord(t.memWrite.addr, t.memWrite.data, t.memWrite.be);
  }
  s.pc = t.PCNext;
  return u;
}

export function undo(s: MachineState, u: Undo): void {
  s.pc = u.pc;
  if (u.reg) s.regs[u.reg[0]] = u.reg[1];
  if (u.mem) s.dmem.setWord(u.mem[0], u.mem[1]);
}

const hex8 = (x: number) => '0x' + (x >>> 0).toString(16).padStart(8, '0');

/** True for `jal x0, 0`, the conventional "stop here" loop. */
export const isHaltLoop = (word: number): boolean => word === 0x0000006f;

export interface RunResult {
  steps: number;
  halted: 'loop' | 'fault' | 'limit' | 'breakpoint';
  fault: string | null;
}

/** Run until `j .`, a fault, or the step limit. */
export function run(s: MachineState, opts: EvalOptions = {}, limit = 10000): RunResult {
  for (let i = 0; i < limit; i++) {
    const w = s.imem[(s.pc >>> 2) % IMEM_WORDS];
    if (isHaltLoop(w)) return { steps: i, halted: 'loop', fault: null };
    const t = evaluate(s, opts);
    if (t.fault) return { steps: i, halted: 'fault', fault: t.fault };
    commit(s, t);
  }
  return { steps: limit, halted: 'limit', fault: null };
}

export { bits };
