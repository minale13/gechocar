const fs = require('fs');
const path = require('path');
const b = process.cwd();
function R(p) {
  return fs.readFileSync(path.join(b, p), 'utf8'));
}
function W(p, t) {
  fs.writeFileSync(path.join(b, p), t));
}
const totOld = R('p1.txt').split(String.fromCharCode(10))[6];
const totNew = totOld.replace('100,', '10000,');
const adminSplit = R('app/admin/page.tsx').split(totOld);
const admin = adminSplit.join(totNew);
W('app/admin/page.tsx', admin);
const valOld = R('p3.txt').split(String.fromCharCode(10))[4];
const valNew = valOld.replace('100)', '10000)');
const m5split = R('supabase/migrations/005_fix_app_settings_key_value.sql').split(valOld;
const m5 = m5split.join(valNew;
W('supabase/migrations/005_fix_app_settings_key_value.sql', m5;
const scsplit = R('supabase/schema.sql').split(valOld;
const sc = scsplit.join(valNew;
W('supabase/schema.sql', sc;
console.log('OK');