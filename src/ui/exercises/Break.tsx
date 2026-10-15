// Break the circuit: a wire is cut or a control signal is stuck. Predict which
// instructions fail, then run them on the faulty and the correct circuit.

import { useMemo, useState } from 'preact/hooks';
import type { Mnemonic } from '../../sim/isa';
import { evaluate, type Fault } from '../../sim/datapath';
import { machineFor } from '../engine';
import { describeDiff, outcome, STUB_OF } from './Control';
import { Diagram } from '../components/Diagram';
import { LESSON_KEYS } from '../../diagram/visibility';
import { recordConcept, recordExercise } from '../store';

export { TESTS } from './tests-data';
import { TESTS } from './tests-data';

const CUT_WIRES: Record<string, string[]> = {
  pcplus4_to_pcmux: ['w_pcp4'],
  imm_to_srcb: ['w_imm_srcb'],
  zero_to_branch: ['w_zero', 'w_zero_direct'],
  rd2_to_store: ['w_rd2_store', 'w_rd2_store_direct'],
  readdata_to_result: ['w_ldext_res', 'w_rd_direct'],
  a3: ['w_a3'],
  pctarget_to_pcmux: ['w_pctarget_direct', 'w_tgt_pcmux'],
  result_to_wd3: ['w_result', 'w_res_direct'],
};

const CUT_NAME: Record<string, string> = {
  pcplus4_to_pcmux: 'the wire from PC + 4 into the PC mux',
  imm_to_srcb: 'the wire from ImmExt into the ALUSrc mux',
  zero_to_branch: 'the Zero flag wire into the branch logic',
  rd2_to_store: 'the wire carrying RD2 to the data memory write data',
  readdata_to_result: 'the load data wire into the result mux',
  a3: 'the rd field wire into write address A3',
  pctarget_to_pcmux: 'the target wire into the PC mux',
  result_to_wd3: 'the Result wire into WD3',
};

export function parseFault(s: string): Fault {
  const p = s.split(':');
  if (p[0] === 'cut') return { kind: 'cut', wire: p[1] as never };
  return { kind: 'stuck', signal: p[1] as never, value: +p[2] };
}

export function faultText(s: string): string {
  const p = s.split(':');
  if (p[0] === 'cut') return `Cut: ${CUT_NAME[p[1]] ?? p[1]} (a cut input reads 0).`;
  return `Stuck-at fault: ${p[1]} is stuck at ${p[2]} for every instruction.`;
}

export function BreakEx({ faults, scope, level, exId }: { faults: string[]; scope: Mnemonic[]; level: number; exId: string }) {
  const tests = TESTS.filter((t) => scope.includes(t.op));
  const [fi, setFi] = useState(0);
  const [pred, setPred] = useState<Set<string>>(new Set());
  const [ran, setRan] = useState(false);
  const fault = faults[fi];
  const f = parseFault(fault);
  const results = useMemo(
    () =>
      tests.map((t) => {
        const st = machineFor(t.e).state;
        const ref = evaluate(st);
        const bad = evaluate(st, { faults: [f] });
        const diff = describeDiff(ref, bad);
        return { t, fails: diff.length > 0, diff, ref, bad };
      }),
    [fault, tests.length],
  );
  const run = () => {
    setRan(true);
    const right = results.filter((r) => r.fails === pred.has(r.t.name)).length;
    recordExercise(`${exId}:${fi}`, right / results.length);
    recordExercise(exId, right / results.length);
    recordConcept(`break:${fault}`, right === results.length);
  };
  const marks: Record<string, string[]> = f.kind === 'cut' ? { 'mark-cut': CUT_WIRES[f.wire] ?? [] } : { 'mark-wrong': STUB_OF[f.signal] ?? [] };
  return (
    <div class="stack">
      <div class="pill-row" role="tablist" aria-label="Faults">
        {faults.map((x, i) => (
          <button key={x} class={`btn small ${i === fi ? 'on' : ''}`} onClick={() => { setFi(i); setPred(new Set()); setRan(false); }}>
            Fault {i + 1}
          </button>
        ))}
      </div>
      <div class="route">{faultText(fault)}</div>
      <Diagram level={level} revealed={new Set(LESSON_KEYS[level] ?? [])} trace={null} marks={marks} camera="fit" legend={false} label="Circuit with the fault marked" />
      <p class="small">Which of these instructions now give a wrong result (wrong register, memory, next PC, or a fault)? Tick them, then run the test program.</p>
      <div class="pill-row">
        {tests.map((t) => (
          <label key={t.name} class="btn small" style={{ gap: '6px' }}>
            <input type="checkbox" checked={pred.has(t.name)} disabled={ran} onChange={() => { const n = new Set(pred); n.has(t.name) ? n.delete(t.name) : n.add(t.name); setPred(n); }} />
            {t.name}
          </label>
        ))}
      </div>
      <div class="toolbar">
        <button class="btn primary" onClick={run} disabled={ran}>Run the test program</button>
        {ran && <button class="btn" onClick={() => { setPred(new Set()); setRan(false); }}>Try again</button>}
      </div>
      {ran && (
        <div class="tablewrap">
          <table class="t">
            <thead><tr><th class="l">instruction</th><th>you said</th><th>actual</th><th class="l">what happens with the fault</th></tr></thead>
            <tbody>
              {results.map((r) => {
                const ok = r.fails === pred.has(r.t.name);
                return (
                  <tr key={r.t.name}>
                    <td class="mono l">{r.t.e.asm}</td>
                    <td>{pred.has(r.t.name) ? 'fails' : 'works'}</td>
                    <td><span class={`badge ${ok ? 'good' : 'bad'}`}>{r.fails ? 'fails' : 'works'}</span></td>
                    <td class="l small">{r.fails ? r.diff.join('; ') : `Unaffected: ${outcome(r.ref).reg ?? outcome(r.ref).mem ?? 'next PC ' + outcome(r.ref).pc}.`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p class="small" style={{ marginTop: '6px' }}>
            {results.filter((r) => r.fails === pred.has(r.t.name)).length} of {results.length} predicted correctly.
          </p>
        </div>
      )}
    </div>
  );
}
