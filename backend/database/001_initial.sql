
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text NOT NULL,
 email text UNIQUE NOT NULL CHECK (email = lower(email)), password_hash text NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','LOCKED')),
 last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organizational_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES organizational_units(id),
 code text UNIQUE NOT NULL, name text NOT NULL, type text NOT NULL CHECK(type IN ('COMPANY','DIVISION','DEPARTMENT','TEAM')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), CHECK(parent_id IS DISTINCT FROM id)
);
CREATE TABLE IF NOT EXISTS positions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL,
 rank_level integer NOT NULL DEFAULT 1 CHECK(rank_level >= 0),
 type text NOT NULL CHECK(type IN ('EXECUTIVE','MANAGEMENT','STAFF')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE IF NOT EXISTS employee_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 organizational_unit_id uuid NOT NULL REFERENCES organizational_units(id), position_id uuid NOT NULL REFERENCES positions(id),
 manager_assignment_id uuid REFERENCES employee_assignments(id),
 type text NOT NULL DEFAULT 'REGULAR' CHECK(type IN ('REGULAR','ACTING','SECONDMENT')),
 is_primary boolean NOT NULL DEFAULT true, is_unit_head boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 CHECK(ended_at IS NULL OR ended_at > started_at), CHECK(manager_assignment_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX IF NOT EXISTS primary_assignment ON employee_assignments(user_id) WHERE is_primary AND ended_at IS NULL;
CREATE TABLE IF NOT EXISTS system_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL,
 description text, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL);
CREATE TABLE IF NOT EXISTS role_permissions (
 system_role_id uuid NOT NULL REFERENCES system_roles(id), permission_id uuid NOT NULL REFERENCES permissions(id),
 PRIMARY KEY(system_role_id,permission_id)
);
CREATE TABLE IF NOT EXISTS role_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_assignment_id uuid NOT NULL REFERENCES employee_assignments(id),
 system_role_id uuid NOT NULL REFERENCES system_roles(id), scope_type text NOT NULL CHECK(scope_type IN ('ORGANIZATION','ORGANIZATIONAL_UNIT')),
 valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz, revoked_at timestamptz,
 CHECK(valid_until IS NULL OR valid_until > valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS active_role ON role_assignments(employee_assignment_id,system_role_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS form_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL,
 description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','INACTIVE')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS form_fields (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), form_template_id uuid NOT NULL REFERENCES form_templates(id),
 key text NOT NULL, label text NOT NULL, type text NOT NULL CHECK(type IN ('TEXT','TEXTAREA','NUMBER','DATE','SELECT','CHECKBOX','SECTION')),
 is_required boolean NOT NULL DEFAULT false, sort_order integer NOT NULL, options jsonb NOT NULL DEFAULT '[]',
 full_width boolean NOT NULL DEFAULT false, UNIQUE(form_template_id,key)
);
CREATE TABLE IF NOT EXISTS workflows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), form_template_id uuid UNIQUE NOT NULL REFERENCES form_templates(id),
 approver_type text NOT NULL CHECK(approver_type IN ('DIRECT_MANAGER','POSITION')), target_position_id uuid REFERENCES positions(id),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((approver_type='DIRECT_MANAGER' AND target_position_id IS NULL) OR (approver_type='POSITION' AND target_position_id IS NOT NULL))
);
CREATE SEQUENCE IF NOT EXISTS request_code_seq;
CREATE TABLE IF NOT EXISTS requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_code text UNIQUE, workflow_id uuid NOT NULL REFERENCES workflows(id),
 requester_assignment_id uuid NOT NULL REFERENCES employee_assignments(id),
 approver_assignment_id uuid REFERENCES employee_assignments(id), form_data jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','REJECTED','CANCELLED')),
 decision_comment text, created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz, decided_at timestamptz,
 CHECK(status <> 'DRAFT' OR (request_code IS NULL AND approver_assignment_id IS NULL AND submitted_at IS NULL)),
 CHECK(status NOT IN ('PENDING','APPROVED','REJECTED') OR (request_code IS NOT NULL AND approver_assignment_id IS NOT NULL AND submitted_at IS NOT NULL)),
 CHECK((status IN ('APPROVED','REJECTED')) = (decided_at IS NOT NULL)),
 CHECK(status <> 'REJECTED' OR length(trim(decision_comment)) > 0),
 CHECK(requester_assignment_id IS DISTINCT FROM approver_assignment_id)
);
CREATE INDEX IF NOT EXISTS requests_requester ON requests(requester_assignment_id,created_at DESC);
CREATE INDEX IF NOT EXISTS requests_approver ON requests(approver_assignment_id,status);
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid REFERENCES requests(id), workflow_id uuid REFERENCES workflows(id),
 actor_assignment_id uuid NOT NULL REFERENCES employee_assignments(id), event_type text NOT NULL, details jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now(), CHECK(num_nonnulls(request_id,workflow_id)=1)
);
CREATE INDEX IF NOT EXISTS audit_time ON audit_logs(occurred_at DESC);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES requests(id),
 recipient_assignment_id uuid NOT NULL REFERENCES employee_assignments(id), type text NOT NULL,
 title text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications(recipient_assignment_id,created_at DESC);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 assignment_id uuid NOT NULL REFERENCES employee_assignments(id), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION protect_request_history() RETURNS trigger AS $$
BEGIN
 IF OLD.status <> 'DRAFT' AND (NEW.form_data IS DISTINCT FROM OLD.form_data OR NEW.workflow_id IS DISTINCT FROM OLD.workflow_id
 OR NEW.requester_assignment_id IS DISTINCT FROM OLD.requester_assignment_id OR NEW.approver_assignment_id IS DISTINCT FROM OLD.approver_assignment_id
 OR NEW.request_code IS DISTINCT FROM OLD.request_code OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN
 RAISE EXCEPTION 'Submitted request content is immutable';
 END IF;
 IF OLD.status IN ('APPROVED','REJECTED','CANCELLED') THEN RAISE EXCEPTION 'Final request is immutable'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER immutable_request BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION protect_request_history();
CREATE OR REPLACE FUNCTION protect_audit() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Audit logs are append-only'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION protect_audit();
