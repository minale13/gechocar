import fs from 'fs';
const lines = fs.readFileSync('scripts/telegram-bot.mjs', 'utf-8').split('\n');
console.log('=== Lines 200-215 ===');
for (let i = 199; i < 220; i++) console.log((i+1) + ': ' + lines[i]);
console.log('=== Lines 260-275 ===');
for (let i = 259; i < 280; i++) console.log((i+1) + ': ' + lines[i]);
