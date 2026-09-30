import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Database } from './db';
import { Actor, requirePermission, str, choice, uuid, bool, can } from './security';
import { audit } from './requests';
@Injectable()
export class FormsService {
  constructor(private db: Database) {}
  async list(a: Actor) {
    requirePermission(a, 'FORM_VIEW', a.unitId);
    const admin = can(a, 'FORM_EDIT_ANY');
    const forms = await this.db.prisma.form_templates.findMany({
      where: admin
        ? {}
        : {OR:[{status:'ACTIVE',workflows:{is:{status:'ACTIVE'}}},{created_by_assignment_id:a.assignmentId},{reviewer_assignment_id:a.assignmentId,status:'PENDING_REVIEW'}]},
      include: {
        form_fields:{orderBy:{sort_order:'asc'}},
        form_review_events:{include:{employee_assignments:{include:{users:true}}},orderBy:{occurred_at:'asc'}},
        workflows:{include:{positions:true,_count:{select:{requests:true}}}},
        employee_assignments_form_templates_created_by_assignment_idToemployee_assignments:{include:{users:true}},
        employee_assignments_form_templates_reviewer_assignment_idToemployee_assignments:{include:{users:true}},
      },
      orderBy:{created_at:'desc'},
    });
    return forms.map(({form_fields,form_review_events,workflows,employee_assignments_form_templates_reviewer_assignment_idToemployee_assignments:reviewer,employee_assignments_form_templates_created_by_assignment_idToemployee_assignments:creator,...f})=>({
      ...f,
      fields:form_fields,
      review_events:form_review_events.map(({employee_assignments,...event})=>({...event,actor_name:employee_assignments.users.full_name})),
      creator_name:creator?.users.full_name || null,
      reviewer_name:reviewer?.users.full_name || null,
      can_edit:can(a,'FORM_EDIT_ANY') || (f.reviewer_assignment_id===a.assignmentId && f.status==='PENDING_REVIEW' && can(a,'FORM_REVIEW',a.unitId)) || (f.created_by_assignment_id===a.assignmentId && ['DRAFT','RETURNED'].includes(f.status)),
      workflow_id:workflows?.id || null,
      approver_type:workflows?.approver_type || null,
      target_position_id:workflows?.target_position_id || null,
      target_position_name:workflows?.positions?.name || null,
      workflow_status:workflows?.status || null,
      request_count:workflows?._count.requests || 0,
    }));
  }
  private async candidates(a: Actor, c: any) {
    return (await c.query(`WITH RECURSIVE managers AS (
      SELECT id,manager_assignment_id FROM employee_assignments WHERE id=$1
      UNION SELECT ea.id,ea.manager_assignment_id FROM employee_assignments ea JOIN managers m ON ea.id=m.manager_assignment_id
    ) SELECT DISTINCT ea.id,u.full_name,p.name AS position_name,
      (ea.id=(SELECT manager_assignment_id FROM employee_assignments WHERE id=$1)) AS is_direct
    FROM employee_assignments ea JOIN users u ON u.id=ea.user_id AND u.status='ACTIVE'
    JOIN positions p ON p.id=ea.position_id AND p.status='ACTIVE'
    JOIN organizational_units ou ON ou.id=ea.organizational_unit_id AND ou.status='ACTIVE'
    JOIN role_assignments ra ON ra.employee_assignment_id=ea.id AND ra.revoked_at IS NULL AND ra.valid_from<=now() AND (ra.valid_until IS NULL OR ra.valid_until>now())
    JOIN system_roles sr ON sr.id=ra.system_role_id AND sr.is_active
    JOIN role_permissions rp ON rp.system_role_id=sr.id JOIN permissions perm ON perm.id=rp.permission_id AND perm.code='FORM_REVIEW'
    WHERE ea.user_id<>$2 AND ea.started_at<=now() AND (ea.ended_at IS NULL OR ea.ended_at>now())
    AND (ra.scope_type='ORGANIZATION' OR ea.id IN (SELECT id FROM managers WHERE id<>$1))
    ORDER BY is_direct DESC,u.full_name`,[a.assignmentId,a.userId])).rows;
  }
  async reviewers(a: Actor) {
    requirePermission(a,'FORM_CREATE',a.unitId);
    return this.candidates(a,this.db.pool);
  }
  private async revision(c: any, id: string, actor: string) {
    await c.query('INSERT INTO form_template_revisions(form_template_id,version,snapshot,actor_assignment_id) SELECT id,version,snapshot_form(id),$2 FROM form_templates WHERE id=$1',[id,actor]);
  }
  async revisions(a: Actor,id: string) {
    uuid(id);
    if (!(await this.list(a)).some(f=>f.id===id)) throw new NotFoundException('Không tìm thấy mẫu.');
    return this.db.query('SELECT r.*,u.full_name AS actor_name FROM form_template_revisions r LEFT JOIN employee_assignments ea ON ea.id=r.actor_assignment_id LEFT JOIN users u ON u.id=ea.user_id WHERE r.form_template_id=$1 ORDER BY r.version DESC',[id]);
  }
  private fields(body: any) {
    if (!Array.isArray(body.fields) || body.fields.length < 1 || body.fields.length > 60)
      throw new BadRequestException('Biểu mẫu cần từ 1 đến 60 thành phần.');
    const keys = new Set<string>();
    return body.fields.map((f: any, i: number) => {
      const key = str(f.key, 'Mã trường', 60);
      if (
        !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) ||
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        keys.has(key)
      )
        throw new BadRequestException(
          'Mã trường phải duy nhất, bắt đầu bằng chữ và chỉ gồm chữ, số, dấu gạch dưới.',
        );
      keys.add(key);
      const type = choice(
        f.type,
        ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'SECTION'],
        'Loại trường',
      );
      const label = str(f.label, 'Nhãn trường', 120);
      const options =
        type === 'SELECT' && Array.isArray(f.options)
          ? f.options.map((v: unknown) => str(v, 'Lựa chọn', 100))
          : [];
      if (
        type === 'SELECT' &&
        (!options.length || options.length > 40 || new Set(options).size !== options.length)
      )
        throw new BadRequestException('Danh sách lựa chọn cần 1–40 giá trị khác nhau.');
      return {
        key,
        label,
        type,
        isRequired: type === 'SECTION' ? false : bool(f.isRequired ?? false, 'Bắt buộc'),
        fullWidth: bool(f.fullWidth ?? false, 'Độ rộng'),
        options,
        order: i,
      };
    });
  }
  async create(a: Actor, body: any) {
    requirePermission(a, 'FORM_CREATE', a.unitId);
    const fields = this.fields(body),
      name = str(body.name, 'Tên biểu mẫu', 150),
      code = str(body.code, 'Mã biểu mẫu', 30).toUpperCase(),
      description = str(body.description ?? '', 'Mô tả', 500, false);
    if (!/^[A-Z0-9_-]+$/.test(code))
      throw new BadRequestException('Mã biểu mẫu chỉ gồm chữ, số, dấu gạch.');
    const id = await this.db.transaction(async (c) => {
      const publish = can(a,'FORM_PUBLISH');
      if (publish && !fields.some((f:any)=>f.type!=='SECTION')) throw new BadRequestException('Mẫu ban hành cần ít nhất một trường dữ liệu.');
      const type = publish ? choice(body.approverType ?? 'DIRECT_MANAGER',['DIRECT_MANAGER','POSITION'],'Người duyệt yêu cầu') : 'DIRECT_MANAGER';
      const target = type==='POSITION' ? uuid(body.targetPositionId) : null;
      if (target && !(await c.query("SELECT 1 FROM positions WHERE id=$1 AND status='ACTIVE'",[target])).rowCount) throw new BadRequestException('Chức danh người duyệt không hoạt động.');
      const [f] = (
        await c.query(
          'INSERT INTO form_templates(code,name,description,created_by_assignment_id) VALUES($1,$2,$3,$4) RETURNING id',
          [code, name, description, a.assignmentId],
        )
      ).rows;
      for (const field of fields)
        await c.query(
          'INSERT INTO form_fields(form_template_id,key,label,type,is_required,sort_order,options,full_width) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            f.id,
            field.key,
            field.label,
            field.type,
            field.isRequired,
            field.order,
            JSON.stringify(field.options),
            field.fullWidth,
          ],
        );
      const [w] = (
        await c.query(
          "INSERT INTO workflows(form_template_id,approver_type,target_position_id,status) VALUES($1,$2,$3,$4) RETURNING id",
          [f.id,type,target,publish ? 'ACTIVE':'INACTIVE'],
        )
      ).rows;
      await audit(c, a.assignmentId, 'WORKFLOW_CREATED', null, w.id);
      await c.query("INSERT INTO form_review_events(form_template_id,actor_assignment_id,event_type) VALUES($1,$2,'CREATED')",[f.id,a.assignmentId]);
      if (publish) {
        await c.query("UPDATE form_templates SET status='ACTIVE',reviewer_assignment_id=$2,reviewed_at=now() WHERE id=$1",[f.id,a.assignmentId]);
        await c.query("INSERT INTO form_review_events(form_template_id,actor_assignment_id,event_type,comment) VALUES($1,$2,'APPROVED','Ban hành trực tiếp')",[f.id,a.assignmentId]);
      }
      await this.revision(c,f.id,a.assignmentId);
      return f.id;
    });
    return { id };
  }
  async update(a: Actor, id: string, body: any) {
    requirePermission(a, 'FORM_CREATE', a.unitId);
    uuid(id);
    const fields = this.fields(body),
      name = str(body.name, 'Tên biểu mẫu', 150),
      description = str(body.description ?? '', 'Mô tả', 500, false);
    await this.db.transaction(async (c) => {
      const [f] = (await c.query('SELECT * FROM form_templates WHERE id=$1 FOR UPDATE', [id])).rows;
      if (!f) throw new NotFoundException('Không tìm thấy biểu mẫu.');
      const ownDraft=f.created_by_assignment_id===a.assignmentId && ['DRAFT','RETURNED'].includes(f.status);
      const assigned=f.reviewer_assignment_id===a.assignmentId && f.status==='PENDING_REVIEW' && can(a,'FORM_REVIEW',a.unitId);
      if (!ownDraft && !assigned && !can(a,'FORM_EDIT_ANY')) throw new ConflictException('Bạn chỉ được sửa mẫu nháp của mình hoặc mẫu được giao thẩm định.');
      if (body.version!==f.version) throw new ConflictException('Mẫu đã thay đổi. Tải lại trước khi lưu để tránh ghi đè phiên bản mới.');
      if (['ACTIVE','INACTIVE'].includes(f.status) && !fields.some((f:any)=>f.type!=='SECTION')) throw new BadRequestException('Mẫu dùng chung cần ít nhất một trường dữ liệu.');
      await c.query('UPDATE form_templates SET name=$1,description=$2,version=version+1 WHERE id=$3', [
        name,
        description,
        id,
      ]);
      await c.query('DELETE FROM form_fields WHERE form_template_id=$1', [id]);
      for (const field of fields)
        await c.query(
          'INSERT INTO form_fields(form_template_id,key,label,type,is_required,sort_order,options,full_width) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            id,
            field.key,
            field.label,
            field.type,
            field.isRequired,
            field.order,
            JSON.stringify(field.options),
            field.fullWidth,
          ],
        );
      await c.query("INSERT INTO form_review_events(form_template_id,actor_assignment_id,event_type) VALUES($1,$2,'UPDATED')",[id,a.assignmentId]);
      await this.revision(c,id,a.assignmentId);
    });
    return { id };
  }
  async status(a: Actor, id: string, body: any) {
    requirePermission(a, 'FORM_MANAGE');
    const status = choice(body.status, ['ACTIVE', 'INACTIVE'], 'Trạng thái');
    await this.db.transaction(async (c) => {
      const [f] = (await c.query('SELECT * FROM form_templates WHERE id=$1 FOR UPDATE', [uuid(id)]))
        .rows;
      if (!f) throw new NotFoundException('Không tìm thấy biểu mẫu.');
      if (status === 'ACTIVE') {
        const count = (
          await c.query(
            "SELECT count(*)::int AS count FROM form_fields WHERE form_template_id=$1 AND type<>'SECTION'",
            [id],
          )
        ).rows[0].count;
        const [w] = (await c.query('SELECT * FROM workflows WHERE form_template_id=$1', [id])).rows;
        if (!count || w?.status !== 'ACTIVE')
          throw new ConflictException(
            'Cần ít nhất một trường dữ liệu và quy trình đang hoạt động.',
          );
      }
      if (!['ACTIVE','INACTIVE'].includes(f.status)) throw new ConflictException('Mẫu chưa được Executive thẩm định.');
      await c.query('UPDATE form_templates SET status=$1 WHERE id=$2', [status, id]);
      await c.query("INSERT INTO form_review_events(form_template_id,actor_assignment_id,event_type,comment) VALUES($1,$2,'STATUS_CHANGED',$3)",[id,a.assignmentId,status]);
    });
    return { ok: true };
  }
  async workflows(a: Actor) {
    requirePermission(a, 'WORKFLOW_VIEW');
    return this.db.query(
      'SELECT w.*,f.name,f.code,f.status AS form_status,p.name AS target_position_name FROM workflows w JOIN form_templates f ON f.id=w.form_template_id LEFT JOIN positions p ON p.id=w.target_position_id ORDER BY f.name',
    );
  }
  async workflow(a: Actor, id: string, body: any) {
    requirePermission(a, 'WORKFLOW_UPDATE');
    const type = choice(body.approverType, ['DIRECT_MANAGER', 'POSITION'], 'Người duyệt'),
      status = choice(body.status, ['ACTIVE', 'INACTIVE'], 'Trạng thái'),
      target = type === 'POSITION' ? uuid(body.targetPositionId) : null;
    await this.db.transaction(async (c) => {
      const [w] = (await c.query('SELECT * FROM workflows WHERE id=$1 FOR UPDATE', [uuid(id)]))
        .rows;
      if (!w) throw new NotFoundException('Không tìm thấy quy trình.');
      const [form] = (await c.query('SELECT status FROM form_templates WHERE id=$1',[w.form_template_id])).rows;
      if (!['ACTIVE','INACTIVE'].includes(form?.status)) throw new ConflictException('Quy trình được thiết lập khi Executive duyệt mẫu.');
      if (
        target &&
        !(await c.query("SELECT 1 FROM positions WHERE id=$1 AND status='ACTIVE'", [target]))
          .rowCount
      )
        throw new BadRequestException('Chức danh không hoạt động.');
      await c.query(
        'UPDATE workflows SET approver_type=$1,target_position_id=$2,status=$3,updated_at=now() WHERE id=$4',
        [type, target, status, id],
      );
      if (w.approver_type !== type || w.target_position_id !== target)
        await audit(c, a.assignmentId, 'WORKFLOW_APPROVER_CHANGED', null, id, {
          previous: { approverType: w.approver_type, targetPositionId: w.target_position_id },
          current: { approverType: type, targetPositionId: target },
        });
      if (w.status !== status)
        await audit(c, a.assignmentId, 'WORKFLOW_STATUS_CHANGED', null, id, {
          previous: w.status,
          current: status,
        });
    });
    return { ok: true };
  }
  async submit(a: Actor, id: string, body: any = {}) {
    requirePermission(a, 'FORM_CREATE', a.unitId);
    return this.db.transaction(async c => {
      const [f] = (await c.query('SELECT * FROM form_templates WHERE id=$1 FOR UPDATE',[uuid(id)])).rows;
      if (!f) throw new NotFoundException('Không tìm thấy biểu mẫu.');
      if (f.created_by_assignment_id !== a.assignmentId || !['DRAFT','RETURNED'].includes(f.status))
        throw new ConflictException('Mẫu không thể gửi thẩm định.');
      const [fieldCount] = (await c.query("SELECT count(*)::int AS count FROM form_fields WHERE form_template_id=$1 AND type<>'SECTION'",[id])).rows;
      if (!fieldCount.count) throw new ConflictException('Mẫu cần ít nhất một trường nhập dữ liệu trước khi gửi thẩm định.');
      const candidates = await this.candidates(a,c);
      const reviewer = body.reviewerAssignmentId ? candidates.find((r:any)=>r.id===uuid(body.reviewerAssignmentId)) : candidates[0];
      if (!reviewer) throw new ConflictException('Người thẩm định phải là cấp trên hoặc lãnh đạo có quyền đang hoạt động.');
      await c.query("UPDATE form_templates SET status='PENDING_REVIEW',reviewer_assignment_id=$1,submitted_at=now(),review_comment=NULL WHERE id=$2",[reviewer.id,id]);
      await c.query("INSERT INTO form_review_events(form_template_id,actor_assignment_id,event_type) VALUES($1,$2,'SUBMITTED')",[id,a.assignmentId]);
      await c.query("INSERT INTO notifications(form_template_id,recipient_assignment_id,type,title,message) VALUES($1,$2,'FORM_SUBMITTED',$3,$4)",[id,reviewer.id,'Mẫu đơn chờ thẩm định',`${f.name} đã được gửi để bạn thẩm định.`]);
      return {ok:true};
    });
  }
  async review(a: Actor, id: string, body: any) {
    requirePermission(a, 'FORM_REVIEW',a.unitId);
    const decision = choice(body.decision,['APPROVE','RETURN'],'Quyết định');
    const comment = str(body.comment ?? '','Nhận xét',500,false);
    if (decision === 'RETURN' && !comment) throw new BadRequestException('Cần nêu lý do trả mẫu.');
    const type = decision === 'APPROVE' ? choice(body.approverType,['DIRECT_MANAGER','POSITION'],'Người duyệt') : null;
    const target = type === 'POSITION' ? uuid(body.targetPositionId) : null;
    return this.db.transaction(async c => {
      const [f] = (await c.query('SELECT * FROM form_templates WHERE id=$1 FOR UPDATE',[uuid(id)])).rows;
      if (!f) throw new NotFoundException('Không tìm thấy biểu mẫu.');
      if (f.status !== 'PENDING_REVIEW' || f.reviewer_assignment_id !== a.assignmentId)
        throw new ConflictException('Biểu mẫu không được giao cho bạn hoặc đã được xử lý.');
      if (body.version!==f.version) throw new ConflictException('Mẫu đã thay đổi. Mở lại mẫu để thẩm định phiên bản mới nhất.');
      if (decision === 'APPROVE') {
        const [fieldCount] = (await c.query("SELECT count(*)::int AS count FROM form_fields WHERE form_template_id=$1 AND type<>'SECTION'",[id])).rows;
        if (!fieldCount.count) throw new ConflictException('Mẫu cần ít nhất một trường nhập dữ liệu trước khi duyệt.');
        if (target && !(await c.query("SELECT 1 FROM positions WHERE id=$1 AND status='ACTIVE'",[target])).rowCount)
          throw new BadRequestException('Chức danh người duyệt không hoạt động.');
        await c.query("UPDATE workflows SET approver_type=$1,target_position_id=$2,status='ACTIVE',updated_at=now() WHERE form_template_id=$3",[type,target,id]);
        await c.query("UPDATE form_templates SET status='ACTIVE',reviewed_at=now(),review_comment=$1 WHERE id=$2",[comment,id]);
      } else await c.query("UPDATE form_templates SET status='RETURNED',reviewed_at=now(),review_comment=$1 WHERE id=$2",[comment,id]);
      await c.query('INSERT INTO form_review_events(form_template_id,actor_assignment_id,event_type,comment) VALUES($1,$2,$3,$4)',[id,a.assignmentId,decision === 'APPROVE' ? 'APPROVED':'RETURNED',comment]);
      if (f.created_by_assignment_id) await c.query('INSERT INTO notifications(form_template_id,recipient_assignment_id,type,title,message) VALUES($1,$2,$3,$4,$5)',[id,f.created_by_assignment_id,decision === 'APPROVE' ? 'FORM_APPROVED' : 'FORM_RETURNED',decision === 'APPROVE' ? 'Mẫu đơn đã được duyệt' : 'Mẫu đơn cần bổ sung',decision === 'APPROVE' ? `${f.name} đã được lưu để sử dụng.` : `${f.name} đã được trả về. ${comment}`]);
      return {ok:true};
    });
  }
}
