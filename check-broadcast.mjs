import fs from 'fs';
const lines = fs.readFileSync('app/api/telegram/broadcast/route.ts', 'utf-8').split('\n');
console.log('Total lines:', lines.length);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('getTelegramBroadcastChatIds') || lines[i].includes('chatId') || lines[i].includes('Broadcast') || lines[i].includes('withChat')) {
    console.log((i+1) + ': ' + lines[i]);
  }
}
