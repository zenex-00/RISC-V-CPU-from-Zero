// Panels for lessons 4 and later.

import { useState } from 'preact/hooks';
import type { Trace } from '../../sim/datapath';
import { ISA } from '../../sim/isa';
import { bin, hex } from '../../sim/bits';
import { storeAlign } from '../../sim/memory';
import { assemble } from '../../sim/assembler';
import { parseImm } from '../../sim/assembler';
import { CtrlSignals, MainTable, AluTable, Gates } from './Panels3';
import { DELAY_INFO, DEFAULT_DELAYS } from '../../sim/timing';

export function LessonPanels2({ id, trace }: { id: string; trace: Trace | null }) {
  switch (id) {
    case 'load-table':
      return <LoadTable trace={trace} />;
    case 'store-be':
      return <StoreTable trace={trace} />;
    case 'branch-f3':
      return <BranchTable trace={trace} />;
    case 'li-split':
      return <LiSplit />;
    case 'ctrl-signals':
      return <CtrlSignals />;
    case 'main-table':
      return <MainTable trace={trace} />;
    case 'alu-table':
      return <AluTable trace={trace} />;
    case 'gates':
      return <Gates trace={trace} />;
    case 'delays':
      return <DelayTable />;
  }
  return <div class="card small muted">Panel "{id}" is not available.</div>;
}

function LoadTable({ trace }: { trace: Trace | null }) {
  const rows = ISA.filter((d) => d.kind === 'load');
  return (
    <div class="card">
      <h3>Loads: funct3 = sign bit + size</h3>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>instr</th><th>funct3</th><th>funct3[2]</th><th>funct3[1:0]</th><th class="l">meaning</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.name} class={trace?.decoded?.op === d.name ? 'sel' : ''}>
                <td class="mono">{d.name}</td>
                <td class="mono">{bin(d.funct3!, 3)}</td>
                <td class="mono">{d.funct3! >> 2}</td>
                <td class="mono">{bin(d.funct3! & 3, 2)}</td>
                <td class="l">{['byte', 'halfword', 'word'][d.funct3! & 3]}, {d.funct3! & 4 ? 'zero-extended' : d.funct3 === 2 ? 'no extension needed' : 'sign-extended'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="small">There is no lwu in RV32I: a 32-bit load fills the register, so there is nothing to extend.</p>
    </div>
  );
}

function StoreTable({ trace }: { trace: Trace | null }) {
  const rs2 = trace?.RD2 ?? 0x12345678;
  const cur = trace ? trace.MemAddr & 3 : -1;
  const ops: [string, number, number[]][] = [['sb', 0, [0, 1, 2, 3]], ['sh', 1, [0, 2]], ['sw', 2, [0]]];
  return (
    <div class="card">
      <h3>Byte enables for each store</h3>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>instr</th><th>addr[1:0]</th><th>BE[3:0]</th><th>WD</th><th class="l">bytes written</th></tr></thead>
          <tbody>
            {ops.flatMap(([n, f, offs]) =>
              offs.map((o) => {
                const s = storeAlign(rs2, o, f);
                const lanes = [0, 1, 2, 3].filter((i) => (s.be >> i) & 1);
                return (
                  <tr key={n + o} class={trace && (trace.f.funct3 & 3) === f && cur === o && trace.ctrl.MemWrite ? 'sel' : ''}>
                    <td class="mono">{n}</td><td class="mono">{bin(o, 2)}</td><td class="mono">{bin(s.be, 4)}</td><td class="mono">{hex(s.wd)}</td>
                    <td class="l">offset {lanes.join(', ')} of the word</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <p class="small muted">Values for rs2 = {hex(rs2)}. Missing rows (sh at offsets 1 and 3, sw at 1 to 3) are misaligned.</p>
    </div>
  );
}

function BranchTable({ trace }: { trace: Trace | null }) {
  const rows = ISA.filter((d) => d.kind === 'branch');
  const cond = (f: number) => (f & 4 ? (f & 2 ? 'LTU' : 'LT') : 'Zero');
  return (
    <div class="card">
      <h3>Branch conditions from funct3</h3>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>instr</th><th>funct3</th><th>bit 2: eq / lt</th><th>bit 1: signed / unsigned</th><th>bit 0: invert</th><th class="l">Take =</th></tr></thead>
          <tbody>
            {rows.map((d) => {
              const f = d.funct3!;
              return (
                <tr key={d.name} class={trace?.decoded?.op === d.name ? 'sel' : ''}>
                  <td class="mono">{d.name}</td>
                  <td class="mono">{bin(f, 3)}</td>
                  <td>{f & 4 ? 'less-than' : 'equality'}</td>
                  <td>{f & 4 ? (f & 2 ? 'unsigned' : 'signed') : 'n/a'}</td>
                  <td>{f & 1 ? 'yes' : 'no'}</td>
                  <td class="mono l">{f & 1 ? `¬${cond(f)}` : cond(f)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="small">funct3 values 010 and 011 are not used by branches (they are reserved), so the hardware never needs "unsigned equality".</p>
    </div>
  );
}

function LiSplit() {
  const [txt, setTxt] = useState('0x12345FFF');
  const v = parseImm(txt);
  let body = <p class="small" style={{ color: 'var(--bad)' }}>Enter a 32-bit number, for example 0x12345FFF or -5000.</p>;
  if (v !== null && v >= -2147483648 && v <= 0xffffffff) {
    const x = v | 0;
    const hi = ((x + 0x800) >>> 12) & 0xfffff;
    const lo = ((x - (hi << 12)) << 20) >> 20;
    const fits = x >= -2048 && x <= 2047;
    const prog = fits ? `addi x5, x0, ${x}` : `lui  x5, ${hex(hi, 5)}\naddi x5, x5, ${lo}`;
    const ok = assemble(prog.replace(/  +/g, ' ')).ok;
    body = (
      <>
        <table class="t" style={{ marginTop: '8px' }}>
          <tbody>
            <tr><th class="l">value</th><td class="mono l">{hex(x)} = {x}</td></tr>
            {!fits && <tr><th class="l">upper = (value + 0x800) &gt;&gt; 12</th><td class="mono l">{hex(hi, 5)}</td></tr>}
            {!fits && <tr><th class="l">lower = value − (upper &lt;&lt; 12)</th><td class="mono l">{lo} ({hex(lo & 0xfff, 3)} as 12 bits)</td></tr>}
          </tbody>
        </table>
        <pre class="verilog">{prog}{ok ? '' : '\n(invalid)'}</pre>
        <p class="small">{fits ? 'The value fits in 12 signed bits, so a single addi from x0 is enough.' : lo < 0 ? 'The low 12 bits have bit 11 set, so addi will subtract; the upper part was rounded up by one to compensate.' : 'The low 12 bits are positive, so no rounding was needed.'}</p>
      </>
    );
  }
  return (
    <div class="card">
      <h3>How li splits a constant</h3>
      <label class="small">
        Value{' '}
        <input type="text" value={txt} onInput={(e) => setTxt((e.target as HTMLInputElement).value)} aria-label="Constant to load" style={{ fontFamily: 'var(--mono)', width: '160px' }} />
      </label>
      {body}
    </div>
  );
}

function DelayTable() {
  return (
    <div class="card">
      <h3>Block delays used in this course</h3>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th class="l">block</th><th>delay (ps)</th></tr></thead>
          <tbody>
            {DELAY_INFO.map((x) => <tr key={x.key}><td class="l">{x.label}</td><td class="mono">{DEFAULT_DELAYS[x.key]}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p class="small">Illustrative numbers. Memories are slowest; the register file is a small memory; the ALU is slower than a plain adder because of its result mux and the wider operations.</p>
    </div>
  );
}
