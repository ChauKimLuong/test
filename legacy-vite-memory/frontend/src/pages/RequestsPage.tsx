import { ArrowClockwise, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { useDeferredValue, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { RequestDetail, RequestStatus, RequestSummary, User } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from './DashboardPage';

const statusOptions: Array<{ value: 'ALL' | RequestStatus; label: string }> = [
  { value: 'ALL', label: 'Tất cả trạng thái' }, { value: 'DRAFT', label: 'Nháp' }, { value: 'IN_REVIEW', label: 'Đang duyệt' },
  { value: 'NEEDS_REVISION', label: 'Cần bổ sung' }, { value: 'APPROVED', label: 'Đã duyệt' }, { value: 'REJECTED', label: 'Từ chối' },
];

export function RequestsPage({ user }: { user: User }) {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [selected, setSelected] = useState<RequestDetail | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | RequestStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const deferredQuery = useDeferredValue(query);

  const load = () => {
    setLoading(true); setError(''); setSelected(null);
    api.requests(user.id).then(setRequests).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false));
  };
  useEffect(load, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = requests.filter((request) => {
    const matchesStatus = status === 'ALL' || request.status === status;
    const normalized = `${request.requestCode} ${request.title} ${request.formTemplate.name}`.toLocaleLowerCase('vi');
    return matchesStatus && normalized.includes(deferredQuery.toLocaleLowerCase('vi'));
  });
  const select = async (id: string) => { try { setSelected(await api.requestDetail(id)); } catch (cause) { setError((cause as Error).message); } };

  return <>
    <section className="page-heading compact"><div><p className="eyebrow">Theo dõi cá nhân</p><h1>Hồ sơ của tôi</h1><p>Xem trạng thái, người xử lý và lịch sử quyết định của từng đề nghị.</p></div>
      <button className="button secondary" onClick={load} disabled={loading}><ArrowClockwise size={18} aria-hidden="true" />Làm mới</button>
    </section>
    <section className="panel">
      <div className="filter-row"><label className="search-input"><MagnifyingGlass size={19} aria-hidden="true" /><span className="sr-only">Tìm hồ sơ</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã hoặc nội dung" /></label>
        <label className="select-label">Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | RequestStatus)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      {error ? <p role="alert" className="inline-error">{error}</p> : null}
      {loading ? <div className="skeleton table-skeleton" aria-label="Đang tải hồ sơ" /> : <div className="responsive-table"><table>
        <thead><tr><th scope="col">Mã</th><th scope="col">Hồ sơ</th><th scope="col">Trạng thái</th><th scope="col">Đang xử lý</th><th scope="col">Cập nhật</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{filtered.length ? filtered.map((request) => <tr key={request.id}><td className="mono">{request.requestCode}</td><td><strong>{request.title}</strong><small>{request.formTemplate.name}</small></td><td><StatusBadge status={request.status} /></td>
          <td>{request.pendingTask ? request.pendingTask.stepLabel : 'Đã kết thúc'}</td><td>{formatDate(request.updatedAt)}</td><td><button className="table-action" onClick={() => select(request.id)} aria-label={`Xem chi tiết ${request.requestCode}`}>Xem <CaretRight size={15} aria-hidden="true" /></button></td></tr>) : <tr><td colSpan={6}><div className="empty-state">Chưa có hồ sơ phù hợp với bộ lọc hiện tại.</div></td></tr>}</tbody>
      </table></div>}
    </section>
    {selected ? <RequestDetailPanel detail={selected} onClose={() => setSelected(null)} /> : null}
  </>;
}

function RequestDetailPanel({ detail, onClose }: { detail: RequestDetail; onClose: () => void }) {
  return <section className="detail-panel" aria-labelledby="detail-title">
    <div className="panel-heading"><div><p className="eyebrow">{detail.requestCode}</p><h2 id="detail-title">{detail.title}</h2><p>{detail.formTemplate.name} - tạo bởi {detail.requester.displayName}</p></div><button className="button secondary" onClick={onClose}>Đóng</button></div>
    <div className="detail-layout"><div><h3>Dữ liệu hồ sơ</h3><dl className="data-list">{Object.entries(detail.data).map(([key, value]) => <div key={key}><dt>{detail.formTemplate.fields.find((field) => field.key === key)?.label ?? key}</dt><dd>{String(value)}</dd></div>)}</dl></div>
      <div><h3>Trạng thái</h3><StatusBadge status={detail.status} /><p className="muted-copy">Cập nhật {formatDate(detail.updatedAt)}</p><h3>Nhật ký</h3><ol className="timeline">{detail.auditLogs.map((log) => <li key={log.id}><strong>{eventLabel(log.eventType)}</strong><span>{log.reason ?? 'Hệ thống đã ghi nhận sự kiện.'}</span><small>{formatDate(log.createdAt)}</small></li>)}</ol></div>
    </div>
  </section>;
}

function eventLabel(event: string) {
  const labels: Record<string, string> = { REQUEST_CREATED: 'Đã tạo hồ sơ', REQUEST_SUBMITTED: 'Đã gửi hồ sơ', REQUEST_RESUBMITTED: 'Đã gửi lại hồ sơ', TASK_CREATED: 'Đã tạo nhiệm vụ', TASK_APPROVED: 'Đã duyệt nhiệm vụ', TASK_REJECTED: 'Đã từ chối nhiệm vụ', TASK_REVISION_REQUESTED: 'Đã yêu cầu bổ sung', REQUEST_APPROVED: 'Hồ sơ đã duyệt', REQUEST_REJECTED: 'Hồ sơ bị từ chối', REQUEST_NEEDS_REVISION: 'Hồ sơ cần bổ sung', REQUEST_IN_REVIEW: 'Hồ sơ đang xử lý' };
  return labels[event] ?? event;
}
