INSERT INTO permissions(code,name) VALUES
 ('TASK_DELEGATE','Ủy quyền và chuyển giao nhiệm vụ của mình'),('TASK_TRANSFER','Chuyển giao nhiệm vụ trong phạm vi'),
 ('SLA_OPERATE','Chạy kiểm tra thời hạn'),('METRICS_VIEW','Xem báo cáo thời gian xử lý'),
 ('REQUEST_COMMENT','Trao đổi trên hồ sơ'),('REQUEST_ATTACH','Bổ sung tài liệu hồ sơ') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(system_role_id,permission_id)
 SELECT r.id,p.id FROM system_roles r CROSS JOIN permissions p WHERE
 (p.code='TASK_DELEGATE' AND EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions x ON x.id=rp.permission_id WHERE rp.system_role_id=r.id AND x.code='REQUEST_APPROVE')) OR
 (r.code IN ('SYSTEM_ADMIN','WORKFLOW_MANAGER','FORM_PUBLISHER') AND p.code IN ('TASK_TRANSFER','SLA_OPERATE','METRICS_VIEW')) OR
 (r.code='APPROVER' AND p.code='METRICS_VIEW') OR
 (p.code IN ('REQUEST_COMMENT','REQUEST_ATTACH') AND EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions x ON x.id=rp.permission_id WHERE rp.system_role_id=r.id AND x.code='REQUEST_CREATE')) ON CONFLICT DO NOTHING;
ALTER TABLE approval_tasks ADD COLUMN due_at timestamptz, ADD COLUMN remind_at timestamptz,
 ADD COLUMN escalation_assignment_id uuid REFERENCES employee_assignments(id);
CREATE INDEX pending_task_due ON approval_tasks(due_at) WHERE status='PENDING';
-- Organization events such as delegation creation have neither a request nor a workflow.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_check CHECK(num_nonnulls(request_id,workflow_id)<=1);
CREATE TABLE approval_delegations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_assignment_id uuid NOT NULL REFERENCES employee_assignments(id),
 delegate_assignment_id uuid NOT NULL REFERENCES employee_assignments(id), starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL, reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 CHECK(owner_assignment_id<>delegate_assignment_id), CHECK(ends_at>starts_at), CHECK(ends_at<=starts_at+interval '90 days')
);
CREATE INDEX delegation_window ON approval_delegations(owner_assignment_id,starts_at,ends_at) WHERE revoked_at IS NULL;
CREATE TABLE task_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), from_task_id uuid UNIQUE NOT NULL REFERENCES approval_tasks(id),
 to_task_id uuid UNIQUE NOT NULL REFERENCES approval_tasks(id), actor_assignment_id uuid REFERENCES employee_assignments(id),
 delegation_id uuid REFERENCES approval_delegations(id), kind text NOT NULL CHECK(kind IN ('MANUAL','DELEGATION','ESCALATION')),
 reason text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), CHECK(from_task_id<>to_task_id)
);
CREATE TRIGGER immutable_transfer BEFORE UPDATE OR DELETE ON task_transfers FOR EACH ROW EXECUTE FUNCTION protect_audit();
CREATE TABLE sla_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES approval_tasks(id),
 event text NOT NULL CHECK(event IN ('REMINDER','OVERDUE','ESCALATION_FAILED')), detail text,
 occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id,event)
);
CREATE TRIGGER immutable_sla_event BEFORE UPDATE OR DELETE ON sla_events FOR EACH ROW EXECUTE FUNCTION protect_audit();
CREATE TABLE request_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES requests(id),
 actor_assignment_id uuid NOT NULL REFERENCES employee_assignments(id), body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_request_comment BEFORE UPDATE OR DELETE ON request_comments FOR EACH ROW EXECUTE FUNCTION protect_audit();
CREATE TABLE request_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES requests(id), document_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), filename text NOT NULL, mime_type text NOT NULL,
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 2097152), sha256 text NOT NULL,
 content bytea NOT NULL CHECK(octet_length(content)=byte_size), uploaded_by_assignment_id uuid NOT NULL REFERENCES employee_assignments(id),
 created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz, UNIQUE(request_id,document_id,version)
);
CREATE INDEX attachment_request ON request_attachments(request_id,created_at);
CREATE FUNCTION protect_attachment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'archived_at') IS DISTINCT FROM (to_jsonb(OLD)-'archived_at') OR OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL THEN RAISE EXCEPTION 'Attachment content and history are immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER immutable_attachment BEFORE UPDATE OR DELETE ON request_attachments FOR EACH ROW EXECUTE FUNCTION protect_attachment();
CREATE TABLE submission_attachments (
 submission_id uuid NOT NULL REFERENCES request_submissions(id), attachment_id uuid NOT NULL REFERENCES request_attachments(id), PRIMARY KEY(submission_id,attachment_id)
);
CREATE TRIGGER immutable_submission_attachment BEFORE UPDATE OR DELETE ON submission_attachments FOR EACH ROW EXECUTE FUNCTION protect_audit();
