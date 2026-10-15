// Practice tab: the lesson's exercises.

import type { LessonDef, PracticeDef } from '../../lessons/types';
import { EncodeEx } from './Encode';
import { DecodeEx } from './Decode';
import { ControlEx } from './Control';
import { TraceEx } from './Trace';
import { BreakEx } from './Break';
import { QuizEx } from './Quiz';
import { BuildEx } from './Build';
import { DrawEx } from './Draw';
import { DesignEx } from './Design';
import { progress } from '../store';
import { useProgress } from '../app';

const KIND_TITLE: Record<PracticeDef['kind'], string> = {
  encode: 'Encode by hand',
  decode: 'Decode by hand',
  control: 'Set the control signals',
  trace: 'Trace the path',
  build: 'Build mode',
  break: 'Break the circuit',
  draw: 'Draw from memory',
  design: 'Design challenge',
  quiz: 'Check your understanding',
};

export const exerciseId = (lesson: number, i: number) => `${lesson}:${i}`;

export function Exercise({ p, lesson, id }: { p: PracticeDef; lesson: LessonDef; id: string }) {
  const level = lesson.level ?? 11;
  switch (p.kind) {
    case 'encode':
      return <EncodeEx ops={p.ops} exId={id} />;
    case 'decode':
      return <DecodeEx ops={p.ops} exId={id} />;
    case 'control':
      return <ControlEx ops={p.ops} exId={id} level={level} />;
    case 'trace':
      return <TraceEx ops={p.ops} exId={id} level={level} />;
    case 'break':
      return <BreakEx faults={p.faults} scope={lesson.scope} level={level} exId={id} />;
    case 'quiz':
      return <QuizEx concepts={p.concepts} exId={id} />;
    case 'build':
      return <BuildEx level={level} exId={id} />;
    case 'draw':
      return <DrawEx subset={p.subset} exId={id} />;
    case 'design':
      return <DesignEx challenge={p.challenge} exId={id} />;
  }
}

export function Practice({ lesson }: { lesson: LessonDef }) {
  useProgress();
  const pr = progress();
  return (
    <div class="ex-list page">
      {lesson.practice.map((p, i) => {
        const id = exerciseId(lesson.id, i);
        const rec = pr.ex[id];
        return (
          <section key={id} class="card" aria-labelledby={`ex-${id}`}>
            <div class="ex-head">
              <h3 id={`ex-${id}`}>{p.title ?? KIND_TITLE[p.kind]}</h3>
              <span class="small muted">
                {KIND_TITLE[p.kind]}
                {rec ? ` · best ${Math.round(rec.best * 100)}% · ${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'}` : ''}
              </span>
            </div>
            <div style={{ marginTop: '10px' }}>
              <Exercise p={p} lesson={lesson} id={id} />
            </div>
          </section>
        );
      })}
      <div class="row" style={{ justifyContent: 'space-between' }}>
        <a class="btn" href={`#/lesson/${lesson.id}/1`}>Back to the walkthrough</a>
        {lesson.id < 14 ? <a class="btn primary" href={`#/lesson/${lesson.id + 1}/1`}>Next: Lesson {lesson.id + 1} →</a> : <a class="btn primary" href="#/final">Final assessment →</a>}
      </div>
    </div>
  );
}
