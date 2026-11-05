import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { activeAssignments, eligible, assigneeSnapshot } from './workflow-rules';
import { audit, notify } from './events';

export async function delegationFor(c: PoolClient, owner: string) {
  return (
    await c.query(
      `SELECT * FROM approval_delegations WHERE owner_assignment_id=$1
    AND revoked_at IS NULL AND starts_at<=now() AND ends_at>now() ORDER BY starts_at DESC LIMIT 1`,
      [owner],
    )
  ).rows[0];
}
export async function transferTask(
  c: PoolClient,
  r: any,
  task: any,
  targetId: string,
  actor: string | null,
  kind: string,
  reason: string,
  delegationId: string | null = null,
) {
  if (r.status !== 'PENDING' || task.status !== 'PENDING')
    throw new ConflictException('Nhiệm vụ đã xử lý.');
  const active = await activeAssignments(c);
  const target = active.find((x) => x.id === targetId);
  const requester = (
    await c.query('SELECT * FROM employee_assignments WHERE id=$1', [r.requester_assignment_id])
  ).rows[0];
  if (!target || !(await eligible(c, target, requester)))
    throw new ForbiddenException(
      'Người nhận không đủ quyền trong phạm vi hồ sơ hoặc là người gửi.',
    );
  if (
    (
      await c.query('SELECT 1 FROM approval_tasks WHERE step_run_id=$1 AND assignee_user_id=$2', [
        task.step_run_id,
        target.user_id,
      ])
    ).rowCount
  )
    throw new ConflictException('Người nhận đã có nhiệm vụ trong bước này. Chọn người khác.');
  await c.query("UPDATE approval_tasks SET status='CANCELLED',decided_at=now() WHERE id=$1", [
    task.id,
  ]);
  const [replacement] = (
    await c.query(
      `INSERT INTO approval_tasks(step_run_id,assignee_assignment_id,assignee_user_id,assignee_snapshot,due_at,remind_at,escalation_assignment_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        task.step_run_id,
        target.id,
        target.user_id,
        JSON.stringify(assigneeSnapshot(target)),
        task.due_at,
        task.remind_at,
        kind === 'ESCALATION' ? null : task.escalation_assignment_id,
      ],
    )
  ).rows;
  await c.query(
    `INSERT INTO task_transfers(from_task_id,to_task_id,actor_assignment_id,delegation_id,kind,reason) VALUES($1,$2,$3,$4,$5,$6)`,
    [task.id, replacement.id, actor, delegationId, kind, reason],
  );
  await c.query(
    'UPDATE requests SET revision=revision+1,approver_assignment_id=CASE WHEN approver_assignment_id=$1 THEN $2 ELSE approver_assignment_id END WHERE id=$3',
    [task.assignee_assignment_id, target.id, r.id],
  );
  await audit(c, actor || task.assignee_assignment_id, 'TASK_TRANSFERRED', r.id, null, {
    fromTaskId: task.id,
    toTaskId: replacement.id,
    from: task.assignee_snapshot,
    to: assigneeSnapshot(target),
    kind,
    reason,
    delegationId,
  });
  for (const recipient of new Set([
    task.assignee_assignment_id,
    target.id,
    r.requester_assignment_id,
  ]))
    await notify(
      c,
      r.id,
      recipient,
      'TASK_TRANSFERRED',
      'Nhiệm vụ đã chuyển giao',
      `${r.request_code}: ${task.assignee_snapshot.name} → ${target.full_name}. ${reason}`,
    );
  return replacement;
}
export async function applyDelegation(c: PoolClient, r: any, task: any) {
  // One delegation per original task. No implicit delegation chains.
  if ((await c.query('SELECT 1 FROM task_transfers WHERE to_task_id=$1', [task.id])).rowCount)
    return false;
  const d = await delegationFor(c, task.assignee_assignment_id);
  if (!d) return false;
  // A savepoint makes a failed delegation keep the original independent approver.
  await c.query('SAVEPOINT delegation_attempt');
  try {
    await transferTask(c, r, task, d.delegate_assignment_id, null, 'DELEGATION', d.reason, d.id);
    await c.query('RELEASE SAVEPOINT delegation_attempt');
    return true;
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT delegation_attempt');
    await c.query('RELEASE SAVEPOINT delegation_attempt');
    if (
      !(
        await c.query(
          "SELECT 1 FROM audit_logs WHERE request_id=$1 AND event_type='DELEGATION_SKIPPED' AND details->>'taskId'=$2",
          [r.id, task.id],
        )
      ).rowCount
    ) {
      await audit(c, task.assignee_assignment_id, 'DELEGATION_SKIPPED', r.id, null, {
        taskId: task.id,
        delegationId: d.id,
        reason: (e as Error).message,
      });
      await notify(
        c,
        r.id,
        task.assignee_assignment_id,
        'DELEGATION_SKIPPED',
        'Ủy quyền chưa áp dụng',
        `${r.request_code}: ${(e as Error).message}`,
      );
    }
    return false;
  }
}
