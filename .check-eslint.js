const fs = require('fs');
const path = require('path');

// lockfile
try {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const pkgs = lock.packages || {};
  const pick = (k) => pkgs[k] ? pkgs[k].version : '(absent)';
  console.log('lock eslint:', pick('node_modules/eslint'));
  console.log('lock eslint-config-next:', pick('node_modules/eslint-config-next'));
  console.log('lock @eslint/eslintrc:', pick('node_modules/@eslint/eslintrc'));
  console.log('lock next:', pick('node_modules/next'));
} catch (e) {
  console.log('lockfile read failed:', e.message);
}

// installed modules
for (const name of ['eslint', 'eslint-config-next', '@eslint/eslintrc']) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join('node_modules', name, 'package.json'), 'utf8'));
    console.log('installed', name + ':', p.version);
  } catch (e) {
    console.log('installed', name + ': NOT INSTALLED');
  }
}
