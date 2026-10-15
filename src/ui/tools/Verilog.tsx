// Verilog view: module code next to the diagram, linked both ways.

import { useMemo, useState } from 'preact/hooks';
import type { VerilogModule } from '../../lessons/types';
import { Diagram } from '../components/Diagram';
import { compById } from '../../diagram/layout';

const KW = /\b(module|endmodule|input|output|wire|reg|always|assign|begin|end|if|else|case|endcase|default|posedge|negedge|parameter|localparam|integer|initial|for|function|endfunction|signed|\$readmemh|\$display|\$finish|forever)\b/g;

function highlight(code: string) {
  // Split comments first so keywords inside comments are not coloured.
  const parts: preact.ComponentChildren[] = [];
  const lines = code.split('\n');
  lines.forEach((ln, li) => {
    const ci = ln.indexOf('//');
    const body = ci >= 0 ? ln.slice(0, ci) : ln;
    const cm = ci >= 0 ? ln.slice(ci) : '';
    let last = 0;
    const re = new RegExp(`${KW.source}|(\\b\\d+'[bhd][0-9a-fA-F_xX]+\\b)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      if (m.index > last) parts.push(body.slice(last, m.index));
      parts.push(<span class={m[0].includes("'") ? 'num' : 'kw'}>{m[0]}</span>);
      last = m.index + m[0].length;
    }
    parts.push(body.slice(last));
    if (cm) parts.push(<span class="cm">{cm}</span>);
    if (li < lines.length - 1) parts.push('\n');
  });
  return parts;
}

export function VerilogView({ modules }: { modules: VerilogModule[] }) {
  const [sel, setSel] = useState(modules[0]?.name ?? '');
  const mod = modules.find((m) => m.name === sel) ?? modules[0];
  const marks = useMemo(() => ({ 'mark-link': mod ? mod.comps : [] }), [mod]);
  const onClick = (id: string, kind: 'comp' | 'wire') => {
    if (kind !== 'comp') return;
    // Most specific module that implements this block.
    const m = [...modules].sort((a, b) => a.comps.length - b.comps.length).find((x) => x.comps.includes(id));
    if (m) setSel(m.name);
  };
  if (!mod) return null;
  return (
    <div class="stack page">
      <p class="small muted">Choose a module to see its code and highlight what it implements in the circuit, or click a block in the circuit to jump to its module. The code is plain Verilog-2001 and synthesizable (except the testbench and the memory initialisation).</p>
      <div class="vlist" role="tablist" aria-label="Modules">
        {modules.map((m) => (
          <button key={m.name} role="tab" aria-selected={m.name === mod.name} class={`btn small mono ${m.name === mod.name ? 'on' : ''}`} onClick={() => setSel(m.name)}>
            {m.name}
          </button>
        ))}
      </div>
      <div class="grid2" style={{ gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', alignItems: 'start' }}>
        <section class="card">
          <h3 class="mono">{mod.name}</h3>
          <p class="small">{mod.summary}</p>
          <pre class="verilog" aria-label={`Verilog source of ${mod.name}`}>{highlight(mod.code)}</pre>
          <h4 style={{ marginTop: '10px' }}>Testbench idea</h4>
          <p class="small">{mod.testbench}</p>
        </section>
        <div class="stack">
          <Diagram level={11} revealed={new Set()} trace={null} marks={marks} onClick={onClick} interactive camera="fit" legend={false} label="Click a block to see its module" />
          <p class="small muted">Implements: {mod.comps.length ? mod.comps.map((c) => compById[c]?.desc.split(':')[0] ?? c).join(', ') : 'simulation only'}.</p>
        </div>
      </div>
    </div>
  );
}
