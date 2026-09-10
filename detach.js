// Detaches a long-running command (typecheck/build) so it survives the
// parent shell exiting. Usage: node detach.js "<command>"
const { spawn } = require("child_process");

const command = process.argv.slice(2).join(" ");
if (!command) {
  console.error("Usage: node detach.js \"<command>\"");
  process.exit(1);
}

const child = spawn("cmd.exe", ["/c", command], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
  cwd: __dirname,
});

child.unref();
console.log("Detached PID:", child.pid);
