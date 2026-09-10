const fs = require('fs');
fs.copyFileSync(process.cwd() + '/components/admin/tickets-tab.tsx', process.cwd() + '/tickets-now.txt');
console.log('COPIED');