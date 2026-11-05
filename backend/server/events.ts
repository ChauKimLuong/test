import { PoolClient } from 'pg';
export async function audit(
  c: PoolClient,
  actor: string,
  event: string,
  requestId: string | null,
  workflowId: string | null,
  details: unknown = null,
) {
  await c.query(
    'INSERT INTO audit_logs(actor_assignment_id,event_type,request_id,workflow_id,details) VALUES($1,$2,$3,$4,$5)',
    [actor, event, requestId, workflowId, details === null ? null : JSON.stringify(details)],
  );
}
export async function notify(
  c: PoolClient,
  id: string,
  recipient: string,
  type: string,
  title: string,
  message: string,
) {
  await c.query(
    'INSERT INTO notifications(request_id,recipient_assignment_id,type,title,message) VALUES($1,$2,$3,$4,$5)',
    [id, recipient, type, title, message],
  );
}
