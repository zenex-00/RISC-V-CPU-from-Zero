import { CATALOG } from '../../lessons/catalog';
import { progress, lessonMastery, dueConcepts, canSave } from '../store';
import { practiceIds } from '../exercises/ids';
import { useProgress } from '../app';

export function HomePage() {
  useProgress();
  const p = progress();
  const started = Object.keys(p.steps).map(Number);
  const cont = p.last?.lesson ?? 0;
  const contStep = p.last ? p.last.step : 0;
  const due = dueConcepts().length;
  return (
    <div class="page stack">
      <section class="card">
        <h1>Build a RISC-V CPU from Zero</h1>
        <p>
          You will design the RV32I single-cycle processor from an almost empty circuit, one block at a time. Each block appears only when an instruction needs it, in the place it keeps until the end. By Lesson 11 you will have the complete datapath and control unit, and you will be able to trace any instruction through it bit by bit.
        </p>
        <div class="toolbar">
          <a class="btn primary" href={`#/lesson/${cont}/${contStep + 1}`}>
            {started.length ? `Continue: Lesson ${cont}` : 'Start with Lesson 0'}
          </a>
          <a class="btn" href="#/review">Review deck{due ? ` (${due} due)` : ''}</a>
          <a class="btn" href="#/sandbox">Sandbox</a>
          <a class="btn" href="#/final">Final assessment</a>
        </div>
        {!canSave() && <p class="small" style={{ color: 'var(--warn)', marginTop: '8px' }}>This browser is blocking local storage, so progress will not be saved between visits. Everything else works.</p>}
      </section>
      <section>
        <h2>Lessons</h2>
        <div class="grid3">
          {CATALOG.map((c) => {
            const m = lessonMastery(c.id, practiceIds(c.id));
            return (
              <div key={c.id} class="card tight stack" style={{ gap: '6px' }}>
                <div class="row" style={{ justifyContent: 'space-between' }}>
                  <span class="mono small muted">Lesson {c.id}</span>
                  <span class="small muted">{Math.round(m * 100)}%</span>
                </div>
                <a href={`#/lesson/${c.id}/1`} style={{ textDecoration: 'none' }}>
                  <h3 style={{ margin: 0 }}>{c.title}</h3>
                </a>
                <p class="small" style={{ margin: 0 }}>{c.goal}</p>
                <div class="progress-bar" aria-label={`Mastery ${Math.round(m * 100)} percent`}><i style={{ width: `${Math.round(m * 100)}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>
      <section class="card">
        <h2>How to use this course</h2>
        <ul>
          <li>Move through steps with <kbd>←</kbd> and <kbd>→</kbd> or the buttons. Each step is one idea.</li>
          <li>Before key steps you predict what happens; the circuit only shows it after you choose.</li>
          <li>Every value on the diagram comes from a real simulator of this exact circuit.</li>
          <li>Each lesson ends with practice: encoding and decoding by hand, setting control signals, tracing paths, building, breaking and extending the circuit.</li>
          <li>Questions you miss come back in the review deck with fresh numbers.</li>
          <li>The sandbox runs any program on the circuit as it stands after any lesson.</li>
        </ul>
        <p class="small muted">Scope: the RV32I base integer instructions. ecall, ebreak, fence and the CSR instructions are out of scope.</p>
      </section>
    </div>
  );
}
