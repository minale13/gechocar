const fs = require('fs');
const path = require('path');
const base = process.cwd();
const src = fs.readFileSync(path.join(base, 'tickets-dump.txt'), 'utf8').split(/\r?\n/);
fs.writeFileSync(path.join(base, 'region.txt'), src.slice(115, 233).join('\n'), 'utf8');
console.log('WROTE region.txt lines=' + (233 - 116));