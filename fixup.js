const fs=require('fs');const path=require('path');const b=process.cwd();
function R(p){return fs.readFileSync(path.join(b,p),'utf8');}
function W(p,t){fs.writeFileSync(path.join(b,p),t);}
const totalOld=R('p1.txt').split('\n')[6].trim();
const totalNew=totalOld.replace('100,','10000,');
const admin=R('app/admin/page.tsx').split(totalOld).join(totalNew);
W('app/admin/page.tsx',admin);
const valOld=R('p3.txt').split('\n')[4].trim();
const valNew=valOld.replace('100)','10000)');
const m5=R('supabase/migrations/005_fix_app_settings_key_value.sql').split(valOld).join(valNew;
W('supabase/migrations/005_fix_app_settings_key_value.sql',m5;
const sc=R('supabase/schema.sql').split(valOld).join(valNew;
W('supabase/schema.sql',sc;
console.log('fixed totalOld='+totalOld+' valOld='+valOld);