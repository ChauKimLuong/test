'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Paperclip,
  ChatsCircle,
  ArrowsLeftRight,
  ChartBar,
  ArrowClockwise,
} from '@phosphor-icons/react';
import { api, can, fmtDate, RequestItem } from '../lib/api';
import { useSession, useAction, useResource, PageHeader, ErrorBox, Loading, Empty } from './ui';

export function Delegations() {
  const { actor, confirm } = useSession(),
    action = useAction(),
    list = useResource<any[]>('operations/delegations'),
    people = useResource<any[]>('operations/directory');
  const [person, setPerson] = useState(''),
    [starts, setStarts] = useState(''),
    [ends, setEnds] = useState(''),
    [reason, setReason] = useState('');
  return (
    <>
      <PageHeader
        eyebrow="ĐIỀU PHỐI CÔNG VIỆC"
        title="Ủy quyền phê duyệt"
        description="Bố trí người thay thế khi nghỉ phép. Mỗi nhiệm vụ vẫn giữ lịch sử và thời hạn ban đầu."
      />
      <div className="operations-grid operations-columns">
        <section className="panel panel-pad">
          <h2>
            <ArrowsLeftRight size={21} /> Lịch ủy quyền mới
          </h2>
          <ErrorBox message={action.error || people.error} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api('operations/delegations', 'POST', {
                  delegateAssignmentId: person,
                  startsAt: new Date(starts).toISOString(),
                  endsAt: new Date(ends).toISOString(),
                  reason,
                });
                list.reload();
                setReason('');
              }, 'Đã lưu lịch ủy quyền.');
            }}
          >
            <label className="field-label">
              Người nhận
              <select required value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Chọn người có quyền duyệt</option>
                {people.data?.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} · {p.position} · {p.unit}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Bắt đầu
              <input
                required
                type="datetime-local"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
              />
            </label>
            <label className="field-label">
              Kết thúc
              <input
                required
                type="datetime-local"
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
              />
            </label>
            <label className="field-label">
              Lý do
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="button primary"
              disabled={action.busy || !can(actor, 'TASK_DELEGATE', actor.unitId)}
            >
              {action.busy ? 'Đang lưu…' : 'Lưu lịch ủy quyền'}
            </button>
          </form>
          <p className="helper">
            Tối đa 90 ngày, không trùng lịch. Kiểm tra lại quyền và phạm vi trên từng hồ sơ; nếu
            người nhận không phù hợp, nhiệm vụ giữ nguyên và có thông báo. Thu hồi chỉ dừng chuyển
            giao tiếp theo.
          </p>
        </section>
        <section className="panel panel-pad">
          <h2>Lịch của tôi</h2>
          <ErrorBox message={list.error} />
          {list.loading ? (
            <Loading />
          ) : !list.data?.length ? (
            <Empty title="Chưa có lịch ủy quyền" />
          ) : (
            list.data.map((d) => (
              <article className="operations-item" key={d.id}>
                <b>{d.delegate_name}</b>
                <span>
                  {fmtDate(d.starts_at, true)} → {fmtDate(d.ends_at, true)}
                </span>
                <p>{d.reason}</p>
                <span className="helper">
                  {d.revoked_at
                    ? 'Đã thu hồi'
                    : new Date(d.ends_at) < new Date()
                      ? 'Đã hết hạn'
                      : new Date(d.starts_at) > new Date()
                        ? 'Sắp bắt đầu'
                        : 'Đang hiệu lực'}
                </span>
                {!d.revoked_at && new Date(d.ends_at) > new Date() && (
                  <button
                    className="button"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        if (
                          await confirm(
                            'Thu hồi lịch ủy quyền?',
                            'Những nhiệm vụ đã chuyển vẫn thuộc người nhận.',
                          )
                        ) {
                          await api('operations/delegations/' + d.id + '/revoke', 'POST');
                          list.reload();
                        }
                      })
                    }
                  >
                    Thu hồi
                  </button>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </>
  );
}
const duration = (value: any) =>
  value == null
    ? '—'
    : Number(value) < 60
      ? `${Number(value).toFixed(1)} phút`
      : `${(Number(value) / 60).toFixed(1)} giờ`;
export function WorkflowMetrics() {
  const { actor } = useSession(),
    action = useAction();
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10)),
    [range, setRange] = useState('');
  const report = useResource<any>('operations/metrics' + range);
  const s = report.data?.summary;
  return (
    <>
      <PageHeader
        eyebrow="GIÁM SÁT QUY TRÌNH"
        title="Thời hạn & điểm chậm"
        description="Đo theo lượt chạy bước, trong phạm vi hồ sơ được phép xem. Bước bỏ qua không tính vào số liệu."
        actions={
          <button className="button" onClick={report.reload}>
            <ArrowClockwise size={18} />
            Làm mới
          </button>
        }
      />
      <form
        className="operations-filters panel panel-pad"
        onSubmit={(e) => {
          e.preventDefault();
          setRange(
            '?' +
              new URLSearchParams({
                from: new Date(from + 'T00:00:00').toISOString(),
                to: new Date(to + 'T23:59:59.999').toISOString(),
              }),
          );
        }}
      >
        <label className="field-label">
          Từ ngày
          <input required type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field-label">
          Đến ngày
          <input required type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="button primary">Áp dụng</button>
        {can(actor, 'SLA_OPERATE') && (
          <button
            className="button"
            type="button"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                const result = await api('operations/sla/run', 'POST');
                report.reload();
                return result;
              }, 'Đã kiểm tra thời hạn và lịch ủy quyền.')
            }
          >
            <Clock size={18} />
            Kiểm tra hạn ngay
          </button>
        )}
      </form>
      <ErrorBox message={report.error || action.error} />
      {report.loading ? (
        <Loading />
      ) : (
        s && (
          <>
            <div className="operations-kpis">
              {[
                ['Lượt bước xử lý', s.steps],
                ['Đang chờ', s.active],
                ['Có vi phạm hạn', s.breached],
                [
                  'Hoàn tất đúng hạn',
                  s.sla_completed
                    ? `${Math.round((100 * s.sla_on_time) / s.sla_completed)}%`
                    : 'Chưa có mẫu',
                ],
              ].map(([label, value]) => (
                <div className="panel panel-pad" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <section className="panel panel-pad">
              <h2>
                <ChartBar size={21} /> Điểm chậm theo bước
              </h2>
              <p className="helper">
                Trung bình/p95 chỉ tính bước đã kết thúc; thời gian chờ dài nhất chỉ tính bước đang
                chạy. Tỷ lệ đúng hạn: {s.sla_on_time}/{s.sla_completed} lượt kết thúc có SLA, gồm
                đồng ý/từ chối/trả bổ sung.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Mẫu / bước</th>
                      <th>Số lượt</th>
                      <th>Chờ</th>
                      <th>Trả bổ sung</th>
                      <th>Vi phạm hạn</th>
                      <th>TB đã xong</th>
                      <th>p95 đã xong</th>
                      <th>Chờ lâu nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.bottlenecks.map((b: any, i: number) => (
                      <tr key={i}>
                        <th>
                          {b.form_name}
                          <small className="helper">{b.name}</small>
                        </th>
                        <td>{b.samples}</td>
                        <td>{b.waiting}</td>
                        <td>{b.returned}</td>
                        <td>{b.breached}</td>
                        <td>{duration(b.avg_completed_minutes)}</td>
                        <td>{duration(b.p95_completed_minutes)}</td>
                        <td>{duration(b.longest_wait_minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!report.data.bottlenecks.length && <Empty title="Chưa có bước trong khoảng này" />}
            </section>
            <section className="panel panel-pad">
              <h2>Hồ sơ cần chú ý</h2>
              {report.data.pending.map((p: any) => (
                <Link
                  className="operations-item operations-link"
                  href={'/requests/' + p.request_id}
                  key={p.id}
                >
                  <b>{p.request_code}</b>
                  <span>
                    {p.form_name} · {p.name}
                  </span>
                  <span className={p.breached ? 'operations-overdue' : ''}>
                    {duration(p.duration_minutes)} {p.breached ? '· Quá hạn' : ''}
                  </span>
                </Link>
              ))}
              {!report.data.pending.length && <Empty title="Không có bước đang chờ" />}
            </section>
          </>
        )
      )}
    </>
  );
}
export function RequestCollaboration({
  request: r,
  onChanged,
  allowTransfer = true,
}: {
  request: RequestItem;
  onChanged: () => void;
  allowTransfer?: boolean;
}) {
  const { actor, confirm } = useSession(),
    action = useAction(),
    content = useResource<any>('requests/' + r.id + '/collaboration');
  const own = r.requester_assignment_id === actor.assignmentId,
    editable =
      own && ['DRAFT', 'RETURNED'].includes(r.status) && can(actor, 'REQUEST_ATTACH', actor.unitId);
  const pending = r.tasks.filter(
    (t) =>
      t.status === 'PENDING' &&
      (t.assignee_assignment_id === actor.assignmentId || can(actor, 'TASK_TRANSFER', r.unit_id)),
  );
  const transferable =
    allowTransfer &&
    r.status === 'PENDING' &&
    pending.length > 0 &&
    (can(actor, 'TASK_DELEGATE', actor.unitId) || can(actor, 'TASK_TRANSFER', r.unit_id));
  const people = useResource<any[]>(
    transferable ? 'requests/' + r.id + '/transfer-candidates' : null,
  );
  const [comment, setComment] = useState(''),
    [replaces, setReplaces] = useState(''),
    [taskId, setTaskId] = useState(''),
    [target, setTarget] = useState(''),
    [reason, setReason] = useState('');
  function reload() {
    content.reload();
    onChanged();
  }
  async function upload(file: File) {
    if (file.size > 2097152) throw new Error('Tài liệu tối đa 2 MiB.');
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Không đọc được tài liệu.'));
      reader.readAsDataURL(file);
    });
    const ext = file.name.split('.').at(-1)?.toLowerCase() || '',
      mime: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        txt: 'text/plain',
        csv: 'text/csv',
      };
    await api('requests/' + r.id + '/attachments', 'POST', {
      filename: file.name,
      mimeType: mime[ext],
      contentBase64: base64,
      replacesAttachmentId: replaces || undefined,
      expectedRevision: r.revision,
    });
    reload();
  }
  const attachments = content.data?.attachments || [];
  return (
    <div className="operations-grid operations-columns no-print">
      <section className="panel panel-pad">
        <h2>
          <Paperclip size={21} /> Tài liệu hồ sơ
        </h2>
        <ErrorBox message={action.error || content.error} />
        <p className="helper">
          PDF, PNG, JPEG, TXT, CSV · tối đa 2 MiB/tệp, 20 MiB/hồ sơ. Phiên bản đã gửi được giữ theo
          từng vòng.
        </p>
        {editable && (
          <>
            <label className="field-label">
              Tài liệu muốn bổ sung
              <select value={replaces} onChange={(e) => setReplaces(e.target.value)}>
                <option value="">Tài liệu mới</option>
                {attachments
                  .filter(
                    (at: any) =>
                      !at.archived_at &&
                      !attachments.some(
                        (newer: any) =>
                          newer.document_id === at.document_id && newer.version > at.version,
                      ),
                  )
                  .map((at: any) => (
                    <option key={at.id} value={at.id}>
                      Phiên bản mới của {at.filename}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Chọn tệp
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
                disabled={action.busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void action.run(() => upload(file), 'Đã lưu tài liệu.');
                }}
              />
            </label>
          </>
        )}
        {!editable && (
          <p className="helper">Chỉ người gửi thêm tài liệu khi đơn là nháp hoặc cần bổ sung.</p>
        )}
        {content.loading ? (
          <Loading />
        ) : (
          attachments.map((at: any) => (
            <article className="operations-item" key={at.id}>
              <a href={'/api/requests/' + r.id + '/attachments/' + at.id}>
                {at.filename} · v{at.version}
              </a>
              <small>
                {(at.byte_size / 1024).toFixed(1)} KiB · {at.uploader_name} ·{' '}
                {fmtDate(at.created_at, true)}
              </small>
              <span className="helper">
                {at.rounds.length ? 'Đã gửi ở vòng ' + at.rounds.join(', ') : 'Chưa gửi'}{' '}
                {at.archived_at ? '· Đã gỡ khỏi lần gửi tiếp theo' : ''}
              </span>
              {editable && !at.archived_at && (
                <button
                  className="button"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      if (
                        await confirm(
                          'Gỡ tài liệu khỏi lần gửi tiếp theo?',
                          'Nội dung và lịch sử vòng trước vẫn được giữ.',
                        )
                      ) {
                        await api(
                          'requests/' + r.id + '/attachments/' + at.id + '/archive',
                          'POST',
                          { expectedRevision: r.revision },
                        );
                        reload();
                      }
                    })
                  }
                >
                  Gỡ
                </button>
              )}
            </article>
          ))
        )}
        {!content.loading && !attachments.length && <Empty title="Chưa có tài liệu" />}
      </section>
      <section className="panel panel-pad">
        <h2>
          <ChatsCircle size={21} /> Trao đổi trên hồ sơ
        </h2>
        <p className="helper">
          Trao đổi bổ sung thông tin; quyết định duyệt vẫn thực hiện qua nhiệm vụ riêng.
        </p>
        {content.data?.comments.map((cm: any) => (
          <article key={cm.id} className="operations-item">
            <b>{cm.actor_name}</b>
            <time>{fmtDate(cm.created_at, true)}</time>
            <p className="operations-comment">{cm.body}</p>
          </article>
        ))}
        {can(actor, 'REQUEST_COMMENT', actor.unitId) && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api('requests/' + r.id + '/comments', 'POST', { body: comment });
                setComment('');
                content.reload();
                onChanged();
              }, 'Đã gửi trao đổi.');
            }}
          >
            <label className="field-label">
              Nội dung
              <textarea
                required
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={action.busy}>
              Gửi trao đổi
            </button>
          </form>
        )}
      </section>
      {(transferable || content.data?.transfers.length > 0) && (
        <section className="panel panel-pad span-2">
          <h2>
            <ArrowsLeftRight size={21} /> Chuyển giao & lịch sử
          </h2>
          <ErrorBox message={people.error} />
          {transferable && (
            <form
              className="operations-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  if (
                    await confirm(
                      'Chuyển nhiệm vụ này?',
                      'Người nhận tiếp tục xử lý với thời hạn ban đầu.',
                    )
                  ) {
                    await api('requests/' + r.id + '/transfer', 'POST', {
                      taskId: taskId || pending[0].id,
                      targetAssignmentId: target,
                      reason,
                      expectedRevision: r.revision,
                    });
                    setReason('');
                    reload();
                  }
                });
              }}
            >
              <label className="field-label">
                Nhiệm vụ
                <select
                  value={taskId || pending[0]?.id}
                  onChange={(e) => setTaskId(e.target.value)}
                >
                  {pending.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.step_name} · {t.assignee_snapshot.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Người nhận
                <select required value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Chọn người phù hợp</option>
                  {people.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.position}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label span-2">
                Lý do
                <textarea
                  required
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="button" disabled={action.busy}>
                Chuyển giao
              </button>
            </form>
          )}
          {content.data?.transfers.map((tr: any) => (
            <article className="operations-item" key={tr.id}>
              <b>
                {tr.original_assignee.name} → {tr.replacement_assignee.name}
              </b>
              <span>
                {tr.kind === 'DELEGATION'
                  ? 'Ủy quyền'
                  : tr.kind === 'ESCALATION'
                    ? 'Chuyển cấp quá hạn'
                    : 'Chuyển giao thủ công'}{' '}
                · {fmtDate(tr.occurred_at, true)}
              </span>
              <p>{tr.reason}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
