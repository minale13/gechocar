const fs = require('fs');
const path = require('path');
const base = process.cwd();
const src = fs.readFileSync(path.join(base, 'region.txt'), 'utf8').split(/\r?\n/);
src.forEach((l, i) => console.log(`${i + 116}: ${l}`));