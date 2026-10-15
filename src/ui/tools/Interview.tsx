// Interview question bank: answer first, then compare with the model answer.

import { useState } from 'preact/hooks';
import type { InterviewQ } from '../../lessons/types';
import { CATALOG } from '../../lessons/catalog';
import { progress, recordConcept, saveInterview } from '../store';
import { inline } from '../markup';

function Question({ q }: { q: InterviewQ }) {
  const [text, setText] = useState(progress().interview[q.id] ?? '');
  const [shown, setShown] = useState(false);
  const [graded, setGraded] = useState<string | null>(null);
  const attempted = text.trim().length >= 15;
  return (
    <div class="card tight stack">
      <div class="step-text"><b>{inline(q.q)}</b></div>
      <textarea
        rows={3}
        value={text}
        placeholder="Write your answer as you would say it in an interview…"
        aria-label={`Your answer: ${q.q}`}
        style={{ fontFamily: 'var(--font)' }}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        onBlur={() => saveInterview(q.id, text)}
      />
      <div class="toolbar">
        <button class="btn" disabled={!attempted} onClick={() => { saveInterview(q.id, text); setShown(true); }}>
          Show the model answer
        </button>
        {!attempted && <span class="small muted">Write an attempt first (at least a sentence).</span>}
      </div>
      {shown && (
        <>
          <div class="answer"><span class="fb-body">{inline(q.a)}</span></div>
          <div class="row small">
            <span class="muted">How did you do?</span>
            {['Got it', 'Partly', 'Missed it'].map((g) => (
              <button key={g} class={`btn small ${graded === g ? 'on' : ''}`} onClick={() => { setGraded(g); recordConcept(`interview:${q.id}`, g === 'Got it'); }}>{g}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function InterviewBank({ bank }: { bank: InterviewQ[] }) {
  const lessons = [...new Set(bank.map((q) => q.lesson))].sort((a, b) => a - b);
  const [lesson, setLesson] = useState<number | 'all'>('all');
  const list = bank.filter((q) => lesson === 'all' || q.lesson === lesson);
  return (
    <div class="stack page">
      <p class="small muted">Answer out loud or in writing first; the model answer appears only after an attempt. Questions you mark "Partly" or "Missed it" join your review deck.</p>
      <div class="pill-row" role="group" aria-label="Filter by lesson">
        <button class={`btn small ${lesson === 'all' ? 'on' : ''}`} onClick={() => setLesson('all')}>All ({bank.length})</button>
        {lessons.map((l) => (
          <button key={l} class={`btn small ${lesson === l ? 'on' : ''}`} onClick={() => setLesson(l)}>
            {l}. {CATALOG[l].short}
          </button>
        ))}
      </div>
      {list.map((q) => <Question key={q.id} q={q} />)}
    </div>
  );
}
