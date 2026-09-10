const fs = require('fs');
const path = require('path');
const base = process.cwd();
for (const name of ['matrix-mid.txt', 'matrix-ui.txt']) {
  console.log('===== ' + name + ' =====');
  const lines = fs.readFileSync(path.join(base, name), 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => console.log(`${i + 116}: ${l}`));
}