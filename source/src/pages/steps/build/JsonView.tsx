import { useMemo, type ReactNode } from 'react';

const TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
const PLACEHOLDER = /<[^<>"]+>/;

/** Render pretty-printed JSON with lightweight, token-based syntax colouring (no innerHTML). */
function highlightJson(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const [whole, str, colon, literal, num] = m;
    if (str !== undefined && colon !== undefined) {
      out.push(
        <span key={i++} className="json-key">
          {str}
        </span>,
        colon,
      );
    } else if (str !== undefined) {
      out.push(
        <span key={i++} className={PLACEHOLDER.test(str) ? 'json-placeholder' : 'json-string'}>
          {str}
        </span>,
      );
    } else if (literal !== undefined) {
      out.push(
        <span key={i++} className={literal === 'null' ? 'json-null' : 'json-bool'}>
          {literal}
        </span>,
      );
    } else if (num !== undefined) {
      out.push(
        <span key={i++} className="json-number">
          {num}
        </span>,
      );
    } else {
      out.push(whole);
    }
    last = start + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function JsonView({ value, label }: { value: unknown; label: string }) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const nodes = useMemo(() => highlightJson(text), [text]);
  return (
    <pre className="mono json-view" tabIndex={0} aria-label={label}>
      <code>{nodes}</code>
    </pre>
  );
}
