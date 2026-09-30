import { CheckCircle, Clock, FileText, ListChecks, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { DashboardData } from '../types';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardPage({ userId }: { userId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setData(null);
    api.dashboard(userId).then((result) => active && setData(result)).catch((cause: Error) => active && setError(cause.message));
    return () => { active = false; };
  }, [userId]);

  if (error) return <section className="page-message error-message" role="alert">{error}</section>;
  if (!data) return <DashboardSkeleton />;

  const cards = [
    { label: 'Tổng hồ sơ', value: data.metrics.total, icon: FileText, tone: 'blue' },
    { label: 'Đang xử lý', value: data.metrics.inReview, icon: Clock, tone: 'amber' },
    { label: 'Đã duyệt', value: data.metrics.approved, icon: CheckCircle, tone: 'green' },
    { label: 'Việc chờ tôi', value: data.metrics.myPendingTasks, icon: ListChecks, tone: 'navy' },
  ];

  return <>
    <section className="page-heading">
      <div><p className="eyebrow">Theo dõi vận hành</p><h1>Tổng quan quy trình</h1><p>Nắm tình trạng hồ sơ và các nhiệm vụ đang chờ xử lý trong không gian demo.</p></div>
      <div className="status-summary"><WarningCircle size={20} aria-hidden="true" /><span>{data.metrics.needsRevision} hồ sơ cần bổ sung</span></div>
    </section>
    <section className="metric-grid" aria-label="Chỉ số tổng quan">
      {cards.map(({ label, value, icon: Icon, tone }) => <article key={label} className="metric-card">
        <span className={`metric-icon ${tone}`}><Icon size={24} aria-hidden="true" /></span>
        <div><p>{label}</p><strong>{value}</strong></div>
      </article>)}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Hồ sơ mới cập nhật</h2><p>Dữ liệu mẫu để kiểm thử dashboard và trạng thái quy trình.</p></div></div>
      <div className="responsive-table"><table>
        <thead><tr><th scope="col">Mã hồ sơ</th><th scope="col">Nội dung</th><th scope="col">Người tạo</th><th scope="col">Trạng thái</th><th scope="col">Cập nhật</th></tr></thead>
        <tbody>{data.recentRequests.map((request) => <tr key={request.id}>
          <td className="mono">{request.requestCode}</td><td><strong>{request.title}</strong><small>{request.formTemplate.name}</small></td>
          <td>{request.requester.displayName}</td><td><StatusBadge status={request.status} /></td><td>{formatDate(request.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </>;
}

function DashboardSkeleton() {
  return <div className="skeleton-stack" aria-label="Đang tải tổng quan"><div className="skeleton title-skeleton" />
    <div className="metric-grid">{Array.from({ length: 4 }, (_, index) => <div className="skeleton metric-skeleton" key={index} />)}</div><div className="skeleton table-skeleton" />
  </div>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
