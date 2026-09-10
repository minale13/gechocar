import fs from 'fs';
const lines = fs.readFileSync('lib/supabase/types.ts', 'utf-8').split('\n');
console.log('Total lines:', lines.length);
// Find profiles section
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('profiles:')) {
    console.log('=== profiles section starting at line', i+1, '===');
    for (let j = i; j < i + 80; j++) {
      if (lines[j] && lines[j].includes('telegram_users:')) break;
      console.log((j+1) + ': ' + lines[j]);
    }
    break;
  }
}
