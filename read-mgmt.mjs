import fs from 'fs';
const lines = fs.readFileSync('lib/admin/management.ts', 'utf-8').split('\n');
console.log('Total lines:', lines.length);
for (let i = 279; i < 400; i++) console.log((i+1) + ': ' + lines[i]);
console.log('---');
for (let i = 829; i < 970; i++) console.log((i+1) + ': ' + lines[i]);

