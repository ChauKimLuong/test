import { PoolClient } from 'pg';
import { hashPassword } from './security';
export async function seed(c: PoolClient) {
  if ((await c.query('SELECT 1 FROM users LIMIT 1')).rowCount) return;
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 10)
    throw new Error('Set DEMO_PASSWORD (at least 10 characters) to seed demo accounts.');
  const hash = await hashPassword(password);
  const unit = async (code: string, name: string, type: string, parent: string | null = null) =>
    (
      await c.query(
        'INSERT INTO organizational_units(code,name,type,parent_id) VALUES($1,$2,$3,$4) RETURNING id',
        [code, name, type, parent],
      )
    ).rows[0].id;
  const company = await unit('FP', 'FlowPilot Corporation', 'COMPANY');
  const product = await unit('PRODUCT', 'Phòng Sản phẩm', 'DEPARTMENT', company);
  const sales = await unit('SALES', 'Phòng Kinh doanh', 'DEPARTMENT', company);
  const productTeam = await unit('PRODUCT_TEAM', 'Nhóm phát triển sản phẩm', 'TEAM', product);
  const salesTeam = await unit('SALES_TEAM', 'Nhóm khách hàng', 'TEAM', sales);
  const pos = async (code: string, name: string, type: string, rank: number) =>
    (
      await c.query(
        'INSERT INTO positions(code,name,type,rank_level) VALUES($1,$2,$3,$4) RETURNING id',
        [code, name, type, rank],
      )
    ).rows[0].id;
  const staff = await pos('SPECIALIST', 'Chuyên viên', 'STAFF', 1);
  const manager = await pos('HEAD', 'Trưởng phòng', 'MANAGEMENT', 3);
  const ceoPos = await pos('CEO', 'Tổng giám đốc', 'EXECUTIVE', 7);
  const cdoPos = await pos('CDO', 'Giám đốc Chuyển đổi số', 'EXECUTIVE', 6);
  const user = async (name: string, email: string, u: string, p: string, m: string | null = null) =>
    (
      await c.query(
        'INSERT INTO employee_assignments(user_id,organizational_unit_id,position_id,manager_assignment_id,is_unit_head) VALUES($5,$1,$2,$3,$4) RETURNING id',
        [
          u,
          p,
          m,
          p === manager || p === ceoPos || p === cdoPos,
          (
            await c.query(
              'INSERT INTO users(full_name,email,password_hash) VALUES($1,$2,$3) RETURNING id',
              [name, email, hash],
            )
          ).rows[0].id,
        ],
      )
    ).rows[0].id;
  const ceo = await user('Trần Đức An', 'ceo@flowpilot.vn', company, ceoPos);
  const cdo = await user('Lê Mai Anh', 'cdo@flowpilot.vn', company, cdoPos, ceo);
  const linh = await user('Nguyễn Thu Linh', 'linh@flowpilot.vn', product, manager, cdo);
  const hoang = await user('Phạm Quốc Hoàng', 'hoang@flowpilot.vn', sales, manager, ceo);
  const huy = await user('Trần Minh Huy', 'huy@flowpilot.vn', productTeam, staff, linh);
  const mai = await user('Đỗ Ngọc Mai', 'mai@flowpilot.vn', productTeam, staff, linh);
  const minh = await user('Vũ Quốc Minh', 'minh@flowpilot.vn', salesTeam, staff, hoang);
  const thao = await user('Bùi Thu Thảo', 'thao@flowpilot.vn', salesTeam, staff, hoang);
  const permissions: Record<string, string> = {
    USER_VIEW: 'Xem nhân sự',
    USER_MANAGE: 'Quản lý nhân sự',
    ORGANIZATION_VIEW: 'Xem tổ chức',
    ORGANIZATION_MANAGE: 'Quản lý tổ chức',
    ROLE_ASSIGN: 'Cấp vai trò',
    FORM_VIEW: 'Xem biểu mẫu',
    FORM_MANAGE: 'Quản lý trạng thái biểu mẫu',
    FORM_CREATE: 'Thiết kế và gửi biểu mẫu',
    FORM_REVIEW: 'Thẩm định và lưu biểu mẫu',
    WORKFLOW_VIEW: 'Xem quy trình',
    WORKFLOW_UPDATE: 'Cấu hình người duyệt',
    REQUEST_CREATE: 'Tạo yêu cầu',
    REQUEST_VIEW: 'Xem yêu cầu theo phạm vi',
    REQUEST_APPROVE: 'Phê duyệt',
    REQUEST_REJECT: 'Từ chối',
    REQUEST_CANCEL: 'Hủy yêu cầu của mình',
    AUDIT_VIEW: 'Xem nhật ký',
  };
  const permissionIds: Record<string, string> = {};
  for (const [code, name] of Object.entries(permissions))
    permissionIds[code] = (
      await c.query('INSERT INTO permissions(code,name) VALUES($1,$2) RETURNING id', [code, name])
    ).rows[0].id;
  const role = async (code: string, name: string, perms: string[]) => {
    const id = (
      await c.query(
        'INSERT INTO system_roles(code,name,description) VALUES($1,$2,$3) RETURNING id',
        [code, name, name],
      )
    ).rows[0].id;
    for (const p of perms)
      await c.query('INSERT INTO role_permissions VALUES($1,$2)', [id, permissionIds[p]]);
    return id;
  };
  const admin = await role('SYSTEM_ADMIN', 'CEO · Điều hành tổ chức', [
    'USER_VIEW','USER_MANAGE','ORGANIZATION_VIEW','ORGANIZATION_MANAGE','ROLE_ASSIGN',
    'FORM_VIEW','FORM_REVIEW','FORM_MANAGE','WORKFLOW_VIEW','WORKFLOW_UPDATE',
    'REQUEST_VIEW','REQUEST_APPROVE','REQUEST_REJECT','AUDIT_VIEW'
  ]);
  const executive = await role('WORKFLOW_MANAGER', 'CDO · Thẩm định biểu mẫu và quy trình', [
    'USER_VIEW','ORGANIZATION_VIEW','FORM_VIEW','FORM_REVIEW','FORM_MANAGE',
    'WORKFLOW_VIEW','WORKFLOW_UPDATE','REQUEST_VIEW','REQUEST_APPROVE','REQUEST_REJECT','AUDIT_VIEW'
  ]);
  const requester = await role('REQUESTER', 'Người gửi yêu cầu', [
    'FORM_VIEW',
    'FORM_CREATE',
    'REQUEST_CREATE',
    'REQUEST_CANCEL',
  ]);
  const approver = await role('APPROVER', 'Người phê duyệt', [
    'FORM_VIEW',
    'REQUEST_APPROVE',
    'REQUEST_REJECT',
  ]);
  await role('AUDITOR', 'Kiểm soát viên', [
    'REQUEST_VIEW',
    'AUDIT_VIEW',
    'FORM_VIEW',
    'ORGANIZATION_VIEW',
  ]);
  for (const [assignment, roleId, scope] of [
    [ceo, admin, 'ORGANIZATION'],
    [cdo, executive, 'ORGANIZATION'],
    [huy, requester, 'ORGANIZATIONAL_UNIT'],
    [mai, requester, 'ORGANIZATIONAL_UNIT'],
    [minh, requester, 'ORGANIZATIONAL_UNIT'],
    [thao, requester, 'ORGANIZATIONAL_UNIT'],
    [linh, requester, 'ORGANIZATIONAL_UNIT'],
    [hoang, requester, 'ORGANIZATIONAL_UNIT'],
    [linh, approver, 'ORGANIZATIONAL_UNIT'],
    [hoang, approver, 'ORGANIZATIONAL_UNIT'],
  ])
    await c.query(
      'INSERT INTO role_assignments(employee_assignment_id,system_role_id,scope_type) VALUES($1,$2,$3)',
      [assignment, roleId, scope],
    );
  const template = async (
    code: string,
    name: string,
    description: string,
    fields: any[],
    type: string,
    target: string | null = null,
  ) => {
    const id = (
      await c.query(
        "INSERT INTO form_templates(code,name,description,status,created_by_assignment_id,reviewer_assignment_id,submitted_at,reviewed_at) VALUES($1,$2,$3,'ACTIVE',$4,$5,now(),now()) RETURNING id",
        [code, name, description, huy, cdo],
      )
    ).rows[0].id;
    for (const [i, f] of fields.entries())
      await c.query(
        'INSERT INTO form_fields(form_template_id,key,label,type,is_required,sort_order,options,full_width) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, f[0], f[1], f[2], true, i, JSON.stringify(f[3] || []), f[2] === 'TEXTAREA'],
      );
    const w = (
      await c.query(
        'INSERT INTO workflows(form_template_id,approver_type,target_position_id) VALUES($1,$2,$3) RETURNING id',
        [id, type, target],
      )
    ).rows[0].id;
    await c.query(
      "INSERT INTO audit_logs(workflow_id,actor_assignment_id,event_type) VALUES($1,$2,'WORKFLOW_CREATED')",
      [w, cdo],
    );
    await c.query("INSERT INTO form_review_events(form_template_id,actor_assignment_id,event_type) VALUES($1,$2,'CREATED'),($1,$3,'APPROVED')", [id,huy,cdo]);
    return w;
  };
  const purchase = await template(
    'BM-MS',
    'Đề nghị mua sắm',
    'Đề xuất thiết bị, công cụ và vật tư phục vụ công việc.',
    [
      ['itemName', 'Thiết bị / hàng hóa', 'TEXT'],
      ['supplier', 'Nhà cung cấp', 'TEXT'],
      ['quantity', 'Số lượng', 'NUMBER'],
      ['amount', 'Tổng chi phí (VNĐ)', 'NUMBER'],
      ['reason', 'Mục đích sử dụng', 'TEXTAREA'],
    ],
    'POSITION',
    ceoPos,
  );
  const leave = await template(
    'BM-NP',
    'Đơn xin nghỉ phép',
    'Gửi lịch nghỉ và phương án bàn giao đến quản lý trực tiếp.',
    [
      ['leaveType', 'Loại nghỉ', 'SELECT', ['Nghỉ phép năm', 'Nghỉ việc riêng', 'Nghỉ ốm']],
      ['startDate', 'Từ ngày', 'DATE'],
      ['endDate', 'Đến ngày', 'DATE'],
      ['reason', 'Lý do và bàn giao', 'TEXTAREA'],
    ],
    'DIRECT_MANAGER',
  );
  await template(
    'BM-CT',
    'Đề nghị công tác',
    'Kế hoạch công tác và kinh phí dự kiến.',
    [
      ['destination', 'Địa điểm', 'TEXT'],
      ['startDate', 'Ngày khởi hành', 'DATE'],
      ['amount', 'Chi phí dự kiến (VNĐ)', 'NUMBER'],
      ['reason', 'Mục tiêu chuyến đi', 'TEXTAREA'],
    ],
    'DIRECT_MANAGER',
  );
  for (let i = 0; i < 9; i++) {
    const isLeave = i % 3 === 1,
      w = isLeave ? leave : purchase,
      actor = i === 5 ? mai : huy,
      reviewer = isLeave ? linh : ceo;
    const data = isLeave
      ? {
          leaveType: 'Nghỉ phép năm',
          startDate: '2026-10-12',
          endDate: '2026-10-13',
          reason: 'Giải quyết công việc gia đình. Đã bàn giao các đầu việc cho nhóm.',
        }
      : {
          itemName: ['Màn hình Dell 27 inch', 'Bàn phím cơ Logitech', 'Laptop cho nhân sự mới'][
            i % 3
          ],
          supplier: 'Công ty thiết bị An Phát',
          quantity: 1,
          amount: [6500000, 2400000, 28500000][i % 3],
          reason: 'Bổ sung thiết bị phục vụ phát triển sản phẩm và làm việc nhóm.',
        };
    const status =
      i < 3
        ? 'PENDING'
        : i < 6
          ? 'APPROVED'
          : i === 6
            ? 'REJECTED'
            : i === 7
              ? 'CANCELLED'
              : 'DRAFT';
    const draft = status === 'DRAFT',
      decided = ['APPROVED', 'REJECTED'].includes(status);
    const r = (
      await c.query(
        "INSERT INTO requests(workflow_id,requester_assignment_id,approver_assignment_id,form_data,status,request_code,created_at,submitted_at,decided_at,decision_comment) VALUES($1,$2,$3,$4,$5,$6,now()-($7::int * interval '1 day'),$8,$9,$10) RETURNING *",
        [
          w,
          actor,
          draft ? null : reviewer,
          JSON.stringify(data),
          status,
          draft ? null : 'REQ-2026-' + String(i + 1).padStart(5, '0'),
          i,
          draft ? null : new Date(Date.now() - i * 86400000),
          decided ? new Date(Date.now() - (i - 1) * 86400000) : null,
          status === 'REJECTED'
            ? 'Vui lòng bổ sung báo giá và nêu rõ cấu hình thiết bị.'
            : status === 'APPROVED'
              ? 'Đồng ý theo đề xuất.'
              : null,
        ],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO audit_logs(request_id,actor_assignment_id,event_type,occurred_at) VALUES($1,$2,'REQUEST_CREATED',$3)",
      [r.id, actor, r.created_at],
    );
    if (!draft)
      await c.query(
        "INSERT INTO audit_logs(request_id,actor_assignment_id,event_type,occurred_at) VALUES($1,$2,'REQUEST_SUBMITTED',$3)",
        [r.id, actor, r.submitted_at],
      );
    if (decided || status === 'CANCELLED')
      await c.query(
        'INSERT INTO audit_logs(request_id,actor_assignment_id,event_type,details,occurred_at) VALUES($1,$2,$3,$4,$5)',
        [
          r.id,
          status === 'CANCELLED' ? actor : reviewer,
          'REQUEST_' + status,
          JSON.stringify({ comment: r.decision_comment }),
          r.decided_at || new Date(),
        ],
      );
    if (status === 'PENDING' || decided)
      await c.query(
        'INSERT INTO notifications(request_id,recipient_assignment_id,type,title,message) VALUES($1,$2,$3,$4,$5)',
        [
          r.id,
          status === 'PENDING' ? reviewer : actor,
          status === 'PENDING' ? 'APPROVAL_REQUIRED' : 'REQUEST_' + status,
          status === 'PENDING'
            ? 'Yêu cầu đang chờ bạn duyệt'
            : status === 'APPROVED'
              ? 'Yêu cầu đã được phê duyệt'
              : 'Yêu cầu cần điều chỉnh',
          r.request_code + ' · ' + (isLeave ? 'Đơn xin nghỉ phép' : 'Đề nghị mua sắm'),
        ],
      );
  }
  await c.query("SELECT setval('request_code_seq',9)");
}
