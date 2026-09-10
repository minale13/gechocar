import fs from 'fs';
const lines = fs.readFileSync('c:/Users/tg computer/admas/lib/admin/management.ts', 'utf-8').split('\r\n');

// Print lines 750-790 (userStats function area)
for (let i = 750; i < 790; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
