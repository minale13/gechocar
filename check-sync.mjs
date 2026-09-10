import fs from 'fs';
const lines = fs.readFileSync('app/api/user/sync/route.ts', 'utf-8').split('\n');
console.log('Total lines:', lines.length);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('telegram_chat_id') || lines[i].includes('chatId') || lines[i].includes('telegramId')) {
    console.log((i+1) + ': ' + lines[i]);
  }
}
