const fs = require('fs');
const content = fs.readFileSync('lib/supabase/types.ts', 'utf-8');

// Check telegram_users section
const telegramUsersIdx = content.indexOf('telegram_users:');
const nextSection = content.indexOf('app_settings:');
const tuSection = content.substring(telegramUsersIdx, nextSection > -1 ? nextSection : telegramUsersIdx + 600);
console.log('=== TELEGRAM_USERS SECTION ===');
console.log(tuSection);
