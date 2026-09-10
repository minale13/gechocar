import fs from 'fs';
const lines = fs.readFileSync('lib/mini-app-sync.ts', 'utf-8').split('\n');
console.log('Total lines:', lines.length);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('chatId') || lines[i].includes('telegramId') || lines[i].includes('initDataUnsafe')) {
    console.log((i+1) + ': ' + lines[i]);
  }
}
