import { PoolClient } from 'pg';
export async function seedAdvancedWorkflows(c: PoolClient) {
  const [chief] = (
    await c.query(
      "SELECT a.id FROM employee_assignments a JOIN users u ON u.id=a.user_id WHERE u.email='cdo@flowpilot.vn' AND a.is_primary AND a.ended_at IS NULL",
    )
  ).rows;
  const positions = (await c.query("SELECT id,code FROM positions WHERE code IN ('CEO','CDO')"))
    .rows;
  if (!chief || positions.length !== 2) return;
  const approvers = positions.map((p) => ({ type: 'POSITION', positionId: p.id }));
  for (const mode of ['ALL', 'ANY']) {
    const code = mode === 'ALL' ? 'CP-MULTI' : 'CP-ANY';
    if ((await c.query('SELECT 1 FROM form_templates WHERE code=$1', [code])).rowCount) continue;
    const name =
      mode === 'ALL' ? 'Đề nghị mua sắm — duyệt nhiều cấp' : 'Đề nghị hỗ trợ — một lãnh đạo đồng ý';
    const [f] = (
      await c.query(
        "INSERT INTO form_templates(code,name,description,status,created_by_assignment_id,reviewer_assignment_id,reviewed_at) VALUES($1,$2,$3,'ACTIVE',$4,$4,now()) RETURNING id",
        [
          code,
          name,
          mode === 'ALL'
            ? 'Quản lý trực tiếp duyệt. Khoản từ 10 triệu cần CDO và CEO cùng đồng ý.'
            : 'Quản lý trực tiếp duyệt, sau đó CDO hoặc CEO đồng ý là đủ.',
          chief.id,
        ],
      )
    ).rows;
    const fields = [
      {
        key: 'amount',
        label: 'Số tiền đề nghị (VND)',
        type: 'NUMBER',
        required: true,
        width: false,
        options: [],
      },
      {
        key: 'purpose',
        label: 'Mục đích / lý do',
        type: 'TEXTAREA',
        required: true,
        width: true,
        options: [],
      },
      {
        key: 'category',
        label: 'Loại đề nghị',
        type: 'SELECT',
        required: true,
        width: false,
        options: ['Thiết bị', 'Phần mềm', 'Dịch vụ'],
      },
      {
        key: 'neededDate',
        label: 'Ngày cần sử dụng',
        type: 'DATE',
        required: true,
        width: false,
        options: [],
      },
    ];
    for (let index = 0; index < fields.length; index++) {
      const x = fields[index];
      await c.query(
        'INSERT INTO form_fields(form_template_id,key,label,type,is_required,full_width,sort_order,options) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [f.id, x.key, x.label, x.type, x.required, x.width, index, JSON.stringify(x.options)],
      );
    }
    await c.query(
      'INSERT INTO form_template_revisions(form_template_id,version,snapshot,actor_assignment_id) VALUES($1,1,snapshot_form($1),$2)',
      [f.id, chief.id],
    );
    await c.query(
      "INSERT INTO form_review_events(form_template_id,actor_assignment_id,event_type,comment) VALUES($1,$2,'APPROVED','Mẫu minh họa bộ xử lý quy trình nâng cấp')",
      [f.id, chief.id],
    );
    const [w] = (
      await c.query(
        "INSERT INTO workflows(form_template_id,approver_type,status) VALUES($1,'DIRECT_MANAGER','ACTIVE') RETURNING id",
        [f.id],
      )
    ).rows;
    const definition = {
      schemaVersion: 1,
      steps: [
        {
          id: 'manager',
          name: 'Quản lý trực tiếp xác nhận',
          mode: 'ALL',
          assignees: [{ type: 'DIRECT_MANAGER' }],
        },
        {
          id: 'chiefs',
          name: mode === 'ALL' ? 'CDO và CEO đồng duyệt' : 'CDO hoặc CEO phê duyệt',
          mode,
          assignees: approvers,
          ...(mode === 'ALL'
            ? {
                when: {
                  mode: 'ALL',
                  conditions: [{ field: 'amount', operator: 'GTE', value: 10000000 }],
                },
              }
            : {}),
        },
      ],
    };
    const [v] = (
      await c.query(
        'INSERT INTO workflow_versions(workflow_id,version,template_version,definition,published_by_assignment_id,change_note) VALUES($1,1,1,$2,$3,$4) RETURNING id',
        [w.id, JSON.stringify(definition), chief.id, 'Mẫu minh họa ' + mode],
      )
    ).rows;
    await c.query(
      'UPDATE workflows SET draft_definition=$1,published_version_id=$2,draft_revision=1 WHERE id=$3',
      [JSON.stringify(definition), v.id, w.id],
    );
  }
}
