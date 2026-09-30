import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { Database } from './db';
import { Actor, can, requirePermission, uuid, str } from './security';
export const requestSelect = `SELECT r.*, r.template_snapshot->>'name' AS form_name,r.template_snapshot->>'code' AS form_code,r.template_snapshot->>'description' AS form_description, a.organizational_unit_id AS unit_id,
 u.full_name AS requester_name, un.name AS unit_name, p.name AS requester_position,
 au.full_name AS approver_name,ap.name AS approver_position
 FROM requests r JOIN workflows w ON w.id=r.workflow_id JOIN form_templates f ON f.id=w.form_template_id
 JOIN employee_assignments a ON a.id=r.requester_assignment_id JOIN users u ON u.id=a.user_id JOIN organizational_units un ON un.id=a.organizational_unit_id JOIN positions p ON p.id=a.position_id
 LEFT JOIN employee_assignments aa ON aa.id=r.approver_assignment_id LEFT JOIN users au ON au.id=aa.user_id LEFT JOIN positions ap ON ap.id=aa.position_id`;
export function visibility(a: Actor, offset = 1) {
  return {
    sql: `(r.requester_assignment_id=$${offset} OR r.approver_assignment_id=$${offset} OR $${offset + 1}::boolean OR ($${offset + 2}::boolean AND a.organizational_unit_id=$${offset + 3}))`,
    values: [a.assignmentId, can(a, 'REQUEST_VIEW'), can(a, 'REQUEST_VIEW', a.unitId), a.unitId],
  };
}
export async function audit(
  c: PoolClient,
  actor: string,
  event: string,
  requestId: string | null,
  workflowId: string | null,
  details: unknown = null,
) {
  await c.query(
    'INSERT INTO audit_logs(actor_assignment_id,event_type,request_id,workflow_id,details) VALUES($1,$2,$3,$4,$5)',
    [actor, event, requestId, workflowId, details ? JSON.stringify(details) : null],
  );
}
export async function notify(
  c: PoolClient,
  id: string,
  recipient: string,
  type: string,
  title: string,
  message: string,
) {
  await c.query(
    'INSERT INTO notifications(request_id,recipient_assignment_id,type,title,message) VALUES($1,$2,$3,$4,$5)',
    [id, recipient, type, title, message],
  );
}
export function validateData(data: unknown, fields: any[], complete: boolean) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new BadRequestException('Nội dung biểu mẫu không hợp lệ.');
  const values = data as Record<string, unknown>,
    errors: Record<string, string> = {};
  const allowed = new Set(fields.filter((f) => f.type !== 'SECTION').map((f) => f.key));
  for (const key of Object.keys(values))
    if (!allowed.has(key)) errors[key] = 'Trường không thuộc biểu mẫu.';
  for (const f of fields) {
    if (f.type === 'SECTION') continue;
    const v = values[f.key],
      empty = v === undefined || v === null || (typeof v === 'string' && !v.trim());
    if (complete && f.is_required && (empty || (f.type === 'CHECKBOX' && v !== true))) {
      errors[f.key] = 'Vui lòng hoàn thành ' + f.label.toLowerCase() + '.';
      continue;
    }
    if (empty) continue;
    if (f.type === 'NUMBER' && (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e15))
      errors[f.key] = 'Vui lòng nhập số hợp lệ.';
    if (f.type === 'CHECKBOX' && typeof v !== 'boolean')
      errors[f.key] = 'Giá trị lựa chọn không hợp lệ.';
    if (
      ['TEXT', 'TEXTAREA', 'DATE', 'SELECT'].includes(f.type) &&
      (typeof v !== 'string' || v.length > (f.type === 'TEXTAREA' ? 5000 : 500))
    )
      errors[f.key] = 'Nội dung vượt giới hạn hoặc không hợp lệ.';
    if (f.type === 'SELECT' && !f.options.includes(v))
      errors[f.key] = 'Vui lòng chọn giá trị trong danh sách.';
    if (
      f.type === 'DATE' &&
      (typeof v !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        Number.isNaN(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      errors[f.key] = 'Ngày không hợp lệ.';
  }
  if (values.startDate && values.endDate && String(values.startDate) > String(values.endDate))
    errors.endDate = 'Ngày kết thúc phải từ ngày bắt đầu trở đi.';
  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Vui lòng kiểm tra các trường được đánh dấu.',
      errors,
    });
  return values;
}
@Injectable()
export class RequestsService {
  constructor(private db: Database) {}
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
      conditions.push('r.approver_assignment_id=$' + values.length);
    }
    if (q.status) {
      if (!['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(q.status))
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
    return { ...r, fields, logs };
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
      if (r.status !== 'DRAFT') throw new ConflictException('Chỉ được sửa bản nháp.');
      const fields = r.template_snapshot.fields;
      const data = validateData(body.formData, fields, false);
      await c.query('UPDATE requests SET form_data=$1 WHERE id=$2', [JSON.stringify(data), r.id]);
      await audit(c, a.assignmentId, 'REQUEST_UPDATED', r.id, null);
    });
    return this.detail(a, id);
  }
  async submit(a: Actor, id: string) {
    requirePermission(a, 'REQUEST_CREATE', a.unitId);
    await this.db.transaction(async (c) => {
      const r = await this.lock(c, id);
      this.owner(a, r);
      if (r.status !== 'DRAFT')
        throw new ConflictException('Yêu cầu này đã được gửi hoặc kết thúc.');
      const [w] = (
        await c.query(
          'SELECT w.*,f.status AS form_status FROM workflows w JOIN form_templates f ON f.id=w.form_template_id WHERE w.id=$1 FOR SHARE OF w,f',
          [r.workflow_id],
        )
      ).rows;
      if (w.status !== 'ACTIVE' || w.form_status !== 'ACTIVE')
        throw new ConflictException('Biểu mẫu hoặc quy trình đã ngừng hoạt động.');
      const fields = r.template_snapshot.fields;
      validateData(r.form_data, fields, true);
      const [requester] = (
        await c.query('SELECT * FROM employee_assignments WHERE id=$1', [a.assignmentId])
      ).rows;
      const params =
        w.approver_type === 'DIRECT_MANAGER'
          ? [requester.manager_assignment_id]
          : [w.target_position_id];
      const candidateWhere =
        w.approver_type === 'DIRECT_MANAGER' ? 'ea.id=$1' : 'ea.position_id=$1';
      const candidates = (
        await c.query(
          `SELECT ea.*,u.full_name FROM employee_assignments ea JOIN users u ON u.id=ea.user_id AND u.status='ACTIVE' JOIN organizational_units ou ON ou.id=ea.organizational_unit_id AND ou.status='ACTIVE' JOIN positions p ON p.id=ea.position_id AND p.status='ACTIVE' WHERE ${candidateWhere} AND ea.started_at<=now() AND (ea.ended_at IS NULL OR ea.ended_at>now())`,
          params,
        )
      ).rows;
      if (candidates.length !== 1)
        throw new ConflictException(
          candidates.length
            ? 'Có nhiều nhân sự giữ chức danh này. Quản trị viên cần điều chỉnh phân công.'
            : 'Chưa tìm thấy người duyệt đang hoạt động. Vui lòng liên hệ quản trị viên.',
        );
      const approver = candidates[0];
      if (approver.user_id === a.userId)
        throw new ConflictException('Không thể gửi yêu cầu cho chính mình phê duyệt.');
      const withinUnit = !!(await c.query(`WITH RECURSIVE chain AS (SELECT id,parent_id FROM organizational_units WHERE id=$1 UNION ALL SELECT u.id,u.parent_id FROM organizational_units u JOIN chain ch ON u.id=ch.parent_id) SELECT 1 FROM chain WHERE id=$2`,[a.unitId,approver.organizational_unit_id])).rowCount;
      const grants = (
        await c.query(
          `SELECT p.code,ra.scope_type FROM role_assignments ra JOIN system_roles sr ON sr.id=ra.system_role_id AND sr.is_active JOIN role_permissions rp ON rp.system_role_id=sr.id JOIN permissions p ON p.id=rp.permission_id WHERE ra.employee_assignment_id=$1 AND ra.revoked_at IS NULL AND ra.valid_from<=now() AND (ra.valid_until IS NULL OR ra.valid_until>now())`,
          [approver.id],
        )
      ).rows;
      if (
        !['REQUEST_APPROVE', 'REQUEST_REJECT'].every((p) =>
          grants.some(
            (g) =>
              g.code === p &&
              (g.scope_type === 'ORGANIZATION' || withinUnit),
          ),
        )
      )
        throw new ConflictException('Người duyệt chưa có đủ quyền trong phạm vi đơn này.');
      const [{ sequence, year }] = (
        await c.query(
          "SELECT nextval('request_code_seq')::text AS sequence,to_char(now(),'YYYY') AS year",
        )
      ).rows;
      const requestCode = 'REQ-' + year + '-' + sequence.padStart(5, '0');
      const [updated] = (
        await c.query(
          "UPDATE requests SET status='PENDING',approver_assignment_id=$1,submitted_at=now(),request_code=$3 WHERE id=$2 RETURNING request_code",
          [approver.id, id, requestCode],
        )
      ).rows;
      await audit(c, a.assignmentId, 'REQUEST_SUBMITTED', id, null, {
        approverAssignmentId: approver.id,
      });
      await notify(
        c,
        id,
        approver.id,
        'APPROVAL_REQUIRED',
        'Yêu cầu đang chờ bạn duyệt',
        updated.request_code + ' · ' + a.fullName,
      );
    });
    return this.detail(a, id);
  }
  async decide(a: Actor, id: string, body: any) {
    const decision = body.decision;
    if (!['APPROVED', 'REJECTED'].includes(decision))
      throw new BadRequestException('Quyết định không hợp lệ.');
    const comment = str(body.comment ?? '', 'Nhận xét', 2000, decision === 'REJECTED');
    await this.db.transaction(async (c) => {
      const r = await this.lock(c, id);
      if (r.approver_assignment_id !== a.assignmentId)
        throw new ForbiddenException('Chỉ người được giao duyệt mới được quyết định.');
      const [owner] = (
        await c.query('SELECT * FROM employee_assignments WHERE id=$1', [r.requester_assignment_id])
      ).rows;
      if (owner.user_id === a.userId) throw new ForbiddenException('Không được tự duyệt yêu cầu.');
      const withinUnit = !!(await c.query(`WITH RECURSIVE chain AS (SELECT id,parent_id FROM organizational_units WHERE id=$1 UNION ALL SELECT u.id,u.parent_id FROM organizational_units u JOIN chain ch ON u.id=ch.parent_id) SELECT 1 FROM chain WHERE id=$2`,[owner.organizational_unit_id,a.unitId])).rowCount;
      requirePermission(
        a,
        decision === 'APPROVED' ? 'REQUEST_APPROVE' : 'REQUEST_REJECT',
        withinUnit ? a.unitId : owner.organizational_unit_id,
      );
      if (r.status !== 'PENDING')
        throw new ConflictException('Yêu cầu đã được xử lý. Vui lòng tải lại.');
      await c.query(
        'UPDATE requests SET status=$1,decision_comment=$2,decided_at=now() WHERE id=$3',
        [decision, comment || null, id],
      );
      await audit(c, a.assignmentId, 'REQUEST_' + decision, id, null, { comment });
      await notify(
        c,
        id,
        r.requester_assignment_id,
        'REQUEST_' + decision,
        decision === 'APPROVED' ? 'Yêu cầu đã được phê duyệt' : 'Yêu cầu bị từ chối',
        r.request_code + ' · ' + (comment || a.fullName),
      );
    });
    return this.detail(a, id);
  }
  async cancel(a: Actor, id: string) {
    requirePermission(a, 'REQUEST_CANCEL', a.unitId);
    await this.db.transaction(async (c) => {
      const r = await this.lock(c, id);
      this.owner(a, r);
      if (!['DRAFT', 'PENDING'].includes(r.status))
        throw new ConflictException('Yêu cầu đã kết thúc, không thể hủy.');
      await c.query("UPDATE requests SET status='CANCELLED' WHERE id=$1", [id]);
      await audit(c, a.assignmentId, 'REQUEST_CANCELLED', id, null);
      if (r.approver_assignment_id)
        await notify(
          c,
          id,
          r.approver_assignment_id,
          'REQUEST_CANCELLED',
          'Người gửi đã hủy yêu cầu',
          r.request_code,
        );
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
      ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => [
        s,
        own.filter((r) => r.status === s).length,
      ]),
    );
    const inbox = items.filter(
      (r) => r.approver_assignment_id === a.assignmentId && r.status === 'PENDING',
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
