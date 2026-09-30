import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// TypeScript emits the decorator metadata required by Nest dependency injection.
const compiler = resolve('node_modules/typescript/bin/tsc');
const initial = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json'], {
  stdio: 'inherit', windowsHide: true,
});
if (initial.status !== 0) process.exit(initial.status || 1);
const children = [
  spawn(process.execPath, [compiler, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, ['--watch', 'dist/main.js'], { stdio: 'inherit', windowsHide: true }),
];
function shutdown() { for (const child of children) child.kill(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const child of children) child.on('exit', () => { shutdown(); process.exit(); });
