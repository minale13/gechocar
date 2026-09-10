const fs = require('fs');
const lines = fs.readFileSync('lib/admin/management.ts', 'utf-8').split('\n');

console.log('=== STATS RETURN (920-940) ===');
for (let i = 919; i < 940; i++) console.log((i+1) + ': ' + JSON.stringify(lines[i]));

console.log('\n=== STATS COMMENT (883-900) ===');
for (let i = 882; i < 900; i++) console.log((i+1) + ': ' + JSON.stringify(lines[i]));
