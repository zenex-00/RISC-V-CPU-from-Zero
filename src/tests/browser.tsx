// Tests page: runs the suite in the browser and lists pass/fail.
import { render } from 'preact';
import './suite';
import './geometry';
import './lessons';
import './exercises';
import { runAll, type TestResult } from './harness';

function Page({ results, ms }: { results: TestResult[]; ms: number }) {
  const fail = results.filter((r) => !r.pass).length;
  const groups = [...new Set(results.map((r) => r.group))];
  return (
    <div class="page" style={{ padding: '20px' }}>
      <p>
        <a href="index.html">← Back to the course</a>
      </p>
      <h1>Simulator tests</h1>
      <p class={`feedback ${fail ? 'bad' : 'good'}`} role="status">
        <strong>
          {results.length - fail} passed, {fail} failed
        </strong>{' '}
        <span class="fb-body">in {ms.toFixed(0)} ms. These run the same simulator code the course uses.</span>
      </p>
      {groups.map((g) => (
        <section key={g} class="card" style={{ marginBottom: '12px' }}>
          <h2>{g}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {results
              .filter((r) => r.group === g)
              .map((r, i) => (
                <li key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--rule-2)' }}>
                  <span class={`badge ${r.pass ? 'good' : 'bad'}`}>{r.pass ? 'PASS' : 'FAIL'}</span> {r.name}
                  {!r.pass && <div class="small" style={{ color: 'var(--bad)', fontFamily: 'var(--mono)' }}>{r.msg}</div>}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const t0 = performance.now();
const results = runAll();
const ms = performance.now() - t0;
const root = document.getElementById('app')!;
root.textContent = '';
render(<Page results={results} ms={ms} />, root);
