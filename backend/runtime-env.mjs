import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

// Explicit shell values win over backend/.env, then the Compose .env in the project root.
export function loadRuntimeEnv() {
  const config = {};
  for (const path of [new URL('../.env', import.meta.url), new URL('./.env', import.meta.url)]) {
    if (existsSync(fileURLToPath(path))) Object.assign(config, parseEnv(readFileSync(path, 'utf8')));
  }
  for (const [key, value] of Object.entries(config)) if (process.env[key] === undefined) process.env[key] = value;
  process.env.PORT ??= process.env.API_PORT || '3001';
  process.env.APP_ORIGIN ??= 'http://localhost:' + (process.env.WEB_PORT || '3000');
  process.env.DATABASE_URL ??= `postgres://${encodeURIComponent(process.env.POSTGRES_USER || 'flowpilot')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || 'flowpilot_local_change_me')}@127.0.0.1:${process.env.DB_PORT || '5433'}/${encodeURIComponent(process.env.POSTGRES_DB || 'flowpilot')}`;
}
