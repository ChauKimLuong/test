import { Check, PaperPlaneTilt, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';
import type { ApprovalTask, DecisionType, User } from '../types';
import { formatDate } from './DashboardPage';

export function TasksPage({ user, onTaskUpdated }: { user: User; onTaskUpdated: () => void }) {
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');

  const load = () => {
    setLoading(true); setError('');
    api.tasks(user.id).then(setTasks).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false));
  };
  useEffect(load, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (task: ApprovalTask, action: DecisionType, comment: string) => {
    setSavingId(task.id); setError('');
    try { await api.decideTask(task.id, { actorId: user.id, action, comment }); load(); onTaskUpdated(); }
    catch (cause) { setError((cause as Error).message); setSavingId(''); }
  };
  const pending = tasks.filter((task) => task.status === 'PENDING');
  const completed = tasks.filter((task) => task.status !== 'PENDING');

  return <>
    <section className="page-heading compact"><div><p className="eyebrow">Thao tác phê duyệt</p><h1>Hộp việc của tôi</h1><p>Chỉ nhiệm vụ được giao cho người dùng đang chọn mới có thể được xử lý.</p></div><span className="status-summary">{pending.length} việc chờ</span></section>
    {error ? <p className="page-message error-message" role="alert">{error}</p> : null}
    <section className="task-stack" aria-label="Nhiệm vụ chờ xử lý">{loading ? <div className="skeleton table-skeleton" /> : pending.length ? pending.map((task) => <TaskCard key={task.id} task={task} saving={savingId === task.id} onDecide={decide} />) : <div className="empty-state panel">Không có nhiệm vụ nào đang chờ bạn xử lý. Hãy đổi người dùng demo sang Nguyễn Thu Linh để thực hành phê duyệt.</div>}</section>
    {completed.length ? <section className="panel completed-tasks"><div className="panel-heading"><div><h2>Việc đã xử lý</h2><p>Lịch sử nhiệm vụ của người dùng hiện tại.</p></div></div>{completed.map((task) => <div className="completed-row" key={task.id}><div><strong>{task.request.requestCode} - {task.request.title}</strong><small>{task.stepLabel} · {formatDate(task.completedAt ?? task.dueAt)}</small></div><StatusBadge status={task.status} /></div>)}</section> : null}
  </>;
}

function TaskCard({ task, saving, onDecide }: { task: ApprovalTask; saving: boolean; onDecide: (task: ApprovalTask, action: DecisionType, comment: string) => void }) {
  const [action, setAction] = useState<DecisionType>('APPROVE');
  const [comment, setComment] = useState('');
  const needsComment = action !== 'APPROVE';
  return <article className="task-card"><div className="task-card-header"><div><p className="eyebrow">{task.request.requestCode}</p><h2>{task.request.title}</h2><p>{task.stepLabel} · Người tạo: {task.requester.displayName}</p></div><div><StatusBadge status={task.status} /><small className="due-date">Hạn: {formatDate(task.dueAt)}</small></div></div>
    <dl className="task-data"><div><dt>Loại hồ sơ</dt><dd>{task.request.formTemplate.name}</dd></div>{Object.entries(task.request.data).slice(0, 3).map(([key, value]) => <div key={key}><dt>{task.request.formTemplate.fields.find((field) => field.key === key)?.label ?? key}</dt><dd>{String(value)}</dd></div>)}</dl>
    <form className="decision-form" onSubmit={(event) => { event.preventDefault(); onDecide(task, action, comment); }}><fieldset><legend>Quyết định</legend><div className="decision-options">
      <label className={action === 'APPROVE' ? 'selected' : ''}><input type="radio" value="APPROVE" checked={action === 'APPROVE'} onChange={() => setAction('APPROVE')} /><Check size={18} aria-hidden="true" />Duyệt</label>
      <label className={action === 'REQUEST_REVISION' ? 'selected' : ''}><input type="radio" value="REQUEST_REVISION" checked={action === 'REQUEST_REVISION'} onChange={() => setAction('REQUEST_REVISION')} /><PaperPlaneTilt size={18} aria-hidden="true" />Yêu cầu bổ sung</label>
      <label className={action === 'REJECT' ? 'selected danger-choice' : 'danger-choice'}><input type="radio" value="REJECT" checked={action === 'REJECT'} onChange={() => setAction('REJECT')} /><X size={18} aria-hidden="true" />Từ chối</label>
    </div></fieldset>
      <label className="comment-field"><span>Nhận xét {needsComment ? <b aria-hidden="true">*</b> : '(không bắt buộc)'}</span><textarea required={needsComment} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={needsComment ? 'Nêu rõ lý do để người tạo có thể xử lý tiếp.' : 'Có thể thêm lời nhắn cho người tạo.'} /></label>
      <button className="button primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Xác nhận quyết định'}</button>
    </form>
  </article>;
}
