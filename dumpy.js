const fs=require('fs'),path=require('path'),b=process.cwd();
const L=p=>fs.readFileSync(path.join(b,p),'utf8').split(/\r?\n/);
fs.writeFileSync(path.join(b,'p1.txt'),L('app/admin/page.tsx').filter((_,i1)=>i1>=37&&i1<47).join('\n'));
fs.writeFileSync(path.join(b,'p2.txt'),L('app/admin/page.tsx').filter((_,i2)=>i2>=179&&i2<189).join('\n'));
fs.writeFileSync(path.join(b,'p3.txt'),L('supabase/migrations/005_fix_app_settings_key_value.sql').filter((_,i3)=>i3>=45&&i3<51).join('\n'));
fs.writeFileSync(path.join(b,'p4.txt'),L('supabase/schema.sql').filter((_,i4)=>i4>=101&&i4<106).join('\n'));
console.log('ok');