// Diagram geometry tests: run the layout checker at every build stage.
import { group, test, ok } from './harness';
import { checkAll } from '../diagram/check';

group('Diagram layout', () => {
  const reports = checkAll();
  test('no wire runs through a block, at every build stage', () => {
    const bad = reports.flatMap((r) => r.issues.filter((i) => i.kind === 'through-block').map((i) => `L${r.level}: ${i.msg}`));
    ok(bad.length === 0, bad.join('; '));
  });
  test('no label overlaps a block, a wire of another net, or another label', () => {
    const bad = reports.flatMap((r) => r.issues.filter((i) => i.kind === 'label-overlap').map((i) => `L${r.level}: ${i.msg}`));
    ok(bad.length === 0, bad.join('; '));
  });
  test('wires only join wires of the same net, and every end is connected', () => {
    const bad = reports.flatMap((r) => r.issues.filter((i) => i.kind === 'bad-junction' || i.kind === 'dangling').map((i) => `L${r.level}: ${i.msg}`));
    ok(bad.length === 0, bad.join('; '));
  });
  test('the full datapath has at most 5 wire crossings', () => {
    const full = reports[reports.length - 1];
    ok(full.crossings.length <= 5, `${full.crossings.length} crossings: ${full.crossings.map((c) => c.a + '×' + c.b).join(', ')}`);
  });
});
