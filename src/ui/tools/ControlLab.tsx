// Control unit lab: derive the main decoder and the ALU decoder, then watch
// the gate-level decoder fire for any opcode.

import { useMemo, useState } from 'preact/hooks';
import { MAIN_TABLE, CTRL_KEYS, aluDecode, type CtrlKey, type MainRow } from '../../sim/control';
import { ALU_NAME, ALU_OPS } from '../../sim/alu';
import { bin } from '../../sim/bits';
import { Gates, fmtCell } from '../panels/Panels3';
import { recordExercise, recordConcept } from '../store';
import { Diagram } from '../components/Diagram';
import { exampleTrace } from '../engine';
import type { Example } from '../../lessons/types';
import { LESSON_KEYS } from '../../diagram/visibility';

const CELL_OPTS: Record<CtrlKey, string[]> = {
  RegWrite: ['0', '1'], ImmSrc: ['I', 'S', 'B', 'J', 'U', 'x'], ALUSrcA: ['00', '01', '10', 'x'], ALUSrc: ['0', '1', 'x'],
  MemRead: ['0', '1'], MemWrite: ['0', '1'], ResultSrc: ['00', '01', '10', 'x'], Branch: ['0', '1'], Jump: ['0', '1'],
  PCTargetSrc: ['0', '1', 'x'], ALUOp: ['00', '01', '10', '11', 'x'],
} as Record<CtrlKey, string[]>;

const WHY: Record<string, string> = {
  RegWrite: 'RegWrite is 1 exactly for the classes that have an rd: everything except stores and branches.',
  ImmSrc: 'ImmSrc names the immediate layout of the format: I for I-type ALU, loads and jalr; S for stores; B for branches; J for jal; U for lui and auipc. R-type has no immediate (x).',
  ALUSrcA: 'A is RD1 (00) except auipc (PC, 01) and lui (0, 10). jal does not use the ALU (x).',
  ALUSrc: 'B is the immediate for I-type ALU, loads, stores, jalr, lui and auipc; RD2 for R-type and branches (compare). x for jal.',
  MemRead: 'Only loads use the memory read.',
  MemWrite: 'Only stores write memory. A 1 anywhere else would corrupt memory.',
  ResultSrc: 'ALUResult (00) for ALU ops, lui and auipc; memory (01) for loads; PC + 4 (10) for jal and jalr. x where RegWrite = 0.',
  Branch: 'Only conditional branches.',
  Jump: 'Only jal and jalr jump unconditionally.',
  PCTargetSrc: 'jalr uses the ALU target (1); jal and branches use PC + imm (0). x when the PC never takes the target.',
  ALUOp: '00 add for address and link arithmetic (loads, stores, jalr, lui, auipc), 01 subtract for branches, 10 R-type, 11 I-type ALU. x for jal.',
};

const EXAMPLES: Record<string, Example> = {
  'R-type': { asm: 'add x5, x6, x7', regs: { 6: 23, 7: 19 } },
  'I-type ALU': { asm: 'addi x5, x6, -12', regs: { 6: 40 } },
  load: { asm: 'lw x5, 8(x6)', regs: { 6: 0x1000 }, mem: { 0x1008: 1234 } },
  store: { asm: 'sw x7, 12(x6)', regs: { 6: 0x1000, 7: 5 } },
  branch: { asm: 'beq x5, x6, +16', pc: 0x10, regs: { 5: 7, 6: 7 } },
  jal: { asm: 'jal x1, +64', pc: 0x10 },
  jalr: { asm: 'jalr x0, 0(x1)', pc: 0x58, regs: { 1: 0x14 } },
  lui: { asm: 'lui x5, 0x12345' },
  auipc: { asm: 'auipc x5, 0x1', pc: 0x10 },
};

const refCell = (r: MainRow, k: CtrlKey) => (r.dc.includes(k) ? 'x' : fmtCell(k, r.ctrl[k] as number | string));

function MainBuilder() {
  const [cells, setCells] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const key = (r: string, k: string) => `${r}|${k}`;
  const ok = (r: MainRow, k: CtrlKey) => {
    const v = cells[key(r.name, k)];
    if (!v) return false;
    if (r.dc.includes(k)) return true; // any value is fine for a don't-care
    return v === refCell(r, k);
  };
  const total = MAIN_TABLE.length * CTRL_KEYS.length;
  const right = MAIN_TABLE.reduce((s, r) => s + CTRL_KEYS.filter((k) => ok(r, k)).length, 0);
  const wrongSignals = new Set<CtrlKey>();
  if (checked) for (const r of MAIN_TABLE) for (const k of CTRL_KEYS) if (!ok(r, k)) wrongSignals.add(k);
  const check = () => {
    setChecked(true);
    recordExercise('10:lab-main', right / total);
    for (const r of MAIN_TABLE) recordConcept(`ctrl:${r.name}`, CTRL_KEYS.every((k) => ok(r, k)));
  };
  const fill = () => {
    const c: Record<string, string> = {};
    for (const r of MAIN_TABLE) for (const k of CTRL_KEYS) c[key(r.name, k)] = refCell(r, k);
    setCells(c);
    setChecked(true);
  };
  return (
    <section class="card">
      <h3>1. Derive the main decoder</h3>
      <p class="small">Fill in every cell. Use x where the value cannot matter; any value is accepted in a don't-care cell, but x is wrong where the signal matters.</p>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th class="l">class</th><th>opcode</th>{CTRL_KEYS.map((k) => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>
            {MAIN_TABLE.map((r) => (
              <tr key={r.name}>
                <td class="l">{r.name}</td>
                <td class="mono">{bin(r.opcode, 7)}</td>
                {CTRL_KEYS.map((k) => {
                  const v = cells[key(r.name, k)] ?? '';
                  const good = ok(r, k);
                  return (
                    <td key={k} style={checked ? { background: good ? 'var(--good-bg)' : 'var(--bad-bg)' } : undefined}>
                      <select aria-label={`${r.name} ${k}`} value={v} onChange={(e) => { setCells({ ...cells, [key(r.name, k)]: (e.target as HTMLSelectElement).value }); setChecked(false); }} style={{ minHeight: '26px', padding: '0 2px', fontFamily: 'var(--mono)' }}>
                        <option value="">?</option>
                        {CELL_OPTS[k].map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="toolbar" style={{ marginTop: '8px' }}>
        <button class="btn primary" onClick={check}>Check the table</button>
        <button class="btn" onClick={fill}>Show the answer</button>
        <button class="btn" onClick={() => { setCells({}); setChecked(false); }}>Clear</button>
      </div>
      {checked && (
        <div class={`feedback ${right === total ? 'good' : 'bad'}`} role="status">
          <strong>{right} of {total} cells correct.</strong>
          {wrongSignals.size > 0 && <ul class="fb-body">{[...wrongSignals].map((k) => <li key={k}><b>{k}</b>: {WHY[k]}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}

const ALU_ROWS: [number, number, number, string][] = [
  [0, 0b010, 0, 'lw'], [1, 0b000, 0, 'beq'], [2, 0b000, 1, 'sub'], [2, 0b101, 1, 'sra'], [2, 0b011, 0, 'sltu'],
  [3, 0b000, 1, 'addi with imm bit 10 = 1'], [3, 0b101, 1, 'srai'], [3, 0b101, 0, 'srli'], [3, 0b111, 0, 'andi'], [2, 0b001, 0, 'sll'],
];

function AluBuilder() {
  const [ans, setAns] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const right = ALU_ROWS.filter(([op, f3, b], i) => ans[i] === String(aluDecode(op, f3, b))).length;
  return (
    <section class="card">
      <h3>2. The ALU decoder</h3>
      <p class="small">For each input combination, choose the ALU operation.</p>
      <div class="tablewrap">
        <table class="t">
          <thead><tr><th>ALUOp</th><th>funct3</th><th>bit 30</th><th class="l">example</th><th>ALU operation</th></tr></thead>
          <tbody>
            {ALU_ROWS.map(([op, f3, b, ex], i) => {
              const good = ans[i] === String(aluDecode(op, f3, b));
              return (
                <tr key={i}>
                  <td class="mono">{bin(op, 2)}</td><td class="mono">{bin(f3, 3)}</td><td class="mono">{b}</td><td class="l small">{ex}</td>
                  <td style={checked ? { background: good ? 'var(--good-bg)' : 'var(--bad-bg)' } : undefined}>
                    <select aria-label={`ALU operation for ${ex}`} value={ans[i] ?? ''} onChange={(e) => { setAns({ ...ans, [i]: (e.target as HTMLSelectElement).value }); setChecked(false); }}>
                      <option value="">?</option>
                      {ALU_OPS.map((o) => <option key={o} value={String(o)}>{ALU_NAME[o]}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div class="toolbar" style={{ marginTop: '8px' }}>
        <button class="btn primary" onClick={() => { setChecked(true); recordExercise('10:lab-alu', right / ALU_ROWS.length); recordConcept('alu-decoder', right === ALU_ROWS.length); }}>Check</button>
      </div>
      {checked && (
        <div class={`feedback ${right === ALU_ROWS.length ? 'good' : 'bad'}`} role="status">
          <strong>{right} of {ALU_ROWS.length} correct.</strong>{' '}
          <span class="fb-body">ALUOp 00 always adds and 01 always subtracts. 10 uses {'{'}bit 30, funct3{'}'}. 11 uses funct3, and bit 30 only when funct3 = 101.</span>
        </div>
      )}
    </section>
  );
}

function Fire() {
  const [cls, setCls] = useState('R-type');
  const ex = EXAMPLES[cls];
  const { trace } = useMemo(() => exampleTrace(ex), [cls]);
  const row = MAIN_TABLE.find((r) => r.name === cls)!;
  const keys = useMemo(() => new Set(LESSON_KEYS[10]), []);
  const active = useMemo(() => new Set(['ctrl', 'w_op', 'w_f3', 'w_b30', ...MAIN_TABLE.length ? ['c_cu_RegWrite', 'c_cu_ImmSrc', 'c_cu_ALUSrcA', 'c_cu_ALUSrc', 'c_cu_ALUControl', 'c_cu_MemRead', 'c_cu_MemWrite', 'c_cu_ResultSrc', 'c_cu_Branch', 'c_cu_Jump', 'c_cu_PCTargetSrc'] : []]), []);
  return (
    <section class="card">
      <h3>3. Watch the signals fire</h3>
      <p class="small">Choose an opcode. The equations light the AND terms that are true; the diagram shows the control unit's outputs for an example instruction.</p>
      <div class="pill-row" role="group" aria-label="Opcode">
        {MAIN_TABLE.map((r) => (
          <button key={r.name} class={`btn small ${cls === r.name ? 'on' : ''}`} onClick={() => setCls(r.name)}>
            {r.name} <span class="mono small">{bin(r.opcode, 7)}</span>
          </button>
        ))}
      </div>
      <p class="small mono" style={{ marginTop: '8px' }}>Example: {ex.asm} · opcode {bin(row.opcode, 7)}</p>
      <div class="grid2">
        <Gates trace={trace} opcode={row.opcode} />
        <Diagram level={10} revealed={keys} trace={trace} active={active} used={new Set(['w_spine', 'w_spine_cu', 'stage:fetch'])} frame={['ctrl', 'w_op', 'w_f3', 'w_b30', ...active]} legend={false} label="Control unit outputs" />
      </div>
    </section>
  );
}

export function ControlLab() {
  return (
    <div class="stack page">
      <MainBuilder />
      <AluBuilder />
      <Fire />
    </div>
  );
}
