'use client';
import { useState } from 'react';
import { RequestItem, fmtDate } from '../lib/api';
import { Badge } from './ui';
export function WorkflowProgress({ request: r }: { request: RequestItem }) {
  const [round, setRound] = useState<number | null>(null),
    current = round || r.instance?.current_round || 1;
  if (!r.instance) return null;
  return (
    <section className="panel panel-pad workflow-progress">
      <div className="workflow-section-heading">
        <h2>Tiến trình phê duyệt</h2>
        <Badge status={r.instance.status} />
      </div>
      <p className="helper">
        Quy trình v{r.instance.workflow_version} · Mẫu v{r.template_snapshot.version} · Vòng{' '}
        {current}
        {current !== r.instance.current_round ? ' · Lịch sử' : ''}
      </p>
      <label className="field-label">
        Vòng gửi
        <select value={current} onChange={(e) => setRound(Number(e.target.value))}>
          {r.submissions.map((s) => (
            <option key={s.round} value={s.round}>
              Vòng {s.round} · {fmtDate(s.submitted_at, true)}
            </option>
          ))}
        </select>
      </label>
      {r.instance.definition.steps.map((s: any, index: number) => {
        const run = r.steps.find((x) => x.round === current && x.step_id === s.id),
          tasks = r.tasks.filter((t) => t.round === current && t.step_index === index);
        return (
          <div className="workflow-progress-step" key={s.id}>
            <div className="workflow-section-heading">
              <b>
                {index + 1}. {s.name}
              </b>
              <Badge status={run?.status === 'ACTIVE' ? 'PENDING' : run?.status || 'WAITING'} />
            </div>
            <p className="helper">
              {s.mode === 'ALL' ? 'Tất cả người được giao phải đồng ý' : 'Một người đồng ý là đủ'}
              {s.when ? ' · Có điều kiện' : ''}
            </p>
            {run?.condition_result?.conditions?.length > 0 && (
              <details>
                <summary>Kết quả điều kiện</summary>
                {run.condition_result.conditions.map((c: any, i: number) => (
                  <p key={i}>
                    {r.fields.find((f) => f.key === c.field)?.label || c.field}:{' '}
                    {JSON.stringify(c.actual)} · {c.operator} {JSON.stringify(c.value)} →{' '}
                    {c.matched ? 'Đúng' : 'Sai'}
                  </p>
                ))}
              </details>
            )}
            {tasks.map((t) => (
              <div className="workflow-task-item" key={t.id}>
                <b>{t.assignee_snapshot.name}</b>
                <small>
                  {t.assignee_snapshot.position} · {t.assignee_snapshot.unit}
                </small>
                <Badge status={t.status} />
                {t.due_at && (
                  <p
                    className={
                      'helper ' +
                      (t.status === 'PENDING' && new Date(t.due_at) < new Date()
                        ? 'operations-overdue'
                        : '')
                    }
                  >
                    Hạn: {fmtDate(t.due_at, true)}{' '}
                    {t.status === 'PENDING' && new Date(t.due_at) < new Date() ? '· Quá hạn' : ''}
                  </p>
                )}
                {t.comment && <blockquote>{t.comment}</blockquote>}
                {t.decided_at && <time>{fmtDate(t.decided_at, true)}</time>}
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
export function SubmissionHistory({ request: r }: { request: RequestItem }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (!r.submissions?.length) return null;
  const round = selected || r.submissions.at(-1).round,
    submission = r.submissions.find((s) => s.round === round),
    previous = r.submissions.find((s) => s.round === round - 1);
  const show = (v: any) =>
    v === undefined || v === null || v === ''
      ? '—'
      : typeof v === 'boolean'
        ? v
          ? 'Đã xác nhận'
          : 'Chưa xác nhận'
        : String(v);
  return (
    <section className="panel panel-pad no-print">
      <h2>Dữ liệu từng vòng gửi</h2>
      <p className="helper">
        Bản lưu tại thời điểm gửi; chỉnh sửa bổ sung không ghi đè dữ liệu vòng trước.
      </p>
      <label className="field-label">
        Chọn vòng
        <select value={round} onChange={(e) => setSelected(Number(e.target.value))}>
          {r.submissions.map((s) => (
            <option value={s.round} key={s.round}>
              Vòng {s.round} · {fmtDate(s.submitted_at, true)}
            </option>
          ))}
        </select>
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Trường</th>
              {previous && <th>Vòng trước</th>}
              <th>Vòng {round}</th>
            </tr>
          </thead>
          <tbody>
            {r.fields
              .filter((f) => f.type !== 'SECTION')
              .map((f) => (
                <tr
                  className={
                    previous &&
                    JSON.stringify(previous.form_data_snapshot[f.key]) !==
                      JSON.stringify(submission.form_data_snapshot[f.key])
                      ? 'workflow-data-changed'
                      : ''
                  }
                  key={f.key}
                >
                  <th>{f.label}</th>
                  {previous && <td>{show(previous.form_data_snapshot[f.key])}</td>}
                  <td>{show(submission.form_data_snapshot[f.key])}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
