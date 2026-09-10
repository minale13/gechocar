const { spawn } = require('child_process');
const path = require('path');
const cwd = __dirname;
const child = spawn('cmd.exe', ['/c', path.join(cwd, 'run-install.bat')], {
  cwd,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();
console.log('spawned pid', child.pid);
