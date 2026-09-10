import fs from 'fs';
import path from 'path';

// Check types.ts
const typesPath = path.join(process.cwd(), 'lib', 'supabase', 'types.ts');
let typesContent = fs.readFileSync(typesPath, 'utf-8');

const allMatches = typesContent.match(/telegram_chat_id/g) || [];
console.log('Total telegram_chat_id in types.ts:', allMatches.length);

// Check profiles section
const profilesStart = typesContent.indexOf('profiles: {');
const profilesSection = typesContent.substring(profilesStart, profilesStart + 1000);

const checks = [
  ['profiles Row: telegram_chat_id after chat_id', profilesSection.includes('chat_id: string | null;\r\n          telegram_chat_id: string | null')],
  ['profiles Insert: telegram_chat_id after chat_id?', profilesSection.includes('chat_id?: string | null;\r\n          telegram_chat_id?: string | null')],
  ['profiles Update: telegram_chat_id after chat_id?', profilesSection.includes('chat_id?: string | null;\r\n          telegram_chat_id?: string | null')],
];

console.log('\nprofiles section verification:');
for (const [name, found] of checks) {
  console.log(`  ${found ? '✓' : '✗'} ${name}`);
}

// Check telegram_users section
const tuStart = typesContent.indexOf('telegram_users: {');
const tuSection = typesContent.substring(tuStart, tuStart + 1000);

const tuChecks = [
  ['telegram_users Row: telegram_chat_id after chat_id', tuSection.includes('chat_id: string | null;\r\n          telegram_chat_id: string | null')],
  ['telegram_users Insert: telegram_chat_id after chat_id?', tuSection.includes('chat_id?: string | null;\r\n          telegram_chat_id?: string | null')],
  ['telegram_users Update: telegram_chat_id after chat_id?', tuSection.includes('chat_id?: string | null;\r\n          telegram_chat_id?: string | null')],
];

console.log('\ntelegram_users section verification:');
for (const [name, found] of tuChecks) {
  console.log(`  ${found ? '✓' : '✗'} ${name}`);
}

// Check migration file exists
const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '027_profiles_telegram_chat_id.sql');
try {
  const migContent = fs.readFileSync(migrationPath, 'utf-8');
  console.log('\n✓ Migration 027 exists, length:', migContent.length);
  const migChecks = [
    ['ALTER TABLE profiles ADD COLUMN telegram_chat_id', migContent.includes('ALTER TABLE profiles ADD COLUMN telegram_chat_id')],
    ['ALTER TABLE telegram_users ADD COLUMN telegram_chat_id', migContent.includes('ALTER TABLE telegram_users ADD COLUMN telegram_chat_id')],
    ['Backfill from chat_id', migContent.includes('UPDATE profiles SET telegram_chat_id = chat_id')],
    ['Backfill from telegram_id', migContent.includes("SET telegram_chat_id = telegram_id::text")],
    ['Indexes created', migContent.includes('CREATE INDEX')],
  ];
  for (const [name, found] of migChecks) {
    console.log(`  ${found ? '✓' : '✗'} ${name}`);
  }
} catch (e) {
  console.log('\n✗ Migration 027 NOT FOUND');
}

// Check schema.sql
const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
let schemaContent = fs.readFileSync(schemaPath, 'utf-8');
const schemaMatches = schemaContent.match(/telegram_chat_id/g) || [];
console.log('\ntelegram_chat_id in schema.sql:', schemaMatches.length);
