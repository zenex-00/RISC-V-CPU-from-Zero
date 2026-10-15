// Multiple-choice questions with fresh numbers, from the concept generators.

import { useState } from 'preact/hooks';
import { GENERATORS, CONCEPT_TITLE, type MCQ } from './concepts';
import { recordConcept, recordExercise } from '../store';
import { inline } from '../markup';

export function MCQView({ concept, onDone }: { concept: string; onDone?: (right: boolean) => void }) {
  const [q, setQ] = useState<MCQ>(() => GENERATORS[concept]());
  const [picked, setPicked] = useState<string | null>(null);
  const answer = (v: string) => {
    if (picked !== null) return;
    setPicked(v);
    recordConcept(concept, v === q.answer);
    onDone?.(v === q.answer);
  };
  return (
    <div class="predict">
      <div class="small muted">{CONCEPT_TITLE[concept] ?? concept}</div>
      <div class="step-text">{inline(q.q)}</div>
      <div class="opts">
        {q.options.map((o) => (
          <button key={o.value} class={`btn opt ${picked !== null ? (o.value === q.answer ? 'right' : o.value === picked ? 'wrongpick' : '') : ''}`} disabled={picked !== null} onClick={() => answer(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div class={`feedback ${picked === q.answer ? 'good' : 'bad'}`} role="status">
          <strong>{picked === q.answer ? 'Correct.' : 'Not quite.'}</strong> <span class="fb-body">{inline(q.explain)}</span>
          {!onDone && (
            <div style={{ marginTop: '6px' }}>
              <button class="btn small" onClick={() => { setQ(GENERATORS[concept]()); setPicked(null); }}>Another one</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuizEx({ concepts, exId }: { concepts: string[]; exId: string }) {
  const list = concepts.filter((c) => GENERATORS[c]);
  const [round, setRound] = useState(0);
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [answered, setAnswered] = useState(false);
  const done = i >= list.length;
  if (!list.length) return null;
  return (
    <div class="stack">
      {!done ? (
        <>
          <div class="small muted">Question {i + 1} of {list.length}</div>
          <MCQView
            key={`${round}:${i}`}
            concept={list[i]}
            onDone={(ok) => {
              setAnswered(true);
              if (ok) setRight(right + 1);
            }}
          />
          <div>
            <button
              class="btn primary"
              disabled={!answered}
              onClick={() => {
                const ni = i + 1;
                setAnswered(false);
                setI(ni);
                if (ni >= list.length) recordExercise(exId, right / list.length);
              }}
            >
              {i + 1 < list.length ? 'Next question' : 'Finish'}
            </button>
          </div>
        </>
      ) : (
        <div class={`feedback ${right === list.length ? 'good' : 'warn'}`}>
          <strong>{right} of {list.length} correct.</strong>{' '}
          <span class="fb-body">{right < list.length ? 'Missed concepts are added to your review deck with fresh numbers.' : 'All correct.'}</span>
          <div style={{ marginTop: '6px' }}>
            <button class="btn small" onClick={() => { setRound(round + 1); setI(0); setRight(0); setAnswered(false); }}>New questions</button>
          </div>
        </div>
      )}
    </div>
  );
}
