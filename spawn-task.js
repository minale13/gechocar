const { spawn } = require('child_process');
const path = require('path');
const cwd = __dirname;
const bat = process.argv[2];
if (!bat) {
  console.error('usage: node spawn-task.js <script.bat>');
  process.exit(1);
}
const child = spawn('cmd.exe', ['/c', path.join(cwd, bat)], {
  cwd,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();
console.log('spawned pid', child.pid);
