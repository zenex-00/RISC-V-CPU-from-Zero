import { checkAll } from './check';
const reps = checkAll();
for (const r of reps) {
  const head = `L${r.level} [${r.keys.join(',')}]`;
  if (r.issues.length) {
    console.log(head);
    for (const i of r.issues) console.log('   ', i.kind, i.msg);
  }
}
const full = reps[reps.length - 1];
console.log('full datapath crossings:', full.crossings.length);
for (const c of full.crossings) console.log('   ', c.a, 'x', c.b, 'at', c.at.join(','));
