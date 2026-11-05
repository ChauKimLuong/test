import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createConnection } from 'node:net';
import pg from 'pg';
import { loadRuntimeEnv } from './runtime-env.mjs';

loadRuntimeEnv();
let database;
try {
  const target = new URL(process.env.DATABASE_URL);
  database = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  await database.query('SELECT 1');
  console.log(`PostgreSQL ready: ${target.hostname}:${target.port || '5432'}${target.pathname}`);
} catch (error) {
  const refused = error.code === 'ECONNREFUSED' || error.errors?.some(e => e.code === 'ECONNREFUSED');
  console.error(refused
    ? 'PostgreSQL is not accepting connections. In PrjectDemo run: .\\start.ps1 -DatabaseOnly, then retry npm run dev.'
    : `PostgreSQL connection failed (${error.code || 'configuration'}). Check DATABASE_URL or POSTGRES_* / DB_PORT in .env.`);
  process.exitCode = 1;
} finally {
  await database?.end();
}
if (process.exitCode) process.exit(process.exitCode);
if (process.argv.includes('--check')) process.exit(0);
const occupied = await new Promise(resolve => {
  const socket = createConnection({ host: '127.0.0.1', port: Number(process.env.PORT) });
  const finish = value => { socket.destroy(); resolve(value); };
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.setTimeout(1000, () => finish(false));
});
if (occupied) {
  console.error(`API port ${process.env.PORT} is already in use. For local development run .\\start.ps1 -DatabaseOnly in PrjectDemo; stop any other local backend using this port.`);
  process.exit(1);
}

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
