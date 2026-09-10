import fs from 'fs';
const lines = fs.readFileSync('lib/telegram-webhook.ts', 'utf-8').split('\n');
console.log('Total lines:', lines.length);
// Find the upsert sections
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('telegram_chat_id') || lines[i].includes('chat_id:') || lines[i].includes('chat_id :')) {
    console.log((i+1) + ': ' + lines[i]);
  }
}
