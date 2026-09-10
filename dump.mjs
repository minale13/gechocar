import { readFileSync, writeFileSync } from 'fs';

// Dump telegram-webhook.ts section
const hookLines = readFileSync('lib/telegram-webhook.ts', 'utf-8').split('\n');
let out = '=== WEBHOOK (200-260) ===\n';
for (let i = 199; i < 260; i++) out += (i + 1) + ': ' + hookLines[i] + '\n';

// Dump telegram-bot.mjs section
const botLines = readFileSync('scripts/telegram-bot.mjs', 'utf-8').split('\n');
out += '\n=== BOT (240-300) ===\n';
for (let i = 239; i < 300; i++) out += (i + 1) + ': ' + botLines[i] + '\n';

// Dump schema.sql around telegram_chat_id
const schemaLines = readFileSync('supabase/schema.sql', 'utf-8').split('\n');
out += '\n=== SCHEMA telegram_chat_id locations ===\n';
for (let i = 0; i < schemaLines.length; i++) {
  if (schemaLines[i].includes('telegram_chat_id')) {
    out += (i + 1) + ': ' + schemaLines[i] + '\n';
  }
}

writeFileSync('dump.txt', out);
console.log('Done.');
