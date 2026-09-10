const fs=require('fs'), path=require('path'), b=process.cwd();
const L=p=>fs.readFileSync(path.join(b,p),'utf8').split(/\r?\n/);
fs.writeFileSync(path.join(b,'p1.txt'), L('app/admin/page.tsx').slice(37,,48).join('\n'));
fs.writeFileSync(path.join(b,'p2.txt'), L('app/admin/page.tsx').slice(179,,190).join('\n'));
fs.writeFileSync(path.join(b,'p3.txt'), L('supabase/migrations/005_fix_app_settings_key_value.sql').slice(45,,52).join('\n'));
fs.writeFileSync(path.join(b,'p4.txt'), L('supabase/schema.sql').slice(101,,107).join('\n'));
console.log('done');