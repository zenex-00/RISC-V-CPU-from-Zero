// Node entry: run the suite and print a pass/fail list.
import './suite';
import './geometry';
import './lessons';
import './exercises';
import { runAll } from './harness';

const results = runAll();
let fail = 0;
let group = '';
for (const r of results) {
  if (r.group !== group) {
    group = r.group;
    console.log(`\n${group}`);
  }
  if (!r.pass) fail++;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '\n        ' + r.msg}`);
}
console.log(`\n${results.length - fail} passed, ${fail} failed`);
(globalThis as unknown as { process: { exitCode: number } }).process.exitCode = fail ? 1 : 0;
