'use strict';

const { spawn } = require('child_process');

let electronPath;
try {
  electronPath = require('electron');
} catch (err) {
  console.error('未找到 electron，请先执行 npm install');
  process.exit(1);
}

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const args = ['.'].concat(process.argv.slice(2));
const child = spawn(electronPath, args, { stdio: 'inherit', env, cwd: process.cwd() });

child.on('exit', (code) => process.exit(code === null ? 0 : code));
child.on('error', (err) => {
  console.error('启动失败：', err.message);
  process.exit(1);
});
