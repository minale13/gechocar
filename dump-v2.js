const fs = require('fs');
const path = require('path');
const base = process.cwd();
const lines = fs.readFileSync(path.join(base, 'components', 'admin', 'tickets-tab.tsx'), 'utf8').split(/\r?\n/);
fs.writeFileSync(path.join(base, 'ticketsfull2.txt'), lines.map((l, i) => `${i + 1}|${l}`).join('\n'), 'utf8');
console.log('WROTE ticketsfull2.txt lines=' + lines.length);