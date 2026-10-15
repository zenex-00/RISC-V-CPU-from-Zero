// Lesson engine: turns (lesson, step index) into what the diagram shows.

import { assembleOne } from '../sim/assembler';
import { evaluate, newState, type EvalOptions, type MachineState, type Trace } from '../sim/datapath';
import { COMPS, WIRES, type Stage } from '../diagram/layout';
import { isVisible } from '../diagram/visibility';
import type { Example, LessonDef } from '../lessons/types';

export const DEFAULT_PC = 0x10;

export interface StepState {
  index: number;
  revealed: Set<string>;
  example: Example | null;
  exampleStart: number;
  state: MachineState | null;
  trace: Trace | null;
  error: string | null;
  active: Set<string>;
  used: Set<string>;
  focus: Set<string>;
  edge: boolean;
}

export function machineFor(ex: Example): { state: MachineState; error: string | null } {
  const pc = ex.pc ?? DEFAULT_PC;
  const s = newState([], pc);
  const a = assembleOne(ex.asm, pc);
  if (!a.ok) return { state: s, error: a.error };
  s.imem[pc >>> 2] = a.line.word;
  for (const [r, v] of Object.entries(ex.regs ?? {})) s.regs[+r] = (v as number) >>> 0;
  for (const [addr, v] of Object.entries(ex.mem ?? {})) s.dmem.setWord(+addr, v as number);
  return { state: s, error: null };
}

const exCache = new Map<string, { state: MachineState; trace: Trace; error: string | null }>();

export function exampleTrace(ex: Example, opts?: EvalOptions) {
  const key = JSON.stringify(ex);
  const hit = !opts && exCache.get(key);
  if (hit) return hit;
  const { state, error } = machineFor(ex);
  const trace = evaluate(state, opts);
  const r = { state, trace, error };
  if (!opts) exCache.set(key, r);
  return r;
}

/** Expand flow entries ('stage:alu' or ids) into part ids visible at this point. */
export function expandFlow(flow: string[] | undefined, level: number, revealed: Set<string>): Set<string> {
  const out = new Set<string>();
  if (!flow) return out;
  for (const f of flow) {
    if (f.startsWith('stage:')) {
      const st = f.slice(6) as Stage;
      for (const w of WIRES) if (w.stage === st && isVisible(w, level, revealed)) out.add(w.id);
      for (const c of COMPS) if (c.stage === st && isVisible(c, level, revealed)) out.add(c.id);
    } else out.add(f);
  }
  return out;
}

export function computeStep(lesson: LessonDef, index: number): StepState {
  const level = lesson.level ?? 0;
  const revealed = new Set<string>();
  let example: Example | null = null;
  let exampleStart = 0;
  for (let i = 0; i <= index; i++) {
    const st = lesson.steps[i];
    st.reveal?.forEach((k) => revealed.add(k));
    if (st.example) {
      example = st.example;
      exampleStart = i;
    }
  }
  const step = lesson.steps[index];
  let trace: Trace | null = null;
  let state: MachineState | null = null;
  let error: string | null = null;
  if (example) {
    const r = exampleTrace(example);
    trace = r.trace;
    state = r.state;
    error = r.error;
  }
  // Used = everything that the signal reached in earlier steps of this example.
  const used = new Set<string>();
  for (let i = exampleStart; i < index; i++) {
    const rv = new Set<string>();
    for (let j = 0; j <= i; j++) lesson.steps[j].reveal?.forEach((k) => rv.add(k));
    expandFlow(lesson.steps[i].flow, level, rv).forEach((id) => used.add(id));
  }
  const active = expandFlow(step.flow, level, revealed);
  if (step.edge && trace) {
    active.add('pc');
    if (trace.regWrite && !trace.regWrite.ignored) active.add('rf');
    if (trace.memWrite) active.add('dmem');
    for (const w of WIRES) if (w.kind === 'clk' && isVisible(w, level, revealed)) active.add(w.id);
  }
  active.forEach((id) => used.delete(id));
  return {
    index, revealed, example, exampleStart, state, trace, error, active, used,
    focus: new Set(step.focus ?? []), edge: !!step.edge,
  };
}
