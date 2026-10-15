// Set the control signals: run the circuit with exactly the learner's signals
// and explain what each mistake does.

import { useMemo, useState } from 'preact/hooks';
import type { Mnemonic } from '../../sim/isa';
import { DEF } from '../../sim/isa';
import { evaluate, type Trace } from '../../sim/datapath';
import { mainDecode, type Ctrl } from '../../sim/control';
import { ALU, ALU_NAME, ALU_OPS } from '../../sim/alu';
import { machineFor } from '../engine';
import { exampleFor, pick } from './gen';
import { recordConcept, recordExercise } from '../store';
import { Diagram } from '../components/Diagram';
import { LESSON_KEYS } from '../../diagram/visibility';
import type { Example } from '../../lessons/types';
import type { ImmSrc } from '../../sim/immgen';

type Sig = keyof Ctrl | 'ALUControl';

export const SIG_LEVEL: Record<string, number> = {
  RegWrite: 2, ALUControl: 2, ImmSrc: 3, ALUSrc: 3, MemRead: 4, ResultSrc: 4, MemWrite: 5, Branch: 6, Jump: 8, PCTargetSrc: 8, ALUSrcA: 9,
};
const ORDER: Sig[] = ['RegWrite', 'ImmSrc', 'ALUSrcA', 'ALUSrc', 'ALUControl', 'MemRead', 'MemWrite', 'ResultSrc', 'Branch', 'Jump', 'PCTargetSrc'];
const IMM_LEVEL: Record<ImmSrc, number> = { I: 3, S: 5, B: 6, J: 8, U: 9 };

export const STUB_OF: Record<string, string[]> = {
  RegWrite: ['c_regwrite', 'c_cu_RegWrite'], ImmSrc: ['c_immsrc', 'c_cu_ImmSrc'], ALUSrc: ['c_alusrc', 'c_cu_ALUSrc'], ALUSrcA: ['c_alusrca', 'c_cu_ALUSrcA'],
  MemRead: ['c_memread', 'c_cu_MemRead'], MemWrite: ['c_memwrite', 'c_cu_MemWrite'], ResultSrc: ['c_resultsrc', 'c_cu_ResultSrc'], Branch: ['c_branch', 'c_cu_Branch'],
  Jump: ['c_jump', 'c_cu_Jump'], PCTargetSrc: ['c_pctargetsrc', 'c_cu_PCTargetSrc'], ALUControl: ['c_alucontrol', 'c_cu_ALUControl'],
};

function options(sig: Sig, level: number): { v: string; label: string }[] {
  switch (sig) {
    case 'ImmSrc':
      return (['I', 'S', 'B', 'J', 'U'] as ImmSrc[]).filter((s) => IMM_LEVEL[s] <= level).map((s) => ({ v: s, label: s }));
    case 'ALUSrcA':
      return [{ v: '0', label: '00 RD1' }, { v: '1', label: '01 PC' }, { v: '2', label: '10 zero' }];
    case 'ResultSrc':
      return [{ v: '0', label: '00 ALUResult' }, { v: '1', label: '01 memory' }, ...(level >= 8 ? [{ v: '2', label: '10 PC + 4' }] : [])];
    case 'ALUControl':
      return ALU_OPS.map((o) => ({ v: String(o), label: ALU_NAME[o] }));
    case 'PCTargetSrc':
      return [{ v: '0', label: '0 PC + imm' }, { v: '1', label: '1 rs1 + imm' }];
    case 'ALUSrc':
      return [{ v: '0', label: '0 RD2' }, { v: '1', label: '1 ImmExt' }];
    default:
      return [{ v: '0', label: '0' }, { v: '1', label: '1' }];
  }
}

import { outcome, describeDiff, same } from './diff';
export { outcome, describeDiff };

function fmtSig(sig: Sig, v: number | string): string {
  if (sig === 'ALUControl') return ALU_NAME[v as number] ?? String(v);
  if (sig === 'ResultSrc' || sig === 'ALUSrcA') return Number(v).toString(2).padStart(2, '0');
  return String(v);
}

export function ControlEx({ ops, exId, level }: { ops: Mnemonic[]; exId: string; level: number }) {
  const [ex, setEx] = useState<{ op: Mnemonic; e: Example }>(() => {
    const op = pick(ops);
    return { op, e: exampleFor(op) };
  });
  const sigs = ORDER.filter((s) => SIG_LEVEL[s] <= level);
  const blank = (): Record<string, string> => Object.fromEntries(sigs.map((s) => [s, '']));
  const [vals, setVals] = useState<Record<string, string>>(blank);
  const [res, setRes] = useState<null | { ok: boolean; wrong: { sig: Sig; msg: string }[]; dc: Sig[]; notes: string[]; got: Trace; ref: Trace }>(null);
  const def = DEF[ex.op];
  const refCtrl = mainDecode(def.opcode).ctrl;
  const row = mainDecode(def.opcode).row!;
  const machine = useMemo(() => machineFor(ex.e).state, [ex]);
  const refTrace = useMemo(() => evaluate(machine), [machine]);

  const build = (v: Record<string, string>) => {
    const c: Partial<Ctrl> = { ...refCtrl };
    let aluControl = refTrace.ALUControl;
    for (const s of sigs) {
      if (v[s] === '') continue;
      if (s === 'ALUControl') aluControl = +v[s];
      else if (s === 'ImmSrc') c.ImmSrc = v[s] as ImmSrc;
      else (c as Record<string, number>)[s] = +v[s];
    }
    return { ctrl: c, aluControl };
  };

  const check = () => {
    if (sigs.some((s) => vals[s] === '')) return;
    const mine = build(vals);
    const got = evaluate(machine, mine);
    const wrong: { sig: Sig; msg: string }[] = [];
    const dc: Sig[] = [];
    const notes: string[] = [];
    for (const s of sigs) {
      const refV = s === 'ALUControl' ? refTrace.ALUControl : (refCtrl as unknown as Record<string, number | string>)[s];
      if (String(refV) === vals[s]) continue;
      // Effect of this one signal alone.
      const one = build(Object.fromEntries(sigs.map((x) => [x, x === s ? vals[s] : ''])));
      const t1 = evaluate(machine, one);
      const diff = describeDiff(refTrace, t1);
      if (!diff.length) {
        if (s === 'MemRead' && vals[s] === '1') notes.push('MemRead = 1 is not needed here. It does no harm in this model, but it wastes energy, and on a real memory bus a read of an I/O register can have side effects.');
        else dc.push(s);
        continue;
      }
      wrong.push({ sig: s, msg: `${s} = ${fmtSig(s, vals[s])} should be ${fmtSig(s, refV)}: ${diff.join('; ')}.` });
    }
    const ok = same(outcome(got), outcome(refTrace)) && wrong.length === 0;
    setRes({ ok, wrong, dc, notes, got, ref: refTrace });
    const score = (sigs.length - wrong.length) / sigs.length;
    recordExercise(exId, ok ? 1 : score * 0.8);
    recordConcept(`ctrl:${row.name}`, ok);
  };

  const next = () => {
    const op = pick(ops);
    setEx({ op, e: exampleFor(op) });
    setVals(blank());
    setRes(null);
  };

  const wrongStubs = res ? res.wrong.flatMap((w) => STUB_OF[w.sig] ?? []) : [];
  const keys = new Set(LESSON_KEYS[level] ?? []);
  return (
    <div class="stack">
      <div class="row">
        <span class="muted small">Instruction:</span>
        <span class="prompt-asm">{ex.e.asm}</span>
        <span class="badge">{row.name}</span>
      </div>
      <div class="sig-grid">
        {sigs.map((s) => (
          <label key={s}>
            <span>{s}</span>
            <select
              value={vals[s]}
              class={res && res.wrong.some((w) => w.sig === s) ? 'wrong' : res && res.dc.includes(s) ? 'dc' : ''}
              onChange={(e) => { setVals({ ...vals, [s]: (e.target as HTMLSelectElement).value }); setRes(null); }}
            >
              <option value="">?</option>
              {options(s, level).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div class="toolbar">
        <button class="btn primary" onClick={check} disabled={sigs.some((s) => vals[s] === '')}>Run the circuit with these signals</button>
        <button class="btn" onClick={next}>New instruction</button>
        {sigs.some((s) => vals[s] === '') && <span class="small muted">Set every signal first.</span>}
      </div>
      {res && (
        <div class={`feedback ${res.ok ? 'good' : 'bad'}`} role="status">
          <strong>{res.ok ? 'The circuit does exactly what the instruction means.' : 'The circuit misbehaves.'}</strong>
          <div class="fb-body">
            {res.wrong.length > 0 && <ul>{res.wrong.map((w) => <li key={w.sig}>{w.msg}</li>)}</ul>}
            {res.dc.length > 0 && <p class="small" style={{ marginTop: '6px' }}>Different from the reference but harmless (don't care for {row.name}): {res.dc.join(', ')}.</p>}
            {res.notes.map((n, i) => <p key={i} class="small">{n}</p>)}
            <table class="t" style={{ marginTop: '8px' }}>
              <thead><tr><th></th><th class="l">correct circuit</th><th class="l">your signals</th></tr></thead>
              <tbody>
                {(['reg', 'mem', 'pc', 'fault'] as const).map((k) => (
                  <tr key={k}>
                    <th class="l">{k === 'reg' ? 'register write' : k === 'mem' ? 'memory write' : k === 'pc' ? 'next PC' : 'fault'}</th>
                    <td class="mono l">{outcome(res.ref)[k] ?? '—'}</td>
                    <td class="mono l">{outcome(res.got)[k] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {res && (
        <Diagram
          level={level}
          revealed={keys}
          trace={res.got}
          active={new Set()}
          used={allUsed(level)}
          marks={{ 'mark-wrong': wrongStubs }}
          camera="fit"
          label="Your circuit with your control signals"
        />
      )}
    </div>
  );
}

import { WIRES, COMPS } from '../../diagram/layout';
const usedCache = new Map<number, Set<string>>();
function allUsed(level: number): Set<string> {
  let s = usedCache.get(level);
  if (!s) {
    s = new Set([...WIRES.map((w) => w.id), ...COMPS.map((c) => c.id)]);
    usedCache.set(level, s);
  }
  return s;
}

void ALU;
