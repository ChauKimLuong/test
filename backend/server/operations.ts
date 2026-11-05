import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { Database } from './db';
import { Actor, can, requirePermission, uuid, str } from './security';
import { visibility, requestSelect } from './requests';
import { activeAssignments, eligible } from './workflow-rules';
import { transferTask, applyDelegation } from './task-operations';
import { audit, notify } from './events';
import { revision } from './workflows';

@Injectable()
export class OperationsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private db: Database) {}
  onModuleInit() {
    if (process.env.SLA_WORKER !== 'false') {
      this.timer = setInterval(() => {
        void this.sweep().catch((e) =>
          console.error({ job: 'workflow-operations', message: e.message }),
        );
      }, 30000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async visible(a: Actor, id: string) {
    const scope = visibility(a, 2);
    const [r] = await this.db.query(requestSelect + ' WHERE r.id=$1 AND ' + scope.sql, [
      uuid(id),
      ...scope.values,
    ]);
    if (!r) throw new NotFoundException('Không tìm thấy hồ sơ trong phạm vi truy cập.');
    return r;
  }
  async directory(a: Actor) {
    requirePermission(a, 'TASK_DELEGATE', a.unitId);
    return this.db.transaction(async (c) => {
      const people = await activeAssignments(c),
        result = [];
      for (const person of people) {
        if (person.user_id === a.userId) continue;
        const [permission] = (
          await c.query(
            `SELECT 1 FROM role_assignments ra JOIN system_roles sr ON sr.id=ra.system_role_id AND sr.is_active
          JOIN role_permissions rp ON rp.system_role_id=sr.id JOIN permissions p ON p.id=rp.permission_id
          WHERE ra.employee_assignment_id=$1 AND p.code='REQUEST_APPROVE' AND ra.revoked_at IS NULL AND ra.valid_from<=now() AND (ra.valid_until IS NULL OR ra.valid_until>now())`,
            [person.id],
          )
        ).rows;
        if (permission)
          result.push({
            id: person.id,
            name: person.full_name,
            unit: person.unit_name,
            position: person.position_name,
          });
      }
      return result;
    });
  }
  async delegations(a: Actor) {
    requirePermission(a, 'TASK_DELEGATE', a.unitId);
    return this.db.query(
      `SELECT d.*,u.full_name AS delegate_name FROM approval_delegations d JOIN employee_assignments ea ON ea.id=d.delegate_assignment_id JOIN users u ON u.id=ea.user_id WHERE owner_assignment_id=$1 ORDER BY created_at DESC`,
      [a.assignmentId],
    );
  }
  async delegate(a: Actor, b: any) {
    requirePermission(a, 'TASK_DELEGATE', a.unitId);
    const target = uuid(b.delegateAssignmentId),
      reason = str(b.reason, 'Lý do', 1000);
    const starts = new Date(b.startsAt),
      ends = new Date(b.endsAt);
    if (
      !Number.isFinite(starts.getTime()) ||
      !Number.isFinite(ends.getTime()) ||
      ends <= starts ||
      ends.getTime() - starts.getTime() > 90 * 86400000 ||
      ends.getTime() <= Date.now()
    )
      throw new BadRequestException('Khoảng ủy quyền cần còn hiệu lực và dài tối đa 90 ngày.');
    const result = await this.db.transaction(async (c) => {
      await c.query('SELECT id FROM employee_assignments WHERE id=$1 FOR UPDATE', [a.assignmentId]);
      const people = await activeAssignments(c),
        who = people.find((p) => p.id === target);
      if (
        !who ||
        who.user_id === a.userId ||
        !(await this.directory(a)).some((p: any) => p.id === target)
      )
        throw new BadRequestException(
          'Người nhận cần đang hoạt động, có quyền duyệt và khác người ủy quyền.',
        );
      if (
        (
          await c.query(
            `SELECT 1 FROM approval_delegations WHERE owner_assignment_id=$1 AND revoked_at IS NULL AND starts_at<$3 AND ends_at>$2`,
            [a.assignmentId, starts, ends],
          )
        ).rowCount
      )
        throw new ConflictException('Thời gian ủy quyền trùng lịch hiện có.');
      const [d] = (
        await c.query(
          'INSERT INTO approval_delegations(owner_assignment_id,delegate_assignment_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [a.assignmentId, target, starts, ends, reason],
        )
      ).rows;
      await audit(c, a.assignmentId, 'DELEGATION_CREATED', null, null, {
        delegationId: d.id,
        target,
        starts,
        ends,
        reason,
      });
      return d;
    });
    await this.sweep();
    return result;
  }
  async revoke(a: Actor, id: string) {
    requirePermission(a, 'TASK_DELEGATE', a.unitId);
    return this.db.transaction(async (c) => {
      const [d] = (
        await c.query(
          'SELECT * FROM approval_delegations WHERE id=$1 AND owner_assignment_id=$2 FOR UPDATE',
          [uuid(id), a.assignmentId],
        )
      ).rows;
      if (!d) throw new NotFoundException('Không tìm thấy lịch ủy quyền của bạn.');
      if (!d.revoked_at) {
        await c.query('UPDATE approval_delegations SET revoked_at=now() WHERE id=$1', [id]);
        await audit(c, a.assignmentId, 'DELEGATION_REVOKED', null, null, { delegationId: id });
      }
      return { ok: true };
    });
  }
  async candidates(a: Actor, id: string) {
    const r = await this.visible(a, id);
    const hasTask =
      (
        await this.db.query(
          `SELECT 1 FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id JOIN workflow_instances i ON i.id=s.instance_id WHERE i.request_id=$1 AND t.status='PENDING' AND t.assignee_assignment_id=$2`,
          [id, a.assignmentId],
        )
      ).length > 0;
    if (!can(a, 'TASK_TRANSFER', r.unit_id) && !(hasTask && can(a, 'TASK_DELEGATE', a.unitId)))
      throw new ForbiddenException('Bạn không có quyền chuyển giao hồ sơ này.');
    return this.db.transaction(async (c) => {
      const requester = (
          await c.query('SELECT * FROM employee_assignments WHERE id=$1', [
            r.requester_assignment_id,
          ])
        ).rows[0],
        result = [];
      for (const person of await activeAssignments(c))
        if (await eligible(c, person, requester))
          result.push({
            id: person.id,
            name: person.full_name,
            unit: person.unit_name,
            position: person.position_name,
          });
      return result;
    });
  }
  async transfer(a: Actor, id: string, b: any) {
    await this.visible(a, id);
    return this.db.transaction(async (c) => {
      const [r] = (
        await c.query(
          'SELECT r.*,ea.organizational_unit_id AS unit_id FROM requests r JOIN employee_assignments ea ON ea.id=r.requester_assignment_id WHERE r.id=$1 FOR UPDATE OF r',
          [uuid(id)],
        )
      ).rows;
      revision(r.revision, b.expectedRevision);
      const [t] = (
        await c.query(
          `SELECT t.* FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id JOIN workflow_instances i ON i.id=s.instance_id WHERE t.id=$1 AND i.request_id=$2 AND s.status='ACTIVE' FOR UPDATE OF t`,
          [uuid(b.taskId), id],
        )
      ).rows;
      if (!t) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
      if (
        !can(a, 'TASK_TRANSFER', r.unit_id) &&
        !(t.assignee_assignment_id === a.assignmentId && can(a, 'TASK_DELEGATE', a.unitId))
      )
        throw new ForbiddenException('Chỉ chuyển nhiệm vụ của mình hoặc trong phạm vi quản trị.');
      return transferTask(
        c,
        r,
        t,
        uuid(b.targetAssignmentId),
        a.assignmentId,
        'MANUAL',
        str(b.reason, 'Lý do chuyển giao', 1000),
      );
    });
  }
  async run(a: Actor) {
    requirePermission(a, 'SLA_OPERATE');
    return this.sweep();
  }
  async sweep() {
    if (this.running) return { busy: true };
    this.running = true;
    let reminders = 0,
      overdue = 0,
      transfers = 0;
    try {
      // Bound every batch; concurrent workers skip locked requests. No deadline can auto-approve.
      const ids = await this.db
        .query(`SELECT DISTINCT i.request_id FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id JOIN workflow_instances i ON i.id=s.instance_id
        WHERE t.status='PENDING' AND s.status='ACTIVE' AND i.status='RUNNING' AND (
        (t.remind_at<=now() AND NOT EXISTS(SELECT 1 FROM sla_events e WHERE e.task_id=t.id AND e.event='REMINDER')) OR
        (t.due_at<=now() AND NOT EXISTS(SELECT 1 FROM sla_events e WHERE e.task_id=t.id AND e.event='OVERDUE')) OR
        (t.due_at<=now() AND t.escalation_assignment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sla_events e WHERE e.task_id=t.id AND e.event='ESCALATION_FAILED')) OR
        (NOT EXISTS(SELECT 1 FROM task_transfers tr WHERE tr.to_task_id=t.id) AND EXISTS(SELECT 1 FROM approval_delegations d WHERE d.owner_assignment_id=t.assignee_assignment_id AND d.revoked_at IS NULL AND d.starts_at<=now() AND d.ends_at>now()
          AND NOT EXISTS(SELECT 1 FROM audit_logs l WHERE l.request_id=i.request_id AND l.event_type='DELEGATION_SKIPPED' AND l.details->>'taskId'=t.id::text AND l.details->>'delegationId'=d.id::text)))) ORDER BY i.request_id LIMIT 200`);
      for (const item of ids)
        await this.db.transaction(async (c) => {
          const [r] = (
            await c.query(
              "SELECT * FROM requests WHERE id=$1 AND status='PENDING' FOR UPDATE SKIP LOCKED",
              [item.request_id],
            )
          ).rows;
          if (!r) return;
          const tasks = (
            await c.query(
              `SELECT t.* FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id JOIN workflow_instances i ON i.id=s.instance_id WHERE i.request_id=$1 AND t.status='PENDING' AND s.status='ACTIVE' AND i.status='RUNNING' ORDER BY t.id FOR UPDATE OF t`,
              [r.id],
            )
          ).rows;
          for (const task of tasks) {
            if (await applyDelegation(c, r, task)) {
              transfers++;
              continue;
            }
            for (const [event, column] of [
              ['REMINDER', 'remind_at'],
              ['OVERDUE', 'due_at'],
            ]) {
              if (!task[column] || new Date(task[column]).getTime() > Date.now()) continue;
              const inserted = await c.query(
                'INSERT INTO sla_events(task_id,event) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',
                [task.id, event],
              );
              if (!inserted.rowCount) continue;
              if (event === 'REMINDER') reminders++;
              else overdue++;
              for (const recipient of new Set(
                event === 'OVERDUE'
                  ? [task.assignee_assignment_id, r.requester_assignment_id]
                  : [task.assignee_assignment_id],
              ))
                await notify(
                  c,
                  r.id,
                  recipient,
                  'SLA_' + event,
                  event === 'OVERDUE' ? 'Nhiệm vụ đã quá hạn' : 'Nhiệm vụ sắp đến hạn',
                  `${r.request_code} · Hạn: ${new Date(task.due_at).toISOString()}`,
                );
              await audit(c, task.assignee_assignment_id, 'SLA_' + event, r.id, null, {
                taskId: task.id,
                dueAt: task.due_at,
                source: 'SYSTEM',
              });
            }
            if (
              task.due_at &&
              new Date(task.due_at).getTime() <= Date.now() &&
              task.escalation_assignment_id
            ) {
              await c.query('SAVEPOINT escalation_attempt');
              try {
                await transferTask(
                  c,
                  r,
                  task,
                  task.escalation_assignment_id,
                  null,
                  'ESCALATION',
                  'Chuyển cấp vì quá hạn',
                );
                await c.query('RELEASE SAVEPOINT escalation_attempt');
                transfers++;
              } catch (e) {
                await c.query('ROLLBACK TO SAVEPOINT escalation_attempt');
                await c.query('RELEASE SAVEPOINT escalation_attempt');
                if (
                  (
                    await c.query(
                      "INSERT INTO sla_events(task_id,event,detail) VALUES($1,'ESCALATION_FAILED',$2) ON CONFLICT DO NOTHING RETURNING id",
                      [task.id, (e as Error).message],
                    )
                  ).rowCount
                ) {
                  await audit(c, task.assignee_assignment_id, 'SLA_ESCALATION_FAILED', r.id, null, {
                    taskId: task.id,
                    reason: (e as Error).message,
                  });
                  await notify(
                    c,
                    r.id,
                    task.assignee_assignment_id,
                    'SLA_ESCALATION_FAILED',
                    'Chưa thể chuyển cấp',
                    (e as Error).message,
                  );
                }
              }
            }
          }
        });
      return { reminders, overdue, transfers, checkedRequests: ids.length };
    } finally {
      this.running = false;
    }
  }
  async collaboration(a: Actor, id: string) {
    await this.visible(a, id);
    return {
      comments: await this.db.query(
        `SELECT cm.*,u.full_name AS actor_name FROM request_comments cm JOIN employee_assignments ea ON ea.id=cm.actor_assignment_id JOIN users u ON u.id=ea.user_id WHERE request_id=$1 ORDER BY created_at,id`,
        [id],
      ),
      attachments: await this.db.query(
        `SELECT at.id,at.document_id,at.version,at.filename,at.mime_type,at.byte_size,at.sha256,at.created_at,at.archived_at,u.full_name AS uploader_name,
        EXISTS(SELECT 1 FROM submission_attachments sa WHERE sa.attachment_id=at.id) AS submitted,
        ARRAY(SELECT rs.round FROM submission_attachments sa JOIN request_submissions rs ON rs.id=sa.submission_id WHERE sa.attachment_id=at.id ORDER BY rs.round) AS rounds
        FROM request_attachments at JOIN employee_assignments ea ON ea.id=at.uploaded_by_assignment_id JOIN users u ON u.id=ea.user_id WHERE request_id=$1 ORDER BY at.created_at DESC,at.version DESC`,
        [id],
      ),
      transfers: await this.db.query(
        `SELECT tr.*,old.assignee_snapshot AS original_assignee,new.assignee_snapshot AS replacement_assignee FROM task_transfers tr JOIN approval_tasks old ON old.id=tr.from_task_id JOIN approval_tasks new ON new.id=tr.to_task_id JOIN workflow_step_runs s ON s.id=old.step_run_id JOIN workflow_instances i ON i.id=s.instance_id WHERE i.request_id=$1 ORDER BY tr.occurred_at`,
        [id],
      ),
    };
  }
  async comment(a: Actor, id: string, b: any) {
    await this.visible(a, id);
    requirePermission(a, 'REQUEST_COMMENT', a.unitId);
    return this.db.transaction(async (c) => {
      const [r] = (await c.query('SELECT * FROM requests WHERE id=$1 FOR SHARE', [id])).rows;
      const [comment] = (
        await c.query(
          'INSERT INTO request_comments(request_id,actor_assignment_id,body) VALUES($1,$2,$3) RETURNING *',
          [id, a.assignmentId, str(b.body, 'Nội dung trao đổi', 2000)],
        )
      ).rows;
      await audit(c, a.assignmentId, 'REQUEST_COMMENTED', id, null, { commentId: comment.id });
      const people = (
        await c.query(
          `SELECT t.assignee_assignment_id AS id FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id JOIN workflow_instances i ON i.id=s.instance_id WHERE i.request_id=$1 AND t.status='PENDING' UNION SELECT $2::uuid AS id`,
          [id, r.requester_assignment_id],
        )
      ).rows;
      for (const person of people)
        if (person.id !== a.assignmentId)
          await notify(
            c,
            id,
            person.id,
            'REQUEST_COMMENTED',
            'Trao đổi mới trên hồ sơ',
            `${r.request_code || 'Bản nháp'} · ${a.fullName}: ${comment.body.slice(0, 200)}`,
          );
      return comment;
    });
  }
  private editable(a: Actor, r: any) {
    requirePermission(a, 'REQUEST_ATTACH', a.unitId);
    if (r.requester_assignment_id !== a.assignmentId || !['DRAFT', 'RETURNED'].includes(r.status))
      throw new ForbiddenException(
        'Chỉ người gửi bổ sung tài liệu khi đơn là nháp hoặc cần bổ sung.',
      );
  }
  async upload(a: Actor, id: string, b: any) {
    await this.visible(a, id);
    const filename = str(b.filename, 'Tên tài liệu', 180);
    if (/[\\/\x00-\x1f\x7f]/.test(filename))
      throw new BadRequestException('Tên tài liệu không hợp lệ.');
    if (
      typeof b.contentBase64 !== 'string' ||
      b.contentBase64.length > 2796204 ||
      b.contentBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(b.contentBase64)
    )
      throw new BadRequestException('Dữ liệu tài liệu không hợp lệ hoặc lớn hơn 2 MiB.');
    const data = Buffer.from(b.contentBase64, 'base64');
    if (!data.length || data.length > 2097152 || data.toString('base64') !== b.contentBase64)
      throw new BadRequestException('Tài liệu cần Base64 chuẩn, từ 1 byte đến 2 MiB.');
    const extension = filename.split('.').at(-1)?.toLowerCase();
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      txt: 'text/plain',
      csv: 'text/csv',
    };
    const mime = types[extension || ''];
    if (!mime || b.mimeType !== mime)
      throw new BadRequestException('Chỉ nhận PDF, PNG, JPEG, TXT và CSV đúng định dạng.');
    let textValid = false;
    try {
      textValid =
        !data.includes(0) &&
        !new TextDecoder('utf-8', { fatal: true }).decode(data).includes('\ufffd');
    } catch {}
    const valid =
      extension === 'pdf'
        ? data.subarray(0, 5).equals(Buffer.from('%PDF-'))
        : extension === 'png'
          ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : ['jpg', 'jpeg'].includes(extension || '')
            ? data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            : textValid;
    if (!valid) throw new BadRequestException('Nội dung không khớp loại tài liệu.');
    return this.db.transaction(async (c) => {
      const [r] = (await c.query('SELECT * FROM requests WHERE id=$1 FOR UPDATE', [id])).rows;
      this.editable(a, r);
      revision(r.revision, b.expectedRevision);
      const size = (
        await c.query(
          'SELECT count(*)::int AS count,COALESCE(sum(byte_size),0)::int AS bytes FROM request_attachments WHERE request_id=$1',
          [id],
        )
      ).rows[0];
      if (size.count >= 50 || size.bytes + data.length > 20 * 1048576)
        throw new BadRequestException('Hồ sơ giới hạn 50 phiên bản tài liệu và tổng 20 MiB.');
      let documentId = randomUUID(),
        version = 1;
      if (b.replacesAttachmentId) {
        const [prior] = (
          await c.query('SELECT * FROM request_attachments WHERE id=$1 AND request_id=$2', [
            uuid(b.replacesAttachmentId),
            id,
          ])
        ).rows;
        if (!prior) throw new NotFoundException('Tài liệu thay thế không thuộc hồ sơ.');
        documentId = prior.document_id;
        version =
          (
            await c.query(
              'SELECT max(version)::int AS version FROM request_attachments WHERE request_id=$1 AND document_id=$2',
              [id, documentId],
            )
          ).rows[0].version + 1;
      }
      const [at] = (
        await c.query(
          `INSERT INTO request_attachments(request_id,document_id,version,filename,mime_type,byte_size,sha256,content,uploaded_by_assignment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,document_id,version,filename`,
          [
            id,
            documentId,
            version,
            filename,
            mime,
            data.length,
            createHash('sha256').update(data).digest('hex'),
            data,
            a.assignmentId,
          ],
        )
      ).rows;
      await c.query('UPDATE requests SET revision=revision+1 WHERE id=$1', [id]);
      await audit(c, a.assignmentId, 'ATTACHMENT_UPLOADED', id, null, {
        ...at,
        bytes: data.length,
      });
      return at;
    });
  }
  async archive(a: Actor, id: string, attachmentId: string, b: any) {
    await this.visible(a, id);
    return this.db.transaction(async (c) => {
      const [r] = (await c.query('SELECT * FROM requests WHERE id=$1 FOR UPDATE', [id])).rows;
      this.editable(a, r);
      revision(r.revision, b.expectedRevision);
      const rows = await c.query(
        'UPDATE request_attachments SET archived_at=now() WHERE id=$1 AND request_id=$2 AND archived_at IS NULL RETURNING id',
        [uuid(attachmentId), id],
      );
      if (!rows.rowCount) throw new NotFoundException('Tài liệu không tồn tại hoặc đã gỡ.');
      await c.query('UPDATE requests SET revision=revision+1 WHERE id=$1', [id]);
      await audit(c, a.assignmentId, 'ATTACHMENT_ARCHIVED', id, null, { attachmentId });
      return { ok: true };
    });
  }
  async download(a: Actor, id: string, attachmentId: string) {
    await this.visible(a, id);
    const [at] = await this.db.query(
      'SELECT * FROM request_attachments WHERE id=$1 AND request_id=$2',
      [uuid(attachmentId), id],
    );
    if (!at) throw new NotFoundException('Không tìm thấy tài liệu.');
    return at;
  }
  async metrics(a: Actor, q: any) {
    requirePermission(a, 'METRICS_VIEW', a.unitId);
    const from = q.from
        ? new Date(str(q.from, 'Ngày bắt đầu', 40))
        : new Date(Date.now() - 30 * 86400000),
      to = q.to ? new Date(str(q.to, 'Ngày kết thúc', 40)) : new Date();
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > 366 * 86400000
    )
      throw new BadRequestException(
        'Khoảng báo cáo tối đa 366 ngày, ngày kết thúc sau ngày bắt đầu.',
      );
    const scope = visibility(a),
      params = [...scope.values, from, to];
    const base = `WITH visible AS (SELECT r.id FROM requests r JOIN employee_assignments a ON a.id=r.requester_assignment_id WHERE ${scope.sql} ${can(a, 'METRICS_VIEW') ? '' : 'AND a.organizational_unit_id=$4'}), measured AS (
      SELECT s.*,r.id AS request_id,r.request_code,r.template_snapshot->>'name' AS form_name,
      extract(epoch FROM (COALESCE(s.completed_at,now())-s.entered_at))/60 AS duration_minutes,
      EXISTS(SELECT 1 FROM approval_tasks t WHERE t.step_run_id=s.id AND t.due_at IS NOT NULL AND COALESCE(t.decided_at,now())>t.due_at) AS breached,
      EXISTS(SELECT 1 FROM approval_tasks t WHERE t.step_run_id=s.id AND t.due_at IS NOT NULL) AS has_sla
      FROM workflow_step_runs s JOIN workflow_instances i ON i.id=s.instance_id JOIN requests r ON r.id=i.request_id JOIN visible v ON v.id=r.id
      WHERE s.entered_at>=$5 AND s.entered_at<$6 AND s.status<>'SKIPPED') `;
    const [summary] = await this.db.query(
      base +
        `SELECT count(*)::int AS steps,count(*) FILTER(WHERE status='ACTIVE')::int AS active,
      count(*) FILTER(WHERE status='RETURNED')::int AS returned,count(*) FILTER(WHERE breached)::int AS breached,
      count(*) FILTER(WHERE completed_at IS NOT NULL AND has_sla AND status IN ('APPROVED','REJECTED','RETURNED'))::int AS sla_completed,
      count(*) FILTER(WHERE completed_at IS NOT NULL AND has_sla AND NOT breached AND status IN ('APPROVED','REJECTED','RETURNED'))::int AS sla_on_time FROM measured`,
      params,
    );
    const bottlenecks = await this.db.query(
      base +
        `SELECT form_name,step_id,name,count(*)::int AS samples,count(*) FILTER(WHERE status='ACTIVE')::int AS waiting,
      count(*) FILTER(WHERE status='RETURNED')::int AS returned,count(*) FILTER(WHERE breached)::int AS breached,
      round(avg(duration_minutes) FILTER(WHERE completed_at IS NOT NULL),2)::float AS avg_completed_minutes,
      percentile_cont(0.95) WITHIN GROUP(ORDER BY duration_minutes) FILTER(WHERE completed_at IS NOT NULL) AS p95_completed_minutes,
      round(max(duration_minutes) FILTER(WHERE status='ACTIVE'),2)::float AS longest_wait_minutes
      FROM measured GROUP BY form_name,step_id,name ORDER BY longest_wait_minutes DESC NULLS LAST,avg_completed_minutes DESC NULLS LAST LIMIT 100`,
      params,
    );
    const pending = await this.db.query(
      base +
        `SELECT id,request_id,request_code,form_name,name,duration_minutes,breached FROM measured WHERE status='ACTIVE' ORDER BY duration_minutes DESC LIMIT 50`,
      params,
    );
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      scope: can(a, 'METRICS_VIEW') ? 'ORGANIZATION' : 'VISIBLE_REQUESTS',
      summary,
      bottlenecks,
      pending,
    };
  }
}
