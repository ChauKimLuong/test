import {
  Injectable,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { Actor, uuid, str } from './security';
import { audit, notify } from './events';
import {
  validateDefinition,
  evaluate,
  resolve,
  activeAssignments,
  eligible,
  assigneeSnapshot,
} from './workflow-rules';
import { ensureVersion, revision } from './workflows';
import { applyDelegation } from './task-operations';
@Injectable()
export class WorkflowEngine {
  async receipt(c: PoolClient, a: Actor, r: any, action: string, b: any) {
    if (!b.idempotencyKey) return false;
    const key = str(b.idempotencyKey, 'Idempotency key', 100),
      hash = createHash('sha256').update(JSON.stringify(b)).digest('hex');
    const [old] = (
      await c.query(
        'SELECT * FROM mutation_receipts WHERE actor_assignment_id=$1 AND request_id=$2 AND action=$3 AND key=$4',
        [a.assignmentId, r.id, action, key],
      )
    ).rows;
    if (old) {
      if (old.payload_hash !== hash)
        throw new ConflictException('Idempotency key đã dùng với nội dung khác.');
      return true;
    }
    await c.query(
      'INSERT INTO mutation_receipts(actor_assignment_id,request_id,action,key,payload_hash) VALUES($1,$2,$3,$4,$5)',
      [a.assignmentId, r.id, action, key, hash],
    );
    return false;
  }
  async submit(c: PoolClient, a: Actor, r: any, b: any = {}) {
    if (await this.receipt(c, a, r, 'submit', b)) return;
    revision(r.revision, b.expectedRevision);
    if (!['DRAFT', 'RETURNED'].includes(r.status))
      throw new ConflictException('Đơn đã gửi hoặc kết thúc.');
    const [w] = (
      await c.query(
        'SELECT w.*,f.status AS form_status FROM workflows w JOIN form_templates f ON f.id=w.form_template_id WHERE w.id=$1 FOR UPDATE OF w',
        [r.workflow_id],
      )
    ).rows;
    let [instance] = (await c.query('SELECT * FROM workflow_instances WHERE request_id=$1', [r.id]))
      .rows;
    let version: any;
    if (instance)
      version = (
        await c.query('SELECT * FROM workflow_versions WHERE id=$1', [instance.workflow_version_id])
      ).rows[0];
    else {
      if (w.status !== 'ACTIVE' || w.form_status !== 'ACTIVE')
        throw new ConflictException('Mẫu hoặc quy trình đã ngừng hoạt động.');
      version = await ensureVersion(c, w, a.assignmentId);
      if (version.template_version !== r.template_snapshot.version)
        throw new ConflictException({
          code: 'TEMPLATE_VERSION_MISMATCH',
          message:
            'Mẫu và quy trình khác phiên bản. Ban hành lại quy trình cho mẫu hiện tại; nếu đơn nháp giữ mẫu cũ, hãy tạo đơn mới.',
        });
    }
    const definition = validateDefinition(version.definition, r.template_snapshot.fields);
    const requester = (await activeAssignments(c)).find((x) => x.id === r.requester_assignment_id);
    if (!requester) throw new ConflictException('Phân công người gửi không hoạt động.');
    for (const s of definition.steps)
      if (evaluate(s, r.form_data).matched) await resolve(c, s, requester);
    const round = instance ? instance.current_round + 1 : 1;
    if (!instance)
      instance = (
        await c.query(
          "INSERT INTO workflow_instances(request_id,workflow_version_id,status) VALUES($1,$2,'RUNNING') RETURNING *",
          [r.id, version.id],
        )
      ).rows[0];
    else {
      await c.query(
        "UPDATE workflow_instances SET status='RUNNING',current_round=$1,current_step=0,blocked_reason=NULL,completed_at=NULL WHERE id=$2",
        [round, instance.id],
      );
      instance = { ...instance, current_round: round, status: 'RUNNING', current_step: 0 };
    }
    await c.query(
      'INSERT INTO request_submissions(request_id,round,form_data_snapshot,requester_snapshot,submitted_by_assignment_id) VALUES($1,$2,$3,$4,$5)',
      [
        r.id,
        round,
        JSON.stringify(r.form_data),
        JSON.stringify({
          ...assigneeSnapshot(requester),
          unitId: requester.organizational_unit_id,
        }),
        a.assignmentId,
      ],
    );
    let code = r.request_code;
    await c.query(
      `INSERT INTO submission_attachments(submission_id,attachment_id)
      SELECT rs.id,at.id FROM request_submissions rs JOIN request_attachments at ON at.request_id=rs.request_id
      WHERE rs.request_id=$1 AND rs.round=$2 AND at.archived_at IS NULL AND NOT EXISTS
      (SELECT 1 FROM request_attachments newer WHERE newer.request_id=at.request_id AND newer.document_id=at.document_id AND newer.version>at.version)`,
      [r.id, round],
    );
    if (!code) {
      const [seq] = (
        await c.query("SELECT nextval('request_code_seq')::text AS n,to_char(now(),'YYYY') AS y")
      ).rows;
      code = `REQ-${seq.y}-${seq.n.padStart(5, '0')}`;
    }
    await c.query(
      "UPDATE requests SET status='PENDING',request_code=$1,submitted_at=COALESCE(submitted_at,now()),last_submitted_at=now(),decision_comment=NULL,revision=revision+1 WHERE id=$2",
      [code, r.id],
    );
    r = { ...r, request_code: code, status: 'PENDING' };
    await audit(
      c,
      a.assignmentId,
      round === 1 ? 'REQUEST_SUBMITTED' : 'REQUEST_RESUBMITTED',
      r.id,
      null,
      { round, workflowVersion: version.version },
    );
    await this.advance(c, a, r, instance, definition, 0, requester);
  }
  private async advance(
    c: PoolClient,
    a: Actor,
    r: any,
    i: any,
    d: any,
    start: number,
    requester: any,
  ) {
    for (let index = start; index < d.steps.length; index++) {
      const s = d.steps[index],
        condition = evaluate(s, r.form_data);
      if (!condition.matched) {
        await c.query(
          "INSERT INTO workflow_step_runs(instance_id,round,step_id,step_index,name,mode,condition_result,status,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,'SKIPPED',now())",
          [i.id, i.current_round, s.id, index, s.name, s.mode, JSON.stringify(condition)],
        );
        await audit(c, a.assignmentId, 'WORKFLOW_STEP_SKIPPED', r.id, null, {
          round: i.current_round,
          step: s.name,
          condition,
        });
        continue;
      }
      let assignees: any[];
      try {
        assignees = await resolve(c, s, requester);
      } catch (e) {
        const reason = (e as Error).message;
        await c.query(
          "UPDATE workflow_instances SET status='BLOCKED',current_step=$1,blocked_reason=$2 WHERE id=$3",
          [index, reason, i.id],
        );
        await c.query('UPDATE requests SET approver_assignment_id=NULL WHERE id=$1', [r.id]);
        await audit(c, a.assignmentId, 'WORKFLOW_BLOCKED', r.id, null, {
          round: i.current_round,
          step: s.name,
          reason,
        });
        await notify(
          c,
          r.id,
          r.requester_assignment_id,
          'WORKFLOW_BLOCKED',
          'Quy trình cần kiểm tra',
          reason,
        );
        const operators = (
          await c.query(
            `SELECT DISTINCT ra.employee_assignment_id FROM role_assignments ra JOIN system_roles sr ON sr.id=ra.system_role_id AND sr.is_active JOIN role_permissions rp ON rp.system_role_id=sr.id JOIN permissions p ON p.id=rp.permission_id WHERE p.code='WORKFLOW_OPERATE' AND ra.scope_type='ORGANIZATION' AND ra.revoked_at IS NULL AND ra.valid_from<=now() AND (ra.valid_until IS NULL OR ra.valid_until>now())`,
          )
        ).rows;
        for (const op of operators)
          if (op.employee_assignment_id !== r.requester_assignment_id)
            await notify(
              c,
              r.id,
              op.employee_assignment_id,
              'WORKFLOW_BLOCKED',
              'Quy trình bị chặn',
              reason,
            );
        return;
      }
      const [run] = (
        await c.query(
          "INSERT INTO workflow_step_runs(instance_id,round,step_id,step_index,name,mode,condition_result,status) VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE') RETURNING *",
          [i.id, i.current_round, s.id, index, s.name, s.mode, JSON.stringify(condition)],
        )
      ).rows;
      for (const who of assignees) {
        const [task] = (
          await c.query(
            `INSERT INTO approval_tasks(step_run_id,assignee_assignment_id,assignee_user_id,assignee_snapshot,due_at,remind_at,escalation_assignment_id)
           VALUES($1,$2,$3,$4,CASE WHEN $5::int IS NULL THEN NULL ELSE now()+make_interval(mins=>$5) END,
           CASE WHEN $5::int IS NULL THEN NULL ELSE now()+make_interval(mins=>$5-$6) END,$7) RETURNING *`,
            [
              run.id,
              who.id,
              who.user_id,
              JSON.stringify(assigneeSnapshot(who)),
              s.sla?.minutes ?? null,
              s.sla?.remindBeforeMinutes ?? 0,
              s.sla?.escalationAssignmentId ?? null,
            ],
          )
        ).rows;
        await notify(
          c,
          r.id,
          who.id,
          'APPROVAL_REQUIRED',
          'Nhiệm vụ cần phê duyệt',
          `${r.request_code} · ${s.name} · vòng ${i.current_round}`,
        );
      }
      await c.query(
        "UPDATE workflow_instances SET status='RUNNING',current_step=$1,blocked_reason=NULL WHERE id=$2",
        [index, i.id],
      );
      await c.query('UPDATE requests SET approver_assignment_id=$1 WHERE id=$2', [
        assignees[0].id,
        r.id,
      ]);
      await audit(c, a.assignmentId, 'WORKFLOW_STEP_STARTED', r.id, null, {
        round: i.current_round,
        step: s.name,
        mode: s.mode,
        assignees: assignees.map(assigneeSnapshot),
      });
      // Create every original sibling before delegating, so a parallel participant cannot occupy two seats.
      const tasks = (
        await c.query('SELECT * FROM approval_tasks WHERE step_run_id=$1 ORDER BY id', [run.id])
      ).rows;
      for (const task of tasks) await applyDelegation(c, r, task);
      return;
    }
    await this.finish(c, a, r, i, 'APPROVED', null);
  }
  private async finish(
    c: PoolClient,
    a: Actor,
    r: any,
    i: any,
    status: string,
    comment: string | null,
  ) {
    await c.query(
      'UPDATE workflow_instances SET status=$1,completed_at=now(),blocked_reason=NULL WHERE id=$2',
      [status, i.id],
    );
    await c.query(
      "UPDATE requests SET status=$1,decision_comment=$2,decided_at=CASE WHEN $1 IN ('APPROVED','REJECTED') THEN now() ELSE NULL END,revision=revision+1 WHERE id=$3",
      [status, comment, r.id],
    );
    await audit(c, a.assignmentId, 'REQUEST_' + status, r.id, null, {
      comment,
      round: i.current_round,
    });
    await notify(
      c,
      r.id,
      r.requester_assignment_id,
      'REQUEST_' + status,
      status === 'APPROVED'
        ? 'Đơn đã được phê duyệt'
        : status === 'RETURNED'
          ? 'Đơn cần bổ sung'
          : 'Đơn bị từ chối',
      `${r.request_code} · ${comment || a.fullName}`,
    );
  }
  async decide(c: PoolClient, a: Actor, r: any, b: any) {
    if (await this.receipt(c, a, r, 'decision', b)) return;
    revision(r.revision, b.expectedRevision);
    const decision = b.decision;
    if (!['APPROVED', 'REJECTED', 'RETURNED'].includes(decision))
      throw new BadRequestException('Quyết định không hợp lệ.');
    const comment = str(b.comment ?? '', 'Nhận xét', 2000, decision !== 'APPROVED');
    const tasks = (
      await c.query(
        `SELECT t.*,s.instance_id,s.round,s.step_index,s.name,s.mode FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id JOIN workflow_instances i ON i.id=s.instance_id WHERE i.request_id=$1 AND t.assignee_assignment_id=$2 AND t.status='PENDING' AND s.status='ACTIVE' AND i.status='RUNNING' ORDER BY t.id FOR UPDATE OF t`,
        [r.id, a.assignmentId],
      )
    ).rows;
    const task = b.taskId
      ? tasks.find((t) => t.id === uuid(b.taskId))
      : tasks.length === 1
        ? tasks[0]
        : null;
    if (!task)
      throw new ForbiddenException('Bạn không có nhiệm vụ đang chờ được giao trong đơn này.');
    if (r.status !== 'PENDING') throw new ConflictException('Đơn đã được xử lý.');
    const active = await activeAssignments(c),
      requester = (
        await c.query('SELECT * FROM employee_assignments WHERE id=$1', [r.requester_assignment_id])
      ).rows[0],
      who = active.find((x) => x.id === a.assignmentId);
    if (
      !who ||
      !(await eligible(c, who, requester, [
        decision === 'APPROVED'
          ? 'REQUEST_APPROVE'
          : decision === 'RETURNED'
            ? 'REQUEST_RETURN'
            : 'REQUEST_REJECT',
      ]))
    )
      throw new ForbiddenException('Bạn không còn đủ quyền hoặc không được tự duyệt.');
    await c.query('UPDATE approval_tasks SET status=$1,decided_at=now() WHERE id=$2', [
      decision,
      task.id,
    ]);
    await c.query(
      'INSERT INTO task_decisions(task_id,actor_assignment_id,decision,comment) VALUES($1,$2,$3,$4)',
      [task.id, a.assignmentId, decision, comment || null],
    );
    await audit(c, a.assignmentId, 'TASK_' + decision, r.id, null, {
      taskId: task.id,
      step: task.name,
      round: task.round,
      comment,
    });
    const [i] = (
      await c.query(
        'SELECT i.*,v.definition FROM workflow_instances i JOIN workflow_versions v ON v.id=i.workflow_version_id WHERE i.id=$1',
        [task.instance_id],
      )
    ).rows;
    const siblings = (
      await c.query(
        'SELECT status FROM approval_tasks t WHERE step_run_id=$1 AND NOT EXISTS(SELECT 1 FROM task_transfers tr WHERE tr.from_task_id=t.id)',
        [task.step_run_id],
      )
    ).rows;
    const approved =
      task.mode === 'ALL'
        ? siblings.every((t) => t.status === 'APPROVED')
        : siblings.some((t) => t.status === 'APPROVED');
    const rejected =
      task.mode === 'ALL'
        ? siblings.some((t) => t.status === 'REJECTED')
        : siblings.every((t) => t.status === 'REJECTED');
    if (decision === 'RETURNED' || approved || rejected) {
      const status = decision === 'RETURNED' ? 'RETURNED' : approved ? 'APPROVED' : 'REJECTED';
      await c.query(
        "UPDATE approval_tasks SET status='CANCELLED',decided_at=now() WHERE step_run_id=$1 AND status='PENDING'",
        [task.step_run_id],
      );
      await c.query('UPDATE workflow_step_runs SET status=$1,completed_at=now() WHERE id=$2', [
        status,
        task.step_run_id,
      ]);
      await audit(c, a.assignmentId, 'WORKFLOW_STEP_' + status, r.id, null, {
        round: task.round,
        step: task.name,
        comment,
        cancelReason:
          decision === 'RETURNED'
            ? 'SUPPLEMENT_REQUIRED'
            : approved
              ? 'STEP_COMPLETED'
              : 'STEP_REJECTED',
      });
      if (status !== 'APPROVED') {
        await this.finish(c, a, r, i, status, comment);
        return;
      }
      await c.query('UPDATE requests SET revision=revision+1 WHERE id=$1', [r.id]);
      await this.advance(c, a, r, i, i.definition, task.step_index + 1, requester);
    } else await c.query('UPDATE requests SET revision=revision+1 WHERE id=$1', [r.id]);
  }
  async cancel(c: PoolClient, r: any) {
    const recipients = (
      await c.query(
        "SELECT DISTINCT t.assignee_assignment_id FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id JOIN workflow_instances i ON i.id=s.instance_id WHERE i.request_id=$1 AND t.status='PENDING'",
        [r.id],
      )
    ).rows;
    for (const who of recipients)
      await notify(
        c,
        r.id,
        who.assignee_assignment_id,
        'REQUEST_CANCELLED',
        'Người gửi đã hủy yêu cầu',
        r.request_code || '',
      );
    await c.query(
      "UPDATE approval_tasks SET status='CANCELLED',decided_at=now() WHERE status='PENDING' AND step_run_id IN (SELECT s.id FROM workflow_step_runs s JOIN workflow_instances i ON i.id=s.instance_id WHERE i.request_id=$1)",
      [r.id],
    );
    await c.query(
      "UPDATE workflow_step_runs SET status='CANCELLED',completed_at=now() WHERE status='ACTIVE' AND instance_id IN (SELECT id FROM workflow_instances WHERE request_id=$1)",
      [r.id],
    );
    await c.query(
      "UPDATE workflow_instances SET status='CANCELLED',completed_at=now() WHERE request_id=$1",
      [r.id],
    );
  }
  async retry(c: PoolClient, a: Actor, r: any) {
    const [i] = (
      await c.query(
        'SELECT i.*,v.definition FROM workflow_instances i JOIN workflow_versions v ON v.id=i.workflow_version_id WHERE request_id=$1',
        [r.id],
      )
    ).rows;
    if (r.status !== 'PENDING' || i?.status !== 'BLOCKED')
      throw new ConflictException('Chỉ thử lại quy trình bị chặn.');
    const requester = (
      await c.query('SELECT * FROM employee_assignments WHERE id=$1', [r.requester_assignment_id])
    ).rows[0];
    await audit(c, a.assignmentId, 'WORKFLOW_RETRIED', r.id, null);
    await c.query('UPDATE requests SET revision=revision+1 WHERE id=$1', [r.id]);
    await this.advance(c, a, r, i, i.definition, i.current_step, requester);
  }
}
