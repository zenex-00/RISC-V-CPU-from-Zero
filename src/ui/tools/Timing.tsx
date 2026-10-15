// Timing lab: edit block delays, find each instruction's critical path, the
// slowest instruction and the minimum clock period.

import { useMemo, useState } from 'preact/hooks';
import { DEFAULT_DELAYS, DELAY_INFO, TIMING_CLASSES, timingFor, criticalSummary, type Delays } from '../../sim/timing';
import type { Mnemonic } from '../../sim/isa';
import { pathParts } from '../../diagram/paths';
import { Diagram } from '../components/Diagram';
import { recordConcept, recordExercise } from '../store';

const NODE_NAME: Record<string, string> = {
  pc: 'PC clock-to-Q', imem: 'instruction memory', ctrl: 'control unit', rf: 'register file read', immgen: 'immediate generator',
  pcadd: 'PC + 4 adder', bradd: 'branch adder', srcamux: 'SrcA mux', srcbmux: 'SrcB mux', alu: 'ALU', brlogic: 'branch logic',
  tgtmux: 'target mux', pcmux: 'PC mux', dmem: 'data memory read', ldext: 'load extend', stalign: 'store align', resmux: 'result mux',
  'rf-write': 'register file setup', 'dmem-write': 'memory write setup', 'pc-write': 'PC setup',
};

export function TimingLab() {
  const [d, setD] = useState<Delays>({ ...DEFAULT_DELAYS });
  const [sel, setSel] = useState<Mnemonic>('lw');
  const [more, setMore] = useState(false);
  const [guess, setGuess] = useState<string | null>(null);
  const [calc, setCalc] = useState('');
  const [calcDone, setCalcDone] = useState<null | boolean>(null);
  const sum = useMemo(() => criticalSummary(d), [d]);
  const t = useMemo(() => timingFor(sel, d), [sel, d]);
  const marks = useMemo(() => ({ 'mark-crit': pathParts(t.path) }), [t]);
  const freq = (ps: number) => (ps > 0 ? `${(1e6 / ps).toFixed(0)} MHz` : '—');
  // Pipeline estimate: five stages, each a register-to-register path.
  const stages = [
    { name: 'Fetch', ps: d.pcq + d.mem + d.setup },
    { name: 'Decode', ps: d.pcq + Math.max(d.rf, d.dec + d.ext) + d.setup },
    { name: 'Execute', ps: d.pcq + d.mux + d.alu + d.setup },
    { name: 'Memory', ps: d.pcq + d.mem + d.ldst + d.setup },
    { name: 'Write-back', ps: d.pcq + d.mux + d.rfsetup },
  ];
  const pipe = Math.max(...stages.map((s) => s.ps));
  const avgUse = TIMING_CLASSES.reduce((s, op) => s + sum.byInstr[op], 0) / TIMING_CLASSES.length;

  return (
    <div class="stack page">
      {guess === null ? (
        <div class="card predict">
          <h4>Predict first</h4>
          <p>With the default delays, which instruction class has the longest path?</p>
          <div class="opts">
            {(['add', 'lw', 'sw', 'beq', 'jal'] as Mnemonic[]).map((o) => (
              <button key={o} class="btn opt" onClick={() => { setGuess(o); recordConcept('critical-path', o === criticalSummary(DEFAULT_DELAYS).slowest); recordExercise('12:predict', o === criticalSummary(DEFAULT_DELAYS).slowest ? 1 : 0); }}>{o}</button>
            ))}
          </div>
        </div>
      ) : (
        <div class={`feedback ${guess === criticalSummary(DEFAULT_DELAYS).slowest ? 'good' : 'bad'}`}>
          <strong>{guess === criticalSummary(DEFAULT_DELAYS).slowest ? 'Correct:' : `Not ${guess}:`}</strong>{' '}
          <span class="fb-body">lw is the slowest. It is the only instruction that goes through both memories, the register file, the ALU, the load-extend logic and the result mux before the register write.</span>
        </div>
      )}
      <section class="card">
        <h3>Compute it yourself</h3>
        <p class="small">Using the delays below, add up the critical path of lw: PC clock-to-Q, memory, register file, mux, ALU, memory, load extend, mux, register file setup. What is the minimum clock period in ps?</p>
        <div class="row">
          <input type="number" value={calc} onInput={(e) => { setCalc((e.target as HTMLInputElement).value); setCalcDone(null); }} aria-label="Your minimum clock period in picoseconds" style={{ width: '120px' }} />
          <button class="btn" onClick={() => { const ok = Math.abs(+calc - sum.period) <= 1; setCalcDone(ok); recordConcept('clock-period', ok); recordExercise('12:compute', ok ? 1 : 0); }}>Check</button>
        </div>
        {calcDone !== null && (
          <div class={`feedback ${calcDone ? 'good' : 'bad'}`} role="status">
            {calcDone ? 'Correct.' : 'Not quite.'}{' '}
            <span class="fb-body">{d.pcq} + {d.mem} + {d.rf} + {d.mux} + {d.alu} + {d.mem} + {d.ldst} + {d.mux} + {d.rfsetup} = {timingFor('lw', d).total} ps for lw{sum.slowest !== 'lw' ? `, but with these delays ${sum.slowest} is slower: ${sum.period} ps` : ''}. The control unit and immediate generator finish earlier, so they are off the critical path.</span>
          </div>
        )}
      </section>
      <div class="grid2">
        <section class="card">
          <h3>Block delays (ps)</h3>
          <div class="sig-grid">
            {DELAY_INFO.filter((x) => x.main || more).map((x) => (
              <label key={x.key}>
                <span style={{ color: 'var(--ink-2)', fontFamily: 'var(--font)', fontWeight: 600 }}>{x.label}</span>
                <input type="number" min={0} max={2000} step={5} value={d[x.key]} onInput={(e) => setD({ ...d, [x.key]: Math.max(0, +(e.target as HTMLInputElement).value || 0) })} aria-label={x.label} />
              </label>
            ))}
          </div>
          <div class="toolbar" style={{ marginTop: '8px' }}>
            <button class="btn small" onClick={() => setMore(!more)}>{more ? 'Fewer' : 'More'} delays</button>
            <button class="btn small" onClick={() => setD({ ...DEFAULT_DELAYS })}>Defaults</button>
            <button class="btn small" onClick={() => setD({ ...d, mem: Math.round(d.mem / 2) })}>Halve memory delay</button>
          </div>
          <p class="small muted">Illustrative values in the range of textbook examples; real numbers depend on the process and the memory.</p>
        </section>
        <section class="card">
          <h3>Per instruction</h3>
          <div class="tablewrap">
            <table class="t">
              <thead><tr><th class="l">instr</th><th>path (ps)</th><th class="l">ends at</th><th class="l">cycle used</th></tr></thead>
              <tbody>
                {TIMING_CLASSES.map((op) => {
                  const tt = timingFor(op, d);
                  return (
                    <tr key={op} class={op === sel ? 'sel' : ''} onClick={() => setSel(op)} style={{ cursor: 'pointer' }}>
                      <td class="mono l"><button class="btn ghost small" onClick={() => setSel(op)} aria-pressed={op === sel}>{op}{op === sum.slowest ? ' (slowest)' : ''}</button></td>
                      <td class="mono">{tt.total}</td>
                      <td class="l small">{tt.endpoint === 'rf' ? 'register write' : tt.endpoint === 'dmem' ? 'memory write' : 'PC'}</td>
                      <td class="l"><div class="progress-bar" style={{ width: '120px' }}><i style={{ width: `${(100 * tt.total) / sum.period}%` }} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Minimum clock period = <b class="mono">{sum.period} ps</b> ({freq(sum.period)}), set by <b>{sum.slowest}</b>.
          </p>
          <p class="small">Every instruction gets this full period. On average the instructions above need {Math.round(avgUse)} ps, so {Math.round(100 * (1 - avgUse / sum.period))}% of the cycle time is wasted waiting.</p>
        </section>
      </div>
      <section class="card">
        <h3>Critical path of {sel}: {t.total} ps</h3>
        <div class="tablewrap">
          <table class="t">
            <thead><tr><th class="l">block</th><th>valid at (ps)</th></tr></thead>
            <tbody>
              {t.path.map((n) => (
                <tr key={n}><td class="l">{NODE_NAME[n] ?? n}</td><td class="mono">{n.endsWith('-write') ? t.total : t.arrival[n]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="small">The path follows only the inputs each mux actually selects for {sel}. A mux output is valid after both its selected data input and its select line are valid, plus the mux delay.</p>
      </section>
      <Diagram level={11} revealed={new Set()} trace={null} marks={marks} camera="fit" legend={false} label={`Critical path of ${sel}`} />
      <section class="card">
        <h3>Why this motivates multi-cycle and pipelined designs</h3>
        <p>A <b>multi-cycle</b> design splits each instruction into steps of one short cycle each, so an instruction takes only as many cycles as it needs (and can reuse one ALU and one memory). A <b>pipelined</b> design also splits the work into stages but overlaps instructions, finishing one per short cycle.</p>
        <div class="tablewrap">
          <table class="t">
            <thead><tr>{stages.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
            <tbody><tr>{stages.map((s) => <td key={s.name} class="mono" style={s.ps === pipe ? { background: 'var(--hl)' } : undefined}>{s.ps} ps</td>)}</tr></tbody>
          </table>
        </div>
        <p class="small">With pipeline registers between five stages, the clock period becomes the slowest stage, about {pipe} ps here instead of {sum.period} ps: roughly {(sum.period / pipe).toFixed(1)}× the throughput in the ideal case. The price is hazards (dependent instructions and branches in flight), which forwarding, stalls and branch prediction handle.</p>
      </section>
    </div>
  );
}
