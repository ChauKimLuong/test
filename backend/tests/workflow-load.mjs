import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
export async function runLoadTests(base, password, db) {
  async function login(email) {
    const r = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(r.status, 201);
    return { cookie: r.headers.get('set-cookie').split(';')[0], ...(await r.json()) };
  }
  const huyClients = [],
    linhClients = [];
  for (let i = 0; i < 20; i++) {
    huyClients.push(await login('huy@flowpilot.vn'));
    linhClients.push(await login('linh@flowpilot.vn'));
  }
  const huy = huyClients[0],
    linh = linhClients[0];
  const [w] = (
    await db.query(
      "SELECT w.* FROM workflows w JOIN form_templates f ON f.id=w.form_template_id WHERE f.code='WF-ADVANCED-TEST'",
    )
  ).rows;
  await db.query(
    `WITH req AS (
 INSERT INTO requests(workflow_id,requester_assignment_id,approver_assignment_id,request_code,status,submitted_at,form_data)
 SELECT $1,$2,$3,'PERF-'||gen_random_uuid(),'PENDING',now(),'{"amount":150,"reason":"Load test"}'::jsonb FROM generate_series(1,1000) RETURNING id),
 instance AS (INSERT INTO workflow_instances(request_id,workflow_version_id,status) SELECT id,$4,'RUNNING' FROM req RETURNING id),
 step AS (INSERT INTO workflow_step_runs(instance_id,round,step_id,step_index,name,mode,status) SELECT id,1,'manager',0,'Quản lý trực tiếp','ALL','ACTIVE' FROM instance RETURNING id)
 INSERT INTO approval_tasks(step_run_id,assignee_assignment_id,assignee_user_id,assignee_snapshot) SELECT id,$3,$5,'{"name":"Linh","position":"Trưởng phòng","unit":"Sản phẩm"}'::jsonb FROM step`,
    [
      w.id,
      huy.actor.assignmentId,
      linh.actor.assignmentId,
      w.published_version_id,
      linh.actor.userId,
    ],
  );
  const [{ id }] = (
    await db.query("SELECT id FROM requests WHERE request_code LIKE 'PERF-%' LIMIT 1")
  ).rows;
  // Measure a populated database with fresh planner statistics, instead of depending on
  // when autovacuum notices the just-inserted bulk fixtures.
  for(const table of ['requests','workflow_instances','workflow_step_runs','approval_tasks'])
    await db.query('ANALYZE '+table);
  async function read(path, user) {
    const start = performance.now();
    const r = await fetch(base + '/' + path, { headers: { cookie: user.cookie } });
    assert.equal(r.status, 200);
    await r.json();
    return performance.now() - start;
  }
  const p95 = (values) =>
    Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]);
  const times = {};
  for (const [label, path, user] of [
    ['inbox', 'requests?view=inbox', linh],
    ['detail', 'requests/' + id, huy],
  ]) {
    const values = [];
    for (let batch = 0; batch < 3; batch++)
      values.push(
        ...(await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            read(path, user === linh ? linhClients[i] : huyClients[i]),
          ),
        )),
      );
    times[label] = { p95Ms: p95(values), samples: values.length, concurrency: 20 };
    assert.ok(
      times[label].p95Ms < 1000,
      `${label} p95 ${times[label].p95Ms}ms exceeds target 1000ms`,
    );
  }
  const pending = (
    await db.query("SELECT id FROM requests WHERE request_code LIKE 'PERF-%' LIMIT 20")
  ).rows;
  const decisions = await Promise.all(
    pending.map(async (r, index) => {
      const start = performance.now();
      const response = await fetch(base + '/requests/' + r.id + '/decision', {
        method: 'POST',
        headers: {
          cookie: linhClients[index].cookie,
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ decision: 'APPROVED' }),
      });
      assert.equal(response.status, 201, await response.text());
      return performance.now() - start;
    }),
  );
  times.decision = { p95Ms: p95(decisions), samples: 20, concurrency: 20 };
  assert.ok(times.decision.p95Ms < 2000);
  const newRequests = await Promise.all(
    Array.from({ length: 20 }, async (_, index) => {
      const response = await fetch(base + '/requests', {
        method: 'POST',
        headers: {
          cookie: huyClients[index].cookie,
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          workflowId: w.id,
          formData: { amount: 150, reason: 'Load submit' },
        }),
      });
      assert.equal(response.status, 201);
      return response.json();
    }),
  );
  const submits = await Promise.all(
    newRequests.map(async (r, index) => {
      const start = performance.now();
      const response = await fetch(base + '/requests/' + r.id + '/submit', {
        method: 'POST',
        headers: {
          cookie: huyClients[index].cookie,
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: '{}',
      });
      assert.equal(response.status, 201, await response.text());
      return performance.now() - start;
    }),
  );
  times.submit = { p95Ms: p95(submits), samples: 20, concurrency: 20 };
  assert.ok(times.submit.p95Ms < 2000);
  console.log(
    'Load test passed: 1000 pending fixtures, 20 concurrent sessions per batch; ' +
      JSON.stringify(times),
  );
}
