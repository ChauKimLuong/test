import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function runWorkflowIntegration(base, password, db) {
  let checks = 0;
  const check = (actual, expected, message) => {
    assert.deepEqual(actual, expected, message);
    checks++;
  };
  async function call(
    user,
    path,
    method = 'GET',
    body = {},
    expected = method === 'POST' ? 201 : 200,
  ) {
    const response = await fetch(base + '/' + path, {
      method,
      headers: {
        ...(user ? { cookie: user.cookie } : {}),
        ...(method === 'GET'
          ? {}
          : { 'content-type': 'application/json', origin: 'http://localhost:3000' }),
      },
      body: method === 'GET' ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    check(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  }
  async function login(email) {
    const response = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password }),
    });
    check(response.status, 201);
    return { cookie: response.headers.get('set-cookie').split(';')[0], ...(await response.json()) };
  }
  const ceo = await login('ceo@flowpilot.vn'),
    cdo = await login('cdo@flowpilot.vn'),
    huy = await login('huy@flowpilot.vn'),
    linh = await login('linh@flowpilot.vn'),
    hoang = await login('hoang@flowpilot.vn');
  const directory = await call(cdo, 'workflows/directory');
  await call(huy, 'workflows/directory', 'GET', {}, 403);
  const fields = [
    {
      key: 'amount',
      label: 'Số tiền',
      type: 'NUMBER',
      isRequired: true,
      fullWidth: false,
      options: [],
    },
    { key: 'reason', label: 'Lý do', type: 'TEXT', isRequired: true, fullWidth: true, options: [] },
    {
      key: 'confirmed',
      label: 'Xác nhận',
      type: 'CHECKBOX',
      isRequired: false,
      fullWidth: false,
      options: [],
    },
    { key: 'date', label: 'Ngày', type: 'DATE', isRequired: false, fullWidth: false, options: [] },
  ];
  const form = await call(cdo, 'forms', 'POST', {
    code: 'WF-ADVANCED-TEST',
    name: 'Chi phí thử sáu chức năng',
    fields,
  });
  const template = (await call(cdo, 'forms')).find((f) => f.id === form.id),
    wid = template.workflow_id;
  let w = await call(cdo, 'workflows/' + wid);
  const manager = {
    id: 'manager',
    name: 'Quản lý trực tiếp',
    mode: 'ALL',
    assignees: [{ type: 'DIRECT_MANAGER' }],
  };
  const chiefs = {
    id: 'chiefs',
    name: 'Lãnh đạo đồng duyệt',
    mode: 'ALL',
    assignees: [
      { type: 'ASSIGNMENT', assignmentId: cdo.actor.assignmentId },
      { type: 'ASSIGNMENT', assignmentId: ceo.actor.assignmentId },
    ],
    when: { mode: 'ALL', conditions: [{ field: 'amount', operator: 'GTE', value: 100 }] },
  };
  const baseDefinition = { schemaVersion: 1, steps: [manager, chiefs] };
  async function publish(definition) {
    w = await call(cdo, 'workflows/' + wid + '/draft', 'PUT', {
      definition,
      expectedRevision: w.draft_revision,
    });
    w = await call(cdo, 'workflows/' + wid + '/publish', 'POST', {
      expectedRevision: w.draft_revision,
      changeNote: 'Kiểm thử ' + randomUUID(),
    });
    return w.versions[0];
  }
  async function create(amount = 150) {
    const r = await call(huy, 'requests', 'POST', {
      workflowId: wid,
      formData: { amount, reason: 'Mua thiết bị' },
    });
    return call(huy, 'requests/' + r.id + '/submit', 'POST', {});
  }
  const decide = (user, r, decision = 'APPROVED', comment = 'Đã kiểm tra') =>
    call(user, 'requests/' + r.id + '/decision', 'POST', {
      taskId: r.tasks.find(
        (t) => t.status === 'PENDING' && t.assignee_assignment_id === user.actor.assignmentId,
      )?.id,
      decision,
      comment,
    });
  const firstVersion = await publish(baseDefinition);
  const wrong = {
    ...baseDefinition,
    steps: [
      {
        ...manager,
        when: { mode: 'ALL', conditions: [{ field: 'amount', operator: 'GT', value: 0 }] },
      },
    ],
  };
  await call(
    cdo,
    'workflows/' + wid + '/draft',
    'PUT',
    { definition: wrong, expectedRevision: w.draft_revision },
    400,
  );
  await call(
    cdo,
    'workflows/' + wid + '/draft',
    'PUT',
    { definition: baseDefinition, expectedRevision: w.draft_revision - 1 },
    409,
  );
  await call(
    huy,
    'workflows/' + wid + '/draft',
    'PUT',
    { definition: baseDefinition, expectedRevision: w.draft_revision },
    403,
  );
  await call(
    linh,
    'workflows/' + wid + '/publish',
    'POST',
    { expectedRevision: w.draft_revision, changeNote: 'Không đủ quyền' },
    403,
  );
  await assert.rejects(
    db.query("UPDATE workflow_versions SET definition='{}' WHERE id=$1", [firstVersion.id]),
  );
  checks++;
  // Condition boundaries, strict data types, no writes in simulation.
  const before = (await db.query('SELECT count(*)::int AS n FROM requests')).rows[0].n;
  for (const amount of [99, 100, 101]) {
    const sim = await call(cdo, 'workflows/' + wid + '/simulate', 'POST', {
      requesterAssignmentId: huy.actor.assignmentId,
      formData: { amount, reason: 'Test' },
    });
    check(sim.steps[1].condition.matched, amount >= 100);
    check(sim.steps[0].assignees[0].assignmentId, linh.actor.assignmentId);
  }
  check((await db.query('SELECT count(*)::int AS n FROM requests')).rows[0].n, before);
  await call(
    cdo,
    'workflows/' + wid + '/simulate',
    'POST',
    { requesterAssignmentId: huy.actor.assignmentId, formData: { amount: '100' } },
    400,
  );
  const low = await create(99);
  const doneLow = await decide(linh, low);
  check(doneLow.status, 'APPROVED');
  check(doneLow.steps.find((s) => s.step_id === 'chiefs').status, 'SKIPPED');
  // ALL and participant visibility/inbox, no late or foreign approval.
  let high = await create();
  check(high.tasks.filter((t) => t.status === 'PENDING').length, 1);
  await call(ceo, 'requests/' + high.id + '/decision', 'POST', { decision: 'APPROVED' }, 403);
  await call(hoang, 'requests/' + high.id, 'GET', {}, 404);
  high = await decide(linh, high);
  check(high.status, 'PENDING');
  check(high.tasks.filter((t) => t.status === 'PENDING').length, 2);
  check(
    (await call(cdo, 'requests?view=inbox')).items.some((r) => r.id === high.id),
    true,
  );
  await call(ceo, 'people/' + cdo.actor.userId + '/status', 'PATCH', { status: 'LOCKED' }, 409);
  high = await decide(cdo, high);
  check(high.status, 'PENDING');
  await call(cdo, 'people/' + ceo.actor.userId + '/status', 'PATCH', { status: 'LOCKED' }, 403);
  high = await decide(ceo, high);
  check(high.status, 'APPROVED');
  check((await call(linh, 'requests/' + high.id)).tasks.length, 3);
  let rejected = await create();
  rejected = await decide(linh, rejected);
  rejected = await decide(cdo, rejected, 'REJECTED', 'Chi phí chưa phù hợp');
  check(rejected.status, 'REJECTED');
  check(rejected.tasks.filter((t) => t.status === 'CANCELLED').length, 1);
  // Version pinned before a new publication. Draft saving alone does not change active version.
  let old = await create();
  const pinned = old.instance.workflow_version_id;
  const anyDefinition = { schemaVersion: 1, steps: [manager, { ...chiefs, mode: 'ANY' }] };
  w = await call(cdo, 'workflows/' + wid + '/draft', 'PUT', {
    definition: anyDefinition,
    expectedRevision: w.draft_revision,
  });
  check(w.published_version_id, pinned);
  w = await call(cdo, 'workflows/' + wid + '/publish', 'POST', {
    expectedRevision: w.draft_revision,
    changeNote: 'ANY',
  });
  old = await decide(linh, old);
  check(old.steps.at(-1).mode, 'ALL');
  let any = await create();
  check(any.instance.workflow_version_id, w.published_version_id);
  any = await decide(linh, any);
  any = await decide(cdo, any, 'REJECTED', 'Chờ ý kiến khác');
  check(any.status, 'PENDING');
  any = await decide(ceo, any);
  check(any.status, 'APPROVED');
  let allReject = await create();
  allReject = await decide(linh, allReject);
  allReject = await decide(cdo, allReject, 'REJECTED', 'Không phù hợp');
  allReject = await decide(ceo, allReject, 'REJECTED', 'Không phù hợp');
  check(allReject.status, 'REJECTED');
  let concurrent = await create();
  concurrent = await decide(linh, concurrent);
  await Promise.all([
    decide(cdo, concurrent),
    decide(ceo, concurrent).catch((e) => {
      assert.match(e.message, /403/);
    }),
  ]);
  concurrent = await call(huy, 'requests/' + concurrent.id);
  check(concurrent.status, 'APPROVED');
  check(
    concurrent.tasks.filter((t) => t.status === 'APPROVED' && t.step_name === 'Lãnh đạo đồng duyệt')
      .length,
    1,
  );
  check(concurrent.tasks.filter((t) => t.status === 'CANCELLED').length, 1);
  // Return/resubmit retains code/version and reruns every step with new data.
  let returned = await create(50);
  const originalCode = returned.request_code,
    originalVersion = returned.instance.workflow_version_id;
  await call(
    linh,
    'requests/' + returned.id + '/decision',
    'POST',
    { decision: 'RETURNED', comment: '' },
    400,
  );
  returned = await decide(linh, returned, 'RETURNED', 'Bổ sung dự toán thiết bị');
  check(returned.status, 'RETURNED');
  await call(
    cdo,
    'requests/' + returned.id,
    'PUT',
    { formData: { amount: 150, reason: 'Dự toán mới' } },
    403,
  );
  returned = await call(huy, 'requests/' + returned.id, 'PUT', {
    formData: { amount: 150, reason: 'Dự toán mới' },
    expectedRevision: returned.revision,
  });
  await call(
    huy,
    'requests/' + returned.id,
    'PUT',
    { formData: { amount: 160, reason: 'Ghi đè' }, expectedRevision: returned.revision - 1 },
    409,
  );
  await publish(baseDefinition);
  const submitBody = { expectedRevision: returned.revision, idempotencyKey: randomUUID() };
  returned = await call(huy, 'requests/' + returned.id + '/submit', 'POST', submitBody);
  await call(huy, 'requests/' + returned.id + '/submit', 'POST', submitBody);
  check(returned.request_code, originalCode);
  check(returned.instance.workflow_version_id, originalVersion);
  check(returned.instance.current_round, 2);
  check(
    returned.submissions.map((s) => s.form_data_snapshot.amount),
    [50, 150],
  );
  returned = await decide(linh, returned);
  check(returned.steps.filter((s) => s.round === 2).at(-1).mode, 'ANY');
  check(returned.tasks.filter((t) => t.round === 2 && t.status === 'PENDING').length, 2);
  await assert.rejects(
    db.query("UPDATE request_submissions SET form_data_snapshot='{}' WHERE request_id=$1", [
      returned.id,
    ]),
  );
  checks++;
  await assert.rejects(
    db.query('UPDATE workflow_instances SET workflow_version_id=$1 WHERE request_id=$2', [
      w.published_version_id,
      returned.id,
    ]),
  );
  checks++;
  returned = await call(huy, 'requests/' + returned.id + '/cancel', 'POST');
  check(returned.status, 'CANCELLED');
  check(
    returned.tasks.some((t) => t.status === 'PENDING'),
    false,
  );
  // Resolver selectors: manager level, position, unit head and role.
  const chiefPosition = directory.positions.find(
    (p) => p.id === directory.assignments.find((a) => a.id === cdo.actor.assignmentId).position_id,
  );
  const approverRole = directory.roles.find((r) => r.name.includes('duyệt'));
  for (const selector of [
    { type: 'MANAGER_LEVEL', level: 2 },
    { type: 'POSITION', positionId: chiefPosition.id },
    { type: 'UNIT_HEAD' },
    { type: 'ASSIGNMENT', assignmentId: linh.actor.assignmentId },
  ]) {
    const def = { schemaVersion: 1, steps: [{ ...manager, assignees: [selector] }] };
    const sim = await call(cdo, 'workflows/' + wid + '/simulate', 'POST', {
      definition: def,
      requesterAssignmentId: huy.actor.assignmentId,
      formData: { amount: 50 },
    });
    check(sim.valid, true);
  }
  const roleId = (await db.query("SELECT id FROM system_roles WHERE code='APPROVER'")).rows[0].id;
  const roleSim = await call(cdo, 'workflows/' + wid + '/simulate', 'POST', {
    definition: {
      schemaVersion: 1,
      steps: [{ ...manager, assignees: [{ type: 'ROLE', roleId }] }],
    },
    requesterAssignmentId: huy.actor.assignmentId,
    formData: { amount: 50 },
  });
  check(roleSim.valid, true);
  check(
    roleSim.steps[0].assignees.some((a) => a.assignmentId === hoang.actor.assignmentId),
    false,
  );
  const self = {
    schemaVersion: 1,
    steps: [
      { ...manager, assignees: [{ type: 'ASSIGNMENT', assignmentId: huy.actor.assignmentId }] },
    ],
  };
  const selfSim = await call(cdo, 'workflows/' + wid + '/simulate', 'POST', {
    definition: self,
    requesterAssignmentId: huy.actor.assignmentId,
    formData: { amount: 50 },
  });
  check(selfSim.valid, false);
  await publish(self);
  const invalid = await call(huy, 'requests', 'POST', {
    workflowId: wid,
    formData: { amount: 50, reason: 'Không tự duyệt' },
  });
  await call(huy, 'requests/' + invalid.id + '/submit', 'POST', {}, 409);
  check((await call(huy, 'requests/' + invalid.id)).status, 'DRAFT');
  check(
    (
      await db.query('SELECT count(*)::int AS n FROM workflow_instances WHERE request_id=$1', [
        invalid.id,
      ])
    ).rows[0].n,
    0,
  );
  // 3 sequential steps and blocked/retry without silently approving.
  const sequential = {
    schemaVersion: 1,
    steps: [
      manager,
      {
        id: 'cdo',
        name: 'CDO',
        mode: 'ALL',
        assignees: [{ type: 'ASSIGNMENT', assignmentId: cdo.actor.assignmentId }],
      },
      {
        id: 'ceo',
        name: 'CEO',
        mode: 'ALL',
        assignees: [{ type: 'ASSIGNMENT', assignmentId: ceo.actor.assignmentId }],
      },
    ],
  };
  await publish(sequential);
  let seq = await create();
  seq = await decide(linh, seq);
  check(seq.status, 'PENDING');
  seq = await decide(cdo, seq);
  check(seq.status, 'PENDING');
  seq = await decide(ceo, seq);
  check(seq.status, 'APPROVED');
  check(
    seq.steps.map((s) => s.status),
    ['APPROVED', 'APPROVED', 'APPROVED'],
  );
  let blocked = await create();
  blocked = await decide(linh, blocked);
  const roles = (
    await db.query(
      'SELECT id FROM role_assignments WHERE employee_assignment_id=$1 AND revoked_at IS NULL',
      [ceo.actor.assignmentId],
    )
  ).rows;
  await db.query('UPDATE role_assignments SET revoked_at=now() WHERE id=ANY($1::uuid[])', [
    roles.map((r) => r.id),
  ]);
  blocked = await decide(cdo, blocked);
  check(blocked.status, 'PENDING');
  check(blocked.instance.status, 'BLOCKED');
  await call(huy, 'requests/' + blocked.id + '/retry', 'POST', {}, 403);
  await db.query('UPDATE role_assignments SET revoked_at=NULL WHERE id=ANY($1::uuid[])', [
    roles.map((r) => r.id),
  ]);
  blocked = await call(cdo, 'requests/' + blocked.id + '/retry', 'POST');
  check(blocked.instance.status, 'RUNNING');
  blocked = await decide(ceo, blocked);
  check(blocked.status, 'APPROVED');
  w = await call(cdo, 'workflows/' + wid + '/restore', 'POST', {
    sourceVersionId: firstVersion.id,
    expectedRevision: w.draft_revision,
  });
  check(w.draft_definition, baseDefinition);
  await call(
    cdo,
    'workflows/' + wid + '/restore',
    'POST',
    { sourceVersionId: randomUUID(), expectedRevision: w.draft_revision },
    404,
  );
  console.log(
    checks +
      ' advanced workflow checks passed: sequential, conditions, ALL/ANY, resolver, versions, supplementation, concurrency, rollback, retry and permissions.',
  );
}
