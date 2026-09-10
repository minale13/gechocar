import fs from 'fs';
import path from 'path';

const mgmt = fs.readFileSync(path.join(process.cwd(), 'lib', 'admin', 'management.ts'), 'utf-8');
console.log('File length:', mgmt.length);

// Find functions
const broadcastStart = mgmt.indexOf('export async function getTelegramBroadcastChatIds');
const broadcastEnd = mgmt.indexOf('export async function broadcastTelegramToUsers');
const statsStart = mgmt.indexOf('export async function getTelegramUserStats');
const statsEnd = mgmt.indexOf('export async function getTelegramBroadcastChatIds');

console.log('Broadcast:', broadcastStart, broadcastEnd);
console.log('Stats:', statsStart, statsEnd);

if (broadcastStart > -1 && broadcastEnd > -1) {
  console.log('\n=== BROADCAST FUNCTION (first 1000) ===');
  console.log(JSON.stringify(mgmt.substring(broadcastStart, Math.min(broadcastStart + 1000, broadcastEnd))));
}
if (statsStart > -1 && statsEnd > -1) {
  console.log('\n=== STATS FUNCTION (first 1000) ===');
  console.log(JSON.stringify(mgmt.substring(statsStart, Math.min(statsStart + 1000, statsEnd))));
}

