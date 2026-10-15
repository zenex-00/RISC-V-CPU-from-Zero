// Trace the path: click blocks and wires in the order the signal can reach them.
// A part is "ready" once everything it depends on has been clicked, so any
// order that respects the real data dependencies is accepted.

import { useMemo, useState } from 'preact/hooks';
import type { Mnemonic } from '../../sim/isa';
import { evaluate, type Trace } from '../../sim/datapath';
import { COMPS, WIRES, COMP_NAME, compById, wireById, type Wire } from '../../diagram/layout';
import { isVisible, LESSON_KEYS } from '../../diagram/visibility';
import { machineFor } from '../engine';
import { exampleFor, pick } from './gen';
import { recordConcept, recordExercise } from '../store';
import { Diagram } from '../components/Diagram';
import { mainDecode } from '../../sim/control';
import { DEF } from '../../sim/isa';

const SKIP_SIG = new Set(['FOUR', 'ZERO', 'Off']);

/** Is a component meaningful for this instruction? */
export function compRelevant(id: string, t: Trace): boolean {
  const c = t.ctrl;
  switch (id) {
    case 'dmem': return c.MemRead === 1 || c.MemWrite === 1;
    case 'ldext': return c.MemRead === 1 && c.RegWrite === 1;
    case 'stalign': return c.MemWrite === 1;
    case 'bradd': return (c.Branch === 1 || c.Jump === 1) && c.PCTargetSrc === 0;
    case 'clr0': return c.Jump === 1 && c.PCTargetSrc === 1;
    case 'tgtmux': return c.Branch === 1 || c.Jump === 1;
    case 'brcond': case 'andg': return c.Branch === 1;
    case 'org': return c.Branch === 1 || c.Jump === 1;
    case 'alu': case 'srcamux': case 'srcbmux': return !(c.Jump === 1 && c.PCTargetSrc === 0);
    case 'immgen': return !!t.decoded && t.decoded.def.fmt !== 'R';
    case 'resmux': return c.RegWrite === 1;
    case 'four': case 'zero': case 'ctrl': return false;
    default: return true;
  }
}

export interface TracePlan {
  parts: string[];
  deps: Record<string, string[]>;
}

export function tracePlan(t: Trace, level: number): TracePlan {
  const rev = new Set(LESSON_KEYS[level] ?? []);
  const wires = WIRES.filter((w) => isVisible(w, level, rev) && (w.kind === 'data' || w.kind === 'field') && !SKIP_SIG.has(w.sig) && w.dst && (!w.active || w.active(t)));
  // Drop wires whose ends are not relevant (e.g. ALUResult into data memory for add).
  const keep = wires.filter((w) => {
    const d = w.dst!.split('.')[0];
    return compRelevant(d, t) || d === 'pc';
  });
  const comps = COMPS.filter((c) => isVisible(c, level, rev) && compRelevant(c.id, t));
  const deps: Record<string, string[]> = {};
  const srcComp = (w: Wire) => w.src!.split('.')[0];
  for (const w of keep) deps[w.id] = [srcComp(w)].filter((s) => compById[s] && compRelevant(s, t));
  // Write-side inputs (WD3, A3, the PC's D input, memory write data) are used at the
  // clock edge, so a block's outputs do not wait for them.
  const WRITE_SIDE = new Set(['rf.wd3', 'rf.a3', 'pc.d', 'dmem.wd', 'dmem.be']);
  for (const c of comps) deps[c.id] = keep.filter((w) => w.dst!.split('.')[0] === c.id && !WRITE_SIDE.has(w.dst!)).map((w) => w.id);
  // The PC starts the cycle: it depends on nothing (its input is for the next cycle).
  deps.pc = [];
  return { parts: [...comps.map((c) => c.id), ...keep.map((w) => w.id)], deps };
}

const nameOf = (id: string) => (compById[id] ? COMP_NAME[id] : wireById[id]?.desc ?? id);

export function TraceEx({ ops, exId, level }: { ops: Mnemonic[]; exId: string; level: number }) {
  const [ex, setEx] = useState(() => {
    const op = pick(ops);
    return { op, e: exampleFor(op) };
  });
  const trace = useMemo(() => evaluate(machineFor(ex.e).state), [ex]);
  const plan = useMemo(() => tracePlan(trace, level), [trace, level]);
  const [done, setDone] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const required = new Set(plan.parts);
  const finished = plan.parts.every((p) => done.includes(p));

  const click = (id: string) => {
    if (finished) return;
    if (done.includes(id)) return setMsg({ ok: true, text: `${nameOf(id)}: already traced.` });
    if (!required.has(id)) {
      setMistakes(mistakes + 1);
      const isCtrl = wireById[id]?.kind === 'ctrl' || wireById[id]?.kind === 'clk';
      return setMsg({ ok: false, text: isCtrl ? 'Control and clock lines are not part of this trace: follow the data.' : `${nameOf(id)} is not used by ${ex.e.asm.split(' ')[0]}: its value is ignored this cycle.` });
    }
    const missing = (plan.deps[id] ?? []).filter((d) => !done.includes(d));
    if (missing.length) {
      setMistakes(mistakes + 1);
      return setMsg({ ok: false, text: `Not yet: ${nameOf(id)} needs ${missing.map(nameOf).join(' and ')} first.` });
    }
    const nd = [...done, id];
    setDone(nd);
    if (plan.parts.every((p) => nd.includes(p))) {
      const score = Math.max(0, 1 - mistakes * 0.08);
      recordExercise(exId, score);
      recordConcept(`trace:${mainDecode(DEF[ex.op].opcode).row?.name ?? ex.op}`, mistakes <= 2);
      setMsg({ ok: true, text: `Complete with ${mistakes} mistake${mistakes === 1 ? '' : 's'}. Every part the instruction uses has been traced in a valid order.` });
    } else setMsg({ ok: true, text: `${nameOf(id)}: correct.` });
  };
  const next = () => {
    const op = pick(ops);
    setEx({ op, e: exampleFor(op) });
    setDone([]);
    setMsg(null);
    setMistakes(0);
  };
  const hint = () => {
    const ready = plan.parts.filter((p) => !done.includes(p) && (plan.deps[p] ?? []).every((d) => done.includes(d)));
    if (ready.length) setMsg({ ok: true, text: `Hint: ${nameOf(ready[0])} is ready.` });
  };
  return (
    <div class="stack">
      <div class="row">
        <span class="muted small">Trace:</span>
        <span class="prompt-asm">{ex.e.asm}</span>
        <span class="small muted">{done.length} of {plan.parts.length} parts</span>
      </div>
      <p class="small muted">Click each block and wire this instruction uses, in an order the signal could reach them: a part can be clicked once everything feeding it has been. Values appear as you go. Keyboard: Tab to a part, Enter to select it.</p>
      <Diagram
        level={level}
        revealed={new Set(LESSON_KEYS[level] ?? [])}
        trace={trace}
        active={new Set(done.slice(-1))}
        used={new Set(done)}
        marks={{ 'mark-trace': done }}
        onClick={(id) => click(id)}
        interactive
        fadeIdle={false}
        camera="fit"
        label="Click the parts in signal order"
      />
      <div class="toolbar">
        <button class="btn" onClick={hint} disabled={finished}>Hint</button>
        <button class="btn" onClick={next}>New instruction</button>
        <span class="small muted">Mistakes: {mistakes}</span>
      </div>
      {msg && <div class={`feedback ${msg.ok ? 'good' : 'bad'}`} role="status">{msg.text}</div>}
    </div>
  );
}
