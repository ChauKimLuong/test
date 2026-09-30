import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { seed } from './seed';
@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  readonly prisma = new PrismaClient({ adapter: new PrismaPg({connectionString: process.env.DATABASE_URL || 'postgres://flowpilot:flowpilot_local_change_me@localhost:5433/flowpilot'}) });
  readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgres://flowpilot:flowpilot_local_change_me@localhost:5433/flowpilot',
    max: 15,
  });
  async onModuleInit() {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(7364521)');
      await c.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz DEFAULT now())',
      );
      for (const version of ['001', '002', '003']) {
        const applied = await c.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
        if (!applied.rowCount) {
          const filename = version === '001' ? '001_initial.sql' : version === '002' ? '002_form_review.sql' : '003_form_notifications.sql';
          await c.query(readFileSync(join(process.cwd(), 'database', filename), 'utf8'));
          await c.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
        }
      }
      if (process.env.SEED_DEMO !== 'false') await seed(c);
      if (!(await c.query("SELECT 1 FROM schema_migrations WHERE version='004'")).rowCount) {
        await c.query(readFileSync(join(process.cwd(), 'database', '004_template_permissions.sql'), 'utf8'));
        await c.query("INSERT INTO schema_migrations(version) VALUES('004')");
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async query(sql: string, params: unknown[] = []): Promise<any[]> {
    return (await this.pool.query(sql, params)).rows;
  }
  async transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const value = await fn(c);
      await c.query('COMMIT');
      return value;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async onModuleDestroy() {
    await this.prisma.$disconnect();
    await this.pool.end();
  }
}
