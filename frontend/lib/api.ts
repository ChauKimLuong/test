export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: Record<string, string> = {},
  ) {
    super(message);
  }
}
export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({ message: 'Phản hồi không hợp lệ.' }));
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== 'auth/login' &&
      path !== 'auth/me' &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event('flowpilot:session-expired'));
    throw new ApiError(
      Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Có lỗi xảy ra.',
      response.status,
      data.errors,
    );
  }
  return data;
}
export type Actor = {
  userId: string;
  assignmentId: string;
  fullName: string;
  email: string;
  unitId: string;
  unitName: string;
  positionName: string;
  permissions: Record<string, string[]>;
  roles: string[];
};
export type Field = {
  id?: string;
  key: string;
  label: string;
  type: string;
  is_required: boolean;
  full_width: boolean;
  options: string[];
  sort_order?: number;
};
export type Template = {
  version: number;
  can_edit: boolean;
  reviewer_name?: string;
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  workflow_id: string;
  workflow_status: string;
  approver_type: string;
  target_position_id?: string;
  target_position_name?: string;
  created_by_assignment_id?: string;
  creator_name?: string;
  reviewer_assignment_id?: string;
  submitted_at?: string;
  reviewed_at?: string;
  review_comment?: string;
  request_count: number;
  fields: Field[];
  review_events?: { id: string; event_type: string; comment?: string | null; occurred_at: string; actor_name: string }[];
};
export type RequestItem = {
  template_snapshot: {version:number};
  id: string;
  request_code: string | null;
  form_name: string;
  form_code: string;
  form_description: string;
  status: string;
  requester_name: string;
  requester_position: string;
  requester_assignment_id: string;
  approver_assignment_id: string | null;
  approver_name: string;
  approver_position: string;
  unit_id: string;
  unit_name: string;
  created_at: string;
  submitted_at: string | null;
  decided_at: string | null;
  decision_comment: string | null;
  workflow_id: string;
  form_data: Record<string, any>;
  fields: Field[];
  logs: any[];
};
export const statusLabels: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PENDING: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  LOCKED: 'Đã khóa',
  PENDING_REVIEW: 'Chờ thẩm định',
  RETURNED: 'Cần bổ sung',
};
export const eventLabels: Record<string, string> = {
  WORKFLOW_CREATED: 'Tạo cấu hình duyệt',
  WORKFLOW_APPROVER_CHANGED: 'Thay đổi người duyệt',
  WORKFLOW_STATUS_CHANGED: 'Đổi trạng thái quy trình',
  REQUEST_CREATED: 'Tạo bản nháp',
  REQUEST_UPDATED: 'Cập nhật bản nháp',
  REQUEST_SUBMITTED: 'Gửi phê duyệt',
  REQUEST_APPROVED: 'Phê duyệt yêu cầu',
  REQUEST_REJECTED: 'Từ chối yêu cầu',
  REQUEST_CANCELLED: 'Hủy yêu cầu',
};
export const fmtDate = (value?: string | null, time = false) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(new Date(value))
    : '—';
export const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(-2)
    .map((s) => s[0])
    .join('');
export const can = (a: Actor | undefined, p: string) => !!a?.permissions[p]?.length;
export function downloadCsv(name: string, headers: string[], rows: unknown[][]) {
  const cell = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    ['\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')],
    { type: 'text/csv;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
