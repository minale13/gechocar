// One-off utility: truncates app/admin/page.tsx at the start of the legacy
// JSX render (superseded by the redesigned luxury admin shell).
import fs from 'fs';

const path = 'app/admin/page.tsx';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
const idx = lines.findIndex((l) =>
  l.includes('<main className="min-h-screen bg-[#0B141B] p-4 text-white sm:p-6">'),
);
if (idx === -1) {
  console.error('Legacy render marker not found — nothing truncated.');
  process.exit(1);
}
const cut = idx - 1; // the `return (` line directly above the <main>
if (lines[cut].trim() !== 'return (') {
  console.error('Unexpected structure above marker:', JSON.stringify(lines[cut]));
  process.exit(1);
}
fs.writeFileSync(path, lines.slice(0, cut).join('\n') + '\n', 'utf8');
console.log(`Truncated at line ${cut + 1} — kept ${cut} lines.`);
