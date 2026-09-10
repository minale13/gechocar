import fs from 'fs';
const file = process.argv[2];
const start = parseInt(process.argv[3] || '0', 10);
const end = parseInt(process.argv[4] || '0', 10);
const c = fs.readFileSync(file, 'utf8').split('\n');
console.log('Total lines:', c.length);
const s = start - 1;
const e = end ? end : c.length - 1;
for (let i = s; i <= e; i++) {
  console.log((i + 1) + ': ' + c[i]);
}
