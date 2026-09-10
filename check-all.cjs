const fs = require('fs');
const c = fs.readFileSync('components/admin/overview-tab.tsx', 'utf-8');
const lines = c.split('\n');
console.log('Total lines:', lines.length);
// Find TelegramUserStats usage
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('totalRegistered') || lines[i].includes('activeMiniApp') || lines[i].includes('TelegramUserStats') || lines[i].includes('user-stats') || lines[i].includes('withChat')) {
    console.log('  L' + (i+1) + ': ' + lines[i].trim().substring(0, 150));
  }
}
