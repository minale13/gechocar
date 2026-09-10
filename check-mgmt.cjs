const fs = require('fs');
const lines = fs.readFileSync('C:/Users/tg computer/admas/lib/admin/management.ts', 'utf-8').split('\n');
console.log('Total lines:', lines.length);

// Find the line numbers for key functions
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('getTelegramBroadcastChatIds')) {
    console.log(`Line ${i+1}: ${lines[i].trim()}`);
  }
  if (lines[i].includes('getTelegramUserStats')) {
    console.log(`Line ${i+1}: ${lines[i].trim()}`);
  }
  if (lines[i].includes('broadcastTelegramMessage')) {
    console.log(`Line ${i+1}: ${lines[i].trim()}`);
  }
}

// Print lines around the stats function
console.log('\n=== Lines 900-960 ===');
for (let i = 899; i < 960 && i < lines.length; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
