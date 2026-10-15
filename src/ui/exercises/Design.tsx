// Design challenges: add a new instruction. The learner picks datapath changes
// and writes the control row; the simulator runs tests against reference
// semantics, and re-runs the existing instructions to catch regressions.

import { useState } from 'preact/hooks';
import { ALU_NAME, ALU_OPS } from '../../sim/alu';
import { bin } from '../../sim/bits';
import type { Ctrl } from '../../sim/control';
import type { Mods } from '../../sim/datapath';
import { CHALLENGES, runDesign, type ModKey } from './designcore';
import { recordExercise, recordConcept } from '../store';

const SIGS: (keyof Ctrl | 'ALU')[] = ['RegWrite', 'ImmSrc', 'ALUSrcA', 'ALUSrc', 'ALU', 'MemRead', 'MemWrite', 'ResultSrc', 'Branch', 'Jump', 'PCTargetSrc'];

function sigOptions(sig: string, mods: Set<ModKey>, base: Mods): { v: string; label: string }[] {
  switch (sig) {
    case 'ImmSrc': return ['I', 'S', 'B', 'U', 'J'].map((x) => ({ v: x, label: x }));
    case 'ALUSrcA': return [{ v: '0', label: '00 RD1' }, { v: '1', label: '01 PC' }, ...(!base.noSrcAZero || mods.has('srcAZero') ? [{ v: '2', label: '10 zero' }] : [])];
    case 'ALUSrc': return [{ v: '0', label: '0 RD2' }, { v: '1', label: '1 ImmExt' }, ...(mods.has('srcBZero') ? [{ v: '2', label: '2 zero' }] : [])];
    case 'ResultSrc': return [{ v: '0', label: '00 ALUResult' }, { v: '1', label: '01 memory' }, { v: '2', label: '10 PC + 4' }, ...(mods.has('resultImm') ? [{ v: '3', label: '11 ImmExt' }] : [])];
    case 'ALU': return ALU_OPS.map((o) => ({ v: String(o), label: ALU_NAME[o] }));
    default: return [{ v: '0', label: '0' }, { v: '1', label: '1' }];
  }
}

export function DesignEx({ challenge, exId }: { challenge: string; exId: string }) {
  const [cid, setCid] = useState(challenge in CHALLENGES ? challenge : 'lui');
  const ch = CHALLENGES[cid];
  const [mods, setMods] = useState<Set<ModKey>>(new Set());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [res, setRes] = useState<null | { rows: { label: string; ok: boolean; why: string }[]; reg: { label: string; ok: boolean; why: string }[] }>(null);
  const [showSol, setShowSol] = useState(false);
  const extraSigs = ch.options.filter((o) => mods.has(o.key) && o.adds).map((o) => o.adds!).filter((x, i, a) => a.indexOf(x) === i);
  const sigs = [...SIGS, ...extraSigs];
  const complete = sigs.every((s) => vals[s] !== undefined && vals[s] !== '');

  const run = () => {
    const r = runDesign(ch, mods, vals);
    setRes({ rows: r.rows, reg: r.reg });
    recordExercise(exId, r.ok ? 1 : (r.rows.filter((x) => x.ok).length / r.rows.length) * 0.7);
    recordConcept(`design:${ch.id}`, r.ok);
  };

  return (
    <div class="stack">
      <div class="pill-row" role="tablist" aria-label="Challenges">
        {Object.values(CHALLENGES).map((c) => (
          <button key={c.id} class={`btn small ${c.id === cid ? 'on' : ''}`} onClick={() => { setCid(c.id); setMods(new Set()); setVals({}); setRes(null); setShowSol(false); }}>
            {c.title}
          </button>
        ))}
      </div>
      <div class="card tight">
        <p class="prompt-asm">{ch.syntax}</p>
        <p>{ch.meaning}</p>
        <p class="small muted">{ch.encoding}</p>
      </div>
      <h4>1. Change the datapath (choose what is needed)</h4>
      <div class="stack" style={{ gap: '4px' }}>
        {ch.options.map((o) => (
          <label key={o.key} class="small" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={mods.has(o.key)} onChange={() => { const n = new Set(mods); n.has(o.key) ? n.delete(o.key) : n.add(o.key); setMods(n); setRes(null); }} />
            <span>{o.label}{o.adds ? <> (new signal <span class="ctl">{o.adds}</span>)</> : null}</span>
          </label>
        ))}
      </div>
      <h4>2. Write the control row for opcode {bin(ch.opcode, 7)}</h4>
      <div class="sig-grid">
        {sigs.map((s) => (
          <label key={s}>
            <span>{s === 'ALU' ? 'ALU operation' : s}</span>
            <select value={vals[s] ?? ''} onChange={(e) => { setVals({ ...vals, [s]: (e.target as HTMLSelectElement).value }); setRes(null); }}>
              <option value="">?</option>
              {sigOptions(s, mods, ch.base).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div class="toolbar">
        <button class="btn primary" disabled={!complete} onClick={run}>Test the design</button>
        <button class="btn" onClick={() => setShowSol(!showSol)}>{showSol ? 'Hide' : 'Show'} a model solution</button>
        {!complete && <span class="small muted">Set every signal first. ALU operation means you are extending the ALU decoder.</span>}
      </div>
      {res && (
        <div class="tablewrap">
          <table class="t">
            <thead><tr><th class="l">test</th><th>result</th><th class="l">details</th></tr></thead>
            <tbody>
              {res.rows.map((r) => (
                <tr key={r.label}><td class="mono l">{r.label}</td><td><span class={`badge ${r.ok ? 'good' : 'bad'}`}>{r.ok ? 'pass' : 'fail'}</span></td><td class="l small">{r.why || 'matches the reference'}</td></tr>
              ))}
              <tr><th colSpan={3} class="l">Existing instructions on the modified datapath (new signals = 0)</th></tr>
              {res.reg.map((r) => (
                <tr key={r.label}><td class="mono l">{r.label}</td><td><span class={`badge ${r.ok ? 'good' : 'bad'}`}>{r.ok ? 'pass' : 'fail'}</span></td><td class="l small">{r.why || 'unchanged'}</td></tr>
              ))}
            </tbody>
          </table>
          <div class={`feedback ${res.rows.every((r) => r.ok) && res.reg.every((r) => r.ok) ? 'good' : 'bad'}`} role="status">
            {res.rows.every((r) => r.ok) && res.reg.every((r) => r.ok) ? 'Your design implements the instruction and breaks nothing else.' : 'Some tests fail. Each failing line says what the simulator saw.'}
          </div>
        </div>
      )}
      {showSol && <div class="answer"><span class="fb-body">{ch.solution}</span></div>}
    </div>
  );
}

