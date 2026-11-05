INSERT INTO permissions(code,name) VALUES
 ('WORKFLOW_PUBLISH','Ban hành phiên bản quy trình'),('WORKFLOW_OPERATE','Thử lại quy trình bị chặn'),('REQUEST_RETURN','Trả yêu cầu để bổ sung') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(system_role_id,permission_id)
 SELECT r.id,p.id FROM system_roles r CROSS JOIN permissions p WHERE
 (r.code IN ('SYSTEM_ADMIN','WORKFLOW_MANAGER','FORM_PUBLISHER') AND p.code IN ('WORKFLOW_PUBLISH','WORKFLOW_OPERATE')) OR
 (p.code='REQUEST_RETURN' AND EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions x ON x.id=rp.permission_id WHERE rp.system_role_id=r.id AND x.code='REQUEST_REJECT')) ON CONFLICT DO NOTHING;
ALTER TABLE workflows ADD COLUMN draft_definition jsonb, ADD COLUMN draft_revision integer NOT NULL DEFAULT 0, ADD COLUMN published_version_id uuid;
CREATE TABLE workflow_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL REFERENCES workflows(id), version integer NOT NULL CHECK(version>0),
 template_version integer NOT NULL, definition jsonb NOT NULL, published_by_assignment_id uuid REFERENCES employee_assignments(id),
 change_note text NOT NULL DEFAULT '', published_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workflow_id,version), UNIQUE(workflow_id,id)
);
ALTER TABLE workflows ADD CONSTRAINT published_version_owner FOREIGN KEY(id,published_version_id) REFERENCES workflow_versions(workflow_id,id);
ALTER TABLE workflows ADD CONSTRAINT workflow_published_pair UNIQUE(id,published_version_id);
CREATE TRIGGER immutable_workflow_version BEFORE UPDATE OR DELETE ON workflow_versions FOR EACH ROW EXECUTE FUNCTION protect_audit();
INSERT INTO workflow_versions(workflow_id,version,template_version,definition,change_note)
 SELECT w.id,1,f.version,jsonb_build_object('schemaVersion',1,'steps',jsonb_build_array(jsonb_build_object('id','legacy-approval','name','Phê duyệt yêu cầu','mode','ALL','assignees',jsonb_build_array(CASE WHEN w.approver_type='POSITION' THEN jsonb_build_object('type','POSITION','positionId',w.target_position_id) ELSE jsonb_build_object('type','DIRECT_MANAGER') END)))), 'LEGACY_MIGRATION' FROM workflows w JOIN form_templates f ON f.id=w.form_template_id;
UPDATE workflows w SET published_version_id=v.id,draft_definition=v.definition FROM workflow_versions v WHERE v.workflow_id=w.id;
ALTER TABLE requests ADD COLUMN revision integer NOT NULL DEFAULT 0, ADD COLUMN last_submitted_at timestamptz;
DO $$ DECLARE x record; BEGIN
 FOR x IN SELECT conname FROM pg_constraint WHERE conrelid='requests'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%' LOOP
 EXECUTE format('ALTER TABLE requests DROP CONSTRAINT %I',x.conname); END LOOP;
END $$;
ALTER TABLE requests ADD CONSTRAINT request_status CHECK(status IN ('DRAFT','PENDING','RETURNED','APPROVED','REJECTED','CANCELLED')),
 ADD CONSTRAINT request_draft CHECK(status<>'DRAFT' OR (request_code IS NULL AND submitted_at IS NULL AND approver_assignment_id IS NULL)),
 ADD CONSTRAINT request_submitted CHECK(status NOT IN ('PENDING','RETURNED','APPROVED','REJECTED') OR (request_code IS NOT NULL AND submitted_at IS NOT NULL)),
 ADD CONSTRAINT request_final CHECK((status IN ('APPROVED','REJECTED'))=(decided_at IS NOT NULL)),
 ADD CONSTRAINT request_rejection_comment CHECK(status<>'REJECTED' OR length(trim(decision_comment))>0);
CREATE TABLE workflow_instances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid UNIQUE NOT NULL REFERENCES requests(id), workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id),
 current_round integer NOT NULL DEFAULT 1 CHECK(current_round>0), current_step integer NOT NULL DEFAULT 0,
 status text NOT NULL CHECK(status IN ('RUNNING','RETURNED','BLOCKED','APPROVED','REJECTED','CANCELLED')),
 blocked_reason text, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE request_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES requests(id), round integer NOT NULL CHECK(round>0),
 form_data_snapshot jsonb NOT NULL, requester_snapshot jsonb NOT NULL, submitted_by_assignment_id uuid NOT NULL REFERENCES employee_assignments(id),
 submitted_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,round)
);
CREATE TRIGGER immutable_submission BEFORE UPDATE OR DELETE ON request_submissions FOR EACH ROW EXECUTE FUNCTION protect_audit();
CREATE TABLE workflow_step_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instance_id uuid NOT NULL REFERENCES workflow_instances(id), round integer NOT NULL,
 step_id text NOT NULL, step_index integer NOT NULL, name text NOT NULL, mode text NOT NULL CHECK(mode IN ('ALL','ANY')), condition_result jsonb,
 status text NOT NULL CHECK(status IN ('ACTIVE','SKIPPED','APPROVED','REJECTED','RETURNED','CANCELLED')),
 entered_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(instance_id,round,step_id)
);
CREATE TABLE approval_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), step_run_id uuid NOT NULL REFERENCES workflow_step_runs(id),
 assignee_assignment_id uuid NOT NULL REFERENCES employee_assignments(id), assignee_user_id uuid NOT NULL REFERENCES users(id), assignee_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','RETURNED','CANCELLED')),
 created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, UNIQUE(step_run_id,assignee_user_id)
);
CREATE INDEX tasks_inbox ON approval_tasks(assignee_assignment_id,status,created_at);
CREATE INDEX step_instance ON workflow_step_runs(instance_id,round,step_index);
CREATE TABLE task_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid UNIQUE NOT NULL REFERENCES approval_tasks(id), actor_assignment_id uuid NOT NULL REFERENCES employee_assignments(id),
 decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED','RETURNED')), comment text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_decision BEFORE UPDATE OR DELETE ON task_decisions FOR EACH ROW EXECUTE FUNCTION protect_audit();
CREATE TABLE mutation_receipts (
 actor_assignment_id uuid NOT NULL REFERENCES employee_assignments(id), request_id uuid NOT NULL REFERENCES requests(id), action text NOT NULL,
 key text NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_assignment_id,request_id,action,key)
);
INSERT INTO workflow_instances(request_id,workflow_version_id,status,started_at,completed_at)
 SELECT r.id,w.published_version_id,CASE WHEN r.status='PENDING' THEN 'RUNNING' ELSE r.status END,r.submitted_at,r.decided_at
 FROM requests r JOIN workflows w ON w.id=r.workflow_id WHERE r.submitted_at IS NOT NULL;
INSERT INTO request_submissions(request_id,round,form_data_snapshot,requester_snapshot,submitted_by_assignment_id,submitted_at)
 SELECT r.id,1,r.form_data,jsonb_build_object('name',u.full_name,'unitId',ea.organizational_unit_id,'userId',u.id,'source','LEGACY_MIGRATION'),ea.id,r.submitted_at
 FROM requests r JOIN employee_assignments ea ON ea.id=r.requester_assignment_id JOIN users u ON u.id=ea.user_id WHERE r.submitted_at IS NOT NULL;
INSERT INTO workflow_step_runs(instance_id,round,step_id,step_index,name,mode,status,entered_at,completed_at)
 SELECT i.id,1,'legacy-approval',0,'Phê duyệt yêu cầu','ALL',CASE WHEN r.status='PENDING' THEN 'ACTIVE' ELSE r.status END,r.submitted_at,r.decided_at
 FROM workflow_instances i JOIN requests r ON r.id=i.request_id;
INSERT INTO approval_tasks(step_run_id,assignee_assignment_id,assignee_user_id,assignee_snapshot,status,created_at,decided_at)
 SELECT s.id,a.id,u.id,jsonb_build_object('name',u.full_name,'position',p.name,'unit',ou.name),r.status,r.submitted_at,r.decided_at
 FROM workflow_step_runs s JOIN workflow_instances i ON i.id=s.instance_id JOIN requests r ON r.id=i.request_id JOIN employee_assignments a ON a.id=r.approver_assignment_id
 JOIN users u ON u.id=a.user_id JOIN positions p ON p.id=a.position_id JOIN organizational_units ou ON ou.id=a.organizational_unit_id;
INSERT INTO task_decisions(task_id,actor_assignment_id,decision,comment,occurred_at)
 SELECT t.id,t.assignee_assignment_id,r.status,r.decision_comment,r.decided_at FROM approval_tasks t JOIN workflow_step_runs s ON s.id=t.step_run_id
 JOIN workflow_instances i ON i.id=s.instance_id JOIN requests r ON r.id=i.request_id WHERE r.status IN ('APPROVED','REJECTED');
CREATE OR REPLACE FUNCTION protect_request_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('APPROVED','REJECTED','CANCELLED') THEN RAISE EXCEPTION 'Final request is immutable'; END IF;
 IF NEW.workflow_id IS DISTINCT FROM OLD.workflow_id OR NEW.requester_assignment_id IS DISTINCT FROM OLD.requester_assignment_id THEN RAISE EXCEPTION 'Request identity is immutable'; END IF;
 IF OLD.status<>'DRAFT' AND (NEW.request_code IS DISTINCT FROM OLD.request_code OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN RAISE EXCEPTION 'Submission identity is immutable'; END IF;
 IF OLD.status NOT IN ('DRAFT','RETURNED') AND NEW.form_data IS DISTINCT FROM OLD.form_data THEN RAISE EXCEPTION 'Submitted data is immutable'; END IF;
 RETURN NEW; END $$;
CREATE FUNCTION protect_instance_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.workflow_version_id IS DISTINCT FROM OLD.workflow_version_id THEN RAISE EXCEPTION 'Pinned instance version is immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER pinned_instance BEFORE UPDATE ON workflow_instances FOR EACH ROW EXECUTE FUNCTION protect_instance_version();
CREATE FUNCTION protect_task_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Task history cannot be deleted'; END IF;
 IF OLD.status<>'PENDING' THEN RAISE EXCEPTION 'Completed task is immutable'; END IF;
 IF NEW.step_run_id IS DISTINCT FROM OLD.step_run_id OR NEW.assignee_assignment_id IS DISTINCT FROM OLD.assignee_assignment_id OR NEW.assignee_user_id IS DISTINCT FROM OLD.assignee_user_id OR NEW.assignee_snapshot IS DISTINCT FROM OLD.assignee_snapshot OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'Task identity is immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER immutable_task BEFORE UPDATE OR DELETE ON approval_tasks FOR EACH ROW EXECUTE FUNCTION protect_task_history();
