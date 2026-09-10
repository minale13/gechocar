const fs = require('fs');
const path = require('path');
const base = process.cwd();
const lines = fs.readFileSync(path.join(base, 'components', 'admin', 'tickets-tab.tsx'), 'utf8').split(/\r?\n/);
fs.writeFileSync(path.join(base, 'grid-tail.txt'), lines.slice(229, 262).join('\n'), 'utf8');
console.log('WROTE grid-tail.txt');
const m = fs.readFileSync(path.join(base, 'supabase', 'migrations', '017_payments_users_relation_fix.sql'), 'utf8');
console.log('017 exists, length=' + m.length);