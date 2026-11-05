import { Pool } from 'pg';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { runIntegration } from './integration.mjs';
import { runWorkflowIntegration } from './workflow-integration.mjs';
import { runRuleTests } from './workflow-rules.mjs';
import { runMigrationTests } from './workflow-migration.mjs';
import { runLoadTests } from './workflow-load.mjs';
import { runOperationsTests } from './workflow-operations.mjs';
const source =
  process.env.DATABASE_URL ||
  'postgres://flowpilot:flowpilot_local_change_me@localhost:5433/flowpilot';
const dbName = 'flowpilot_test_' + Date.now();
if (!/^flowpilot_test_[0-9]+$/.test(dbName)) throw new Error('Invalid disposable database name');
const admin = new Pool({ connectionString: source });
const target = new URL(source);
target.pathname = '/' + dbName;
let child,
  db,
  logs = '',
  created = false;
try {
  await admin.query('CREATE DATABASE ' + dbName);
  created = true;
  const password = 'TestPassword@2026!';
  runRuleTests();
  await runMigrationTests(source, password);
  child = spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      DATABASE_URL: target.toString(),
      PORT: '3099',
      APP_ORIGIN: 'http://localhost:3000',
      DEMO_PASSWORD: password,
      SEED_DEMO: 'true',
      SLA_WORKER: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (b) => (logs += b.toString()));
  child.stderr.on('data', (b) => (logs += b.toString()));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch('http://localhost:3099/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (child.exitCode !== null) break;
    await delay(300);
  }
  if (!ready) throw new Error('Test API did not start: ' + logs);
  db = new Pool({ connectionString: target.toString() });
  await runIntegration('http://localhost:3099/api', password, db);
  await runWorkflowIntegration('http://localhost:3099/api', password, db);
  await runOperationsTests('http://localhost:3099/api', password, db);
  await runLoadTests('http://localhost:3099/api', password, db);
} catch (e) {
  console.error(e);
  console.error(logs.slice(-5000));
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, delay(5000)]);
  }
  if (db) await db.end();
  if (created) await admin.query('DROP DATABASE ' + dbName + ' WITH (FORCE)');
  await admin.end();
  console.log('Disposable test database removed. Demo data unchanged.');
}
