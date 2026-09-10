import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'supabase', 'schema.sql');
let content = fs.readFileSync(filePath, 'utf-8');

// Search for profiles table definition
const profilesIdx = content.indexOf('profiles');
console.log('profiles occurrences:');
let idx = 0;
while ((idx = content.indexOf('profiles', idx)) !== -1) {
  const lineStart = content.lastIndexOf('\n', idx);
  const lineEnd = content.indexOf('\n', idx);
  const line = content.substring(lineStart, lineEnd);
  if (line.toLowerCase().includes('create') || line.toLowerCase().includes('table') || line.includes('telegram_chat_id')) {
    console.log(`  ${idx}: ${line.trim()}`);
  }
  idx += 9;
}

// Check for telegram_chat_id in schema
const tcidCount = (content.match(/telegram_chat_id/g) || []).length;
console.log('\ntelegram_chat_id occurrences in schema.sql:', tcidCount);

// Show lines with telegram_chat_id
const lines = content.split('\n');
lines.forEach((line, i) => {
  if (line.includes('telegram_chat_id')) {
    console.log(`  Line ${i+1}: ${line.trim()}`);
  }
});
