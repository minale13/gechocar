const fs = require('fs');
const path = require('path');
const base = process.cwd();
const src = fs.readFileSync(path.join(base, 'tickets-dump.txt'), 'utf8').split(/\r?\n/);
const pick = (a, b) => src.slice(a - 1, b).join('\n');
function dump(name, a, b) {
  fs.writeFileSync(path.join(base, name), pick(a, b), 'utf8');
  console.log('WROTE ' + name);
}
dump('matrix-mid.txt', 116, 152);
dump('matrix-ui.txt', 160, 235);