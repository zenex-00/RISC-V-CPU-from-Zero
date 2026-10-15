// Lesson content checks: every lesson's data is consistent with the circuit
// and the simulator.
import { group, test, ok, eq } from './harness';
import { LESSON_KEYS } from '../diagram/visibility';
import { COMPS, WIRES, compById } from '../diagram/layout';
import { exampleTrace } from '../ui/engine';
import { PRACTICE_COUNTS } from '../ui/exercises/index-data';
import { GENERATORS } from '../ui/exercises/concepts';
import { EQUATIONS, evalEquation } from '../sim/gates';
import { MAIN_TABLE, IMMSRC_CODE_FOR } from './gatecheck';
import type { LessonDef } from '../lessons/types';
import l00 from '../lessons/l00';
import l01 from '../lessons/l01';
import l02 from '../lessons/l02';
import l03 from '../lessons/l03';
import l04 from '../lessons/l04';
import l05 from '../lessons/l05';
import l06 from '../lessons/l06';
import l07 from '../lessons/l07';
import l08 from '../lessons/l08';
import l09 from '../lessons/l09';
import l10 from '../lessons/l10';
import l11 from '../lessons/l11';
import l12 from '../lessons/l12';
import l13 from '../lessons/l13';
import l14 from '../lessons/l14';

export const LESSONS: LessonDef[] = [l00, l01, l02, l03, l04, l05, l06, l07, l08, l09, l10, l11, l12, l13, l14];

const PANELS = new Set(['comb-seq', 'clock', 'setup-hold', 'single-cycle', 'dp-vs-ctrl', 'rtype-table', 'itype-table', 'load-table', 'store-be', 'branch-f3', 'li-split', 'ctrl-signals', 'main-table', 'alu-table', 'gates', 'delays']);
const PARTS = new Set([...COMPS.map((c) => c.id), ...WIRES.map((w) => w.id)]);
const STAGES = new Set(['pc', 'fetch', 'decode', 'read', 'alu', 'mem', 'wb', 'next', 'ctrl', 'edge']);

/** Count sentences: a full stop, question or exclamation mark followed by a space or the end. */
export function sentences(text: string): number {
  const t = text.replace(/`[^`]*`/g, 'CODE').replace(/\be\.g\./g, 'eg').replace(/\bi\.e\./g, 'ie').replace(/\d\.\d/g, '0');
  return (t.match(/[.!?](\s|$)/g) ?? []).length;
}

group('Lesson content', () => {
  test('lesson ids and order', () => {
    LESSONS.forEach((l, i) => eq(l.id, i, 'id'));
  });
  for (const l of LESSONS) {
    test(`Lesson ${l.id}: reveal keys, parts, panels, predictions, examples`, () => {
      const keys = l.level !== null && l.level <= 10 ? LESSON_KEYS[l.level] ?? [] : [];
      const seen: string[] = [];
      const long: string[] = [];
      l.steps.forEach((s, i) => {
        const where = `step ${i + 1}`;
        for (const k of s.reveal ?? []) {
          ok(keys.includes(k), `${where}: reveal key "${k}" is not a key of level ${l.level}`);
          seen.push(k);
        }
        for (const f of s.flow ?? []) {
          if (f.startsWith('stage:')) ok(STAGES.has(f.slice(6)), `${where}: unknown stage ${f}`);
          else ok(PARTS.has(f), `${where}: unknown part ${f}`);
        }
        for (const f of s.focus ?? []) ok(PARTS.has(f), `${where}: unknown focus ${f}`);
        if (s.inside) ok(!!compById[s.inside]?.inside, `${where}: no inside panel for ${s.inside}`);
        if (s.panel) ok(PANELS.has(s.panel), `${where}: unknown panel ${s.panel}`);
        if (s.example) {
          const r = exampleTrace(s.example);
          ok(!r.error, `${where}: example "${s.example.asm}" does not assemble: ${r.error}`);
          ok(!r.trace.fault, `${where}: example "${s.example.asm}" faults: ${r.trace.fault}`);
        }
        if (s.predict) {
          let ex = null;
          for (let j = i; j >= 0 && !ex; j--) ex = l.steps[j].example ?? null;
          ok(ex, `${where}: prediction without an example`);
          if (ex) {
            const t = exampleTrace(ex).trace;
            const a = s.predict.answer(t);
            ok(s.predict.options.some((o) => o.value === a), `${where}: answer "${a}" is not among the options`);
            ok(s.predict.explain(t).length > 10, `${where}: explanation missing`);
          }
        }
        for (const para of s.text.split(/\n\s*\n/)) if (sentences(para) > 3) long.push(`${where} (${sentences(para)}): "${para.slice(0, 50)}…"`);
      });
      ok(long.length === 0, 'steps longer than 3 sentences: ' + long.join(' | '));
      eq(seen.join(','), keys.join(','), 'reveal keys in lesson order');
    });
    test(`Lesson ${l.id}: practice list matches the index`, () => {
      eq(l.practice.length, PRACTICE_COUNTS[l.id], 'practice count');
      for (const p of l.practice) if (p.kind === 'quiz') for (const c of p.concepts) ok(GENERATORS[c], `no generator for concept ${c}`);
    });
  }
  test('every concept generator produces a valid question 50 times', () => {
    for (const [k, g] of Object.entries(GENERATORS)) {
      for (let i = 0; i < 50; i++) {
        const q = g();
        ok(q.options.length >= 2, `${k}: fewer than 2 options`);
        ok(q.options.some((o) => o.value === q.answer), `${k}: answer ${q.answer} not among options`);
        ok(new Set(q.options.map((o) => o.value)).size === q.options.length, `${k}: duplicate options`);
      }
    }
  });
  test('gate-level main decoder matches the truth table for all nine opcodes', () => {
    for (const r of MAIN_TABLE) {
      for (const e of EQUATIONS) {
        const want = IMMSRC_CODE_FOR(r, e.signal);
        if (want === null) continue; // don't-care
        eq(evalEquation(e, r.opcode), want, `${e.signal} for ${r.name}`);
      }
    }
  });
});
