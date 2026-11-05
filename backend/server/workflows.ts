import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { Database } from './db';
import { Actor, requirePermission, uuid, str } from './security';
import { audit } from './events';
import { validateData } from './form-data';
import {
  Definition,
  validateDefinition,
  legacyDefinition,
  activeAssignments,
  evaluate,
  resolve,
  assigneeSnapshot,
  eligible,
} from './workflow-rules';
import { delegationFor } from './task-operations';
export async function publishVersion(
  c: PoolClient,
  w: any,
  definition: Definition,
  actor: string | null,
  note: string,
) {
  const [form] = (
    await c.query('SELECT version FROM form_templates WHERE id=$1', [w.form_template_id])
  ).rows;
  const [v] = (
    await c.query(
      `INSERT INTO workflow_versions(workflow_id,version,template_version,definition,published_by_assignment_id,change_note)
 VALUES($1,(SELECT COALESCE(max(version),0)+1 FROM workflow_versions WHERE workflow_id=$1),$2,$3,$4,$5) RETURNING *`,
      [w.id, form.version, JSON.stringify(definition), actor, note],
    )
  ).rows;
  await c.query(
    'UPDATE workflows SET published_version_id=$1,draft_definition=$2,draft_revision=draft_revision+1,updated_at=now() WHERE id=$3',
    [v.id, JSON.stringify(definition), w.id],
  );
  if (actor)
    await audit(c, actor, 'WORKFLOW_PUBLISHED', null, w.id, {
      version: v.version,
      changeNote: note,
    });
  return v;
}
export async function ensureVersion(c: PoolClient, w: any, actor: string) {
  if (w.published_version_id)
    return (await c.query('SELECT * FROM workflow_versions WHERE id=$1', [w.published_version_id]))
      .rows[0];
  return publishVersion(c, w, legacyDefinition(w), actor, 'Quy trình một bước khởi tạo cùng mẫu');
}
export function revision(actual: number, expected: any) {
  if (expected !== undefined && expected !== actual)
    throw new ConflictException({
      code: 'STALE_REVISION',
      message: 'Dữ liệu đã thay đổi. Tải lại để xem phiên bản mới trước khi thao tác.',
    });
}
@Injectable()
export class WorkflowsService {
  constructor(private db: Database) {}
  async list(a: Actor) {
    requirePermission(a, 'WORKFLOW_VIEW');
    return this.db.query(
      `SELECT w.*,f.name,f.code,f.status AS form_status,f.version AS template_version,v.version AS published_version,v.definition AS published_definition,p.name AS target_position_name FROM workflows w JOIN form_templates f ON f.id=w.form_template_id LEFT JOIN workflow_versions v ON v.id=w.published_version_id LEFT JOIN positions p ON p.id=w.target_position_id ORDER BY f.name`,
    );
  }
  async directory(a: Actor) {
    requirePermission(a, 'WORKFLOW_UPDATE');
    return this.db.transaction(async (c) => ({
      assignments: (await activeAssignments(c)).map((x) => ({
        id: x.id,
        user_id: x.user_id,
        full_name: x.full_name,
        unit_id: x.organizational_unit_id,
        position_id: x.position_id,
        position_name: x.position_name,
        unit_name: x.unit_name,
      })),
      positions: (
        await c.query("SELECT id,name FROM positions WHERE status='ACTIVE' ORDER BY name")
      ).rows,
      units: (
        await c.query(
          "SELECT id,name FROM organizational_units WHERE status='ACTIVE' ORDER BY name",
        )
      ).rows,
      roles: (await c.query('SELECT id,name FROM system_roles WHERE is_active ORDER BY name')).rows,
    }));
  }
  async detail(a: Actor, id: string) {
    requirePermission(a, 'WORKFLOW_VIEW');
    const [w] = await this.db.query(
      `SELECT w.*,f.name,f.code,f.status AS form_status,f.version AS template_version FROM workflows w JOIN form_templates f ON f.id=w.form_template_id WHERE w.id=$1`,
      [uuid(id)],
    );
    if (!w) throw new NotFoundException('Không tìm thấy quy trình.');
    return {
      ...w,
      fields: await this.db.query(
        'SELECT * FROM form_fields WHERE form_template_id=$1 ORDER BY sort_order',
        [w.form_template_id],
      ),
      versions: await this.versions(a, id),
    };
  }
  async versions(a: Actor, id: string) {
    requirePermission(a, 'WORKFLOW_VIEW');
    return this.db.query(
      `SELECT v.*,u.full_name AS publisher_name FROM workflow_versions v LEFT JOIN employee_assignments ea ON ea.id=v.published_by_assignment_id LEFT JOIN users u ON u.id=ea.user_id WHERE workflow_id=$1 ORDER BY version DESC`,
      [uuid(id)],
    );
  }
  private async lock(c: PoolClient, id: string) {
    const [w] = (await c.query('SELECT * FROM workflows WHERE id=$1 FOR UPDATE', [uuid(id)])).rows;
    if (!w) throw new NotFoundException('Không tìm thấy quy trình.');
    const [f] = (await c.query('SELECT * FROM form_templates WHERE id=$1', [w.form_template_id]))
      .rows;
    if (!['ACTIVE', 'INACTIVE'].includes(f.status))
      throw new ConflictException('Cần thẩm định mẫu trước khi cấu hình quy trình.');
    return w;
  }
  private async definition(c: PoolClient, w: any, body: any) {
    return validateDefinition(
      body.definition,
      (await c.query('SELECT * FROM form_fields WHERE form_template_id=$1', [w.form_template_id]))
        .rows,
    );
  }
  private async refs(c: PoolClient, d: Definition) {
    const active = await activeAssignments(c);
    for (const step of d.steps)
      if (
        step.sla?.escalationAssignmentId &&
        !active.some((a) => a.id === step.sla!.escalationAssignmentId)
      )
        throw new BadRequestException(`${step.name}: người nhận chuyển cấp không hoạt động.`);
    for (const step of d.steps)
      for (const selector of step.assignees)
        if (selector.type === 'ASSIGNMENT' && !active.some((a) => a.id === selector.assignmentId))
          throw new BadRequestException(`${step.name}: người được chỉ định không hoạt động.`);
    for (const s of d.steps)
      for (const x of s.assignees) {
        for (const [key, table, active] of [
          ['positionId', 'positions', "status='ACTIVE'"],
          ['unitId', 'organizational_units', "status='ACTIVE'"],
          [
            'assignmentId',
            'employee_assignments',
            'started_at<=now() AND (ended_at IS NULL OR ended_at>now())',
          ],
          ['roleId', 'system_roles', 'is_active'],
        ]) {
          const value = (x as any)[key];
          if (
            value &&
            !(await c.query(`SELECT 1 FROM ${table} WHERE id=$1 AND ${active}`, [value])).rowCount
          )
            throw new BadRequestException(
              `${s.name}: tham chiếu người/đơn vị/chức danh/vai trò không hoạt động.`,
            );
        }
      }
  }
  async save(a: Actor, id: string, b: any) {
    requirePermission(a, 'WORKFLOW_UPDATE');
    await this.db.transaction(async (c) => {
      const w = await this.lock(c, id);
      if (!Number.isInteger(b.expectedRevision))
        throw new BadRequestException('Cần expectedRevision để lưu nháp.');
      revision(w.draft_revision, b.expectedRevision);
      const d = await this.definition(c, w, b);
      await this.refs(c, d);
      await c.query(
        'UPDATE workflows SET draft_definition=$1,draft_revision=draft_revision+1,updated_at=now() WHERE id=$2',
        [JSON.stringify(d), id],
      );
      await audit(c, a.assignmentId, 'WORKFLOW_DRAFT_SAVED', null, id, {
        revision: w.draft_revision + 1,
      });
    });
    return this.detail(a, id);
  }
  async validate(a: Actor, id: string, b: any) {
    requirePermission(a, 'WORKFLOW_UPDATE');
    return this.db.transaction(async (c) => {
      const w = await this.lock(c, id),
        d = await this.definition(c, w, { definition: b.definition || w.draft_definition });
      await this.refs(c, d);
      return { valid: true, definition: d };
    });
  }
  async publish(a: Actor, id: string, b: any) {
    requirePermission(a, 'WORKFLOW_PUBLISH');
    await this.db.transaction(async (c) => {
      const w = await this.lock(c, id);
      if (!Number.isInteger(b.expectedRevision))
        throw new BadRequestException('Cần expectedRevision để ban hành.');
      revision(w.draft_revision, b.expectedRevision);
      const d = await this.definition(c, w, { definition: w.draft_definition });
      await this.refs(c, d);
      await publishVersion(c, w, d, a.assignmentId, str(b.changeNote, 'Ghi chú ban hành', 500));
    });
    return this.detail(a, id);
  }
  async status(a: Actor, id: string, b: any) {
    requirePermission(a, 'WORKFLOW_UPDATE');
    if (!['ACTIVE', 'INACTIVE'].includes(b.status))
      throw new BadRequestException('Trạng thái không hợp lệ.');
    await this.db.transaction(async (c) => {
      const w = await this.lock(c, id);
      await c.query('UPDATE workflows SET status=$1,updated_at=now() WHERE id=$2', [b.status, id]);
      await audit(c, a.assignmentId, 'WORKFLOW_STATUS_CHANGED', null, id, {
        previous: w.status,
        current: b.status,
      });
    });
    return this.detail(a, id);
  }
  async restore(a: Actor, id: string, b: any) {
    requirePermission(a, 'WORKFLOW_UPDATE');
    const [v] = await this.db.query(
      'SELECT definition FROM workflow_versions WHERE id=$1 AND workflow_id=$2',
      [uuid(b.sourceVersionId), uuid(id)],
    );
    if (!v) throw new NotFoundException('Phiên bản không thuộc quy trình.');
    return this.save(a, id, { definition: v.definition, expectedRevision: b.expectedRevision });
  }
  async simulate(a: Actor, id: string, b: any) {
    requirePermission(a, 'WORKFLOW_UPDATE');
    return this.db.transaction(async (c) => {
      const w = await this.lock(c, id),
        d = await this.definition(c, w, { definition: b.definition || w.draft_definition });
      const requester = (await activeAssignments(c)).find(
        (x) => x.id === uuid(b.requesterAssignmentId),
      );
      if (!requester) throw new BadRequestException('Người gửi không hoạt động.');
      const fields = (
        await c.query('SELECT * FROM form_fields WHERE form_template_id=$1', [w.form_template_id])
      ).rows;
      const data = validateData(b.formData, fields, false);
      const steps = [];
      for (const s of d.steps) {
        const condition = evaluate(s, data);
        let assignees: any[] = [],
          error: string | null = null;
        if (condition.matched)
          try {
            const original = await resolve(c, s, requester),
              active = await activeAssignments(c),
              reserved = new Set(original.map((x) => x.user_id));
            for (const person of original) {
              const delegation = await delegationFor(c, person.id),
                target =
                  delegation && active.find((x) => x.id === delegation.delegate_assignment_id);
              if (
                target &&
                !reserved.has(target.user_id) &&
                (await eligible(c, target, requester))
              ) {
                reserved.add(target.user_id);
                assignees.push({ ...assigneeSnapshot(target), delegatedFrom: person.full_name });
              } else
                assignees.push({
                  ...assigneeSnapshot(person),
                  ...(delegation
                    ? { delegationWarning: 'Ủy quyền không phù hợp, giữ người duyệt ban đầu.' }
                    : {}),
                });
            }
          } catch (e) {
            error = (e as Error).message;
          }
        steps.push({ ...s, condition, assignees, error });
      }
      return { simulation: true, valid: steps.every((s) => !s.error), steps };
    });
  }
}
