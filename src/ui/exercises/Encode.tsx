// Encode by hand: toggle the 32 bits; each field is checked separately.

import { useState } from 'preact/hooks';
import { BitView } from '../components/BitView';
import { DEF, layoutFor, type FieldSpan, type Mnemonic } from '../../sim/isa';
import { encode, disasm, type Instr } from '../../sim/encode';
import { bits, bin, hex } from '../../sim/bits';
import { pick, randomInstr } from './gen';
import { recordConcept, recordExercise } from '../store';

const OPNAME: Record<number, string> = {
  0b0110011: 'OP (R-type ALU)', 0b0010011: 'OP-IMM (I-type ALU)', 0b0000011: 'LOAD', 0b0100011: 'STORE',
  0b1100011: 'BRANCH', 0b1101111: 'JAL', 0b1100111: 'JALR', 0b0110111: 'LUI', 0b0010111: 'AUIPC',
};

/** Explain why a field must hold the bits it holds. */
export function fieldReason(i: Instr, f: FieldSpan, word: number): string {
  const d = DEF[i.op];
  const want = bin(bits(word, f.hi, f.lo), f.hi - f.lo + 1);
  switch (f.kind) {
    case 'opcode':
      return `${d.name} uses opcode ${want} = ${OPNAME[d.opcode]}.`;
    case 'funct3':
      return `${d.name} has funct3 = ${want}.`;
    case 'funct7':
      return d.kind === 'shifti'
        ? `${d.name}: imm[11:5] must be ${want}; bit 30 = ${bits(word, 30, 30)} picks ${d.name === 'srai' ? 'arithmetic' : 'logical'} shift.`
        : `${d.name} has funct7 = ${want}${(d.funct7 ?? 0) & 0x20 ? ' (bit 30 = 1 selects sub/sra)' : ''}.`;
    case 'rd':
      return `rd is x${i.rd} = ${want}.`;
    case 'rs1':
      return `rs1 is x${i.rs1} = ${want}.`;
    case 'rs2':
      return `rs2 is x${i.rs2} = ${want}.`;
    case 'imm': {
      const w = i.imm | 0;
      if (f.label === 'shamt') return `shamt = ${i.imm} = ${want}.`;
      const base = `The immediate is ${d.fmt === 'U' ? hex(w >>> 12, 5) + ' (upper 20 bits)' : w} = ${d.fmt === 'U' ? bin(w >>> 12, 20) : bin(w, d.fmt === 'J' ? 21 : d.fmt === 'B' ? 13 : 12)} in binary. ${f.label} holds ${want}.`;
      if (d.fmt === 'B' || d.fmt === 'J') return base + ' Bit 0 is not stored; check where bits 11 and 12 (B) or 11, 19:12 and 20 (J) go.';
      if (d.fmt === 'S') return base + ' imm[11:5] goes in bits 31:25 and imm[4:0] in bits 11:7.';
      return base + (w < 0 ? ' Negative values are two\'s complement.' : '');
    }
  }
}

export function EncodeEx({ ops, exId }: { ops: Mnemonic[]; exId: string }) {
  const [target, setTarget] = useState<Instr>(() => randomInstr(pick(ops)));
  const [word, setWord] = useState(0);
  const [result, setResult] = useState<{ wrong: FieldSpan[]; score: number } | null>(null);
  const [showFields, setShowFields] = useState(true);
  const correct = encode(target);
  const layout = layoutFor(DEF[target.op]);
  const toggle = (i: number) => {
    setWord((word ^ (1 << i)) >>> 0);
    setResult(null);
  };
  const check = () => {
    const wrong = layout.filter((f) => bits(word, f.hi, f.lo) !== bits(correct, f.hi, f.lo));
    const score = (layout.length - wrong.length) / layout.length;
    setResult({ wrong, score });
    recordExercise(exId, score);
    recordConcept(`encode:${DEF[target.op].fmt}`, wrong.length === 0);
  };
  const next = () => {
    setTarget(randomInstr(pick(ops)));
    setWord(0);
    setResult(null);
  };
  return (
    <div class="stack">
      <div class="row">
        <span class="muted small">Encode:</span>
        <span class="prompt-asm">{disasm(target)}</span>
        <span class="badge">{DEF[target.op].fmt}-type</span>
      </div>
      <p class="small muted">Click a bit to flip it. Field boundaries for this format are shown {showFields ? '' : '(hidden)'}; immediates are in two's complement.</p>
      <BitView word={word} layout={showFields ? layout : [{ kind: 'imm', hi: 31, lo: 0, label: '' }]} onToggle={toggle} wrong={result ? new Set(result.wrong.map((f) => f.hi)) : undefined} showHex />
      <div class="toolbar">
        <button class="btn primary" onClick={check}>Check</button>
        <button class="btn" onClick={() => { setWord(0); setResult(null); }}>Clear</button>
        <button class="btn" onClick={next}>New instruction</button>
        <label class="small"><input type="checkbox" checked={showFields} onChange={() => setShowFields(!showFields)} /> show field boundaries</label>
      </div>
      {result && (
        <div class={`feedback ${result.wrong.length ? 'bad' : 'good'}`} role="status">
          {result.wrong.length === 0 ? (
            <><strong>All fields correct.</strong> <span class="fb-body">{hex(correct)} is {disasm(target)}.</span></>
          ) : (
            <>
              <strong>{result.wrong.length} of {layout.length} fields wrong.</strong>
              <ul class="fb-body">
                {result.wrong.map((f) => (
                  <li key={f.hi}>
                    <b>{f.label}</b> (bits {f.hi}:{f.lo}): you have {bin(bits(word, f.hi, f.lo), f.hi - f.lo + 1)}. {fieldReason(target, f, correct)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
