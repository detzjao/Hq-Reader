import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npm = 'npm';
const node = process.execPath;

const children = [];
let shuttingDown = false;

function run(command, args, label) {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env, shell: false });
  child.on('exit', (code) => {
    if (!shuttingDown && code && code !== 0) {
      console.error(`\n${label} encerrou com código ${code}.`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try { child.kill(); } catch {}
    }
  }
  setTimeout(() => process.exit(code), 150).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run(node, ['server/devServer.js'], 'API local');
if (isWindows) {
  run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run dev:frontend'], 'Frontend');
} else {
  run(npm, ['run', 'dev:frontend'], 'Frontend');
}
