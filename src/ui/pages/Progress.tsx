// Progress overview and the final assessment.

import { useState } from 'preact/hooks';
import { CATALOG } from '../../lessons/catalog';
import { progress, lessonMastery, weakConcepts, resetProgress, saveFinal, canSave } from '../store';
import { practiceIds } from '../exercises/ids';
import { useProgress } from '../app';
import { conceptTitle } from './Review';
import { MCQView } from '../exercises/Quiz';
import { CONCEPT_TITLE } from '../exercises/concepts';

export function ProgressPage() {
  useProgress();
  const p = progress();
  const weak = weakConcepts();
  return (
    <div class="page stack">
      <div class="lesson-head">
        <h1>Progress</h1>
        <span class="goal">Mastery combines the steps you have seen (40%) with your best exercise scores (60%).</span>
      </div>
      <section class="card">
        <div class="tablewrap">
          <table class="t">
            <thead><tr><th class="l">lesson</th><th>steps seen</th><th>exercises</th><th class="l">mastery</th></tr></thead>
            <tbody>
              {CATALOG.map((c) => {
                const ids = practiceIds(c.id);
                const done = ids.filter((id) => p.ex[id]).length;
                const m = lessonMastery(c.id, ids);
                return (
                  <tr key={c.id}>
                    <td class="l"><a href={`#/lesson/${c.id}/1`}>{c.id}. {c.title}</a></td>
                    <td class="mono">{p.stepsTotal[c.id] ? `${(p.steps[c.id] ?? -1) + 1} / ${p.stepsTotal[c.id]}` : '—'}</td>
                    <td class="mono">{ids.length ? `${done} / ${ids.length}` : '—'}</td>
                    <td class="l"><div class="row" style={{ gap: '6px' }}><div class="progress-bar" style={{ width: '140px' }}><i style={{ width: `${Math.round(m * 100)}%` }} /></div><span class="small">{Math.round(m * 100)}%</span></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h3>Weak areas</h3>
        {weak.length ? (
          <ul>{weak.slice(0, 10).map((w) => <li key={w.concept}>{conceptTitle(w.concept)}: {Math.round(w.rate * 100)}% right</li>)}</ul>
        ) : <p class="small muted">None yet.</p>}
        <a class="btn" href="#/review">Open the review deck</a>
      </section>
      <section class="card">
        <h3>Final assessment</h3>
        <p class="small">Fifteen questions across the whole course, with fresh numbers each time.{p.final ? ` Last score: ${Math.round(p.final.score * 100)}% on ${new Date(p.final.when).toLocaleDateString()}.` : ''}</p>
        <a class="btn primary" href="#/final">Start the final assessment</a>
      </section>
      <section class="card">
        <h3>Saved data</h3>
        <p class="small">{canSave() ? 'Progress is saved in this browser only (local storage).' : 'This browser is blocking local storage, so progress is not saved.'}</p>
        <button class="btn" onClick={() => { if (window.confirm('Erase all saved progress in this browser?')) resetProgress(); }}>Reset progress</button>
      </section>
    </div>
  );
}

const FINAL: string[] = [
  'sign-extension', 'stype-imm', 'alu-sub-bit30', 'signed-vs-unsigned', 'load-address', 'lb-sign', 'byte-enable', 'branch-target',
  'overflow-lt', 'jal-link', 'jalr-bit0', 'li-rounding', 'main-decoder', 'alu-decoder', 'critical-path',
];

export function FinalPage() {
  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [answered, setAnswered] = useState(false);
  const [round, setRound] = useState(0);
  const done = i >= FINAL.length;
  const score = results.filter(Boolean).length;
  return (
    <div class="page stack">
      <div class="lesson-head">
        <h1>Final assessment</h1>
        <span class="goal">Fifteen questions from every part of the course. Work them out on paper where needed.</span>
      </div>
      {!done ? (
        <section class="card stack">
          <div class="progress-bar"><i style={{ width: `${(100 * i) / FINAL.length}%` }} /></div>
          <div class="small muted">Question {i + 1} of {FINAL.length}</div>
          <MCQView key={`${round}:${i}`} concept={FINAL[i]} onDone={(ok) => { setAnswered(true); setResults([...results, ok]); }} />
          <div>
            <button class="btn primary" disabled={!answered} onClick={() => {
              setAnswered(false);
              const ni = i + 1;
              setI(ni);
              if (ni >= FINAL.length) {
                const detail: Record<string, number> = {};
                FINAL.forEach((c, k) => (detail[c] = results[k] ? 1 : 0));
                saveFinal(score / FINAL.length, detail);
              }
            }}>{i + 1 < FINAL.length ? 'Next' : 'See the result'}</button>
          </div>
        </section>
      ) : (
        <section class="card stack">
          <h2>{score} of {FINAL.length} ({Math.round((100 * score) / FINAL.length)}%)</h2>
          <p>{score >= 13 ? 'Excellent: you can reason about this processor at the bit level.' : score >= 10 ? 'Solid. Review the missed topics below, then try again with new numbers.' : 'Revisit the lessons for the missed topics; they are now in your review deck.'}</p>
          <ul>
            {FINAL.map((c, k) => <li key={c}>{results[k] ? '✓' : '✗'} {CONCEPT_TITLE[c] ?? c}</li>)}
          </ul>
          <div class="toolbar">
            <button class="btn primary" onClick={() => { setI(0); setResults([]); setRound(round + 1); }}>Try again with new numbers</button>
            <a class="btn" href="#/review">Review deck</a>
          </div>
        </section>
      )}
    </div>
  );
}
