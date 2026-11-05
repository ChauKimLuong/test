import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import seedModule from '../dist/seed.js';
import engineModule from '../dist/workflow-engine.js';
export async function runMigrationTests(source, password) {
  const name = 'flowpilot_migration_' + Date.now(),
    admin = new Pool({ connectionString: source }),
    url = new URL(source);
  url.pathname = '/' + name;
  let db,
    c,
    created = false,
    checks = 0;
  try {
    await admin.query('CREATE DATABASE ' + name);
    created = true;
    db = new Pool({ connectionString: url.toString() });
    c = await db.connect();
    for (const file of ['001_initial.sql', '002_form_review.sql', '003_form_notifications.sql'])
      await c.query(readFileSync('database/' + file, 'utf8'));
    const saved = process.env.DEMO_PASSWORD;
    process.env.DEMO_PASSWORD = password;
    try {
      await seedModule.seed(c);
    } finally {
      if (saved === undefined) delete process.env.DEMO_PASSWORD;
      else process.env.DEMO_PASSWORD = saved;
    }
    await c.query(readFileSync('database/004_template_permissions.sql', 'utf8'));
    const requester = (
      await c.query(
        "SELECT a.* FROM employee_assignments a JOIN users u ON u.id=a.user_id WHERE u.email='huy@flowpilot.vn'",
      )
    ).rows[0];
    const approver = (
      await c.query(
        "SELECT a.*,u.full_name FROM employee_assignments a JOIN users u ON u.id=a.user_id WHERE u.email='linh@flowpilot.vn'",
      )
    ).rows[0];
    const workflow = (
      await c.query(
        "SELECT w.* FROM workflows w JOIN form_templates f ON f.id=w.form_template_id WHERE f.status='ACTIVE' LIMIT 1",
      )
    ).rows[0];
    const fixtures = [];
    for (const status of ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) {
      const submitted = status !== 'DRAFT';
      const [r] = (
        await c.query(
          `INSERT INTO requests(workflow_id,requester_assignment_id,approver_assignment_id,form_data,request_code,status,submitted_at,decided_at,decision_comment) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7 THEN now() ELSE NULL END,CASE WHEN $6 IN ('APPROVED','REJECTED') THEN now() ELSE NULL END,$8) RETURNING *`,
          [
            workflow.id,
            requester.id,
            submitted ? approver.id : null,
            JSON.stringify({ legacy: 'Nội dung cũ' }),
            submitted ? 'MIG-' + status : null,
            status,
            submitted,
            status === 'REJECTED' ? 'Lý do cũ' : null,
          ],
        )
      ).rows;
      fixtures.push(r);
    }
    const before = (
      await c.query(
        'SELECT id,request_code,form_data,status,template_snapshot FROM requests ORDER BY id',
      )
    ).rows;
    await c.query('BEGIN');
    await c.query(readFileSync('database/005_workflow_engine.sql', 'utf8'));
    await c.query(readFileSync('database/006_workflow_operations.sql', 'utf8'));
    await c.query('COMMIT');
    assert.deepEqual(
      (
        await c.query(
          'SELECT id,request_code,form_data,status,template_snapshot FROM requests ORDER BY id',
        )
      ).rows,
      before,
    );
    checks++;
    for (const r of fixtures) {
      const instances = (
        await c.query('SELECT * FROM workflow_instances WHERE request_id=$1', [r.id])
      ).rows;
      assert.equal(instances.length, r.status === 'DRAFT' ? 0 : 1);
      checks++;
      if (r.status !== 'DRAFT') {
        assert.equal(
          (
            await c.query(
              'SELECT count(*)::int AS n FROM request_submissions WHERE request_id=$1',
              [r.id],
            )
          ).rows[0].n,
          1,
        );
        checks++;
      }
    }
    const pending = fixtures.find((r) => r.status === 'PENDING');
    await c.query('BEGIN');
    const r = (await c.query('SELECT * FROM requests WHERE id=$1 FOR UPDATE', [pending.id]))
      .rows[0];
    await new engineModule.WorkflowEngine().decide(
      c,
      { assignmentId: approver.id, userId: approver.user_id, fullName: approver.full_name },
      r,
      { decision: 'APPROVED', comment: 'Tiếp tục sau migration' },
    );
    await c.query('COMMIT');
    assert.equal(
      (await c.query('SELECT status FROM requests WHERE id=$1', [r.id])).rows[0].status,
      'APPROVED',
    );
    checks++;
    for (const table of ['workflow_versions', 'request_submissions', 'task_decisions']) {
      await assert.rejects(c.query(`DELETE FROM ${table}`));
      checks++;
    }
    await assert.rejects(
      c.query("UPDATE requests SET form_data='{}' WHERE id=$1", [
        fixtures.find((r) => r.status === 'APPROVED').id,
      ]),
    );
    checks++;
    console.log(
      checks +
        ' migration checks passed: baseline DRAFT/PENDING/final preserved, legacy pending approval continued, immutable history retained.',
    );
  } finally {
    if (c) {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
    if (db) await db.end();
    if (created) await admin.query('DROP DATABASE ' + name + ' WITH (FORCE)');
    await admin.end();
  }
}
