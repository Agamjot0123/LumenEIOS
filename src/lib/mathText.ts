import katex from 'katex';
import { escapeHtml } from './runtime';

/** Model text often stores a line break as the two characters \ and n. */
function normalizeBreaks(value: string, inMath: boolean): string {
  return value.replace(/\\n(?![a-zA-Z])/g, inMath ? ' ' : '\n');
}

function renderTex(tex: string, display: boolean): string {
  return katex.renderToString(normalizeBreaks(tex, true), {
    throwOnError: false,
    displayMode: display,
    strict: 'ignore',
  });
}

function textHtml(value: string): string {
  return escapeHtml(normalizeBreaks(value, false)).replace(/\n/g, '<br/>');
}

/** HTML for mixed prose and LaTeX (`\(...\)`, `\[...\]`, or a bare formula). */
export function renderMathHtml(source: string): string {
  const text = source ?? '';
  const pattern = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
  const parts: string[] = [];
  let last = 0;
  let found = false;
  for (const match of text.matchAll(pattern)) {
    found = true;
    const index = match.index ?? 0;
    if (index > last) parts.push(textHtml(text.slice(last, index)));
    const display = match[1] != null;
    parts.push(renderTex(display ? match[1] : match[2], display));
    last = index + match[0].length;
  }
  const rest = text.slice(last);
  if (!found && /\\[a-zA-Z]+/.test(rest)) {
    parts.push(renderTex(rest, false));
  } else if (rest.includes('\\(') || rest.includes('\\[')) {
    parts.push(renderTex(rest.replace(/^\\[\[\(]/, ''), false));
  } else if (rest) {
    parts.push(textHtml(rest));
  }
  return parts.join('');
}

export function sameAnswer(left?: string | null, right?: string | null): boolean {
  const normalize = (value: string) => normalizeBreaks(value, true).replace(/\s+/g, ' ').trim();
  if (!left || !right) return false;
  return normalize(left) === normalize(right);
}
