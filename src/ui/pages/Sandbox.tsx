// Free sandbox: any program on the circuit as built after any lesson, plus a
// single-instruction encoder and a hex decoder.

import { useState } from 'preact/hooks';
import { Machine } from '../tools/Machine';
import { assembleOne, parseImm } from '../../sim/assembler';
import { decode } from '../../sim/encode';
import { InstrCard } from '../components/InstrCard';
import { BitView } from '../components/BitView';
import { CATALOG } from '../../lessons/catalog';
import { hex } from '../../sim/bits';

const START = `# Try anything. Labels and li, mv, j, ret, nop, call work.
        li   t0, 5
        li   t1, -3
        add  t2, t0, t1
        sltu t3, t1, t0     # -3 is huge unsigned: 0
        slt  t4, t1, t0     # signed: 1
        lui  s0, 0x1        # s0 = 0x1000 (data memory)
        sw   t2, 0(s0)
        lb   a0, 0(s0)
done:   j    done
`;

function Encoder() {
  const [txt, setTxt] = useState('sw x7, 12(x6)');
  const r = assembleOne(txt, 0);
  return (
    <section class="card stack">
      <h3>Encode one instruction</h3>
      <input type="text" value={txt} onInput={(e) => setTxt((e.target as HTMLInputElement).value)} aria-label="Instruction to encode" style={{ fontFamily: 'var(--mono)' }} />
      {r.ok ? (() => {
        const d = decode(r.line.word);
        return d.ok ? <InstrCard d={d.d} /> : null;
      })() : <div class="feedback bad">{r.error}</div>}
      {r.ok && r.line.pseudo && <p class="small muted">{r.line.pseudo} is a pseudo-instruction; this is its first real instruction.</p>}
    </section>
  );
}

function Decoder() {
  const [txt, setTxt] = useState('0x00628863');
  const v = parseImm(txt.trim().startsWith('0x') || /^[0-9a-f]+$/i.test(txt.trim()) ? (txt.trim().startsWith('0x') ? txt.trim() : '0x' + txt.trim()) : txt);
  const word = v === null ? null : v >>> 0;
  const d = word === null ? null : decode(word);
  return (
    <section class="card stack">
      <h3>Decode a hex word</h3>
      <input type="text" value={txt} onInput={(e) => setTxt((e.target as HTMLInputElement).value)} aria-label="Hex word to decode" style={{ fontFamily: 'var(--mono)' }} />
      {word === null ? <div class="feedback bad">Enter a 32-bit number, for example 0x00832283.</div> : d && d.ok ? <InstrCard d={d.d} /> : (
        <>
          <BitView word={word} showValues />
          <div class="feedback bad">{hex(word)} does not decode: {d && !d.ok ? d.error : ''}</div>
        </>
      )}
    </section>
  );
}

export function SandboxPage() {
  const [level, setLevel] = useState(11);
  return (
    <div class="page wide stack">
      <div class="lesson-head">
        <h1>Sandbox</h1>
        <span class="goal">Run any program on the circuit as it stands after a chosen lesson. Edit registers and memory directly.</span>
      </div>
      <div class="row">
        <label class="small">Circuit as built after{' '}
          <select value={level} onChange={(e) => setLevel(+(e.target as HTMLSelectElement).value)} aria-label="Circuit build level">
            {CATALOG.filter((c) => c.id >= 2 && c.id <= 11).map((c) => <option key={c.id} value={c.id}>Lesson {c.id}: {c.short}</option>)}
          </select>
        </label>
        <span class="small muted">Instructions that need hardware from a later lesson are refused, with the reason.</span>
      </div>
      <Machine key={level} level={level} sandbox initial={START} />
      <div class="grid2">
        <Encoder />
        <Decoder />
      </div>
    </div>
  );
}
