// Tiny inline markup for lesson text: `code`, **bold**, {rs1} field chips,
// <ctl>Name</ctl> control signals. Paragraphs split on blank lines.

import type { ComponentChildren } from 'preact';

const FIELDS = new Set(['opcode', 'rd', 'funct3', 'rs1', 'rs2', 'funct7', 'imm']);

export function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\{[a-z0-9]+\}|<ctl>[^<]+<\/ctl>)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t[0] === '`') out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t[0] === '{') {
      const f = t.slice(1, -1);
      out.push(FIELDS.has(f) ? <span key={k++} class={`fchip f-${f}`}>{f}</span> : t);
    } else out.push(<span key={k++} class="ctl">{t.slice(5, -6)}</span>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Prose({ text }: { text: string }) {
  const paras = text.split(/\n\s*\n/);
  return (
    <>
      {paras.map((p, i) => (
        <p key={i}>{inline(p.trim())}</p>
      ))}
    </>
  );
}
