// Lesson data format. Lesson files are pure data plus small functions of the
// simulator trace; each is built into its own script and loaded on demand.

import type { Trace } from '../sim/datapath';
import type { FieldKind, Mnemonic } from '../sim/isa';
import type { ImmSrc } from '../sim/immgen';

export interface Example {
  /** One instruction in assembly. It is placed at `pc` (default 0x0000_0010). */
  asm: string;
  pc?: number;
  /** Register values before the instruction. Keys are x-numbers. */
  regs?: Record<number, number>;
  /** Data memory words: address -> value. */
  mem?: Record<number, number>;
}

export interface PredictOption {
  label: string;
  value: string;
}

export interface Predict {
  q: string;
  options: PredictOption[];
  /** Correct option value, computed from the simulator trace. */
  answer: (t: Trace) => string;
  /** One or two sentences shown after the answer. */
  explain: (t: Trace) => string;
  /** Concept id for the review deck. */
  concept: string;
}

export interface StepDef {
  title?: string;
  /** 1-3 sentences. Markup: `code`, **bold**, {rs1} {rs2} {rd} {opcode} {funct3} {funct7} {imm} field chips, <ctl>Name</ctl>. */
  text: string;
  /** Reveal keys (see LESSON_KEYS) that appear at this step. */
  reveal?: string[];
  /** Switch to a new worked example (resets the cycle's used wires). */
  example?: Example;
  /** Parts the signal reaches in this step: 'stage:<name>' or part ids. */
  flow?: string[];
  /** Emphasise these parts. */
  focus?: string[];
  /** Highlight these fields in the bit view. */
  fields?: FieldKind[];
  /** "Where those bits go" line, e.g. bits 19:15 go to the register file as read address 1. */
  route?: string;
  /** Show the immediate rebuild panel for this format. */
  imm?: ImmSrc;
  /** Offer the "look inside" panel of this component. */
  inside?: string;
  predict?: Predict;
  /** This step is the clock edge. */
  edge?: boolean;
  /** Special panel shown with this step (implemented in the app). */
  panel?: string;
  /** Show the four-level instruction card (default: from Lesson 2 on). */
  card?: boolean;
  /** Hide the datapath (concept-only steps). */
  noDiagram?: boolean;
  /** Fade parts that carry nothing useful for this instruction. Default true when an example is active. */
  fadeIdle?: boolean;
  /** Extra highlight classes on the diagram, e.g. { 'mark-crit': [...] }. */
  marks?: Record<string, string[]>;
  /** Camera: fit all visible parts (default) or follow the active parts. */
  camera?: 'fit' | 'follow';
}

export type PracticeDef =
  | { kind: 'encode'; ops: Mnemonic[]; title?: string }
  | { kind: 'decode'; ops: Mnemonic[]; title?: string }
  | { kind: 'control'; ops: Mnemonic[]; title?: string }
  | { kind: 'trace'; ops: Mnemonic[]; title?: string }
  | { kind: 'build'; title?: string }
  | { kind: 'break'; title?: string; faults: string[] }
  | { kind: 'draw'; subset: string; title?: string }
  | { kind: 'design'; challenge: string; title?: string }
  | { kind: 'quiz'; title?: string; concepts: string[] };

export interface VerilogModule {
  name: string;
  /** Diagram components this module implements (for linking). */
  comps: string[];
  summary: string;
  code: string;
  testbench: string;
}

export interface InterviewQ {
  id: string;
  lesson: number;
  q: string;
  a: string;
}

export interface LessonDef {
  id: number;
  title: string;
  short: string;
  goal: string;
  /** Datapath build level (null: no datapath in this lesson). */
  level: number | null;
  /** Instructions the circuit can run at the end of this lesson. */
  scope: Mnemonic[];
  steps: StepDef[];
  practice: PracticeDef[];
  /** Full-page tool instead of a step walkthrough after the steps (machine, timing, verilog, interview). */
  tool?: 'machine' | 'timing' | 'verilog' | 'interview' | 'control';
  /** Lesson 13: the Verilog sources. */
  verilog?: VerilogModule[];
  /** Lesson 14: the interview question bank. */
  bank?: InterviewQ[];
}

declare global {
  interface Window {
    __rvLesson?: (l: LessonDef) => void;
  }
}

export function register(l: LessonDef) {
  if (typeof window !== 'undefined' && window.__rvLesson) window.__rvLesson(l);
  return l;
}
