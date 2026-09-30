ALTER TABLE form_templates DROP CONSTRAINT IF EXISTS form_templates_status_check;
ALTER TABLE form_templates ADD CONSTRAINT form_templates_status_check CHECK(status IN ('DRAFT','PENDING_REVIEW','RETURNED','ACTIVE','INACTIVE'));
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS created_by_assignment_id uuid REFERENCES employee_assignments(id);
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS reviewer_assignment_id uuid REFERENCES employee_assignments(id);
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS review_comment text;
CREATE TABLE IF NOT EXISTS form_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 form_template_id uuid NOT NULL REFERENCES form_templates(id),
 actor_assignment_id uuid NOT NULL REFERENCES employee_assignments(id),
 event_type text NOT NULL CHECK(event_type IN ('CREATED','UPDATED','SUBMITTED','APPROVED','RETURNED','STATUS_CHANGED')),
 comment text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_review_events_form ON form_review_events(form_template_id,occurred_at);
CREATE OR REPLACE TRIGGER immutable_form_review_events BEFORE UPDATE OR DELETE ON form_review_events FOR EACH ROW EXECUTE FUNCTION protect_audit();
