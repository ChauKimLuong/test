import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function runOperationsTests(base, password, db) {
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
        cookie: user?.cookie || '',
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
  const cdo = await login('cdo@flowpilot.vn'),
    ceo = await login('ceo@flowpilot.vn'),
    linh = await login('linh@flowpilot.vn'),
    huy = await login('huy@flowpilot.vn'),
    hoang = await login('hoang@flowpilot.vn');
  check(cdo.actor.permissions.SLA_OPERATE.includes('ORGANIZATION'), true);
  await call(huy, 'operations/sla/run', 'POST', {}, 403);
  await call(huy, 'operations/metrics', 'GET', {}, 403);
  await call(huy, 'operations/delegations', 'GET', {}, 403);
  const form = await call(cdo, 'forms', 'POST', {
    code: 'WF-OPERATIONS',
    name: 'Vận hành quy trình',
    fields: [
      {
        key: 'purpose',
        label: 'Mục đích',
        type: 'TEXT',
        isRequired: true,
        fullWidth: true,
        options: [],
      },
    ],
  });
  const wid = (await call(cdo, 'forms')).find((f) => f.id === form.id).workflow_id;
  let w = await call(cdo, 'workflows/' + wid);
  async function publish(steps) {
    w = await call(cdo, 'workflows/' + wid + '/draft', 'PUT', {
      definition: { schemaVersion: 1, steps },
      expectedRevision: w.draft_revision,
    });
    w = await call(cdo, 'workflows/' + wid + '/publish', 'POST', {
      expectedRevision: w.draft_revision,
      changeNote: 'Test operations',
    });
    return w;
  }
  const step = (assignees = [linh], mode = 'ALL', sla) => ({
    id: 'approval',
    name: 'Xét hồ sơ',
    mode,
    assignees: assignees.map((a) => ({ type: 'ASSIGNMENT', assignmentId: a.actor.assignmentId })),
    ...(sla ? { sla } : {}),
  });
  await call(
    cdo,
    'workflows/' + wid + '/validate',
    'POST',
    {
      definition: {
        schemaVersion: 1,
        steps: [step([linh], 'ALL', { minutes: 0, remindBeforeMinutes: 0 })],
      },
    },
    400,
  );
  await call(
    cdo,
    'workflows/' + wid + '/validate',
    'POST',
    {
      definition: {
        schemaVersion: 1,
        steps: [step([linh], 'ALL', { minutes: 10, remindBeforeMinutes: 11 })],
      },
    },
    400,
  );
  await publish([
    step([linh], 'ALL', {
      minutes: 60,
      remindBeforeMinutes: 15,
      escalationAssignmentId: cdo.actor.assignmentId,
    }),
  ]);
  check(w.versions[0].definition.steps[0].sla.minutes, 60);
  async function draft() {
    return call(huy, 'requests', 'POST', {
      workflowId: wid,
      formData: { purpose: 'Kiểm thử vận hành' },
    });
  }
  const detail = (r) => call(huy, 'requests/' + r.id);
  const submit = (r) => call(huy, 'requests/' + r.id + '/submit', 'POST', {});
  const pending = (r, user) =>
    r.tasks.find(
      (t) => t.status === 'PENDING' && t.assignee_assignment_id === user.actor.assignmentId,
    );
  const decide = (user, r, decision = 'APPROVED') =>
    call(user, 'requests/' + r.id + '/decision', 'POST', {
      decision,
      comment: 'Nhận xét',
      taskId: pending(r, user)?.id,
    });
  // Collaboration: exact bytes, visibility, append-only comments, document versions pinned per round.
  let r = await draft();
  const text = Buffer.from('Báo giá phiên bản 1\n'),
    upload = {
      filename: 'bao-gia.txt',
      mimeType: 'text/plain',
      contentBase64: text.toString('base64'),
    };
  await call(hoang, 'requests/' + r.id + '/collaboration', 'GET', {}, 404);
  await call(hoang, 'requests/' + r.id + '/comments', 'POST', { body: 'Không được xem' }, 404);
  await call(cdo, 'requests/' + r.id + '/attachments', 'POST', upload, 403);
  await call(
    huy,
    'requests/' + r.id + '/attachments',
    'POST',
    { ...upload, filename: '../test.txt' },
    400,
  );
  await call(
    huy,
    'requests/' + r.id + '/attachments',
    'POST',
    { ...upload, mimeType: 'application/pdf' },
    400,
  );
  await call(
    huy,
    'requests/' + r.id + '/attachments',
    'POST',
    { ...upload, filename: 'fake.pdf', mimeType: 'application/pdf' },
    400,
  );
  await call(
    huy,
    'requests/' + r.id + '/attachments',
    'POST',
    { ...upload, contentBase64: '####' },
    400,
  );
  await call(
    huy,
    'requests/' + r.id + '/attachments',
    'POST',
    { ...upload, contentBase64: Buffer.from([255, 255]).toString('base64') },
    400,
  );
  const at1 = await call(huy, 'requests/' + r.id + '/attachments', 'POST', {
    ...upload,
    expectedRevision: r.revision,
  });
  await call(
    huy,
    'requests/' + r.id + '/attachments',
    'POST',
    { ...upload, expectedRevision: r.revision },
    409,
  );
  let download = await fetch(base + '/requests/' + r.id + '/attachments/' + at1.id, {
    headers: { cookie: huy.cookie },
  });
  check(download.status, 200);
  check(Buffer.from(await download.arrayBuffer()), text);
  check(download.headers.get('content-disposition').startsWith('attachment;'), true);
  download = await fetch(base + '/requests/' + r.id + '/attachments/' + at1.id, {
    headers: { cookie: hoang.cookie },
  });
  check(download.status, 404);
  await call(huy, 'requests/' + r.id + '/comments', 'POST', { body: 'Thông tin bổ sung' });
  let collab = await call(huy, 'requests/' + r.id + '/collaboration');
  check(collab.comments.at(-1).body, 'Thông tin bổ sung');
  r = await submit(r);
  check(r.tasks[0].due_at != null, true);
  check(Math.round((new Date(r.tasks[0].due_at) - new Date(r.tasks[0].remind_at)) / 60000), 15);
  await call(huy, 'requests/' + r.id + '/attachments', 'POST', upload, 403);
  await call(linh, 'requests/' + r.id + '/comments', 'POST', { body: 'Cần sửa báo giá' });
  r = await decide(linh, r, 'RETURNED');
  const text2 = Buffer.from('Báo giá phiên bản 2');
  const at2 = await call(huy, 'requests/' + r.id + '/attachments', 'POST', {
    ...upload,
    contentBase64: text2.toString('base64'),
    replacesAttachmentId: at1.id,
  });
  check(at2.version, 2);
  r = await submit(r);
  collab = await call(linh, 'requests/' + r.id + '/collaboration');
  check(collab.attachments.find((a) => a.id === at1.id).rounds, [1]);
  check(collab.attachments.find((a) => a.id === at2.id).rounds, [2]);
  await assert.rejects(
    db.query('UPDATE request_comments SET body=$1 WHERE request_id=$2', ['ghi đè', r.id]),
  );
  checks++;
  await assert.rejects(db.query('DELETE FROM request_attachments WHERE id=$1', [at1.id]));
  checks++;
  await assert.rejects(
    db.query('DELETE FROM submission_attachments WHERE attachment_id=$1', [at1.id]),
  );
  checks++;
  await call(huy, 'requests/' + r.id + '/attachments/' + at2.id + '/archive', 'POST', {}, 403);
  r = await decide(linh, r);
  check(r.status, 'APPROVED');
  await call(huy, 'requests/' + r.id + '/comments', 'POST', { body: 'Đã nhận kết quả' });
  let archived = await draft();
  const archiveFile = await call(huy, 'requests/' + archived.id + '/attachments', 'POST', upload);
  await call(
    huy,
    'requests/' + archived.id + '/attachments/' + archiveFile.id + '/archive',
    'POST',
    {},
  );
  archived = await submit(archived);
  check((await call(huy, 'requests/' + archived.id + '/collaboration')).attachments[0].rounds, []);
  await call(huy, 'requests/' + archived.id + '/cancel', 'POST');
  // Transfers preserve deadlines, old owner loses decision rights, ALL counts replacement seats only.
  let transfer = await submit(await draft());
  const original = pending(transfer, linh);
  await call(huy, 'requests/' + transfer.id + '/transfer-candidates', 'GET', {}, 403);
  await call(
    hoang,
    'requests/' + transfer.id + '/transfer',
    'POST',
    { taskId: original.id, targetAssignmentId: cdo.actor.assignmentId, reason: 'Không hợp lệ' },
    404,
  );
  await call(
    linh,
    'requests/' + transfer.id + '/transfer',
    'POST',
    { taskId: original.id, targetAssignmentId: huy.actor.assignmentId, reason: 'Tự duyệt' },
    403,
  );
  await call(
    linh,
    'requests/' + transfer.id + '/transfer',
    'POST',
    { taskId: original.id, targetAssignmentId: hoang.actor.assignmentId, reason: 'Sai phạm vi' },
    403,
  );
  const moved = await call(linh, 'requests/' + transfer.id + '/transfer', 'POST', {
    taskId: original.id,
    targetAssignmentId: cdo.actor.assignmentId,
    reason: 'Nhờ CDO xử lý',
    expectedRevision: transfer.revision,
  });
  check(moved.due_at, original.due_at);
  transfer = await detail(transfer);
  check(transfer.tasks.find((t) => t.id === original.id).status, 'CANCELLED');
  await call(
    linh,
    'requests/' + transfer.id + '/decision',
    'POST',
    { decision: 'APPROVED', taskId: original.id },
    403,
  );
  transfer = await decide(cdo, transfer);
  check(transfer.status, 'APPROVED');
  collab = await call(huy, 'requests/' + transfer.id + '/collaboration');
  check(collab.transfers[0].kind, 'MANUAL');
  await publish([step([linh, ceo], 'ALL')]);
  let parallel = await submit(await draft());
  await call(
    linh,
    'requests/' + parallel.id + '/transfer',
    'POST',
    {
      taskId: pending(parallel, linh).id,
      targetAssignmentId: ceo.actor.assignmentId,
      reason: 'Trùng người',
    },
    409,
  );
  await call(linh, 'requests/' + parallel.id + '/transfer', 'POST', {
    taskId: pending(parallel, linh).id,
    targetAssignmentId: cdo.actor.assignmentId,
    reason: 'Bổ sung người thay thế',
  });
  parallel = await detail(parallel);
  parallel = await decide(cdo, parallel);
  check(parallel.status, 'PENDING');
  parallel = await decide(ceo, parallel);
  check(parallel.status, 'APPROVED');
  // Future, overlapping, active, revoked and expired delegations; no self or transitive delegation.
  const now = Date.now(),
    window = {
      startsAt: new Date(now - 1000).toISOString(),
      endsAt: new Date(now + 3600000).toISOString(),
      reason: 'Nghỉ phép',
    };
  await call(
    linh,
    'operations/delegations',
    'POST',
    { ...window, delegateAssignmentId: linh.actor.assignmentId },
    400,
  );
  await call(
    linh,
    'operations/delegations',
    'POST',
    { ...window, delegateAssignmentId: huy.actor.assignmentId },
    400,
  );
  await call(
    linh,
    'operations/delegations',
    'POST',
    {
      ...window,
      endsAt: new Date(now - 1000).toISOString(),
      delegateAssignmentId: cdo.actor.assignmentId,
    },
    400,
  );
  await publish([step()]);
  let existing = await submit(await draft());
  const delegation = await call(linh, 'operations/delegations', 'POST', {
    ...window,
    delegateAssignmentId: cdo.actor.assignmentId,
  });
  const simulation = await call(cdo, 'workflows/' + wid + '/simulate', 'POST', {
    requesterAssignmentId: huy.actor.assignmentId,
    formData: { purpose: 'Mô phỏng' },
  });
  check(simulation.steps[0].assignees[0].assignmentId, cdo.actor.assignmentId);
  check(simulation.steps[0].assignees[0].delegatedFrom, linh.actor.fullName);
  existing = await detail(existing);
  check(!!pending(existing, cdo), true);
  check(!!pending(existing, linh), false);
  await call(
    linh,
    'operations/delegations',
    'POST',
    { ...window, delegateAssignmentId: ceo.actor.assignmentId },
    409,
  );
  await call(ceo, 'operations/delegations/' + delegation.id + '/revoke', 'POST', {}, 404);
  let delegated = await submit(await draft());
  check(!!pending(delegated, cdo), true);
  await call(linh, 'operations/delegations/' + delegation.id + '/revoke', 'POST');
  delegated = await decide(cdo, delegated);
  check(delegated.status, 'APPROVED');
  existing = await decide(cdo, existing);
  check(existing.status, 'APPROVED');
  let normal = await submit(await draft());
  check(!!pending(normal, linh), true);
  await call(huy, 'requests/' + normal.id + '/cancel', 'POST');
  const future = await call(linh, 'operations/delegations', 'POST', {
    ...window,
    startsAt: new Date(now + 3600000).toISOString(),
    endsAt: new Date(now + 7200000).toISOString(),
    delegateAssignmentId: cdo.actor.assignmentId,
  });
  normal = await submit(await draft());
  check(!!pending(normal, linh), true);
  await call(huy, 'requests/' + normal.id + '/cancel', 'POST');
  await call(linh, 'operations/delegations/' + future.id + '/revoke', 'POST');
  const wrongScope = await call(linh, 'operations/delegations', 'POST', {
    ...window,
    delegateAssignmentId: hoang.actor.assignmentId,
  });
  normal = await submit(await draft());
  check(!!pending(normal, linh), true);
  check(
    normal.logs.some((l) => l.event_type === 'DELEGATION_SKIPPED'),
    true,
  );
  await call(linh, 'operations/delegations/' + wrongScope.id + '/revoke', 'POST');
  normal = await decide(linh, normal);
  // SLA idempotency and escalation, fallback when target is invalid, finalized tasks ignored.
  await publish([
    step([linh], 'ALL', {
      minutes: 60,
      remindBeforeMinutes: 15,
      escalationAssignmentId: cdo.actor.assignmentId,
    }),
  ]);
  let sla = await submit(await draft());
  const timed = pending(sla, linh);
  await db.query("UPDATE approval_tasks SET remind_at=now()-interval '1 minute' WHERE id=$1", [
    timed.id,
  ]);
  await call(cdo, 'operations/sla/run', 'POST');
  await call(cdo, 'operations/sla/run', 'POST');
  check(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM sla_events WHERE task_id=$1 AND event='REMINDER'",
        [timed.id],
      )
    ).rows[0].n,
    1,
  );
  await db.query("UPDATE approval_tasks SET due_at=now()-interval '1 minute' WHERE id=$1", [
    timed.id,
  ]);
  await call(cdo, 'operations/sla/run', 'POST');
  sla = await detail(sla);
  check(sla.status, 'PENDING');
  check(!!pending(sla, cdo), true);
  check((await call(huy, 'requests/' + sla.id + '/collaboration')).transfers[0].kind, 'ESCALATION');
  await call(cdo, 'operations/sla/run', 'POST');
  check(
    (
      await db.query('SELECT count(*)::int AS n FROM task_transfers WHERE from_task_id=$1', [
        timed.id,
      ])
    ).rows[0].n,
    1,
  );
  sla = await decide(cdo, sla);
  check(sla.status, 'APPROVED');
  await call(cdo, 'operations/sla/run', 'POST');
  await publish([
    step([linh], 'ALL', {
      minutes: 60,
      remindBeforeMinutes: 0,
      escalationAssignmentId: huy.actor.assignmentId,
    }),
  ]);
  let failed = await submit(await draft());
  await db.query("UPDATE approval_tasks SET due_at=now()-interval '1 minute' WHERE id=$1", [
    pending(failed, linh).id,
  ]);
  await call(cdo, 'operations/sla/run', 'POST');
  failed = await detail(failed);
  check(!!pending(failed, linh), true);
  check(failed.status, 'PENDING');
  check(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM sla_events WHERE task_id=$1 AND event='ESCALATION_FAILED'",
        [pending(failed, linh).id],
      )
    ).rows[0].n,
    1,
  );
  failed = await decide(linh, failed);
  await publish([step([linh], 'ANY')]);
  let any = await submit(await draft());
  await call(linh, 'requests/' + any.id + '/transfer', 'POST', {
    taskId: pending(any, linh).id,
    targetAssignmentId: cdo.actor.assignmentId,
    reason: 'Thay người',
  });
  any = await detail(any);
  any = await decide(cdo, any, 'REJECTED');
  check(any.status, 'REJECTED');
  // Report aggregation is source-backed and scoped. An outsider must never receive another unit's rows.
  const report = await call(cdo, 'operations/metrics');
  check(report.summary.steps > 0, true);
  check(report.summary.breached > 0, true);
  check(
    report.bottlenecks.some((b) => b.name === 'Xét hồ sơ'),
    true,
  );
  check(report.summary.sla_on_time <= report.summary.sla_completed, true);
  const outsider = await call(hoang, 'operations/metrics');
  check(
    outsider.bottlenecks.some((b) => b.form_name === 'Vận hành quy trình'),
    false,
  );
  await call(cdo, 'operations/metrics?from=invalid', 'GET', {}, 400);
  await call(cdo, 'operations/metrics?from=2020-01-01&to=2026-01-01', 'GET', {}, 400);
  // Immutable decision survives a concurrent transfer: exactly one action can take effect.
  await publish([step()]);
  let race = await submit(await draft());
  const task = pending(race, linh);
  const responses = await Promise.all([
    fetch(base + '/requests/' + race.id + '/decision', {
      method: 'POST',
      headers: {
        cookie: linh.cookie,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ taskId: task.id, decision: 'APPROVED' }),
    }),
    fetch(base + '/requests/' + race.id + '/transfer', {
      method: 'POST',
      headers: {
        cookie: linh.cookie,
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        taskId: task.id,
        targetAssignmentId: cdo.actor.assignmentId,
        reason: 'Race',
      }),
    }),
  ]);
  check(responses.filter((r) => r.status === 201).length, 1);
  race = await detail(race);
  if (race.status === 'PENDING') race = await decide(cdo, race);
  check(race.status, 'APPROVED');
  console.log(
    checks +
      ' workflow operations checks passed: SLA, transfers, delegations, files, comments, snapshots, metrics, scopes and concurrency.',
  );
}
