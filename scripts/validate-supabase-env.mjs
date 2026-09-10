// Validates .env.local Supabase config WITHOUT printing secrets.
import fs from 'fs';

const text = fs.readFileSync('.env.local', 'utf8');

function parseEnv(t) {
  const out = {};
  for (const line of t.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

function decodeJwt(part) {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const env = parseEnv(text);
const url = env.NEXT_PUBLIC_SUPABASE_URL || '';
const urlRef = /https:\/\/([^.]+)\.supabase\.co/.exec(url)?.[1] || '';

const keys = [
  ['NEXT_PUBLIC_SUPABASE_URL', url],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''],
  ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY || ''],
];

console.log('=== Key validation (values redacted) ===');
for (const [name, value] of keys) {
  const raw = value;
  const hasQuotes = /^"|"$/.test(raw) || /^'|'$/.test(raw);
  const hasTrailingSpace = raw !== raw.trim();
  const clean = raw.trim().replace(/^["']|["']$/g, '');
  const prefix = clean.slice(0, 20);
  const looksLikePlaceholder =
    /your-|placeholder|put-|replace|xxx|TODO/i.test(clean) ||
    (name.includes('SERVICE_ROLE') && clean.length < 40) ||
    (name.includes('ANON_KEY') && clean.length < 40 && !clean.startsWith('eyJ'));
  const parts = clean.split('.');
  const isJwt = parts.length === 3 && clean.startsWith('eyJ');
  const payload = isJwt ? decodeJwt(parts[1]) : null;
  const ref = payload?.ref ?? payload?.iss?.split(':')[0] ?? null;
  const role = (payload?.role ?? '?').padEnd(12, ' ');

  console.log(
    `${name}:\n` +
    `  present=${!!raw}\n` +
    `  hasQuotes=${hasQuotes}\n` +
    `  hasSurroundingSpaces=${hasTrailingSpace && raw !== ''}\n` +
    `  jwtFormat=${isJwt}\n` +
    `  chars=${raw.length}\n` +
    `  masked=${raw ? raw.slice(0, 6) + '…' + raw.slice(-4) : ''}\n` +
    `  prefix=${JSON.stringify(prefix)}\n` +
    `  placeholder?=${looksLikePlaceholder}\n` +
    `  role=${role}\n` +
    `  jwtRef=${ref}\n` +
    (urlRef && ref && ref !== urlRef ? `  ⚠️ MISMATCH: key ref (${ref}) != URL ref (${urlRef})\n` : '')
  );
}

console.log(`URL project ref: ${urlRef}`);
const kosher =
  keys.every(([, v]) => v && !/^["']|["']$/.test(v.trim()) && v === v.trim()) &&
  urlRef;
console.log(kosher ? '\nRESULT: config looks structurally valid' : '\nRESULT: ISSUES DETECTED — see above');