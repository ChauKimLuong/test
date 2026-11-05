import { BadRequestException, ConflictException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { str, uuid, integer } from './security';
export type Selector = {
  type: string;
  level?: number;
  positionId?: string;
  assignmentId?: string;
  roleId?: string;
  unitId?: string;
};
export type Condition = { field: string; operator: string; value?: any };
export type WorkflowStep = {
  id: string;
  name: string;
  mode: 'ALL' | 'ANY';
  assignees: Selector[];
  sla?: { minutes: number; remindBeforeMinutes: number; escalationAssignmentId?: string };
  when?: { mode: 'ALL' | 'ANY'; conditions: Condition[] };
};
export type Definition = { schemaVersion: 1; steps: WorkflowStep[] };
export function validateDefinition(input: any, fields: any[]): Definition {
  const fail = (message: string): never => {
    throw new BadRequestException({ code: 'INVALID_DEFINITION', message });
  };
  if (
    !input ||
    input.schemaVersion !== 1 ||
    !Array.isArray(input.steps) ||
    input.steps.length < 1 ||
    input.steps.length > 30
  )
    fail('Quy trình cần 1–30 bước và schemaVersion = 1.');
  const ids = new Set();
  const steps = input.steps.map((s: any, index: number) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) fail('Cấu hình bước không hợp lệ.');
    const id = str(s.id, 'ID bước', 80),
      name = str(s.name, 'Tên bước', 150);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
      fail(`Bước ${index + 1}: ID không hợp lệ hoặc trùng.`);
    ids.add(id);
    if (
      !['ALL', 'ANY'].includes(s.mode) ||
      !Array.isArray(s.assignees) ||
      !s.assignees.length ||
      s.assignees.length > 12
    )
      fail(`Bước ${index + 1}: chọn ALL/ANY và 1–12 quy tắc người duyệt.`);
    const assignees = s.assignees.map((a: any) => {
      if (
        !a ||
        ![
          'DIRECT_MANAGER',
          'MANAGER_LEVEL',
          'POSITION',
          'ASSIGNMENT',
          'ROLE',
          'UNIT_HEAD',
        ].includes(a.type)
      )
        fail(`Bước ${index + 1}: loại người duyệt không hợp lệ.`);
      const x: Selector = { type: a.type };
      if (a.type === 'MANAGER_LEVEL') x.level = integer(a.level, 1, 20, 'Cấp quản lý');
      if (a.type === 'POSITION') x.positionId = uuid(a.positionId);
      if (a.type === 'ASSIGNMENT') x.assignmentId = uuid(a.assignmentId);
      if (a.type === 'ROLE') x.roleId = uuid(a.roleId);
      if (a.unitId) x.unitId = uuid(a.unitId);
      return x;
    });
    let when: WorkflowStep['when'];
    if (s.when) {
      if (index === 0) fail('Bước đầu phải luôn chạy để có người duyệt độc lập.');
      if (
        !['ALL', 'ANY'].includes(s.when.mode) ||
        !Array.isArray(s.when.conditions) ||
        !s.when.conditions.length ||
        s.when.conditions.length > 20
      )
        fail(`Bước ${index + 1}: nhóm điều kiện cần 1–20 điều kiện.`);
      const conditions = s.when.conditions.map((r: any) => {
        if (!r || typeof r !== 'object' || Array.isArray(r)) fail('Điều kiện không hợp lệ.');
        const f = fields.find((f) => f.key === r.field && f.type !== 'SECTION');
        if (!f) fail(`Bước ${index + 1}: trường ${r.field} không thuộc phiên bản mẫu.`);
        const empty = ['IS_EMPTY', 'IS_NOT_EMPTY'].includes(r.operator);
        const ops =
          f.type === 'CHECKBOX'
            ? ['EQ']
            : ['NUMBER', 'DATE'].includes(f.type)
              ? ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE']
              : ['EQ', 'NE', 'IN'];
        if (!empty && !ops.includes(r.operator))
          fail(`Bước ${index + 1}: toán tử không phù hợp trường ${f.label}.`);
        const values = r.operator === 'IN' ? r.value : [r.value];
        if (!empty && (!Array.isArray(values) || !values.length || values.length > 50))
          fail('Điều kiện IN cần danh sách 1–50 giá trị.');
        if (!empty)
          for (const v of values) {
            const valid =
              f.type === 'NUMBER'
                ? typeof v === 'number' && Number.isFinite(v)
                : f.type === 'CHECKBOX'
                  ? typeof v === 'boolean'
                  : typeof v === 'string' && v.length <= 500;
            if (!valid) fail(`Giá trị điều kiện ${f.label} sai kiểu.`);
            if (
              f.type === 'DATE' &&
              (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
                Number.isNaN(Date.parse(v)) ||
                new Date(v).toISOString().slice(0, 10) !== v)
            )
              fail('Ngày điều kiện không hợp lệ.');
            if (f.type === 'SELECT' && !f.options.includes(v))
              fail('Giá trị điều kiện không có trong danh sách chọn.');
          }
        return { field: f.key, operator: r.operator, ...(!empty ? { value: r.value } : {}) };
      });
      when = { mode: s.when.mode, conditions };
    }
    let sla: WorkflowStep['sla'];
    if (s.sla) {
      const minutes = integer(s.sla.minutes, 1, 43200, 'Thời hạn (phút)');
      const remindBeforeMinutes = integer(
        s.sla.remindBeforeMinutes,
        0,
        minutes,
        'Nhắc trước hạn (phút)',
      );
      sla = {
        minutes,
        remindBeforeMinutes,
        ...(s.sla.escalationAssignmentId
          ? { escalationAssignmentId: uuid(s.sla.escalationAssignmentId) }
          : {}),
      };
    }
    return {
      id,
      name,
      mode: s.mode,
      assignees,
      ...(when ? { when } : {}),
      ...(sla ? { sla } : {}),
    };
  });
  return { schemaVersion: 1, steps };
}
export function evaluate(step: WorkflowStep, data: Record<string, any>) {
  const conditions = (step.when?.conditions || []).map((r) => {
    const v = data[r.field],
      empty = v === undefined || v === null || (typeof v === 'string' && !v.trim());
    let matched = false;
    if (r.operator === 'IS_EMPTY') matched = empty;
    else if (r.operator === 'IS_NOT_EMPTY') matched = !empty;
    else if (!empty) {
      switch (r.operator) {
        case 'EQ':
          matched = v === r.value;
          break;
        case 'NE':
          matched = v !== r.value;
          break;
        case 'GT':
          matched = v > r.value;
          break;
        case 'GTE':
          matched = v >= r.value;
          break;
        case 'LT':
          matched = v < r.value;
          break;
        case 'LTE':
          matched = v <= r.value;
          break;
        case 'IN':
          matched = r.value.includes(v);
          break;
      }
    }
    return { ...r, actual: v ?? null, matched };
  });
  return {
    matched:
      !step.when ||
      (step.when.mode === 'ALL'
        ? conditions.every((r) => r.matched)
        : conditions.some((r) => r.matched)),
    mode: step.when?.mode || 'ALWAYS',
    conditions,
  };
}
export async function activeAssignments(c: PoolClient) {
  return (
    await c.query(`SELECT a.*,u.full_name,p.name AS position_name,ou.name AS unit_name FROM employee_assignments a
 JOIN users u ON u.id=a.user_id AND u.status='ACTIVE' JOIN positions p ON p.id=a.position_id AND p.status='ACTIVE'
 JOIN organizational_units ou ON ou.id=a.organizational_unit_id AND ou.status='ACTIVE'
 WHERE a.started_at<=now() AND (a.ended_at IS NULL OR a.ended_at>now()) ORDER BY u.full_name,a.id`)
  ).rows;
}
export async function eligible(
  c: PoolClient,
  a: any,
  requester: any,
  permissions = ['REQUEST_APPROVE', 'REQUEST_REJECT'],
) {
  if (a.user_id === requester.user_id) return false;
  const within = !!(
    await c.query(
      `WITH RECURSIVE chain AS (SELECT id,parent_id FROM organizational_units WHERE id=$1 UNION SELECT ou.id,ou.parent_id FROM organizational_units ou JOIN chain ch ON ch.parent_id=ou.id) SELECT 1 FROM chain WHERE id=$2`,
      [requester.organizational_unit_id, a.organizational_unit_id],
    )
  ).rowCount;
  const grants = (
    await c.query(
      `SELECT p.code,ra.scope_type FROM role_assignments ra JOIN system_roles sr ON sr.id=ra.system_role_id AND sr.is_active JOIN role_permissions rp ON rp.system_role_id=sr.id JOIN permissions p ON p.id=rp.permission_id WHERE ra.employee_assignment_id=$1 AND ra.revoked_at IS NULL AND ra.valid_from<=now() AND (ra.valid_until IS NULL OR ra.valid_until>now())`,
      [a.id],
    )
  ).rows;
  return permissions.every((p) =>
    grants.some((g) => g.code === p && (g.scope_type === 'ORGANIZATION' || within)),
  );
}
export async function resolve(c: PoolClient, step: WorkflowStep, requester: any) {
  const assignments = await activeAssignments(c),
    result = new Map<string, any>();
  for (const s of step.assignees) {
    let candidates: any[] = [];
    if (s.type === 'DIRECT_MANAGER' || s.type === 'MANAGER_LEVEL') {
      let manager = requester,
        seen = new Set([requester.id]);
      for (let i = 0; i < (s.level || 1); i++) {
        manager = assignments.find((a) => a.id === manager?.manager_assignment_id);
        if (!manager || seen.has(manager.id)) {
          manager = null;
          break;
        }
        seen.add(manager.id);
      }
      candidates = manager ? [manager] : [];
    } else if (s.type === 'POSITION')
      candidates = assignments.filter((a) => a.position_id === s.positionId);
    else if (s.type === 'ASSIGNMENT')
      candidates = assignments.filter((a) => a.id === s.assignmentId);
    else if (s.type === 'ROLE') {
      const ids = (
        await c.query(
          `SELECT ra.employee_assignment_id FROM role_assignments ra JOIN system_roles sr ON sr.id=ra.system_role_id AND sr.is_active WHERE ra.system_role_id=$1 AND ra.revoked_at IS NULL AND ra.valid_from<=now() AND (ra.valid_until IS NULL OR ra.valid_until>now())`,
          [s.roleId],
        )
      ).rows;
      candidates = assignments.filter((a) => ids.some((r) => r.employee_assignment_id === a.id));
    } else {
      let unit = s.unitId || requester.organizational_unit_id,
        seen = new Set();
      while (unit && !seen.has(unit)) {
        seen.add(unit);
        candidates = assignments.filter((a) => a.organizational_unit_id === unit && a.is_unit_head);
        if (candidates.length || s.unitId) break;
        unit = (await c.query('SELECT parent_id FROM organizational_units WHERE id=$1', [unit]))
          .rows[0]?.parent_id;
      }
    }
    if (s.unitId) candidates = candidates.filter((a) => a.organizational_unit_id === s.unitId);
    const valid = [];
    for (const a of candidates) if (await eligible(c, a, requester)) valid.push(a);
    if (!valid.length)
      throw new ConflictException({
        code: 'APPROVER_NOT_FOUND',
        message: `${step.name}: chưa tìm thấy người duyệt độc lập có đủ quyền (${s.type}).`,
      });
    if (s.type !== 'ROLE' && valid.length !== 1)
      throw new ConflictException({
        code: 'AMBIGUOUS_APPROVER',
        message: `${step.name}: có nhiều người phù hợp. Hãy chọn thêm đơn vị hoặc phân công cụ thể.`,
      });
    for (const a of valid) {
      if (result.has(a.user_id) && result.get(a.user_id).id !== a.id)
        throw new ConflictException(
          'Một người có nhiều phân công trong cùng bước. Chọn rõ một phân công.',
        );
      result.set(a.user_id, a);
    }
  }
  if (result.size > 50) throw new ConflictException('Bước vượt giới hạn 50 người duyệt.');
  return [...result.values()];
}
export const assigneeSnapshot = (a: any) => ({
  name: a.full_name,
  position: a.position_name,
  unit: a.unit_name,
  userId: a.user_id,
  assignmentId: a.id,
});
export function legacyDefinition(w: any): Definition {
  return {
    schemaVersion: 1,
    steps: [
      {
        id: 'legacy-approval',
        name: 'Phê duyệt yêu cầu',
        mode: 'ALL',
        assignees: [
          w.approver_type === 'POSITION'
            ? { type: 'POSITION', positionId: w.target_position_id }
            : { type: 'DIRECT_MANAGER' },
        ],
      },
    ],
  };
}
