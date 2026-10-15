// Progress saved in localStorage. Every access is wrapped: the course works
// (without saving) when storage is blocked, e.g. in some file:// setups.

const KEY = 'rv-course-progress-v1';

export interface ExRecord {
  attempts: number;
  best: number; // 0..1
  last: number; // 0..1
  when: number;
}

export interface ConceptRecord {
  right: number;
  wrong: number;
  box: number; // Leitner box 0..4
  due: number; // timestamp (ms) when it should come back
  last: number;
}

export interface Progress {
  steps: Record<number, number>; // lesson -> furthest step index seen
  stepsTotal: Record<number, number>;
  ex: Record<string, ExRecord>; // exercise id -> record
  concepts: Record<string, ConceptRecord>;
  interview: Record<string, string>; // question id -> learner's answer text
  final: { score: number; when: number; detail: Record<string, number> } | null;
  /** Last lesson step opened, for "Continue". */
  last?: { lesson: number; step: number };
}

const empty = (): Progress => ({ steps: {}, stepsTotal: {}, ex: {}, concepts: {}, interview: {}, final: null });

let state: Progress = load();
let storageOk = true;
const listeners = new Set<() => void>();

function load(): Progress {
  if (typeof window === 'undefined') return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    storageOk = false;
    return empty();
  }
}

function save() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false;
  }
  listeners.forEach((f) => f());
}

export const progress = () => state;
export const canSave = () => storageOk;

export function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function markStep(lesson: number, step: number, total: number) {
  state.last = { lesson, step };
  const prev = state.steps[lesson] ?? -1;
  if (step <= prev && state.stepsTotal[lesson] === total) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage blocked: progress is kept for this session only */
    }
    return;
  }
  state.steps[lesson] = Math.max(prev, step);
  state.stepsTotal[lesson] = total;
  save();
}

export function recordExercise(id: string, score: number) {
  const r = state.ex[id] ?? { attempts: 0, best: 0, last: 0, when: 0 };
  r.attempts++;
  r.best = Math.max(r.best, score);
  r.last = score;
  r.when = Date.now();
  state.ex[id] = r;
  save();
}

const DAY = 24 * 3600 * 1000;
const BOX_DELAY = [0, 10 * 60 * 1000, DAY, 3 * DAY, 7 * DAY];

/** Record a right or wrong answer for a concept (drives the review deck). */
export function recordConcept(concept: string, right: boolean) {
  const r = state.concepts[concept] ?? { right: 0, wrong: 0, box: 0, due: 0, last: 0 };
  if (right) {
    r.right++;
    r.box = Math.min(4, r.box + 1);
  } else {
    r.wrong++;
    r.box = 0;
  }
  r.last = Date.now();
  r.due = r.last + BOX_DELAY[r.box];
  state.concepts[concept] = r;
  save();
}

export function saveInterview(id: string, text: string) {
  state.interview[id] = text;
  save();
}

export function saveFinal(score: number, detail: Record<string, number>) {
  state.final = { score, when: Date.now(), detail };
  save();
}

export function resetProgress() {
  state = empty();
  save();
}

/** Concepts the learner has got wrong at least once and that are due now. */
export function dueConcepts(now = Date.now()): string[] {
  return Object.entries(state.concepts)
    .filter(([, r]) => r.wrong > 0 && r.due <= now)
    .sort((a, b) => a[1].box - b[1].box || a[1].due - b[1].due)
    .map(([k]) => k);
}

export function weakConcepts(): { concept: string; rate: number; wrong: number }[] {
  return Object.entries(state.concepts)
    .filter(([, r]) => r.wrong > 0)
    .map(([concept, r]) => ({ concept, rate: r.right / (r.right + r.wrong), wrong: r.wrong }))
    .sort((a, b) => a.rate - b.rate);
}

/** Mastery of a lesson: steps seen (40%) and exercise scores (60%). */
export function lessonMastery(lesson: number, exerciseIds: string[]): number {
  const total = state.stepsTotal[lesson] ?? 0;
  const seen = total ? Math.min(1, ((state.steps[lesson] ?? -1) + 1) / total) : 0;
  if (!exerciseIds.length) return seen;
  const ex = exerciseIds.reduce((s, id) => s + (state.ex[id]?.best ?? 0), 0) / exerciseIds.length;
  return 0.4 * seen + 0.6 * ex;
}
