import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { Database } from './db';
import { Actor, can, requirePermission, uuid } from './security';
import { audit } from './events';
export { audit, notify } from './events';
import { WorkflowEngine } from './workflow-engine';
import { validateData } from './form-data';
export { validateData } from './form-data';
import { revision } from './workflows';
export const requestSelect = `SELECT r.*, r.template_snapshot->>'name' AS form_name,r.template_snapshot->>'code' AS form_code,r.template_snapshot->>'description' AS form_description, a.organizational_unit_id AS unit_id,
 u.full_name AS requester_name, un.name AS unit_name, p.name AS requester_position,
 COALESCE((SELECT string_agg(t.assignee_snapshot->>'name', ', ' ORDER BY t.id) FROM approval_tasks t JOIN workflow_step_runs sr ON sr.id=t.step_run_id JOIN workflow_instances wi ON wi.id=sr.instance_id WHERE wi.request_id=r.id AND t.status='PENDING'),au.full_name) AS approver_name,ap.name AS approver_position,
 ARRAY(SELECT t.assignee_assignment_id FROM approval_tasks t JOIN workflow_step_runs sr ON sr.id=t.step_run_id JOIN workflow_instances wi ON wi.id=sr.instance_id WHERE wi.request_id=r.id AND t.status='PENDING') AS pending_assignee_ids
 FROM requests r JOIN workflows w ON w.id=r.workflow_id JOIN form_templates f ON f.id=w.form_template_id
 JOIN employee_assignments a ON a.id=r.requester_assignment_id JOIN users u ON u.id=a.user_id JOIN organizational_units un ON un.id=a.organizational_unit_id JOIN positions p ON p.id=a.position_id
 LEFT JOIN employee_assignments aa ON aa.id=r.approver_assignment_id LEFT JOIN users au ON au.id=aa.user_id LEFT JOIN positions ap ON ap.id=aa.position_id`;
export function visibility(a: Actor, offset = 1) {
  return {
    sql: `(r.requester_assignment_id=$${offset} OR EXISTS(SELECT 1 FROM approval_tasks t JOIN workflow_step_runs sr ON sr.id=t.step_run_id JOIN workflow_instances wi ON wi.id=sr.instance_id WHERE wi.request_id=r.id AND t.assignee_assignment_id=$${offset}) OR $${offset + 1}::boolean OR ($${offset + 2}::boolean AND a.organizational_unit_id=$${offset + 3}))`,
    values: [a.assignmentId, can(a, 'REQUEST_VIEW'), can(a, 'REQUEST_VIEW', a.unitId), a.unitId],
  };
}
@Injectable()
export class RequestsService {
  constructor(
    private db: Database,
    private engine: WorkflowEngine,
  ) {}
  async list(a: Actor, q: any) {
    const scope = visibility(a);
    const conditions = [scope.sql];
    const values: unknown[] = [...scope.values];
    if (q.view === 'mine') {
      values.push(a.assignmentId);
      conditions.push('r.requester_assignment_id=$' + values.length);
    }
    if (q.view === 'inbox') {
      values.push(a.assignmentId);
      conditions.push(
        `r.status='PENDING' AND EXISTS(SELECT 1 FROM approval_tasks t JOIN workflow_step_runs sr ON sr.id=t.step_run_id JOIN workflow_instances wi ON wi.id=sr.instance_id WHERE wi.request_id=r.id AND t.status='PENDING' AND t.assignee_assignment_id=$${values.length})`,
      );
    }
    if (q.status) {
      if (!['DRAFT', 'PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(q.status))
        throw new BadRequestException('Trạng thái không hợp lệ.');
      values.push(q.status);
      conditions.push('r.status=$' + values.length);
    }
    if (q.search) {
      values.push('%' + String(q.search).slice(0, 100) + '%');
      conditions.push(
        `(r.request_code ILIKE $${values.length} OR r.template_snapshot->>'name' ILIKE $${values.length} OR u.full_name ILIKE $${values.length})`,
      );
    }
    const page = Math.max(1, Math.min(100000, Number.parseInt(q.page) || 1)),
      limit = 12;
    const where = ' WHERE ' + conditions.join(' AND ');
    const total = (
      await this.db.query(
        'SELECT count(*)::int AS count FROM (' + requestSelect + where + ') t',
        values,
      )
    )[0].count;
    const items = await this.db.query(
      requestSelect +
        where +
        ` ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      values,
    );
    return { items, total, page, pageSize: limit };
  }
  async detail(a: Actor, id: string) {
    const scope = visibility(a, 2);
    const [r] = await this.db.query(requestSelect + ' WHERE r.id=$1 AND ' + scope.sql, [
      uuid(id),
      ...scope.values,
    ]);
    if (!r) throw new NotFoundException('Không tìm thấy yêu cầu trong phạm vi truy cập.');
    const fields = r.template_snapshot.fields;
    const logs = await this.db.query(
      'SELECT l.*,u.full_name AS actor_name FROM audit_logs l JOIN employee_assignments a ON a.id=l.actor_assignment_id JOIN users u ON u.id=a.user_id WHERE l.request_id=$1 ORDER BY l.occurred_at,l.id',
      [id],
    );
    const [instance] = await this.db.query(
      'SELECT i.*,v.version AS workflow_version,v.definition FROM workflow_instances i JOIN workflow_versions v ON v.id=i.workflow_version_id WHERE i.request_id=$1',
      [id],
    );
    const steps = instance
      ? await this.db.query(
          'SELECT * FROM workflow_step_runs WHERE instance_id=$1 ORDER BY round,step_index',
          [instance.id],
        )
      : [];
    const tasks = instance
      ? await this.db.query(
          'SELECT t.*,s.round,s.name AS step_name,s.step_index,d.comment,d.occurred_at FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id LEFT JOIN task_decisions d ON d.task_id=t.id WHERE s.instance_id=$1 ORDER BY s.round,s.step_index,t.created_at,t.id',
          [instance.id],
        )
      : [];
    const submissions = await this.db.query(
      'SELECT * FROM request_submissions WHERE request_id=$1 ORDER BY round',
      [id],
    );
    return { ...r, fields, logs, instance: instance || null, steps, tasks, submissions };
  }
  async create(a: Actor, body: any) {
    requirePermission(a, 'REQUEST_CREATE', a.unitId);
    const workflowId = uuid(body.workflowId);
    const id = await this.db.transaction(async (c) => {
      const [w] = (
        await c.query(
          'SELECT w.*,f.status AS form_status FROM workflows w JOIN form_templates f ON f.id=w.form_template_id WHERE w.id=$1 FOR SHARE OF w FOR UPDATE OF f',
          [workflowId],
        )
      ).rows;
      if (!w || w.status !== 'ACTIVE' || w.form_status !== 'ACTIVE')
        throw new BadRequestException('Biểu mẫu hoặc quy trình đã ngừng hoạt động.');
      const fields = (
        await c.query('SELECT * FROM form_fields WHERE form_template_id=$1', [w.form_template_id])
      ).rows;
      const data = validateData(body.formData ?? {}, fields, false);
      const [r] = (
        await c.query(
          'INSERT INTO requests(workflow_id,requester_assignment_id,form_data) VALUES($1,$2,$3) RETURNING id',
          [w.id, a.assignmentId, JSON.stringify(data)],
        )
      ).rows;
      await audit(c, a.assignmentId, 'REQUEST_CREATED', r.id, null);
      return r.id;
    });
    return this.detail(a, id);
  }
  async update(a: Actor, id: string, body: any) {
    requirePermission(a, 'REQUEST_CREATE', a.unitId);
    await this.db.transaction(async (c) => {
      const r = await this.lock(c, id);
      this.owner(a, r);
      if (!['DRAFT', 'RETURNED'].includes(r.status))
        throw new ConflictException('Chỉ được sửa nháp hoặc đơn cần bổ sung.');
      revision(r.revision, body.expectedRevision);
      const fields = r.template_snapshot.fields;
      const data = validateData(body.formData, fields, false);
      await c.query('UPDATE requests SET form_data=$1,revision=revision+1 WHERE id=$2', [
        JSON.stringify(data),
        r.id,
      ]);
      await audit(c, a.assignmentId, 'REQUEST_UPDATED', r.id, null);
    });
    return this.detail(a, id);
  }
  async submit(a: Actor, id: string, body: any = {}) {
    requirePermission(a, 'REQUEST_CREATE', a.unitId);
    await this.db.transaction(async (c) => {
      const r = await this.lock(c, id);
      this.owner(a, r);
      validateData(r.form_data, r.template_snapshot.fields, true);
      await this.engine.submit(c, a, r, body);
    });
    return this.detail(a, id);
  }
  async decide(a: Actor, id: string, body: any) {
    await this.db.transaction(async (c) => {
      const r = await this.lock(c, id);
      await this.engine.decide(c, a, r, body);
    });
    return this.detail(a, id);
  }
  async retry(a: Actor, id: string) {
    requirePermission(a, 'WORKFLOW_OPERATE');
    await this.db.transaction(async (c) => {
      const r = await this.lock(c, id);
      await this.engine.retry(c, a, r);
    });
    return this.detail(a, id);
  }
  async cancel(a: Actor, id: string) {
    requirePermission(a, 'REQUEST_CANCEL', a.unitId);
    await this.db.transaction(async (c) => {
      const r = await this.lock(c, id);
      this.owner(a, r);
      if (!['DRAFT', 'PENDING', 'RETURNED'].includes(r.status))
        throw new ConflictException('Yêu cầu đã kết thúc, không thể hủy.');
      await this.engine.cancel(c, r);
      await c.query("UPDATE requests SET status='CANCELLED',revision=revision+1 WHERE id=$1", [id]);
      await audit(c, a.assignmentId, 'REQUEST_CANCELLED', id, null);
    });
    return this.detail(a, id);
  }
  private owner(a: Actor, r: any) {
    if (r.requester_assignment_id !== a.assignmentId)
      throw new ForbiddenException('Bạn không phải người tạo bản nháp này.');
  }
  private async lock(c: PoolClient, id: string) {
    const [r] = (await c.query('SELECT * FROM requests WHERE id=$1 FOR UPDATE', [uuid(id)])).rows;
    if (!r) throw new NotFoundException('Không tìm thấy yêu cầu.');
    return r;
  }
  async dashboard(a: Actor) {
    const scope = visibility(a);
    const items = await this.db.query(
      requestSelect + ' WHERE ' + scope.sql + ' ORDER BY r.created_at DESC',
      scope.values,
    );
    const own = items.filter((r) => r.requester_assignment_id === a.assignmentId);
    const mine = Object.fromEntries(
      ['DRAFT', 'PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => [
        s,
        own.filter((r) => r.status === s).length,
      ]),
    );
    const inbox = items.filter(
      (r) => r.pending_assignee_ids.includes(a.assignmentId) && r.status === 'PENDING',
    );
    const byMonth = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - 5 + i);
      const key = d.toISOString().slice(0, 7);
      return {
        month: key,
        count: items.filter(
          (r) => r.submitted_at && new Date(r.submitted_at).toISOString().startsWith(key),
        ).length,
      };
    });
    const done = items.filter((r) => r.decided_at && r.submitted_at);
    const avgHours = done.length
      ? done.reduce(
          (sum, r) =>
            sum + (new Date(r.decided_at).getTime() - new Date(r.submitted_at).getTime()) / 3600000,
          0,
        ) / done.length
      : 0;
    return {
      mine,
      total: items.length,
      pendingInbox: inbox.length,
      recent: items.slice(0, 5),
      inbox: inbox.slice(0, 3),
      byMonth,
      averageHours: Math.round(avgHours * 10) / 10,
      approvalRate: done.length
        ? Math.round((done.filter((r) => r.status === 'APPROVED').length / done.length) * 100)
        : 0,
    };
  }
}
