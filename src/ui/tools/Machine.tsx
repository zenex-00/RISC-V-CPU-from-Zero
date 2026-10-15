// Program runner: assemble, step, run, breakpoints, registers, memory, PC trail.
// Used by Lesson 11 and by the sandbox.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { assemble, type AsmResult } from '../../sim/assembler';
import { commit, evaluate, isHaltLoop, newState, undo, type MachineState, type Trace, type Undo } from '../../sim/datapath';
import { hex, u32 } from '../../sim/bits';
import { ABI } from '../../sim/isa';
import { DMEM_BASE, DMEM_BYTES } from '../../sim/memory';
import { PROGRAMS } from '../../sim/programs';
import { canRun, levelNeeded, LEVEL_REASON } from '../../sim/scope';
import { Diagram } from '../components/Diagram';
import { InstrCard } from '../components/InstrCard';
import { WIRES, COMPS } from '../../diagram/layout';
import { LESSON_KEYS } from '../../diagram/visibility';
import { parseImm } from '../../sim/assembler';

const ALL_PARTS = new Set([...WIRES.map((w) => w.id), ...COMPS.map((c) => c.id)]);
const SPEEDS = [1, 2, 5, 10, 30, 100, 0]; // steps per second; 0 = as fast as possible

interface Snapshot {
  regs: Uint32Array;
  mem: Map<number, number>;
}

function snap(s: MachineState): Snapshot {
  const mem = new Map<number, number>();
  for (let a = 0; a < DMEM_BYTES; a += 4) {
    const v = s.dmem.readWord(DMEM_BASE + a);
    if (v) mem.set(DMEM_BASE + a, v);
  }
  return { regs: new Uint32Array(s.regs), mem };
}

export function Machine({ level = 11, sandbox = false, initial }: { level?: number; sandbox?: boolean; initial?: string }) {
  const [src, setSrc] = useState(initial ?? PROGRAMS[0].source);
  const [asm, setAsm] = useState<AsmResult>(() => assemble(initial ?? PROGRAMS[0].source));
  const [, setTick] = useState(0);
  const st = useRef<MachineState>(newState(asm.words));
  const hist = useRef<Undo[]>([]);
  const trail = useRef<number[]>([]);
  const visited = useRef<Set<number>>(new Set());
  const prev = useRef<Snapshot>(snap(st.current));
  const [cycles, setCycles] = useState(0);
  const [halt, setHalt] = useState<string | null>(null);
  const [bps, setBps] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [hexRegs, setHexRegs] = useState(false);
  const [editReg, setEditReg] = useState<number | null>(null);
  const [memAddr, setMemAddr] = useState('0x1000');
  const rerender = () => setTick((x) => x + 1);

  const reset = (words = asm.words) => {
    st.current = newState(words);
    st.current.regs[2] = DMEM_BASE + DMEM_BYTES; // sp at the top of data memory
    hist.current = [];
    trail.current = [];
    visited.current = new Set([0]);
    prev.current = snap(st.current);
    setCycles(0);
    setHalt(null);
    setRunning(false);
    rerender();
  };
  useEffect(() => reset(), []);

  const doAssemble = (text = src) => {
    const r = assemble(text);
    setAsm(r);
    if (r.ok) reset(r.words);
  };

  const trace: Trace = evaluate(st.current);
  const op = trace.decoded?.op;
  const blocked = op && !canRun(op, level) ? `This circuit cannot run ${op} yet: it needs ${LEVEL_REASON[levelNeeded(op)]}.` : null;

  /** One clock cycle. Returns false when the machine should stop. */
  const stepOnce = (): boolean => {
    const s = st.current;
    const w = s.imem[(s.pc >>> 2) & 1023];
    if (isHaltLoop(w)) {
      setHalt('Finished: the program jumped to itself (j .).');
      return false;
    }
    const t = evaluate(s);
    if (t.fault) {
      setHalt(`Stopped: ${t.fault}.`);
      return false;
    }
    if (t.decoded && !canRun(t.decoded.op, level)) {
      setHalt(`Stopped: ${t.decoded.op} needs ${LEVEL_REASON[levelNeeded(t.decoded.op)]}.`);
      return false;
    }
    prev.current = snap(s);
    hist.current.push(commit(s, t));
    if (hist.current.length > 5000) hist.current.shift();
    trail.current.push(t.PC);
    if (trail.current.length > 200) trail.current.shift();
    visited.current.add(s.pc);
    setCycles((c) => c + 1);
    return true;
  };

  const step = () => {
    setHalt(null);
    stepOnce();
    rerender();
  };
  const back = () => {
    const u = hist.current.pop();
    if (!u) return;
    prev.current = snap(st.current);
    undo(st.current, u);
    trail.current.pop();
    setCycles((c) => Math.max(0, c - 1));
    setHalt(null);
    rerender();
  };

  // Run loop: a timer that stops at a halt, a breakpoint, or when the tab is hidden.
  useEffect(() => {
    if (!running) return;
    let stop = false;
    const sps = SPEEDS[speed];
    const tick = () => {
      if (stop) return;
      if (document.hidden) return;
      const n = sps === 0 ? 2000 : 1;
      for (let i = 0; i < n; i++) {
        if (!stepOnce()) {
          setRunning(false);
          break;
        }
        if (bps.has(st.current.pc)) {
          setRunning(false);
          setHalt(`Breakpoint at ${hex(st.current.pc)}.`);
          break;
        }
        if (cyclesRef.current++ > 200000) {
          setRunning(false);
          setHalt('Stopped after 200,000 cycles.');
          break;
        }
      }
      rerender();
    };
    // The timer only exists while the tab is visible.
    let id = 0;
    const start = () => {
      if (!id && !document.hidden) id = window.setInterval(tick, sps === 0 ? 16 : 1000 / sps);
    };
    const halt = () => {
      if (id) window.clearInterval(id);
      id = 0;
    };
    const vis = () => (document.hidden ? halt() : start());
    document.addEventListener('visibilitychange', vis);
    start();
    return () => {
      stop = true;
      halt();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [running, speed, bps]);
  const cyclesRef = useRef(0);
  useEffect(() => {
    cyclesRef.current = 0;
  }, [running]);

  const s = st.current;
  const changedReg = (i: number) => prev.current.regs[i] !== s.regs[i];
  const memRows = (() => {
    const rows: number[] = [];
    for (let a = 0; a < DMEM_BYTES; a += 4) if (s.dmem.readWord(DMEM_BASE + a) || prev.current.mem.has(DMEM_BASE + a)) rows.push(DMEM_BASE + a);
    const base = parseImm(memAddr);
    if (base !== null && base >= DMEM_BASE && base < DMEM_BASE + DMEM_BYTES) for (let k = 0; k < 8; k++) rows.push(((base & ~3) + 4 * k) >>> 0);
    return [...new Set(rows)].filter((a) => a < DMEM_BASE + DMEM_BYTES).sort((a, b) => a - b).slice(0, 48);
  })();
  const keys = useMemo(() => new Set(LESSON_KEYS[Math.min(level, 10)] ?? []), [level]);

  const editMemory = (addr: number) => {
    const v = window.prompt(`New value for the word at ${hex(addr)} (decimal or 0x hex):`, hex(s.dmem.readWord(addr)));
    if (v === null) return;
    const n = parseImm(v);
    if (n === null) return;
    s.dmem.setWord(addr, n);
    rerender();
  };

  return (
    <div class="stack">
      <div class="grid2" style={{ gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(320px, 1.1fr)' }}>
        <div class="card tight stack">
          <div class="row">
            {!sandbox && (
              <select aria-label="Example program" onChange={(e) => { const p = PROGRAMS.find((x) => x.id === (e.target as HTMLSelectElement).value)!; setSrc(p.source); doAssemble(p.source); }}>
                {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button class="btn small" onClick={() => doAssemble()}>Assemble and reset</button>
          </div>
          <textarea rows={10} value={src} spellcheck={false} aria-label="Assembly source" onInput={(e) => setSrc((e.target as HTMLTextAreaElement).value)} />
          {!asm.ok && <div class="feedback bad">{asm.errors.map((e, i) => <div key={i}>line {e.line}: {e.msg}</div>)}</div>}
          <div class="codepane" aria-label="Program in memory">
            {asm.lines.map((l) => (
              <div key={l.addr} class={`ln${l.addr === s.pc ? ' cur' : ''}${visited.current.has(l.addr) ? ' visited' : ''}`}>
                <span class="bp" role="button" tabIndex={0} aria-label={`Toggle breakpoint at ${hex(l.addr)}`} title="Breakpoint" onClick={() => { const n = new Set(bps); n.has(l.addr) ? n.delete(l.addr) : n.add(l.addr); setBps(n); }} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLElement).click()}>
                  {bps.has(l.addr) ? '●' : '·'}
                </span>
                <span class="addr">{hex(l.addr, 4)}</span>
                <span class="word">{hex(l.word)}</span>
                <span>{l.src}{l.pseudo ? <span class="muted"> ({l.pseudo})</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
        <div class="stack">
          <div class="toolbar">
            <button class="btn" onClick={back} disabled={!hist.current.length || running} title="Undo the last clock edge">← Step back</button>
            <button class="btn primary" onClick={step} disabled={running || !!blocked || !asm.ok}>Step (one clock edge)</button>
            <button class="btn" onClick={() => { setHalt(null); setRunning(!running); }} disabled={!asm.ok}>{running ? 'Pause' : 'Run'}</button>
            <button class="btn" onClick={() => reset()}>Reset</button>
            <label class="small">Speed{' '}
              <select value={speed} onChange={(e) => setSpeed(+(e.target as HTMLSelectElement).value)} aria-label="Run speed">
                {SPEEDS.map((v, i) => <option key={i} value={i}>{v === 0 ? 'maximum' : `${v} / s`}</option>)}
              </select>
            </label>
          </div>
          <div class="row small">
            <span>PC <b class="mono">{hex(s.pc)}</b></span>
            <span>cycles <b class="mono">{cycles}</b></span>
            <span class="muted">PC trail: <span class="mono">{trail.current.slice(-8).map((p) => hex(p, 3)).join(' → ') || '—'}</span></span>
          </div>
          {halt && <div class="feedback warn" role="status">{halt}</div>}
          {blocked && <div class="feedback bad" role="status">{blocked}</div>}
          {trace.decodeError && !trace.fault && <div class="feedback bad">Cannot decode {hex(trace.Instr)}: {trace.decodeError}</div>}
        </div>
      </div>
      {trace.decoded && <InstrCard d={trace.decoded} />}
      <Diagram level={Math.min(level, 11)} revealed={keys} trace={trace} active={new Set()} used={ALL_PARTS} camera="fit" label="Datapath for the current instruction" />
      <div class="grid2">
        <div class="card tight">
          <div class="row" style={{ justifyContent: 'space-between' }}>
            <h4>Registers</h4>
            <label class="small"><input type="checkbox" checked={hexRegs} onChange={() => setHexRegs(!hexRegs)} /> hex</label>
          </div>
          <div class="regs">
            {Array.from({ length: 32 }, (_, i) => (
              <div key={i} class={changedReg(i) ? 'changed' : ''} title={`x${i} (${ABI[i]})`}>
                <span class="rn">x{i} {ABI[i]}</span>
                {sandbox && i > 0 && editReg === i ? (
                  <input
                    type="text"
                    autoFocus
                    defaultValue={String(s.regs[i] | 0)}
                    style={{ width: '90px', minHeight: '20px', padding: '0 4px', fontFamily: 'var(--mono)' }}
                    aria-label={`Value of x${i}`}
                    onBlur={(e) => { const n = parseImm((e.target as HTMLInputElement).value); if (n !== null) s.regs[i] = u32(n); setEditReg(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditReg(null); }}
                  />
                ) : (
                  <span role={sandbox && i > 0 ? 'button' : undefined} tabIndex={sandbox && i > 0 ? 0 : undefined} onClick={() => sandbox && i > 0 && setEditReg(i)} onKeyDown={(e) => e.key === 'Enter' && sandbox && i > 0 && setEditReg(i)}>
                    {hexRegs ? hex(s.regs[i]) : String(s.regs[i] | 0)}
                  </span>
                )}
              </div>
            ))}
          </div>
          {sandbox && <p class="small muted">Click a value to edit it. x0 is hard-wired to 0.</p>}
        </div>
        <div class="card tight">
          <div class="row" style={{ justifyContent: 'space-between' }}>
            <h4>Data memory</h4>
            <label class="small">view at <input type="text" value={memAddr} onInput={(e) => setMemAddr((e.target as HTMLInputElement).value)} style={{ width: '90px', fontFamily: 'var(--mono)' }} aria-label="Memory address to view" /></label>
          </div>
          <div class="mem">
            {memRows.map((a) => {
              const v = s.dmem.readWord(a);
              const changed = (prev.current.mem.get(a) ?? 0) !== v;
              return (
                <div key={a} class={changed ? 'changed' : ''} style={{ display: 'grid', gridTemplateColumns: '90px 100px 1fr', gap: '6px' }}>
                  <span class="muted">{hex(a)}</span>
                  <span role={sandbox ? 'button' : undefined} tabIndex={sandbox ? 0 : undefined} onClick={() => sandbox && editMemory(a)}>{hex(v)}</span>
                  <span class="muted">{v | 0}</span>
                </div>
              );
            })}
            {!memRows.length && <p class="small muted">All data memory is zero. Range {hex(DMEM_BASE)} to {hex(DMEM_BASE + DMEM_BYTES - 1)}.</p>}
          </div>
          {sandbox && <p class="small muted">Click a word to change it.</p>}
        </div>
      </div>
    </div>
  );
}
