// Predict, then reveal.

import type { Trace } from '../../sim/datapath';
import type { Predict as P } from '../../lessons/types';
import { recordConcept } from '../store';
import { inline } from '../markup';

export function PredictBox({ p, trace, picked, onPick }: { p: P; trace: Trace; picked: string | null; onPick: (v: string) => void }) {
  const answer = p.answer(trace);
  const done = picked !== null;
  const right = picked === answer;
  return (
    <div class="card predict" aria-live="polite">
      <h4>Predict before you look</h4>
      <div class="step-text">{inline(p.q)}</div>
      <div class="opts">
        {p.options.map((o) => {
          const cls = done ? (o.value === answer ? 'right' : o.value === picked ? 'wrongpick' : '') : '';
          return (
            <button
              key={o.value}
              class={`btn opt ${cls}`}
              disabled={done}
              onClick={() => {
                onPick(o.value);
                recordConcept(p.concept, o.value === answer);
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {done && (
        <div class={`feedback ${right ? 'good' : 'bad'}`}>
          <strong>{right ? 'Correct.' : 'Not quite.'}</strong> <span class="fb-body">{inline(p.explain(trace))}</span>
        </div>
      )}
      {!done && <div class="small muted">The diagram shows this step once you choose.</div>}
    </div>
  );
}
