// Spaced review: concepts answered wrong come back, each time with new numbers.

import { useEffect, useState } from 'preact/hooks';
import { dueConcepts, progress, weakConcepts } from '../store';
import { useProgress } from '../app';
import { GENERATORS, CONCEPT_TITLE } from '../exercises/concepts';
import { MCQView } from '../exercises/Quiz';
import { EncodeEx } from '../exercises/Encode';
import { DecodeEx } from '../exercises/Decode';
import { ControlEx } from '../exercises/Control';
import { TraceEx } from '../exercises/Trace';
import { BreakEx } from '../exercises/Break';
import { DesignEx } from '../exercises/Design';
import { DrawEx } from '../exercises/Draw';
import { ISA, MNEMONICS, type Mnemonic } from '../../sim/isa';
import { MAIN_TABLE } from '../../sim/control';
import { loadLesson } from '../loader';
import type { InterviewQ } from '../../lessons/types';

const opsOfFmt = (f: string) => ISA.filter((d) => d.fmt === f).map((d) => d.name);
const opsOfClass = (c: string): Mnemonic[] => {
  const row = MAIN_TABLE.find((r) => r.name === c);
  return row ? ISA.filter((d) => d.opcode === row.opcode).map((d) => d.name) : ['add'];
};

export function conceptTitle(c: string): string {
  const [k, v] = c.split(':');
  if (v === undefined) return CONCEPT_TITLE[c] ?? c;
  switch (k) {
    case 'encode': return `Encode ${v}-type`;
    case 'decode': return `Decode ${v}-type`;
    case 'ctrl': return `Control signals: ${v}`;
    case 'trace': return `Trace: ${v}`;
    case 'break': return `Fault: ${c.slice(6)}`;
    case 'design': return `Design challenge: ${v}`;
    case 'draw': return `Draw from memory: ${v}`;
    case 'interview': return `Interview: ${v}`;
  }
  return c;
}

function InterviewCard({ id }: { id: string }) {
  const [q, setQ] = useState<InterviewQ | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    loadLesson(14).then((l) => setQ(l.bank?.find((b) => b.id === id) ?? null), () => setQ(null));
  }, [id]);
  if (!q) return <p class="small muted">Loading…</p>;
  return (
    <div class="stack">
      <p><b>{q.q}</b></p>
      <p class="small muted">Answer it out loud or on paper first.</p>
      {!shown ? <button class="btn" onClick={() => setShown(true)}>Show the model answer</button> : <div class="answer"><span class="fb-body">{q.a}</span></div>}
    </div>
  );
}

export function ReviewCard({ concept }: { concept: string }) {
  const [k, v] = concept.split(':');
  const id = `review:${concept}`;
  if (GENERATORS[concept]) return <MCQView concept={concept} />;
  switch (k) {
    case 'encode': return <EncodeEx ops={opsOfFmt(v)} exId={id} />;
    case 'decode': return <DecodeEx ops={opsOfFmt(v)} exId={id} />;
    case 'ctrl': return <ControlEx ops={opsOfClass(v)} exId={id} level={11} />;
    case 'trace': return <TraceEx ops={opsOfClass(v)} exId={id} level={11} />;
    case 'break': return <BreakEx faults={[concept.slice(6)]} scope={MNEMONICS} level={11} exId={id} />;
    case 'design': return <DesignEx challenge={v} exId={id} />;
    case 'draw': return <DrawEx subset={v} exId={id} />;
    case 'interview': return <InterviewCard id={v} />;
  }
  return <p class="small muted">No review card for {concept}.</p>;
}

export function ReviewPage() {
  useProgress();
  const [snapshot, setSnapshot] = useState(() => dueConcepts());
  const [i, setI] = useState(0);
  const weak = weakConcepts();
  const total = Object.keys(progress().concepts).length;
  const cur = snapshot[i];
  return (
    <div class="page stack">
      <div class="lesson-head">
        <h1>Review deck</h1>
        <span class="goal">Concepts you got wrong come back after a delay that grows each time you get them right, always with fresh numbers.</span>
      </div>
      {cur ? (
        <section class="card stack">
          <div class="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{conceptTitle(cur)}</h3>
            <span class="small muted">card {i + 1} of {snapshot.length}</span>
          </div>
          <ReviewCard key={cur + i} concept={cur} />
          <div>
            <button class="btn primary" onClick={() => setI(i + 1)}>Next card</button>
          </div>
        </section>
      ) : (
        <section class="card">
          <p><b>{snapshot.length ? 'Done for now.' : 'Nothing is due.'}</b> {total ? 'Cards come back when they are due.' : 'Answer predictions and exercises in the lessons; anything you miss lands here.'}</p>
          <button class="btn" onClick={() => { setSnapshot(dueConcepts()); setI(0); }}>Check again</button>
        </section>
      )}
      {weak.length > 0 && (
        <section class="card">
          <h3>Weak areas</h3>
          <div class="tablewrap">
            <table class="t">
              <thead><tr><th class="l">concept</th><th>right</th><th>wrong</th><th class="l">practise now</th></tr></thead>
              <tbody>
                {weak.slice(0, 12).map((w) => {
                  const r = progress().concepts[w.concept];
                  return (
                    <tr key={w.concept}>
                      <td class="l">{conceptTitle(w.concept)}</td><td class="mono">{r.right}</td><td class="mono">{r.wrong}</td>
                      <td class="l"><button class="btn small" onClick={() => { setSnapshot([w.concept, ...snapshot.slice(i)]); setI(0); }}>Practise</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
