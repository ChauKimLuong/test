INSERT INTO permissions(code,name) VALUES
 ('FORM_EDIT_ANY','Chỉnh sửa mẫu dùng chung và mẫu đề xuất'),
 ('FORM_PUBLISH','Ban hành mẫu trực tiếp') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO system_roles(code,name,description) VALUES
 ('MEMBER','Thành viên công ty','Tạo mẫu đề xuất và gửi yêu cầu'),
 ('FORM_PUBLISHER','Lãnh đạo ban hành mẫu','CTO/CDO hoặc lãnh đạo được cấp quyền ban hành và chỉnh sửa mẫu') ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(system_role_id,permission_id)
 SELECT r.id,p.id FROM system_roles r CROSS JOIN permissions p WHERE
 (r.code='MEMBER' AND p.code IN ('FORM_VIEW','FORM_CREATE','REQUEST_CREATE','REQUEST_CANCEL')) OR
 (r.code IN ('SYSTEM_ADMIN','WORKFLOW_MANAGER','FORM_PUBLISHER') AND p.code IN ('FORM_VIEW','FORM_CREATE','FORM_REVIEW','FORM_EDIT_ANY','FORM_PUBLISH','FORM_MANAGE','WORKFLOW_VIEW','WORKFLOW_UPDATE','ORGANIZATION_VIEW','REQUEST_CREATE','REQUEST_CANCEL')) OR
 (r.code='APPROVER' AND p.code IN ('FORM_REVIEW','ORGANIZATION_VIEW')) ON CONFLICT DO NOTHING;
INSERT INTO role_assignments(employee_assignment_id,system_role_id,scope_type)
 SELECT a.id,r.id,'ORGANIZATIONAL_UNIT' FROM employee_assignments a CROSS JOIN system_roles r
 WHERE r.code='MEMBER' AND (a.ended_at IS NULL OR a.ended_at>now())
 AND NOT EXISTS(SELECT 1 FROM role_assignments ra WHERE ra.employee_assignment_id=a.id AND ra.system_role_id=r.id AND ra.revoked_at IS NULL);
INSERT INTO positions(code,name,type,rank_level) VALUES('CTO','Giám đốc Công nghệ','EXECUTIVE',6) ON CONFLICT(code) DO NOTHING;

ALTER TABLE form_templates ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE FUNCTION snapshot_form(template_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('name',f.name,'code',f.code,'description',f.description,'version',f.version,
 'fields',COALESCE((SELECT jsonb_agg(to_jsonb(ff) ORDER BY ff.sort_order) FROM form_fields ff WHERE ff.form_template_id=f.id),'[]'::jsonb))
 FROM form_templates f WHERE f.id=template_id;
$$;
CREATE TABLE form_template_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), form_template_id uuid NOT NULL REFERENCES form_templates(id),
 version integer NOT NULL, snapshot jsonb NOT NULL, actor_assignment_id uuid REFERENCES employee_assignments(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(form_template_id,version)
);
INSERT INTO form_template_revisions(form_template_id,version,snapshot,actor_assignment_id)
 SELECT id,version,snapshot_form(id),created_by_assignment_id FROM form_templates;
CREATE TRIGGER immutable_form_revisions BEFORE UPDATE OR DELETE ON form_template_revisions FOR EACH ROW EXECUTE FUNCTION protect_audit();

ALTER TABLE requests ADD COLUMN template_snapshot jsonb;
ALTER TABLE requests DISABLE TRIGGER immutable_request;
UPDATE requests r SET template_snapshot=snapshot_form(w.form_template_id) FROM workflows w WHERE w.id=r.workflow_id;
ALTER TABLE requests ENABLE TRIGGER immutable_request;
ALTER TABLE requests ALTER COLUMN template_snapshot SET NOT NULL;
CREATE FUNCTION preserve_template_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT snapshot_form(w.form_template_id) INTO NEW.template_snapshot FROM workflows w WHERE w.id=NEW.workflow_id;
 ELSIF NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot THEN
  RAISE EXCEPTION 'Request template snapshot is immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER request_template_snapshot BEFORE INSERT OR UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION preserve_template_snapshot();
