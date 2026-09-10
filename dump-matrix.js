const fs = require('fs');
const path = require('path');
const base = process.cwd();
const file = path.join(base, 'components', 'admin', 'tickets-tab.tsx');
const out = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l, i) => `${i + 1}: ${l}`).join('\n');
fs.writeFileSync(path.join(base, 'tickets-dump.txt'), out, 'utf8');
console.log('WROTE tickets-dump.txt lines=' + out.split('\n').length);