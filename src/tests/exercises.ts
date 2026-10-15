// Exercise engines: design challenges, trace completability, build plans.
import { group, test, ok, eq } from './harness';
import { CHALLENGES, runDesign, type ModKey } from '../ui/exercises/designcore';
import { tracePlan } from '../ui/exercises/Trace';
import { buildPlan } from '../ui/exercises/buildplan';
import { exampleFor } from '../ui/exercises/gen';
import { exampleTrace } from '../ui/engine';
import { ISA } from '../sim/isa';
import { levelNeeded } from '../sim/scope';
import { compById } from '../diagram/layout';

group('Exercises', () => {
  for (const ch of Object.values(CHALLENGES)) {
    test(`design challenge "${ch.id}": the model solution passes every test and breaks nothing`, () => {
      const r = runDesign(ch, new Set(ch.model.mods), ch.model.vals);
      ok(r.ok, [...r.rows, ...r.reg].filter((x) => !x.ok).map((x) => `${x.label}: ${x.why}`).join('; '));
    });
  }
  test('design challenge "lui": the alternative (ImmExt into the result mux) also passes', () => {
    const ch = CHALLENGES.lui;
    const r = runDesign(ch, new Set<ModKey>(['resultImm']), { ...ch.model.vals, ALUSrcA: '0', ResultSrc: '3' });
    ok(r.ok, r.rows.filter((x) => !x.ok).map((x) => x.why).join('; '));
  });
  test('design challenges reject wrong designs', () => {
    const lui = CHALLENGES.lui;
    ok(!runDesign(lui, new Set(), lui.model.vals).ok, 'lui without the constant-0 input must fail');
    const sh = CHALLENGES.sh1add;
    ok(!runDesign(sh, new Set<ModKey>(['shB']), sh.model.vals).ok, 'shifting input B computes rs1 + 2*rs2 and must fail');
    const cm = CHALLENGES.cmov;
    ok(!runDesign(cm, new Set<ModKey>(['rs2Zero']), { ...cm.model.vals, ALUSrc: '0' }).ok, 'cmov passing B = rs2 must fail');
    ok(!runDesign(cm, new Set<ModKey>(['srcBZero']), cm.model.vals).ok, 'cmov without the zero detector must fail');
    const sw = CHALLENGES.swinc;
    ok(!runDesign(sw, new Set<ModKey>(['addrSrc']), sw.model.vals).ok, 'swinc without RegDst must fail');
    ok(!runDesign(sw, new Set<ModKey>(['regDst']), sw.model.vals).ok, 'swinc without AddrSrc must fail');
  });
  test('every instruction can be traced to completion at its own level and on the full machine', () => {
    for (const d of ISA) {
      for (let k = 0; k < 3; k++) {
        const t = exampleTrace(exampleFor(d.name)).trace;
        ok(!t.fault, `${d.name} example faults: ${t.fault}`);
        for (const level of [Math.max(levelNeeded(d.name), 2), 11]) {
          const plan = tracePlan(t, level);
          const done = new Set<string>();
          let progress = true;
          while (progress) {
            progress = false;
            for (const p of plan.parts) {
              if (done.has(p)) continue;
              if ((plan.deps[p] ?? []).every((x) => done.has(x))) {
                done.add(p);
                progress = true;
              }
            }
          }
          const stuck = plan.parts.filter((p) => !done.has(p));
          ok(stuck.length === 0, `${d.name} at level ${level}: cannot reach ${stuck.join(', ')}`);
          ok(plan.parts.includes('pc') && plan.parts.includes('imem'), `${d.name}: trace must include PC and instruction memory`);
        }
      }
    }
  });
  test('build mode: every lesson 1-10 has blocks to place and connectable wires', () => {
    for (let level = 1; level <= 10; level++) {
      const p = buildPlan(level);
      if (level === 10) continue; // the control unit is studied in its own lab
      ok(p.newComps.length > 0, `level ${level}: no blocks to place`);
      for (const w of p.need) {
        for (const end of [w.src!, w.dst!]) {
          const [c, port] = end.split('.');
          ok(compById[c] && compById[c].ports[port], `level ${level}: ${w.id} ends at unknown port ${end}`);
          ok(p.comps.some((x) => x.id === c), `level ${level}: ${w.id} connects to ${c}, which is not in the circuit`);
        }
      }
      eq(new Set(p.need.map((w) => `${w.src}>${w.dst}`)).size, p.need.length, `level ${level}: duplicate wires`);
    }
  });
});
