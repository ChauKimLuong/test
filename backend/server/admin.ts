import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Database } from './db';
import {
  Actor,
  can,
  requirePermission,
  str,
  choice,
  uuid,
  integer,
  bool,
  hashPassword,
} from './security';
@Injectable()
export class AdminService {
  constructor(private db: Database) {}
  async directory(a: Actor) {
    const permissions = ['ORGANIZATION_VIEW', 'USER_VIEW', 'ROLE_ASSIGN', 'WORKFLOW_VIEW'];
    if (!permissions.some((p) => can(a, p, a.unitId)))
      throw new ForbiddenException('Bạn không có quyền xem danh mục tổ chức.');
    const organizationWide = permissions.some((p) => can(a, p));
    const units = await this.db.query(
      'SELECT * FROM organizational_units WHERE $1::boolean OR id=$2 ORDER BY code',
      [organizationWide, a.unitId],
    );
    const positions = await this.db.query('SELECT * FROM positions ORDER BY rank_level DESC,name');
    return { units, positions };
  }
  async people(a: Actor) {
    requirePermission(a, 'USER_VIEW');
    return this.db.query(`SELECT u.id,u.full_name,u.email,u.status,u.last_login_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'unit_id',a.organizational_unit_id,'unit_name',ou.name,'position_id',a.position_id,'position_name',p.name,'manager_assignment_id',a.manager_assignment_id,'manager_name',mu.full_name,'type',a.type,'is_primary',a.is_primary,'started_at',a.started_at,'ended_at',a.ended_at,'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ra.id,'code',sr.code,'name',sr.name,'scope_type',ra.scope_type,'valid_from',ra.valid_from,'valid_until',ra.valid_until,'revoked_at',ra.revoked_at)) FROM role_assignments ra JOIN system_roles sr ON sr.id=ra.system_role_id WHERE ra.employee_assignment_id=a.id),'[]'))) FROM employee_assignments a JOIN organizational_units ou ON ou.id=a.organizational_unit_id JOIN positions p ON p.id=a.position_id LEFT JOIN employee_assignments ma ON ma.id=a.manager_assignment_id LEFT JOIN users mu ON mu.id=ma.user_id WHERE a.user_id=u.id),'[]') AS assignments FROM users u ORDER BY u.full_name`);
  }
  async user(a: Actor, b: any) {
    requirePermission(a, 'USER_MANAGE');
    const email = str(b.email, 'Email', 200).toLowerCase(),
      name = str(b.fullName, 'Họ tên', 150),
      password = str(b.password, 'Mật khẩu', 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10)
      throw new BadRequestException('Email không hợp lệ hoặc mật khẩu ngắn hơn 10 ký tự.');
    const u = await this.db.prisma.users.create({
      data: {
        full_name: name,
        email,
        password_hash: await hashPassword(password),
        status: 'INACTIVE',
      },
    });
    return { id: u.id, full_name: u.full_name, email: u.email, status: u.status };
  }
  async userStatus(a: Actor, id: string, b: any) {
    requirePermission(a, 'USER_MANAGE');
    uuid(id);
    const status = choice(b.status, ['ACTIVE', 'INACTIVE', 'LOCKED'], 'Trạng thái');
    if (id === a.userId && status !== 'ACTIVE')
      throw new ConflictException('Không thể khóa tài khoản đang sử dụng.');
    if (
      status !== 'ACTIVE' &&
      (
        await this.db.query(
          "SELECT 1 FROM form_templates f JOIN employee_assignments ea ON ea.id=f.reviewer_assignment_id WHERE ea.user_id=$1 AND f.status='PENDING_REVIEW' LIMIT 1",
          [id],
        )
      ).length
    )
      throw new ConflictException('Cần xử lý hết mẫu chờ thẩm định trước khi khóa tài khoản.');
    if (
      status !== 'ACTIVE' &&
      (
        await this.db.query(
          "SELECT 1 FROM approval_tasks t JOIN employee_assignments ea ON ea.id=t.assignee_assignment_id WHERE ea.user_id=$1 AND t.status='PENDING' LIMIT 1",
          [id],
        )
      ).length
    )
      throw new ConflictException('Cần xử lý hết nhiệm vụ duyệt trước khi khóa tài khoản.');
    if (status === 'ACTIVE') {
      const [ready] = await this.db.query(
        `SELECT EXISTS(SELECT 1 FROM employee_assignments a JOIN role_assignments ra ON ra.employee_assignment_id=a.id AND ra.revoked_at IS NULL AND ra.valid_from<=now() AND (ra.valid_until IS NULL OR ra.valid_until>now()) JOIN system_roles sr ON sr.id=ra.system_role_id AND sr.is_active JOIN positions p ON p.id=a.position_id AND p.status='ACTIVE' JOIN organizational_units ou ON ou.id=a.organizational_unit_id AND ou.status='ACTIVE' WHERE a.user_id=$1 AND a.started_at<=now() AND (a.ended_at IS NULL OR a.ended_at>now())) AS ready`,
        [id],
      );
      if (!ready?.ready)
        throw new ConflictException(
          'Cần phân công và cấp ít nhất một vai trò trước khi kích hoạt.',
        );
    }
    if (!(await this.db.prisma.users.findUnique({ where: { id } }))) throw new NotFoundException();
    await this.db.prisma.users.update({ where: { id }, data: { status } });
    if (status !== 'ACTIVE') await this.db.query('DELETE FROM sessions WHERE user_id=$1', [id]);
    return { ok: true };
  }
  async unit(a: Actor, b: any, id?: string) {
    requirePermission(a, 'ORGANIZATION_MANAGE');
    const code = str(b.code, 'Mã đơn vị', 30).toUpperCase(),
      name = str(b.name, 'Tên đơn vị', 150),
      type = choice(b.type, ['COMPANY', 'DIVISION', 'DEPARTMENT', 'TEAM'], 'Loại đơn vị'),
      status = choice(b.status ?? 'ACTIVE', ['ACTIVE', 'INACTIVE'], 'Trạng thái'),
      parent = b.parentId ? uuid(b.parentId) : null;
    return this.db.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(7364522)');
      const expectedParent: Record<string, string[]> = {
        COMPANY: [],
        DIVISION: ['COMPANY'],
        DEPARTMENT: ['COMPANY', 'DIVISION'],
        TEAM: ['DEPARTMENT'],
      };
      if (type === 'COMPANY') {
        if (parent) throw new BadRequestException('Công ty không có đơn vị cấp trên.');
        if (
          !id &&
          (await c.query("SELECT 1 FROM organizational_units WHERE type='COMPANY' LIMIT 1"))
            .rowCount
        )
          throw new ConflictException('Doanh nghiệp đã có đơn vị công ty.');
      } else {
        const [p] = parent
          ? (await c.query('SELECT type,status FROM organizational_units WHERE id=$1', [parent]))
              .rows
          : [];
        if (!p || p.status !== 'ACTIVE' || !expectedParent[type].includes(p.type))
          throw new BadRequestException('Đơn vị cấp trên không phù hợp với cấp tổ chức đã chọn.');
      }
      if (id) {
        uuid(id);
        const exists = (await c.query('SELECT 1 FROM organizational_units WHERE id=$1', [id]))
          .rowCount;
        if (!exists) throw new NotFoundException();
        if (
          (await c.query('SELECT 1 FROM organizational_units WHERE parent_id=$1 LIMIT 1', [id]))
            .rowCount
        ) {
          const [old] = (await c.query('SELECT type FROM organizational_units WHERE id=$1', [id]))
            .rows;
          if (old.type !== type)
            throw new ConflictException('Không thể đổi loại đơn vị đang có cấp dưới.');
        }
        if (parent) {
          const cycle = (
            await c.query(
              'WITH RECURSIVE children AS (SELECT id FROM organizational_units WHERE id=$1 UNION ALL SELECT u.id FROM organizational_units u JOIN children c ON u.parent_id=c.id) SELECT 1 FROM children WHERE id=$2',
              [id, parent],
            )
          ).rowCount;
          if (cycle) throw new BadRequestException('Không thể tạo vòng lặp trong cơ cấu tổ chức.');
        }
        if (
          status === 'INACTIVE' &&
          (
            await c.query(
              'SELECT 1 FROM employee_assignments WHERE organizational_unit_id=$1 AND (ended_at IS NULL OR ended_at>now()) LIMIT 1',
              [id],
            )
          ).rowCount
        )
          throw new ConflictException('Đơn vị còn phân công đang hoạt động.');
        return (
          await c.query(
            'UPDATE organizational_units SET code=$1,name=$2,type=$3,status=$4,parent_id=$5 WHERE id=$6 RETURNING *',
            [code, name, type, status, parent, id],
          )
        ).rows[0];
      }
      return (
        await c.query(
          'INSERT INTO organizational_units(code,name,type,status,parent_id) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [code, name, type, status, parent],
        )
      ).rows[0];
    });
  }
  async position(a: Actor, b: any, id?: string) {
    requirePermission(a, 'ORGANIZATION_MANAGE');
    const code = str(b.code, 'Mã chức danh', 30).toUpperCase(),
      name = str(b.name, 'Tên chức danh', 150),
      type = choice(b.type, ['EXECUTIVE', 'MANAGEMENT', 'STAFF'], 'Loại chức danh'),
      rank = integer(b.rankLevel, 0, 100, 'Cấp bậc'),
      status = choice(b.status ?? 'ACTIVE', ['ACTIVE', 'INACTIVE'], 'Trạng thái');
    if (id) {
      uuid(id);
      if (
        status === 'INACTIVE' &&
        (
          await this.db.query(
            'SELECT 1 FROM employee_assignments WHERE position_id=$1 AND (ended_at IS NULL OR ended_at>now()) LIMIT 1',
            [id],
          )
        ).length
      )
        throw new ConflictException('Chức danh còn phân công đang hoạt động.');
      const [row] = await this.db.query(
        'UPDATE positions SET code=$1,name=$2,type=$3,rank_level=$4,status=$5 WHERE id=$6 RETURNING *',
        [code, name, type, rank, status, id],
      );
      if (!row) throw new NotFoundException();
      return row;
    }
    return (
      await this.db.query(
        'INSERT INTO positions(code,name,type,rank_level,status) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [code, name, type, rank, status],
      )
    )[0];
  }
  async assignment(a: Actor, b: any) {
    requirePermission(a, 'USER_MANAGE');
    const user = uuid(b.userId),
      unit = uuid(b.unitId),
      position = uuid(b.positionId),
      manager = b.managerAssignmentId ? uuid(b.managerAssignmentId) : null,
      primary = bool(b.isPrimary ?? true, 'Phân công chính'),
      head = bool(b.isUnitHead ?? false, 'Trưởng đơn vị'),
      type = choice(b.type ?? 'REGULAR', ['REGULAR', 'ACTING', 'SECONDMENT'], 'Loại phân công');
    return this.db.transaction(async (c) => {
      if (
        !(
          await c.query(
            "SELECT 1 FROM users WHERE id=$1 AND status IN ('ACTIVE','INACTIVE') FOR UPDATE",
            [user],
          )
        ).rowCount
      )
        throw new BadRequestException('Nhân sự chưa hoạt động.');
      if (
        !(
          await c.query("SELECT 1 FROM organizational_units WHERE id=$1 AND status='ACTIVE'", [
            unit,
          ])
        ).rowCount ||
        !(await c.query("SELECT 1 FROM positions WHERE id=$1 AND status='ACTIVE'", [position]))
          .rowCount
      )
        throw new BadRequestException('Đơn vị hoặc chức danh chưa hoạt động.');
      if (manager) {
        const [m] = (
          await c.query(
            'SELECT * FROM employee_assignments WHERE id=$1 AND started_at<=now() AND (ended_at IS NULL OR ended_at>now())',
            [manager],
          )
        ).rows;
        if (!m || m.user_id === user)
          throw new BadRequestException('Quản lý trực tiếp không hợp lệ.');
      }
      if (
        primary &&
        (
          await c.query(
            'SELECT 1 FROM employee_assignments WHERE user_id=$1 AND is_primary AND ended_at IS NULL',
            [user],
          )
        ).rowCount
      )
        throw new ConflictException(
          'Nhân sự đã có phân công chính. Hãy kết thúc phân công cũ hoặc tạo phân công kiêm nhiệm.',
        );
      const assignment = (
        await c.query(
          'INSERT INTO employee_assignments(user_id,organizational_unit_id,position_id,manager_assignment_id,is_primary,is_unit_head,type) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [user, unit, position, manager, primary, head, type],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO role_assignments(employee_assignment_id,system_role_id,scope_type) SELECT $1,id,'ORGANIZATIONAL_UNIT' FROM system_roles WHERE code='MEMBER'",
        [assignment.id],
      );
      return assignment;
    });
  }
  async endAssignment(a: Actor, id: string) {
    requirePermission(a, 'USER_MANAGE');
    uuid(id);
    if (id === a.assignmentId)
      throw new ConflictException('Không thể kết thúc phân công đang sử dụng.');
    return this.db.transaction(async (c) => {
      const [ea] = (
        await c.query('SELECT * FROM employee_assignments WHERE id=$1 FOR UPDATE', [id])
      ).rows;
      if (!ea) throw new NotFoundException();
      if (ea.ended_at) throw new ConflictException('Phân công đã kết thúc.');
      if (
        (
          await c.query(
            "SELECT 1 FROM form_templates WHERE reviewer_assignment_id=$1 AND status='PENDING_REVIEW' LIMIT 1",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException(
          'Cần xử lý hết mẫu chờ thẩm định trước khi kết thúc phân công.',
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM approval_tasks WHERE assignee_assignment_id=$1 AND status='PENDING' LIMIT 1",
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Cần xử lý hết đơn chờ duyệt trước khi kết thúc phân công.');
      if (
        (
          await c.query(
            'SELECT 1 FROM employee_assignments WHERE manager_assignment_id=$1 AND (ended_at IS NULL OR ended_at>now()) LIMIT 1',
            [id],
          )
        ).rowCount
      )
        throw new ConflictException('Phân công này còn nhân sự trực thuộc.');
      await c.query('UPDATE employee_assignments SET ended_at=now() WHERE id=$1', [id]);
      await c.query(
        'UPDATE role_assignments SET revoked_at=now() WHERE employee_assignment_id=$1 AND revoked_at IS NULL',
        [id],
      );
      await c.query('DELETE FROM sessions WHERE assignment_id=$1', [id]);
      return { ok: true };
    });
  }
  async roles(a: Actor) {
    requirePermission(a, 'ROLE_ASSIGN');
    return this.db.query(
      `SELECT sr.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('code',p.code,'name',p.name)) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.system_role_id=sr.id),'[]') AS permissions FROM system_roles sr ORDER BY sr.code`,
    );
  }
  async grant(a: Actor, b: any) {
    requirePermission(a, 'ROLE_ASSIGN');
    const assignment = uuid(b.assignmentId),
      role = uuid(b.roleId),
      scope = choice(b.scopeType, ['ORGANIZATION', 'ORGANIZATIONAL_UNIT'], 'Phạm vi');
    const until = b.validUntil ? new Date(b.validUntil) : null;
    if (until && (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()))
      throw new BadRequestException('Ngày hết hạn phải ở tương lai.');
    if (
      !(
        await this.db.query(
          'SELECT 1 FROM employee_assignments WHERE id=$1 AND started_at<=now() AND (ended_at IS NULL OR ended_at>now())',
          [assignment],
        )
      ).length
    )
      throw new BadRequestException('Phân công không hoạt động.');
    const [r] = await this.db.query('SELECT * FROM system_roles WHERE id=$1 AND is_active', [role]);
    if (!r) throw new BadRequestException('Vai trò không hoạt động.');
    if (
      ['SYSTEM_ADMIN', 'WORKFLOW_MANAGER', 'FORM_PUBLISHER'].includes(r.code) &&
      scope !== 'ORGANIZATION'
    )
      throw new BadRequestException('Vai trò quản trị cần phạm vi toàn tổ chức.');
    return this.db.transaction(async (c) => {
      await c.query('SELECT id FROM employee_assignments WHERE id=$1 FOR UPDATE', [assignment]);
      await c.query(
        'UPDATE role_assignments SET revoked_at=now() WHERE employee_assignment_id=$1 AND system_role_id=$2 AND revoked_at IS NULL AND valid_until<=now()',
        [assignment, role],
      );
      return (
        await c.query(
          'INSERT INTO role_assignments(employee_assignment_id,system_role_id,scope_type,valid_until) VALUES($1,$2,$3,$4) RETURNING *',
          [assignment, role, scope, until],
        )
      ).rows[0];
    });
  }
  async revoke(a: Actor, id: string) {
    requirePermission(a, 'ROLE_ASSIGN');
    uuid(id);
    const [ra] = await this.db.query(
      'SELECT ra.*,sr.code FROM role_assignments ra JOIN system_roles sr ON sr.id=ra.system_role_id WHERE ra.id=$1',
      [id],
    );
    if (!ra) throw new NotFoundException();
    if (ra.employee_assignment_id === a.assignmentId && ra.code === 'SYSTEM_ADMIN')
      throw new ConflictException('Không thể thu hồi quyền quản trị đang sử dụng.');
    if (
      (
        await this.db.query(
          "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.system_role_id=$1 AND p.code='FORM_REVIEW'",
          [ra.system_role_id],
        )
      ).length &&
      (
        await this.db.query(
          "SELECT 1 FROM form_templates WHERE reviewer_assignment_id=$1 AND status='PENDING_REVIEW' LIMIT 1",
          [ra.employee_assignment_id],
        )
      ).length
    )
      throw new ConflictException('Người này còn mẫu chờ thẩm định.');
    if (
      (
        await this.db.query(
          "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.system_role_id=$1 AND p.code IN ('REQUEST_APPROVE','REQUEST_REJECT','REQUEST_RETURN') LIMIT 1",
          [ra.system_role_id],
        )
      ).length > 0 &&
      (
        await this.db.query(
          "SELECT 1 FROM approval_tasks WHERE assignee_assignment_id=$1 AND status='PENDING' LIMIT 1",
          [ra.employee_assignment_id],
        )
      ).length
    )
      throw new ConflictException('Người này còn yêu cầu chờ duyệt.');
    await this.db.query(
      'UPDATE role_assignments SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',
      [id],
    );
    return { ok: true };
  }
  async audit(a: Actor, q: any) {
    if (!can(a, 'AUDIT_VIEW', a.unitId))
      throw new ForbiddenException('Bạn không có quyền xem nhật ký.');
    const params: unknown[] = [can(a, 'AUDIT_VIEW'), a.unitId];
    const where = ['($1::boolean OR ea.organizational_unit_id=$2 AND l.request_id IS NOT NULL)'];
    if (q.event) {
      params.push(String(q.event).slice(0, 60));
      where.push('l.event_type=$' + params.length);
    }
    if (q.search) {
      params.push('%' + String(q.search).slice(0, 100) + '%');
      where.push(
        `(u.full_name ILIKE $${params.length} OR r.request_code ILIKE $${params.length} OR COALESCE(r.template_snapshot->>'name',f.name) ILIKE $${params.length})`,
      );
    }
    const base = `FROM audit_logs l JOIN employee_assignments actor ON actor.id=l.actor_assignment_id JOIN users u ON u.id=actor.user_id LEFT JOIN requests r ON r.id=l.request_id LEFT JOIN employee_assignments ea ON ea.id=r.requester_assignment_id LEFT JOIN workflows w ON w.id=COALESCE(l.workflow_id,r.workflow_id) LEFT JOIN form_templates f ON f.id=w.form_template_id WHERE ${where.join(' AND ')}`;
    const page = Math.max(1, Number.parseInt(q.page) || 1);
    const total = (await this.db.query('SELECT count(*)::int AS count ' + base, params))[0].count;
    const items = await this.db.query(
      "SELECT l.*,u.full_name AS actor_name,r.request_code,COALESCE(r.template_snapshot->>'name',f.name) AS form_name " +
        base +
        ` ORDER BY l.occurred_at DESC,l.id LIMIT 30 OFFSET ${(page - 1) * 30}`,
      params,
    );
    return { items, total, page, pageSize: 30 };
  }
  async notifications(a: Actor) {
    return this.db.query(
      'SELECT * FROM notifications WHERE recipient_assignment_id=$1 ORDER BY created_at DESC LIMIT 100',
      [a.assignmentId],
    );
  }
  async read(a: Actor, id: string) {
    if (id === 'all')
      await this.db.query(
        'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE recipient_assignment_id=$1',
        [a.assignmentId],
      );
    else
      await this.db.query(
        'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_assignment_id=$2',
        [uuid(id), a.assignmentId],
      );
    return { ok: true };
  }
}
