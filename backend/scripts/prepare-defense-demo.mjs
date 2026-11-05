import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRuntimeEnv } from '../runtime-env.mjs';

loadRuntimeEnv();
const base = process.env.DEMO_API_URL || `http://127.0.0.1:${process.env.API_PORT || 3001}/api`;
const origin = process.env.APP_ORIGIN;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const code = 'MS-BV-01';
const roleCode = 'PROCUREMENT_REVIEWER';
const pass = process.env.DEMO_PASSWORD || 'Demo@2026!';
let cookie;
async function login(email) {
  const response = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      email,
      password: process.env['DEMO_' + email.split('@')[0].toUpperCase() + '_PASSWORD'] || pass,
    }),
  });
  if (!response.ok)
    throw new Error(
      `Không đăng nhập được ${email}: HTTP ${response.status}. Kiểm tra mật khẩu demo.`,
    );
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...(await response.json()) };
}
async function api(path, method = 'GET', body, session = cookie) {
  const response = await fetch(base + '/' + path, {
    method,
    headers: {
      cookie: session,
      ...(method === 'GET' ? {} : { 'content-type': 'application/json', origin }),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${method} ${path}: HTTP ${response.status} · ${result.message}`);
  return result;
}
try {
  const ceo = await login('ceo@flowpilot.vn');
  cookie = ceo.cookie;
  assert.ok(ceo.actor.permissions.WORKFLOW_PUBLISH?.includes('ORGANIZATION'));
  const people = await api('people');
  const assignment = (email) => {
    const user = people.find((p) => p.email === email && p.status === 'ACTIVE');
    const a = user?.assignments?.find((a) => a.is_primary && !a.ended_at);
    if (!a) throw new Error(`Thiếu phân công đang hoạt động của ${email}.`);
    return a;
  };
  const huy = assignment('huy@flowpilot.vn'),
    hoang = assignment('hoang@flowpilot.vn'),
    cdo = assignment('cdo@flowpilot.vn'),
    ceoAssignment = assignment('ceo@flowpilot.vn');
  const before = (
    await db.query('SELECT id,status,request_code,form_data FROM requests ORDER BY id')
  ).rows;
  // Only create a narrowly defined review role. No admin, workflow-edit or general view permission.
  const c = await db.connect();
  let reviewerRole;
  try {
    await c.query('BEGIN');
    const created = await c.query(
      `INSERT INTO system_roles(code,name,description) VALUES($1,$2,$3) ON CONFLICT(code) DO NOTHING RETURNING id`,
      [
        roleCode,
        'Thẩm định mua sắm liên phòng ban',
        'Thẩm định chi phí/hiệu quả trên nhiệm vụ được giao; không quản trị và không tự xem mọi hồ sơ.',
      ],
    );
    reviewerRole = (
      await c.query('SELECT id FROM system_roles WHERE code=$1 AND is_active', [roleCode])
    ).rows[0];
    assert.ok(reviewerRole, 'Vai trò thẩm định bị ngừng hoạt động.');
    await c.query(
      `INSERT INTO role_permissions(system_role_id,permission_id) SELECT $1,id FROM permissions WHERE code IN ('REQUEST_APPROVE','REQUEST_REJECT','REQUEST_RETURN') ON CONFLICT DO NOTHING`,
      [reviewerRole.id],
    );
    const granted = (
      await c.query(
        'SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.system_role_id=$1 ORDER BY p.code',
        [reviewerRole.id],
      )
    ).rows.map((p) => p.code);
    assert.deepEqual(
      granted,
      ['REQUEST_APPROVE', 'REQUEST_REJECT', 'REQUEST_RETURN'],
      'Vai trò demo đã có quyền khác; dừng để tránh dùng cấu hình quyền không đúng mục đích.',
    );
    if (created.rowCount)
      await c.query(
        `INSERT INTO audit_logs(actor_assignment_id,event_type,details) VALUES($1,'DEFENSE_REVIEW_ROLE_CREATED',$2)`,
        [
          ceo.actor.assignmentId,
          JSON.stringify({
            roleId: reviewerRole.id,
            permissions: ['REQUEST_APPROVE', 'REQUEST_REJECT', 'REQUEST_RETURN'],
            purpose: 'Dữ liệu trình bày tiểu luận',
          }),
        ],
      );
    await c.query('COMMIT');
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
  const activeRole = (
    await db.query(
      'SELECT * FROM role_assignments WHERE employee_assignment_id=$1 AND system_role_id=$2 AND revoked_at IS NULL',
      [hoang.id, reviewerRole.id],
    )
  ).rows[0];
  if (!activeRole) {
    const grant = await api('role-assignments', 'POST', {
      assignmentId: hoang.id,
      roleId: reviewerRole.id,
      scopeType: 'ORGANIZATION',
    });
    await db.query(
      `INSERT INTO audit_logs(actor_assignment_id,event_type,details) VALUES($1,'DEFENSE_REVIEW_ROLE_GRANTED',$2)`,
      [
        ceo.actor.assignmentId,
        JSON.stringify({
          roleAssignmentId: grant.id,
          assignmentId: hoang.id,
          roleId: reviewerRole.id,
          scope: 'ORGANIZATION',
        }),
      ],
    );
  } else
    assert.equal(
      activeRole.scope_type,
      'ORGANIZATION',
      'Vai trò demo hiện có scope khác; hãy rà soát bằng tài khoản CEO.',
    );
  const fields = [
    { key: 'requestInfo', label: 'I. Thông tin đề nghị', type: 'SECTION', fullWidth: true },
    {
      key: 'itemName',
      label: 'Hạng mục đề nghị mua',
      type: 'TEXT',
      isRequired: true,
      fullWidth: true,
    },
    {
      key: 'category',
      label: 'Nhóm mua sắm',
      type: 'SELECT',
      isRequired: true,
      options: ['Thiết bị', 'Phần mềm', 'Dịch vụ'],
    },
    { key: 'quantity', label: 'Số lượng', type: 'NUMBER', isRequired: true },
    { key: 'neededDate', label: 'Ngày cần sử dụng', type: 'DATE', isRequired: true },
    { key: 'supplier', label: 'Nhà cung cấp dự kiến', type: 'TEXT' },
    { key: 'budgetInfo', label: 'II. Ngân sách và căn cứ', type: 'SECTION', fullWidth: true },
    { key: 'amount', label: 'Tổng kinh phí đề nghị (VND)', type: 'NUMBER', isRequired: true },
    {
      key: 'budgetSource',
      label: 'Nguồn kinh phí',
      type: 'SELECT',
      isRequired: true,
      options: ['Ngân sách bộ phận', 'Chi ngoài kế hoạch'],
    },
    {
      key: 'purpose',
      label: 'Lý do, lợi ích và căn cứ đề nghị',
      type: 'TEXTAREA',
      isRequired: true,
      fullWidth: true,
    },
    { key: 'urgent', label: 'Xử lý khẩn — cần CEO phê duyệt', type: 'CHECKBOX', fullWidth: true },
  ].map((f) => ({ isRequired: false, fullWidth: false, options: [], ...f }));
  let form = (await api('forms')).find((f) => f.code === code);
  const createdForm = !form;
  if (!form) {
    const f = await api('forms', 'POST', {
      code,
      name: 'Đề nghị mua sắm — quy trình trình bày',
      description:
        'Dữ liệu mô phỏng: quản lý xác nhận; 5–<20 triệu thẩm định chi phí; từ 20 triệu đồng thẩm định ALL rồi CEO. Khẩn hoặc ngoài kế hoạch luôn cần CEO. Hạn theo bước, giữ phiên bản và lịch sử bổ sung.',
      fields,
      approverType: 'DIRECT_MANAGER',
    });
    form = (await api('forms')).find((x) => x.id === f.id);
  }
  assert.ok(form && form.status === 'ACTIVE', 'Mẫu demo cần đang hoạt động.');
  const definition = {
    schemaVersion: 1,
    steps: [
      {
        id: 'confirm-need',
        name: '01 · Quản lý trực tiếp xác nhận nhu cầu',
        mode: 'ALL',
        assignees: [{ type: 'DIRECT_MANAGER' }],
        sla: { minutes: 1440, remindBeforeMinutes: 120, escalationAssignmentId: cdo.id },
      },
      {
        id: 'review-mid-budget',
        name: '02 · Thẩm định chi phí và hiệu quả (5–<20 triệu)',
        mode: 'ALL',
        assignees: [{ type: 'ROLE', roleId: reviewerRole.id }],
        when: {
          mode: 'ALL',
          conditions: [
            { field: 'amount', operator: 'GTE', value: 5000000 },
            { field: 'amount', operator: 'LT', value: 20000000 },
          ],
        },
        sla: { minutes: 480, remindBeforeMinutes: 60, escalationAssignmentId: cdo.id },
      },
      {
        id: 'parallel-review',
        name: '03 · Đồng thẩm định liên phòng ban (từ 20 triệu)',
        mode: 'ALL',
        assignees: [
          { type: 'POSITION', positionId: cdo.position_id, unitId: cdo.unit_id },
          { type: 'ROLE', roleId: reviewerRole.id },
        ],
        when: { mode: 'ALL', conditions: [{ field: 'amount', operator: 'GTE', value: 20000000 }] },
        sla: { minutes: 2880, remindBeforeMinutes: 240 },
      },
      {
        id: 'ceo-final',
        name: '04 · CEO quyết định ngân sách lớn hoặc ngoại lệ',
        mode: 'ALL',
        assignees: [
          { type: 'POSITION', positionId: ceoAssignment.position_id, unitId: ceo.actor.unitId },
        ],
        when: {
          mode: 'ANY',
          conditions: [
            { field: 'amount', operator: 'GTE', value: 20000000 },
            { field: 'urgent', operator: 'EQ', value: true },
            { field: 'budgetSource', operator: 'EQ', value: 'Chi ngoài kế hoạch' },
          ],
        },
        sla: { minutes: 1440, remindBeforeMinutes: 120 },
      },
    ],
  };
  let workflow = await api('workflows/' + form.workflow_id);
  if (createdForm) {
    await api('workflows/' + workflow.id + '/validate', 'POST', { definition });
    workflow = await api('workflows/' + workflow.id + '/draft', 'PUT', {
      definition,
      expectedRevision: workflow.draft_revision,
    });
    workflow = await api('workflows/' + workflow.id + '/publish', 'POST', {
      expectedRevision: workflow.draft_revision,
      changeNote:
        'CEO ban hành quy trình mua sắm minh họa: điều kiện AND/OR, đồng duyệt ALL, SLA, ngoại lệ và lịch sử.',
    });
  } else
    assert.deepEqual(
      workflow.versions[0].definition,
      definition,
      'Mẫu demo đã được chỉnh riêng. Script không ghi đè; dùng UI để mô phỏng hoặc tạo hồ sơ mới.',
    );
  const neededDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const data = (label, amount, urgent = false, budgetSource = 'Ngân sách bộ phận') => ({
    itemName: label,
    category: 'Thiết bị',
    quantity: 1,
    neededDate,
    supplier: 'Nhà cung cấp minh họa (dữ liệu giả lập)',
    amount,
    budgetSource,
    purpose:
      'Hồ sơ mô phỏng phục vụ trình bày tiểu luận. Trang bị phương tiện cho dự án nội bộ; kinh phí đã nêu là số liệu thử, không phải giao dịch thật.',
    urgent,
  });
  const simulations = [];
  for (const [label, amount, urgent, budgetSource, expected] of [
    ['Chi nhỏ', 3000000, false, 'Ngân sách bộ phận', ['confirm-need']],
    [
      'Đúng ngưỡng 5 triệu',
      5000000,
      false,
      'Ngân sách bộ phận',
      ['confirm-need', 'review-mid-budget'],
    ],
    [
      'Ngay dưới 20 triệu',
      19999999,
      false,
      'Ngân sách bộ phận',
      ['confirm-need', 'review-mid-budget'],
    ],
    [
      'Đúng ngưỡng 20 triệu',
      20000000,
      false,
      'Ngân sách bộ phận',
      ['confirm-need', 'parallel-review', 'ceo-final'],
    ],
    [
      'Chi lớn',
      35000000,
      false,
      'Ngân sách bộ phận',
      ['confirm-need', 'parallel-review', 'ceo-final'],
    ],
    ['Khẩn nhưng kinh phí nhỏ', 3000000, true, 'Ngân sách bộ phận', ['confirm-need', 'ceo-final']],
    ['Chi ngoài kế hoạch', 3000000, false, 'Chi ngoài kế hoạch', ['confirm-need', 'ceo-final']],
  ]) {
    const result = await api('workflows/' + workflow.id + '/simulate', 'POST', {
      requesterAssignmentId: huy.id,
      formData: data(label, amount, urgent, budgetSource),
    });
    assert.equal(result.valid, true, JSON.stringify(result.steps.map((s) => s.error)));
    assert.deepEqual(
      result.steps.filter((s) => s.condition.matched).map((s) => s.id),
      expected,
    );
    simulations.push({
      label,
      amount,
      urgent,
      budgetSource,
      steps: result.steps.map((s) => ({
        id: s.id,
        name: s.name,
        matched: s.condition.matched,
        assignees: s.assignees.map((a) => a.name),
      })),
    });
  }
  const sessions = {
    huy: await login('huy@flowpilot.vn'),
    linh: await login('linh@flowpilot.vn'),
    hoang: await login('hoang@flowpilot.vn'),
    cdo: await login('cdo@flowpilot.vn'),
  };
  const cases = [];
  const get = (id) => api('requests/' + id, 'GET', undefined, sessions.huy.cookie);
  async function decide(
    r,
    who,
    decision = 'APPROVED',
    comment = 'Dữ liệu demo: đã kiểm tra theo trách nhiệm của bước.',
  ) {
    const task = r.tasks.find(
      (t) =>
        t.status === 'PENDING' && t.assignee_assignment_id === sessions[who].actor.assignmentId,
    );
    assert.ok(task, `${who} phải có nhiệm vụ trước khi quyết định.`);
    return api(
      'requests/' + r.id + '/decision',
      'POST',
      {
        decision,
        comment,
        taskId: task.id,
        expectedRevision: r.revision,
        idempotencyKey: 'defense-' + r.id + '-' + task.id + '-' + decision,
      },
      sessions[who].cookie,
    );
  }
  for (const [key, label, amount] of [
    ['small', 'DEMO-BV-01 · Kinh phí nhỏ', 3000000],
    ['medium', 'DEMO-BV-02 · Thẩm định chi phí', 12000000],
    ['large', 'DEMO-BV-03 · Đồng thẩm định và CEO', 35000000],
    ['returned', 'DEMO-BV-04 · Cần bổ sung báo giá', 9000000],
    ['draft', 'DEMO-BV-05 · Nháp để gửi trực tiếp', 35000000],
  ]) {
    const [existing] = (
      await db.query(
        "SELECT id FROM requests WHERE workflow_id=$1 AND form_data->>'itemName'=$2 ORDER BY created_at DESC LIMIT 1",
        [workflow.id, label],
      )
    ).rows;
    let r;
    if (existing) r = await get(existing.id);
    else {
      r = await api(
        'requests',
        'POST',
        { workflowId: workflow.id, formData: data(label, amount) },
        sessions.huy.cookie,
      );
      const quote = `BAO GIA MO PHONG - ${label}\nHang muc: thiet bi phuc vu du an noi bo\nSo luong: 1\nTong kinh phi: ${amount} VND\nTai lieu gia lap de trinh bay, khong phai bao gia thuong mai.\n`;
      await api(
        'requests/' + r.id + '/attachments',
        'POST',
        {
          filename: 'bao-gia-mo-phong.txt',
          mimeType: 'text/plain',
          contentBase64: Buffer.from(quote).toString('base64'),
          expectedRevision: r.revision,
        },
        sessions.huy.cookie,
      );
      r = await get(r.id);
      if (key !== 'draft')
        r = await api(
          'requests/' + r.id + '/submit',
          'POST',
          { expectedRevision: r.revision, idempotencyKey: 'defense-submit-' + r.id },
          sessions.huy.cookie,
        );
      if (key === 'returned')
        r = await decide(
          r,
          'linh',
          'RETURNED',
          'Dữ liệu demo: cần bổ sung căn cứ lựa chọn nhà cung cấp và làm rõ lợi ích mua sắm.',
        );
      if (['small', 'medium', 'large'].includes(key)) r = await decide(r, 'linh');
      if (key === 'medium') r = await decide(r, 'hoang');
      if (key === 'large') {
        assert.equal(r.tasks.filter((t) => t.status === 'PENDING').length, 2);
        r = await decide(r, 'cdo');
        assert.equal(r.status, 'PENDING');
        assert.equal(
          r.tasks.some((t) => t.step_index === 3 && t.status === 'PENDING'),
          false,
          'CEO chưa được giao trước khi đủ ALL.',
        );
        r = await decide(r, 'hoang');
        assert.equal(r.tasks.filter((t) => t.status === 'PENDING').length, 1);
        assert.equal(
          r.tasks.find((t) => t.status === 'PENDING').assignee_assignment_id,
          ceo.actor.assignmentId,
        );
      }
      assert.equal(
        r.status,
        {
          small: 'APPROVED',
          medium: 'APPROVED',
          large: 'PENDING',
          returned: 'RETURNED',
          draft: 'DRAFT',
        }[key],
      );
    }
    cases.push({
      key,
      id: r.id,
      code: r.request_code,
      status: r.status,
      label,
      amount,
      url: 'http://localhost:3000/requests/' + r.id,
      workflowVersion: r.instance?.workflow_version || null,
    });
  }
  const after = (
    await db.query('SELECT id,status,request_code,form_data FROM requests ORDER BY id')
  ).rows;
  assert.deepEqual(
    after.filter((r) => before.some((old) => old.id === r.id)),
    before,
    'Hồ sơ trước khi chuẩn bị demo phải được giữ nguyên.',
  );
  const result = {
    preparedAt: new Date().toISOString(),
    form: {
      id: form.id,
      code,
      name: form.name,
      workflowId: workflow.id,
      workflowVersion: workflow.versions[0].version,
      creator: 'ceo@flowpilot.vn',
      url: 'http://localhost:3000/workflows?form=' + form.id,
    },
    reviewerRole: {
      id: reviewerRole.id,
      code: roleCode,
      assignee: 'hoang@flowpilot.vn',
      permissions: ['REQUEST_APPROVE', 'REQUEST_REJECT', 'REQUEST_RETURN'],
    },
    definition,
    simulations,
    cases,
    preservedExistingRequests: before.length,
  };
  const folder = fileURLToPath(new URL('../../docs/defense-demo/', import.meta.url));
  mkdirSync(folder, { recursive: true });
  writeFileSync(folder + 'prepared.json', JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        form: result.form,
        cases: result.cases,
        simulationsPassed: simulations.length,
        preservedExistingRequests: before.length,
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
