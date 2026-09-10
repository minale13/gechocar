// Robust brace/paren/bracket balancer (whole-file) that handles strings,
// comments, template literals with ${} recursion, and regex literals.
import fs from 'fs';
import path from 'path';

const file = process.argv[2] ?? 'app/admin/page.tsx';
const maxLine = process.argv[3] ? Number(process.argv[3]) : Infinity;
const src = (() => {
  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  if (maxLine === Infinity) return raw;
  return raw.split(/\r?\n/).slice(0, maxLine).join('\n');
})();
const lines = src.split(/\r?\n/);
const stack = [];
const pairs = { '}': '{', ')': '(', ']': '[' };

function lineOf(idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}
function colOf(idx) {
  const nl = src.lastIndexOf('\n', idx - 1);
  return idx - nl;
}
const fail = (idx, text) => {
  console.log(`L${lineOf(idx)}:${colOf(idx)} — ${text}`);
  process.exit(0);
};

let i = 0;
const n = src.length;
function scan(stopAtLen = -1) {
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '`') {
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          // Push a synthetic brace for the ${...} substitution so its
          // closing } pops it (not some unrelated brace).
          const base = stack.length;
          stack.push({ ch: '{', idx: i });
          i += 2;
          scan(base);
          continue;
        }
        if (src[i] === '`') { i++; break; }
        i++;
      }
      continue;
    }
    // regex literal heuristic: not after ) } ] " ' ` or word char
    const prevChar = src[i - 1] || ' ';
    if (ch === '/' && !/[)}\]]"'`\w]/.test(prevChar)) {
      let k = i + 1;
      let inClass = false;
      while (k < n) {
        if (src[k] === '\\') { k += 2; continue; }
        if (src[k] === '[') inClass = true;
        else if (src[k] === ']') inClass = false;
        else if (src[k] === '/' && !inClass) break;
        k++;
      }
      i = k + 1;
      continue;
    }

    if (ch === '{' || ch === '(' || ch === '[') {
      stack.push({ ch, idx: i });
      if (process.env.TRACE && lineOf(i) >= Number(process.env.TRACE_FROM || 0)) {
        console.log(`L${lineOf(i)} PUSH '${ch}' len after: ${stack.length} char:${src.slice(i, i + 14).replace(/\n/g, '\\n')}`);
      }
      i++;
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      if (process.env.TRACE && lineOf(i) >= Number(process.env.TRACE_FROM || 0)) {
        console.log(`L${lineOf(i)} POP '${ch}' len before: ${stack.length}`);
      }
      if (stack.length === 0) fail(i, `UNMATCHED CLOSING '${ch}'`);
      const top = stack[stack.length - 1];
      if (top.ch !== pairs[ch]) {
        fail(
          i,
          `MISMATCH: '${ch}' closes but stack top is '${top.ch}' opened L${lineOf(top.idx)}: ${lines[lineOf(top.idx) - 1].trim().slice(0, 70)}`,
        );
      }
      stack.pop();
      i++;
      // If we've popped back to the level the caller's ${...} substitution
      // started at, hand control back to the template scanner.
      if (stopAtLen >= 0 && stack.length === stopAtLen) return;
      continue;
    }
    i++;
  }
}
scan();
if (stack.length === 0) {
  console.log('Balanced OK');
} else {
  console.log(`Unclosed (${stack.length}):`);
  stack.slice(-8).forEach((x) =>
    console.log(
      `  ${x.ch} opened L${lineOf(x.idx)}: ${lines[lineOf(x.idx) - 1].trim().slice(0, 70)}`,
    ),
  );
}