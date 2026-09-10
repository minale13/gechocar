import fs from 'fs';
const content = fs.readFileSync('node_modules/@supabase/postgrest-js/dist/index.cjs', 'utf8');

// Find the 'or' method in PostgrestFilterBuilder
const orIdx = content.indexOf('or(');
let searchFrom = orIdx;
while (searchFrom >= 0 && searchFrom < content.length) {
  const chunk = content.substring(searchFrom - 50, searchFrom + 300);
  if (chunk.includes('or(') && chunk.includes('filters')) {
    console.log('Found or method at index', searchFrom);
    console.log(chunk);
    break;
  }
  searchFrom = content.indexOf('or(', searchFrom + 1);
}

// Also try searching for the specific method name
const orMethodIdx = content.indexOf('or(filters');
if (orMethodIdx >= 0) {
  console.log('\nFound "or(filters" at index', orMethodIdx);
  console.log(content.substring(orMethodIdx - 100, orMethodIdx + 500));
}
