// Lesson page: step walkthrough, practice, and the lesson's tool.

import { useEffect, useMemo, useState, useCallback } from 'preact/hooks';
import { CATALOG } from '../../lessons/catalog';
import type { LessonDef, StepDef } from '../../lessons/types';
import { cachedLesson, loadLesson, prefetchLesson } from '../loader';
import { computeStep } from '../engine';
import { Diagram } from '../components/Diagram';
import { InstrCard } from '../components/InstrCard';
import { PredictBox } from '../components/Predict';
import { Prose } from '../markup';
import { markStep } from '../store';
import { InsideToggle } from '../components/Inside';
import { ImmRebuild } from '../components/ImmRebuild';
import { SpecialPanel } from '../panels/Panels';
import { Practice } from '../exercises/Practice';
import { LessonTool } from '../tools/Tools';
import { compById } from '../../diagram/layout';
import { navigate } from '../router';

export function LessonPage({ id, step, tab }: { id: number; step: number; tab: string }) {
  const [lesson, setLesson] = useState<LessonDef | null>(cachedLesson(id) ?? null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    const c = cachedLesson(id);
    if (c) setLesson(c);
    else {
      setLesson(null);
      loadLesson(id).then(setLesson, (e) => setErr(String(e.message ?? e)));
    }
    prefetchLesson(id + 1);
  }, [id]);
  const cat = CATALOG[id];
  if (err) return <div class="page card">Could not load this lesson: {err}</div>;
  if (!lesson || lesson.id !== id) return <div class="page muted">Loading lesson {id}…</div>;
  const hasPractice = lesson.practice.length > 0;
  const tabs: [string, string][] = [['walk', lesson.tool ? 'Walkthrough' : 'Walkthrough']];
  if (lesson.tool) tabs.push(['tool', TOOL_NAME[lesson.tool]]);
  if (hasPractice) tabs.push(['practice', 'Practice']);
  const cur = tabs.some((t) => t[0] === tab) ? tab : 'walk';
  return (
    <div class="page wide">
      <div class="lesson-head">
        <span class="num">Lesson {id}</span>
        <h1>{cat.title}</h1>
        <span class="goal">{cat.goal}</span>
      {tabs.length > 1 && (
        <div class="tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={cur === k} class={cur === k ? 'on' : ''} onClick={() => navigate(`#/lesson/${id}/${k === 'walk' ? step + 1 : k}`)}>
              {label}
            </button>
          ))}
        </div>
      )}
      </div>
      {cur === 'walk' && <Walkthrough lesson={lesson} index={Math.min(step, lesson.steps.length - 1)} />}
      {cur === 'practice' && <Practice lesson={lesson} />}
      {cur === 'tool' && lesson.tool && <LessonTool tool={lesson.tool} lesson={lesson} />}
    </div>
  );
}

const TOOL_NAME: Record<string, string> = {
  machine: 'Run programs',
  timing: 'Timing lab',
  verilog: 'Verilog and diagram',
  interview: 'Question bank',
  control: 'Control unit lab',
};

function Walkthrough({ lesson, index }: { lesson: LessonDef; index: number }) {
  const n = lesson.steps.length;
  const step: StepDef = lesson.steps[index];
  const st = useMemo(() => computeStep(lesson, index), [lesson, index]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const pkey = `${lesson.id}:${index}`;
  const pick = picked[pkey] ?? null;
  const waiting = !!(step.predict && st.trace && pick === null);

  useEffect(() => {
    markStep(lesson.id, index, n);
  }, [lesson.id, index, n]);

  const go = useCallback(
    (i: number) => {
      if (i < 0 || i >= n) return;
      navigate(`#/lesson/${lesson.id}/${i + 1}`, true);
    },
    [lesson.id, n],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  const level = lesson.level;
  const showDiagram = level !== null && !step.noDiagram;
  const d = (step.card ?? lesson.id >= 2) ? st.trace?.decoded ?? null : null;
  const active = waiting ? new Set<string>() : st.active;
  const insideId = step.inside;
  const lastStep = index === n - 1;

  const nav = (
    <div class="stepnav">
      <button class="btn" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous step">
        ← Back
      </button>
      <div class="dots" role="group" aria-label="Steps">
        {lesson.steps.map((_, i) => (
          <button key={i} class={i === index ? 'on' : i < index ? 'seen' : ''} aria-label={`Step ${i + 1}`} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)} />
        ))}
      </div>
      {!lastStep ? (
        <button class="btn primary" onClick={() => go(index + 1)} aria-label="Next step">
          Next →
        </button>
      ) : (
        <button
          class="btn primary"
          onClick={() => navigate(lesson.tool ? `#/lesson/${lesson.id}/tool` : lesson.practice.length ? `#/lesson/${lesson.id}/practice` : `#/lesson/${Math.min(14, lesson.id + 1)}/1`)}
        >
          {lesson.tool ? 'Open the tool →' : lesson.practice.length ? 'Practice →' : 'Next lesson →'}
        </button>
      )}
    </div>
  );

  const stepCard = (
    <div class="card step-card" aria-live="polite">
      <div class="step-meta">
        <span>
          Step {index + 1} of {n}
        </span>
        {st.edge ? <span class="badge">clock edge</span> : st.trace ? <span class="badge">same clock cycle</span> : null}
      </div>
      {step.title && <h2 class="step-title">{step.title}</h2>}
      <div class="step-text">
        <Prose text={step.text} />
      </div>
      {step.route && !waiting && <div class="route">{step.route}</div>}
      {st.error && <div class="feedback bad">Example error: {st.error}</div>}
    </div>
  );

  const side = (
    <div class="side-col">
      {stepCard}
      {step.predict && st.trace && <PredictBox p={step.predict} trace={st.trace} picked={pick} onPick={(v) => setPicked({ ...picked, [pkey]: v })} />}
      {insideId && compById[insideId]?.inside && <InsideToggle key={insideId + index} compId={insideId} trace={st.trace} />}
      {nav}
      <div class="keys-hint">
        Keys: <kbd>←</kbd> <kbd>→</kbd> move between steps
      </div>
    </div>
  );

  if (!showDiagram) {
    return (
      <div class="walk">
        <div class="diagram-col">
          {step.panel ? <SpecialPanel id={step.panel} trace={st.trace} /> : d ? <InstrCard d={d} lit={step.fields} /> : null}
        </div>
        {side}
      </div>
    );
  }

  return (
    <div class="walk">
      {d && (
        <div class="strip-row">
          <InstrCard d={d} lit={step.fields} />
        </div>
      )}
      <div class="diagram-col">
        <Diagram
          level={level!}
          revealed={st.revealed}
          trace={st.trace}
          active={active}
          used={st.used}
          focus={st.focus}
          edge={st.edge && !waiting}
          fadeIdle={step.fadeIdle}
          camera={step.camera ?? 'auto'}
          marks={step.marks}
          label={`Datapath, lesson ${lesson.id}, step ${index + 1}`}
        />
        {step.imm && st.trace && <ImmRebuild word={st.trace.Instr} src={step.imm} />}
        {step.panel && <SpecialPanel id={step.panel} trace={st.trace} />}
      </div>
      {side}
    </div>
  );
}
