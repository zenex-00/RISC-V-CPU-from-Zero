// Special panels that lessons attach to steps.

import { useState } from 'preact/hooks';
import type { Trace } from '../../sim/datapath';
import { ALU_NAME, aluDecodeTable } from './tables';
import { ISA } from '../../sim/isa';
import { bin } from '../../sim/bits';
import { LessonPanels2 } from './Panels2';

export function SpecialPanel({ id, trace }: { id: string; trace: Trace | null }) {
  switch (id) {
    case 'comb-seq':
      return <CombSeq />;
    case 'clock':
      return <ClockWave />;
    case 'setup-hold':
      return <SetupHold />;
    case 'single-cycle':
      return <SingleCycle />;
    case 'dp-vs-ctrl':
      return <DpVsCtrl />;
    case 'rtype-table':
      return <RTable trace={trace} />;
    case 'itype-table':
      return <ITable trace={trace} />;
  }
  return <LessonPanels2 id={id} trace={trace} />;
}

/* ---------- Lesson 0 ---------- */

function CombSeq() {
  const [a, setA] = useState(5);
  const [b, setB] = useState(3);
  const [d, setD] = useState(7);
  const [q, setQ] = useState(0);
  const [edges, setEdges] = useState(0);
  return (
    <div class="card">
      <h3>Two kinds of logic</h3>
      <div class="grid2">
        <div>
          <h4>Combinational: an adder</h4>
          <p class="small">The output is a function of the current inputs only. Change an input and the output follows after a short propagation delay.</p>
          <div class="row">
            <label>A <input type="number" value={a} onInput={(e) => setA(+(e.target as HTMLInputElement).value | 0)} style={{ width: '80px' }} /></label>
            <label>B <input type="number" value={b} onInput={(e) => setB(+(e.target as HTMLInputElement).value | 0)} style={{ width: '80px' }} /></label>
          </div>
          <p class="prompt-asm" style={{ marginTop: '10px' }} aria-live="polite">A + B = {(a + b) | 0}</p>
        </div>
        <div>
          <h4>Sequential: a register</h4>
          <p class="small">The output Q is stored state. It changes only at a rising clock edge, when it copies D. Between edges, D can change freely and Q does not move.</p>
          <div class="row">
            <label>D <input type="number" value={d} onInput={(e) => setD(+(e.target as HTMLInputElement).value | 0)} style={{ width: '80px' }} /></label>
            <button class="btn" onClick={() => { setQ(d); setEdges(edges + 1); }}>Clock edge ↑</button>
          </div>
          <p class="prompt-asm" style={{ marginTop: '10px' }} aria-live="polite">Q = {q}</p>
          <p class="small muted">Edges so far: {edges}. Change D without clicking: Q stays.</p>
        </div>
      </div>
      <p class="small">A processor is both: combinational logic computes, registers and memories hold the state between clock edges.</p>
    </div>
  );
}

function ClockWave() {
  // D as a sequence of 24 half-period slots (12 cycles... we use 6 cycles x 4 slots).
  const SLOTS = 24;
  const [dv, setDv] = useState<number[]>([0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0]);
  const W = 22;
  const X0 = 50;
  // Rising edges at slots 4, 8, 12, 16, 20 (clock period = 4 slots, high for slots 2..3).
  const edgesAt = [4, 8, 12, 16, 20];
  const q: number[] = [];
  let cur = 0;
  for (let s = 0; s < SLOTS; s++) {
    if (edgesAt.includes(s)) cur = dv[s - 1];
    q.push(cur);
  }
  const wave = (vals: number[], y: number) => {
    let d = `M${X0},${y + (vals[0] ? 0 : 24)}`;
    vals.forEach((v, i) => {
      const yy = y + (v ? 0 : 24);
      d += ` V${yy} H${X0 + (i + 1) * W}`;
    });
    return d;
  };
  const clk = Array.from({ length: SLOTS }, (_, s) => (s % 4 >= 2 ? 1 : 0));
  return (
    <div class="card">
      <h3>The clock edge</h3>
      <p class="small">Click the D waveform to change it. The register samples D at each rising edge of CLK (dashed lines) and holds that value until the next edge. Changes of D between edges are invisible to Q.</p>
      <div class="tablewrap">
        <svg viewBox={`0 0 ${X0 + SLOTS * W + 10} 170`} width={X0 + SLOTS * W + 10} class="mini-svg inside-svg" role="img" aria-label="Clock, D and Q waveforms">
          <text x={8} y={30} class="is" text-anchor="start">CLK</text>
          <text x={8} y={80} class="is" text-anchor="start">D</text>
          <text x={8} y={130} class="is" text-anchor="start">Q</text>
          {edgesAt.map((s) => (
            <line key={s} x1={X0 + s * W} y1={10} x2={X0 + s * W} y2={160} class="il" style={{ strokeDasharray: '3 3', opacity: 0.5 }} />
          ))}
          <path d={wave(clk, 14)} class="wv" />
          <path d={wave(dv, 64)} class="wv d" />
          <path d={wave(q, 114)} class="wv q" />
          {dv.map((_, i) => (
            <rect
              key={i}
              x={X0 + i * W}
              y={60}
              width={W}
              height={32}
              class="hitbox"
              role="button"
              tabIndex={0}
              aria-label={`D slot ${i + 1}, value ${dv[i]}`}
              onClick={() => setDv(dv.map((v, j) => (j === i ? 1 - v : v)))}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setDv(dv.map((v, j) => (j === i ? 1 - v : v))))}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

function SetupHold() {
  const [t, setT] = useState(-60);
  const SETUP = 30;
  const HOLD = 10;
  let status: [string, string];
  if (t < -SETUP) status = ['good', 'D changed before the setup window: the flip-flop captures the new value.'];
  else if (t > HOLD) status = ['good', 'D changed after the hold window: the flip-flop captures the old value, and the new one waits for the next edge.'];
  else status = ['bad', 'Violation: D changed inside the setup/hold window. The flip-flop may go metastable and settle to either value after an unbounded time. Synchronous design avoids this by making the clock period long enough.'];
  const X = (ps: number) => 200 + ps * 2;
  return (
    <div class="card">
      <h3>Setup and hold</h3>
      <p class="small">A flip-flop needs D stable for a setup time t<sub>setup</sub> = {SETUP} ps before the edge and a hold time t<sub>hold</sub> = {HOLD} ps after it. Move the moment D changes.</p>
      <svg viewBox="0 0 400 120" class="mini-svg inside-svg" role="img" aria-label="Setup and hold window around a clock edge">
        <rect x={X(-SETUP)} y={8} width={(SETUP + HOLD) * 2} height={104} class="window" />
        <line x1={X(0)} y1={6} x2={X(0)} y2={114} class="il" style={{ strokeDasharray: '3 3' }} />
        <path d={`M20,50 H${X(0)} V20 H380`} class="wv" />
        <text x={X(0) + 4} y={16} class="tiny" text-anchor="start">rising edge</text>
        <path d={`M20,96 H${X(t)} L${X(t) + 6},80 H380 M20,80 H${X(t)} L${X(t) + 6},96 H380`} class="wv d" />
        <text x={8} y={46} class="is" text-anchor="start">CLK</text>
        <text x={8} y={92} class="is" text-anchor="start">D</text>
      </svg>
      <label class="small">
        D changes at {t > 0 ? '+' : ''}{t} ps relative to the edge
        <input type="range" min={-90} max={80} value={t} onInput={(e) => setT(+(e.target as HTMLInputElement).value)} style={{ width: '100%' }} aria-label="Time D changes, relative to the clock edge" />
      </label>
      <div class={`feedback ${status[0]}`} aria-live="polite">{status[1]}</div>
    </div>
  );
}

function SingleCycle() {
  const instrs: [string, number][] = [['add', 570], ['lw', 795], ['beq', 580], ['sw', 565]];
  const T = 795;
  return (
    <div class="card">
      <h3>One instruction per clock cycle</h3>
      <p class="small">In a single-cycle processor every instruction starts at one rising edge and finishes by the next: CPI = 1. The bars show how much of the cycle each instruction actually needs (illustrative delays from Lesson 12).</p>
      <svg viewBox="0 0 420 150" class="mini-svg inside-svg" role="img" aria-label="Timeline of four instructions, one per clock period">
        {instrs.map(([n, d], i) => {
          const x = 60 + i * 88;
          return (
            <g key={n}>
              <rect x={x} y={30} width={86} height={86} class="ib" />
              <rect x={x} y={30 + 86 - (d / T) * 86} width={86} height={(d / T) * 86} class="ib hl" />
              <text x={x + 43} y={24} class="is">{n}</text>
              <text x={x + 43} y={132} class="tiny">{d} ps</text>
              <line x1={x} y1={20} x2={x} y2={124} class="il" style={{ strokeDasharray: '3 3' }} />
            </g>
          );
        })}
        <text x={8} y={78} class="is" text-anchor="start">cycle</text>
      </svg>
      <p class="small">The clock period must fit the slowest instruction, so the faster ones waste the rest of their cycle. Lesson 12 measures this and motivates multi-cycle and pipelined designs.</p>
    </div>
  );
}

function DpVsCtrl() {
  return (
    <div class="card">
      <h3>Datapath and control</h3>
      <svg viewBox="0 0 420 190" class="mini-svg inside-svg" role="img" aria-label="Datapath blocks steered by a control unit">
        <rect x={150} y={10} width={120} height={46} class="ib" />
        <text x={210} y={30} class="it">Control unit</text>
        <text x={210} y={46} class="tiny">reads opcode, funct3, funct7</text>
        <rect x={20} y={100} width={70} height={50} class="ib" /><text x={55} y={130} class="is">registers</text>
        <path d="M150,96 L170,106 L170,146 L150,156 Z" class="ib" /><text x={160} y={172} class="tiny">mux</text>
        <path d="M220,96 L270,112 L270,140 L220,156 L220,134 L230,126 L220,118 Z" class="ib" /><text x={252} y={130} class="is">ALU</text>
        <rect x={320} y={100} width={80} height={50} class="ib" /><text x={360} y={130} class="is">memory</text>
        <line x1={90} y1={115} x2={150} y2={115} class="il" /><line x1={90} y1={136} x2={150} y2={136} class="il" />
        <line x1={170} y1={126} x2={220} y2={126} class="il" /><line x1={270} y1={126} x2={320} y2={126} class="il" />
        <line x1={160} y1={56} x2={160} y2={100} class="il ctlw" />
        <line x1={245} y1={56} x2={245} y2={104} class="il ctlw" />
        <line x1={265} y1={44} x2={360} y2={44} class="il ctlw" /><line x1={360} y1={44} x2={360} y2={100} class="il ctlw" />
        <line x1={175} y1={56} x2={175} y2={70} class="il ctlw" /><line x1={175} y1={70} x2={55} y2={70} class="il ctlw" /><line x1={55} y1={70} x2={55} y2={100} class="il ctlw" />
      </svg>
      <p class="small">The <b>datapath</b> holds and transforms data: registers, ALU, multiplexers, memories, adders. The <b>control path</b> decides, for each instruction, what the datapath does: which mux inputs to pass, which operation the ALU performs, whether to write a register or memory. Control signals are drawn in orange throughout the course.</p>
    </div>
  );
}

/* ---------- Decode tables ---------- */

function RTable({ trace }: { trace: Trace | null }) {
  const rows = ISA.filter((d) => d.kind === 'alu');
  return (
    <div class="card">
      <h3>R-type: the ALU operation is {'{'}bit 30, funct3{'}'}</h3>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>instr</th><th>funct7</th><th>funct3</th><th>ALUControl</th><th class="l">operation</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.name} class={trace?.decoded?.op === d.name ? 'sel' : ''}>
                <td class="mono">{d.name}</td>
                <td class="mono">{bin(d.funct7!, 7)}</td>
                <td class="mono">{bin(d.funct3!, 3)}</td>
                <td class="mono">{bin(((d.funct7! >> 5) << 3) | d.funct3!, 4)}</td>
                <td class="l">{ALU_NAME[((d.funct7! >> 5) << 3) | d.funct3!]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="small">Only add/sub and srl/sra share a funct3; bit 30 separates them. The ALU's 4-bit operation code was chosen to be exactly these bits, so for R-type the "ALU decoder" is just wiring.</p>
    </div>
  );
}

function ITable({ trace }: { trace: Trace | null }) {
  const rows = ISA.filter((d) => d.kind === 'alui' || d.kind === 'shifti');
  const t = aluDecodeTable(3);
  return (
    <div class="card">
      <h3>I-type ALU: same funct3 codes, bit 30 only for shifts</h3>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>instr</th><th>funct3</th><th>imm[11:5]</th><th>ALUControl</th><th class="l">operation</th></tr></thead>
          <tbody>
            {rows.map((d) => {
              const ctl = t(d.funct3!, d.funct7 ? d.funct7 >> 5 : 0);
              return (
                <tr key={d.name} class={trace?.decoded?.op === d.name ? 'sel' : ''}>
                  <td class="mono">{d.name}</td>
                  <td class="mono">{bin(d.funct3!, 3)}</td>
                  <td class="mono">{d.kind === 'shifti' ? bin(d.funct7!, 7) : 'immediate'}</td>
                  <td class="mono">{bin(ctl, 4)}</td>
                  <td class="l">{ALU_NAME[ctl]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="small">There is no subi: addi with a negative immediate does the job, which is why funct3 = 000 never needs bit 30 for I-type.</p>
    </div>
  );
}
