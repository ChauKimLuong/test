import assert from 'node:assert/strict';

export async function runIntegration(base, password, db) {
  let checks = 0;
  async function call(path, method = 'GET', body, cookie, expected = 200) {
    const response = await fetch(base + '/' + path, {
      method,
      headers: {
        ...(method === 'GET' ? {} : { 'content-type': 'application/json', origin: 'http://localhost:3000' }),
        ...(cookie ? { cookie } : {}),
      },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    const data = await response.json();
    assert.equal(response.status, expected, method + ' ' + path + ': ' + JSON.stringify(data));
    checks++;
    return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function login(email) {
    const {data,cookie} = await call('auth/login','POST',{email,password},undefined,201);
    return {actor:data.actor,cookie};
  }
  const ceo = await login('ceo@flowpilot.vn');
  const cdo = await login('cdo@flowpilot.vn');
  const huy = await login('huy@flowpilot.vn');
  const linh = await login('linh@flowpilot.vn');
  assert.ok(ceo.actor.permissions.FORM_CREATE && ceo.actor.permissions.FORM_PUBLISH);
  assert.ok(cdo.actor.permissions.FORM_CREATE && cdo.actor.permissions.REQUEST_CREATE);
  assert.ok(huy.actor.permissions.FORM_CREATE && huy.actor.permissions.REQUEST_CREATE);
  checks += 3;
  await call('forms','POST',{name:'Không hợp lệ',code:'NO',fields:[]},ceo.cookie,400);
  await call('forms','POST',{name:'Không hợp lệ',code:'NO',fields:[]},cdo.cookie,400);
  const organization = (await call('organization','GET',undefined,ceo.cookie)).data;
  assert.equal(organization.units.filter(u=>u.type==='DEPARTMENT').length,2);
  assert.equal(organization.units.filter(u=>u.type==='TEAM').length,2);
  checks += 2;
  const company = organization.units.find(u=>u.type==='COMPANY');
  await call('organization/units','POST',{code:'BADTEAM',name:'Nhóm sai cấp',type:'TEAM',parentId:company.id,status:'ACTIVE'},ceo.cookie,400);
  await call('organization/units','POST',{code:'SECOND',name:'Công ty khác',type:'COMPANY',status:'ACTIVE'},ceo.cookie,409);
  const department = (await call('organization/units','POST',{code:'QA',name:'Phòng QA',type:'DEPARTMENT',parentId:company.id,status:'ACTIVE'},ceo.cookie,201)).data;
  await call('organization/units','POST',{code:'QA_TEAM',name:'Nhóm kiểm thử',type:'TEAM',parentId:department.id,status:'ACTIVE'},ceo.cookie,201);
  const allPeople = (await call('people','GET',undefined,ceo.cookie)).data;
  assert.equal(allPeople.length,8); checks++;
  await call('people','GET',undefined,huy.cookie,403);
  const fields = [{key:'noiDung',label:'Nội dung',type:'TEXTAREA',isRequired:true,fullWidth:true,options:[]}];
  const {id:formId} = (await call('forms','POST',{code:'BM-TEST',name:'Mẫu thử luồng mới',description:'Nhân viên thiết kế',fields},huy.cookie,201)).data;
  const {id:sectionId} = (await call('forms','POST',{code:'BM-EMPTY',name:'Mẫu chỉ có tiêu đề',fields:[{key:'section',label:'Tiêu đề',type:'SECTION',isRequired:false,fullWidth:true,options:[]}]},huy.cookie,201)).data;
  await call('forms/'+sectionId+'/submit','POST',{},huy.cookie,409);
  await call('forms/'+formId,'PUT',{name:'Sửa không có phiên bản',description:'',fields},cdo.cookie,409);
  await call('forms/'+formId+'/review','POST',{decision:'APPROVE',approverType:'DIRECT_MANAGER'},cdo.cookie,409);
  await call('forms/'+formId+'/submit','POST',{reviewerAssignmentId:cdo.actor.assignmentId},huy.cookie,201);
  await call('forms/'+formId,'PUT',{name:'Sửa khi chờ',description:'',fields},huy.cookie,409);
  const pending = (await call('forms','GET',undefined,cdo.cookie)).data.find(f=>f.id===formId);
  assert.equal(pending.status,'PENDING_REVIEW'); checks++;
  assert.ok(pending.review_events.some(e=>e.event_type==='SUBMITTED')); checks++;
  const cdoNotifications = (await call('notifications','GET',undefined,cdo.cookie)).data;
  assert.ok(cdoNotifications.some(n=>n.form_template_id===formId && n.type==='FORM_SUBMITTED')); checks++;
  const cdoPerson = allPeople.find(p=>p.email==='cdo@flowpilot.vn');
  await call('people/'+cdoPerson.id+'/status','PATCH',{status:'LOCKED'},ceo.cookie,409);
  await call('assignments/'+cdoPerson.assignments[0].id+'/end','POST',{},ceo.cookie,409);
  await call('forms/'+formId+'/review','POST',{decision:'RETURN',comment:''},cdo.cookie,400);
  await call('forms/'+formId+'/review','POST',{decision:'RETURN',comment:'Bổ sung mô tả',version:1},cdo.cookie,201);
  await call('forms/'+formId,'PUT',{name:'Mẫu thử đã bổ sung',description:'Đã bổ sung mô tả',fields,version:1},huy.cookie,200);
  await call('forms/'+formId+'/submit','POST',{reviewerAssignmentId:cdo.actor.assignmentId},huy.cookie,201);
  await call('forms/'+formId+'/review','POST',{decision:'APPROVE',approverType:'DIRECT_MANAGER',comment:'Đồng ý',version:2},cdo.cookie,201);
  await call('forms/'+formId+'/review','POST',{decision:'APPROVE',approverType:'DIRECT_MANAGER'},cdo.cookie,409);
  const active = (await call('forms','GET',undefined,huy.cookie)).data.find(f=>f.id===formId);
  assert.equal(active.status,'ACTIVE'); checks++;
  const huyNotifications = (await call('notifications','GET',undefined,huy.cookie)).data;
  assert.ok(huyNotifications.some(n=>n.form_template_id===formId && n.type==='FORM_APPROVED')); checks++;
  const request = (await call('requests','POST',{workflowId:active.workflow_id},huy.cookie,201)).data;
  await call('requests/'+request.id,'PUT',{formData:{noiDung:'Đề xuất cải tiến quy trình'}},huy.cookie,200);
  await call('requests/'+request.id+'/submit','POST',{},huy.cookie,201);
  const submitted = (await call('requests/'+request.id,'GET',undefined,huy.cookie)).data;
  assert.equal(submitted.approver_assignment_id,linh.actor.assignmentId); checks++;
  await call('requests/'+request.id+'/decision','POST',{decision:'APPROVED',comment:'Đã xem'},linh.cookie,201);
  const approved = (await call('requests/'+request.id,'GET',undefined,huy.cookie)).data;
  assert.equal(approved.status,'APPROVED'); checks++;
  // Published templates may evolve without rewriting historical request documents.
  const nextFields=[{key:'newContent',label:'Nội dung mới',type:'TEXT',isRequired:true,fullWidth:true,options:[]}];
  await call('forms/'+formId,'PUT',{name:'Tên mới',description:'',fields:nextFields,version:2},huy.cookie,409);
  await call('forms/'+formId,'PUT',{name:'Mẫu phiên bản 3',description:'Mô tả mới',fields:nextFields,version:2},cdo.cookie,200);
  await call('forms/'+formId,'PUT',{name:'Ghi đè phiên bản cũ',description:'',fields,version:2},ceo.cookie,409);
  const oldDocument=(await call('requests/'+request.id,'GET',undefined,huy.cookie)).data;
  assert.equal(oldDocument.form_name,'Mẫu thử đã bổ sung');
  assert.equal(oldDocument.fields[0].key,'noiDung');
  assert.equal(oldDocument.template_snapshot.version,2); checks+=3;
  const newDocument=(await call('requests','POST',{workflowId:active.workflow_id},huy.cookie,201)).data;
  assert.equal(newDocument.fields[0].key,'newContent');
  assert.equal(newDocument.template_snapshot.version,3); checks+=2;
  const revisions=(await call('forms/'+formId+'/revisions','GET',undefined,huy.cookie)).data;
  assert.deepEqual(revisions.map(r=>r.version),[3,2,1]); checks++;
  await assert.rejects(db.query('UPDATE form_template_revisions SET snapshot=\'{}\' WHERE form_template_id=$1',[formId])); checks++;
  await assert.rejects(db.query('UPDATE requests SET template_snapshot=\'{}\' WHERE id=$1',[newDocument.id])); checks++;

  // Staff can nominate their manager or an authorized executive, never themselves or another team's manager.
  const candidates=(await call('forms/reviewers','GET',undefined,huy.cookie)).data;
  assert.ok(candidates.some(r=>r.id===linh.actor.assignmentId) && candidates.some(r=>r.id===cdo.actor.assignmentId));
  assert.ok(!candidates.some(r=>r.id===huy.actor.assignmentId || r.id===allPeople.find(p=>p.email==='hoang@flowpilot.vn').assignments[0].id)); checks+=2;
  const proposal=(await call('forms','POST',{code:'MANAGER-REVIEW',name:'Đề xuất cấp trên',fields,status:'ACTIVE'},huy.cookie,201)).data;
  await call('forms/'+proposal.id+'/submit','POST',{reviewerAssignmentId:huy.actor.assignmentId},huy.cookie,409);
  await call('forms/'+proposal.id+'/submit','POST',{reviewerAssignmentId:allPeople.find(p=>p.email==='hoang@flowpilot.vn').assignments[0].id},huy.cookie,409);
  await call('forms/'+proposal.id+'/submit','POST',{reviewerAssignmentId:linh.actor.assignmentId},huy.cookie,201);
  const managerQueue=(await call('forms','GET',undefined,linh.cookie)).data;
  assert.ok(managerQueue.find(f=>f.id===proposal.id)?.can_edit); checks++;
  await call('forms/'+proposal.id,'PUT',{name:'Trưởng phòng đã chỉnh',description:'',fields,version:1},linh.cookie,200);
  await call('forms/'+proposal.id+'/review','POST',{decision:'APPROVE',approverType:'DIRECT_MANAGER',version:1},linh.cookie,409);
  await call('forms/'+proposal.id+'/review','POST',{decision:'APPROVE',approverType:'DIRECT_MANAGER',version:2},linh.cookie,201);
  await call('forms/'+proposal.id+'/status','PATCH',{status:'INACTIVE'},linh.cookie,403);

  // Executive publication skips review; executive request submission still requires an independent approver.
  const executiveForm=(await call('forms','POST',{code:'CHIEF-PUBLISHED',name:'Mẫu lãnh đạo',fields,approverType:'DIRECT_MANAGER'},cdo.cookie,201)).data;
  const published=(await call('forms','GET',undefined,cdo.cookie)).data.find(f=>f.id===executiveForm.id);
  assert.equal(published.status,'ACTIVE'); assert.equal(published.workflow_status,'ACTIVE'); checks+=2;
  const chiefRequest=(await call('requests','POST',{workflowId:published.workflow_id,formData:{noiDung:'Yêu cầu của CDO'}},cdo.cookie,201)).data;
  await call('requests/'+chiefRequest.id+'/submit','POST',{},cdo.cookie,201);
  const chiefPending=(await call('requests/'+chiefRequest.id,'GET',undefined,cdo.cookie)).data;
  assert.equal(chiefPending.approver_assignment_id,ceo.actor.assignmentId); checks++;
  const newEmail = 'new.person@flowpilot.vn';
  await call('auth/register','POST',{fullName:'Nhân sự mới',email:newEmail,password},undefined,201);
  const duplicate = await call('auth/register','POST',{fullName:'Nhân sự mới',email:newEmail,password},undefined,409);
  assert.match(duplicate.data.message,/tồn tại/); checks++;
  await call('auth/login','POST',{email:newEmail,password},undefined,403);
  const p = (await call('people','GET',undefined,ceo.cookie)).data.find(u=>u.email===newEmail);
  assert.equal(p.status,'INACTIVE'); checks++;
  await call('people/'+p.id+'/status','PATCH',{status:'ACTIVE'},ceo.cookie,409);
  const team = organization.units.find(u=>u.code==='SALES_TEAM');
  const staff = organization.positions.find(p=>p.code==='SPECIALIST');
  const manager = allPeople.find(p=>p.email==='hoang@flowpilot.vn').assignments[0];
  const assignment = (await call('assignments','POST',{userId:p.id,unitId:team.id,positionId:staff.id,managerAssignmentId:manager.id,isPrimary:true,isUnitHead:false,type:'REGULAR'},ceo.cookie,201)).data;
  const requesterRole = (await call('roles','GET',undefined,ceo.cookie)).data.find(r=>r.code==='REQUESTER');
  await call('role-assignments','POST',{assignmentId:assignment.id,roleId:requesterRole.id,scopeType:'ORGANIZATIONAL_UNIT'},ceo.cookie,201);
  await call('people/'+p.id+'/status','PATCH',{status:'ACTIVE'},ceo.cookie,200);
  const newcomer = await login(newEmail);
  assert.ok(newcomer.actor.permissions.FORM_CREATE && newcomer.actor.permissions.REQUEST_CREATE); checks++;
  const events = await db.query('SELECT event_type FROM form_review_events WHERE form_template_id=$1 ORDER BY occurred_at,id',[formId]);
  assert.ok(events.rows.some(e=>e.event_type==='RETURNED') && events.rows.some(e=>e.event_type==='APPROVED')); checks++;
  console.log(checks + ' integration checks passed: roles, registration, onboarding, form review, workflow, requests, Prisma-backed accounts.');
}
