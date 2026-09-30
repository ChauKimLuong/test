import type { RequestStatus, TaskStatus } from '../types';

const labels: Record<RequestStatus | TaskStatus, string> = {
  DRAFT: 'Nháp', SUBMITTED: 'Đã gửi', IN_REVIEW: 'Đang duyệt', NEEDS_REVISION: 'Cần bổ sung', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối',
  PENDING: 'Chờ xử lý', REVISION_REQUESTED: 'Đã yêu cầu bổ sung',
};

export function StatusBadge({ status }: { status: RequestStatus | TaskStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}>{labels[status]}</span>;
}
