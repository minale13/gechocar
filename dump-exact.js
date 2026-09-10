const fs = require('fs');
const path = require('path');
const base = process.cwd();
function show(file, from, to, out) {
  const lines = fs.readFileSync(path.join(base, file), 'utf8').split(/\r?\n/);
  const block = lines.slice(from - 1, to).map((l, i) => `${i + from}|${l}`).join('\n');
  fs.writeFileSync(path.join(base, out), block, 'utf8');
  console.log('WROTE ' + out);
}
show('app/admin/page.tsx', 38, 48, 'p1.txt');
show('app/admin/page.tsx', 180,, 190,,'p2.txt');
show('supabase/migrations/005_fix_app_settings_key_value.sql', 46,, 52,,,'p3.txt');
show('supabase/schema.sql',  102,, 107,,,'p4.txt');