ALTER TABLE notifications ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN form_template_id uuid REFERENCES form_templates(id);
ALTER TABLE notifications ADD CONSTRAINT notifications_one_target CHECK ((request_id IS NOT NULL) <> (form_template_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS notifications_form ON notifications(form_template_id);
