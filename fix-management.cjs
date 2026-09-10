const fs = require('fs');
const filePath = 'lib/admin/management.ts';
let content = fs.readFileSync(filePath, 'utf-8');
const EOL = '\r\n';

let count = 0;
const track = (label, oldText, newText) => {
  if (content.includes(oldText)) {
    content = content.replace(oldText, newText);
    count++;
    console.log('  ✓ ' + label);
  } else {
    console.log('  ✗ ' + label + ' - NOT FOUND');
  }
};

// 1. Fix TelegramUserStats type comments
track('Type comment - totalRegistered',
  '  /** Profiles with a broadcastable chat_id (bot /start or Mini App open). */',
  '  /** Profiles with a Telegram identity (telegram_chat_id OR telegram_id). */'
);

// 2. Fix function return type and body
track('Function return type',
  '): Promise<{ total: number; today: number; withChat: number }> {',
  '): Promise<TelegramUserStats> {'
);

// 3. Fix the comment block inside the function
track('Function comment block',
  '   // Total registered users = every profile that has a Telegram identity' + EOL +
   '   // (telegram_chat_id OR telegram_id). In a private (DM) chat the user\'s' + EOL +
   '   // personal chat id equals their account id, so stringified telegram_id is' + EOL +
   '   // a valid broadcast target and must count as a registered user.',
   '   // Total registered users = every profile with a Telegram identity' + EOL +
   '   // (telegram_chat_id OR telegram_id).' + EOL +
   '   //' + EOL +
   '   // In a private (DM) chat the user\'s personal chat id equals their' + EOL +
   '   // account id, so stringified telegram_id is a valid broadcast target.'
);

// 4. Fix the final return to match TelegramUserStats shape
track('Final return shape',
  '  return {' + EOL +
   '    total: totalRes.count ?? 0,' + EOL +
   '    today: todayRes.count ?? 0,' + EOL +
   '    withChat: withChatRes.count ?? 0,' + EOL +
   '  };',
  '  return {' + EOL +
   '    totalRegistered: totalRes.count ?? 0,' + EOL +
   '    activeMiniApp24h: todayRes.count ?? 0,' + EOL +
   '    activeMiniAppTotal: withChatRes.count ?? 0,' + EOL +
   '  };'
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('\nDone. Replacements: ' + count + '/4');
