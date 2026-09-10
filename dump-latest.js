const fs = require('fs');
const path = require('path');
const base = process.cwd();
const lines = fs.readFileSync(path.join(base, 'components', 'admin', 'tickets-tab.tsx'), 'utf8').split(/\r?\n/);
fs.writeFileSync(path.join(base, 'tickets-latest.txt'), lines.join('\n'), 'utf8');
console.log('WROTE tickets-latest.txt lines=' + lines.length);