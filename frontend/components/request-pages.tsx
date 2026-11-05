'use client';
import { useUnsavedNavigation } from './unsaved-navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoneyInput } from './money-input';
import { isMoneyField } from '../lib/money-input';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Copy,
  FileText,
  FloppyDisk,
  PaperPlaneTilt,
  Printer,
  XCircle,
  Eye,
  Clock,
  ShieldCheck,
} from '@phosphor-icons/react';
import { WorkflowProgress, SubmissionHistory } from './workflow-progress';
import { RequestCollaboration } from './operations-pages';
import { api, can, Field, Template, RequestItem, fmtDate, eventLabels, money } from '../lib/api';
import {
  Avatar,
  Badge,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  Step,
  useAction,
  useResource,
  useSession,
} from './ui';
export function FormInputs({
  fields,
  values,
  onChange,
  errors = {},
}: {
  fields: Field[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  errors?: Record<string, string>;
}) {
  return (
    <div className="form-fields">
      {fields.map((f) =>
        f.type === 'SECTION' ? (
          <h3 className="form-section" key={f.key}>
            {f.label}
          </h3>
        ) : (
          <div
            className={'input-group ' + (f.full_width || f.type === 'TEXTAREA' ? 'span-2' : '')}
            key={f.key}
          >
            <label htmlFor={'field-' + f.key}>
              {f.label}
              {f.is_required && <span className="required"> *</span>}
            </label>
            {f.type === 'TEXTAREA' ? (
              <textarea
                id={'field-' + f.key}
                value={values[f.key] ?? ''}
                maxLength={5000}
                rows={4}
                aria-invalid={!!errors[f.key]}
                aria-describedby={errors[f.key] ? 'error-' + f.key : undefined}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            ) : f.type === 'SELECT' ? (
              <select
                id={'field-' + f.key}
                value={values[f.key] ?? ''}
                aria-invalid={!!errors[f.key]}
                onChange={(e) => onChange(f.key, e.target.value)}
              >
                <option value="">Chọn {f.label.toLowerCase()}</option>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.type === 'CHECKBOX' ? (
              <label className="checkbox-label">
                <input
                  id={'field-' + f.key}
                  type="checkbox"
                  checked={values[f.key] === true}
                  onChange={(e) => onChange(f.key, e.target.checked)}
                />
                Xác nhận {f.label.toLowerCase()}
              </label>
            ) : isMoneyField(f) ? (
              <MoneyInput
                id={'field-' + f.key}
                value={values[f.key] ?? ''}
                aria-invalid={!!errors[f.key]}
                aria-describedby={errors[f.key] ? 'error-' + f.key : undefined}
                placeholder="Ví dụ: 20.000.000"
                onValueChange={(value) => onChange(f.key, value)}
              />
            ) : (
              <input
                id={'field-' + f.key}
                type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'}
                step={f.type === 'NUMBER' ? 'any' : undefined}
                maxLength={500}
                value={values[f.key] ?? ''}
                aria-invalid={!!errors[f.key]}
                aria-describedby={errors[f.key] ? 'error-' + f.key : undefined}
                onChange={(e) =>
                  onChange(
                    f.key,
                    f.type === 'NUMBER' && e.target.value !== ''
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            )}{' '}
            {errors[f.key] && (
              <span className="field-error" id={'error-' + f.key}>
                {errors[f.key]}
              </span>
            )}
          </div>
        ),
      )}
    </div>
  );
}
export function Paper({
  name,
  code,
  fields,
  values,
  request,
}: {
  name: string;
  code: string;
  fields: Field[];
  values: Record<string, any>;
  request?: RequestItem;
}) {
  return (
    <article className="paper print-document">
      <div className="paper-letterhead">
        <div>
          <b>FLOWPILOT CORPORATION</b>
          <span>Hệ thống biểu mẫu nội bộ</span>
        </div>
        <div>
          <b>{code}</b>
          <span>{request?.request_code || 'BẢN XEM TRƯỚC'}</span>
        </div>
      </div>
      <header className="paper-title">
        <h2>{name}</h2>
        <p>{request ? 'Ngày lập: ' + fmtDate(request.created_at) : 'Biểu mẫu sử dụng nội bộ'}</p>
      </header>
      {request && (
        <div className="paper-meta">
          <p>
            <b>Người đề nghị:</b> {request.requester_name}
          </p>
          <p>
            <b>Đơn vị:</b> {request.unit_name}
          </p>
          <p>
            <b>Chức danh:</b> {request.requester_position}
          </p>
        </div>
      )}
      <div className="paper-fields">
        {fields.map((f) =>
          f.type === 'SECTION' ? (
            <h3 className="span-2" key={f.key}>
              {f.label}
            </h3>
          ) : (
            <div
              className={'paper-field ' + (f.full_width || f.type === 'TEXTAREA' ? 'span-2' : '')}
              key={f.key}
            >
              <b>{f.label}</b>
              <p>
                {f.type === 'CHECKBOX' ? (
                  values[f.key] ? (
                    '☑ Đã xác nhận'
                  ) : (
                    '☐ Chưa xác nhận'
                  )
                ) : values[f.key] !== undefined && values[f.key] !== '' ? (
                  f.type === 'NUMBER' ? (
                    money(values[f.key])
                  ) : (
                    String(values[f.key])
                  )
                ) : (
                  <span className="paper-placeholder">
                    ................................................................
                  </span>
                )}
              </p>
            </div>
          ),
        )}
      </div>
      {request?.decision_comment && (
        <div className="paper-decision">
          <b>Ý kiến người phê duyệt</b>
          <p>{request.decision_comment}</p>
        </div>
      )}
      {request && request.tasks.length > 0 && (
        <section className="paper-approvals">
          <h3>Lịch sử người xử lý</h3>
          <p>
            Quy trình v{request.instance?.workflow_version} · Vòng gửi{' '}
            {request.instance?.current_round}
          </p>
          <table>
            <thead>
              <tr>
                <th>Vòng / bước</th>
                <th>Người xử lý</th>
                <th>Kết quả / thời điểm</th>
              </tr>
            </thead>
            <tbody>
              {request.tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    Vòng {t.round} · {t.step_name}
                  </td>
                  <td>
                    {t.assignee_snapshot.name}
                    <br />
                    {t.assignee_snapshot.position}
                  </td>
                  <td>
                    {t.status === 'APPROVED'
                      ? 'Đồng ý'
                      : t.status === 'REJECTED'
                        ? 'Từ chối'
                        : t.status === 'RETURNED'
                          ? 'Trả bổ sung'
                          : t.status === 'CANCELLED'
                            ? 'Đã hủy'
                            : 'Đang chờ'}
                    <br />
                    {fmtDate(t.decided_at, true)}
                    {t.comment && <p>{t.comment}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <div className="paper-signatures">
        <div>
          <b>NGƯỜI ĐỀ NGHỊ</b>
          <span>{request?.requester_name || 'Ký và ghi rõ họ tên'}</span>
        </div>
        <div>
          <b>NGƯỜI PHÊ DUYỆT</b>
          <span>{request?.approver_name || 'Ký và ghi rõ họ tên'}</span>
          {request?.decided_at && (
            <small>
              {request.status === 'APPROVED' ? 'Đã phê duyệt' : 'Đã từ chối'} ·{' '}
              {fmtDate(request.decided_at, true)}
            </small>
          )}
        </div>
      </div>
      <footer className="paper-footer">
        Tài liệu được tạo từ ORVA · {request?.request_code || code}
        <span>Khổ A4 · 210 × 297 mm</span>
      </footer>
    </article>
  );
}
function validate(fields: Field[], data: Record<string, any>) {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === 'SECTION') continue;
    if (
      f.is_required &&
      (data[f.key] === undefined ||
        (typeof data[f.key] === 'string' && !data[f.key].trim()) ||
        data[f.key] === null ||
        (f.type === 'CHECKBOX' && data[f.key] !== true))
    )
      errors[f.key] = 'Vui lòng hoàn thành ' + f.label.toLowerCase() + '.';
  }
  if (data.startDate && data.endDate && data.startDate > data.endDate)
    errors.endDate = 'Ngày kết thúc phải từ ngày bắt đầu trở đi.';
  return errors;
}
export function RequestEditor({ draft, onSaved }: { draft?: RequestItem; onSaved?: () => void }) {
  const { actor, confirm, notify } = useSession(),
    router = useRouter(),
    forms = useResource<Template[]>(draft ? null : 'forms'),
    action = useAction();
  const [selected, setSelected] = useState<Template | null>(null),
    [values, setValues] = useState<Record<string, any>>(draft?.form_data || {}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState(false),
    [localSaved, setLocalSaved] = useState(false);
  const createdId = useRef<string | null>(draft?.id || null),
    dirty = useRef(false),
    savedRevision = useRef<number | undefined>(draft?.revision);
  useUnsavedNavigation(() => dirty.current);
  const fields = draft?.fields || selected?.fields || [],
    name = draft?.form_name || selected?.name || '',
    code = draft?.form_code || selected?.code || '';
  const localKey =
    'flowpilot:draft:' +
    actor.assignmentId +
    ':' +
    (draft?.id || (selected ? selected.id + ':v' + selected.version : 'new'));
  useEffect(() => {
    if (!draft) return;
    try {
      const saved = localStorage.getItem(localKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setValues(data);
          setLocalSaved(true);
          dirty.current = true;
        }
      }
    } catch {}
  }, [draft?.id]);
  useEffect(() => {
    if (draft || !forms.data) return;
    const id = new URLSearchParams(window.location.search).get('template');
    const form = forms.data.find(
      (f) => f.id === id && f.status === 'ACTIVE' && f.workflow_status === 'ACTIVE',
    );
    if (form) choose(form);
  }, [forms.data]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  function choose(form: Template) {
    setSelected(form);
    let initial: Record<string, any> = {};
    try {
      const copied = sessionStorage.getItem('flowpilot:copy:' + actor.assignmentId);
      if (copied) {
        const c = JSON.parse(copied);
        if (c.workflowId === form.workflow_id) {
          initial = c.formData;
          sessionStorage.removeItem('flowpilot:copy:' + actor.assignmentId);
        }
      } else {
        const saved = localStorage.getItem(
          'flowpilot:draft:' + actor.assignmentId + ':' + form.id + ':v' + form.version,
        );
        if (saved) {
          initial = JSON.parse(saved);
          setLocalSaved(true);
        }
      }
    } catch {}
    setValues(initial);
  }
  function change(key: string, value: any) {
    dirty.current = true;
    const next = { ...values, [key]: value };
    setValues(next);
    setErrors((e) => ({ ...e, [key]: '' }));
    try {
      localStorage.setItem(localKey, JSON.stringify(next));
      setLocalSaved(true);
    } catch {
      setLocalSaved(false);
    }
  }
  async function save(submit: boolean) {
    if (submit) {
      const invalid = validate(fields, values);
      setErrors(invalid);
      if (Object.keys(invalid).length) {
        document.getElementById('field-' + Object.keys(invalid)[0])?.focus();
        return;
      }
      if (
        !(await confirm(
          'Gửi yêu cầu phê duyệt?',
          'Sau khi gửi, nội dung đơn được giữ nguyên. Người duyệt sẽ nhận thông báo để xử lý.',
        ))
      )
        return;
    }
    const ok = await action.run(
      async () => {
        if (createdId.current)
          savedRevision.current = (
            await api('requests/' + createdId.current, 'PUT', {
              formData: values,
              expectedRevision: savedRevision.current,
            })
          ).revision;
        else {
          const r = await api('requests', 'POST', {
            workflowId: selected!.workflow_id,
            formData: values,
          });
          createdId.current = r.id;
          savedRevision.current = r.revision;
        }
        if (submit)
          await api('requests/' + createdId.current + '/submit', 'POST', {
            expectedRevision: savedRevision.current,
            idempotencyKey: crypto.randomUUID(),
          });
        dirty.current = false;
        try {
          localStorage.removeItem(localKey);
        } catch {}
        onSaved?.();
        router.push('/requests/' + createdId.current);
      },
      submit ? 'Đã gửi yêu cầu phê duyệt.' : 'Đã lưu bản nháp.',
    );
    if (!ok) setErrors({});
  }
  if (!can(actor, 'REQUEST_CREATE')) return <Empty title="Bạn chưa có quyền tạo yêu cầu" />;
  if (!draft && !selected)
    return (
      <>
        <Link href="/requests" className="back-link">
          <ArrowLeft />
          Quay lại yêu cầu
        </Link>
        <PageHeader
          eyebrow="TẠO YÊU CẦU"
          title="Bạn muốn đề xuất điều gì?"
          description="Đây là bước điền đơn từ mẫu đã được duyệt. Để thiết kế mẫu mới, chọn Tạo mẫu đơn mới ở menu trái."
        />
        <ErrorBox message={forms.error} />
        {forms.loading ? (
          <Loading />
        ) : (
          <div className="template-grid">
            {forms.data
              ?.filter((f) => f.status === 'ACTIVE' && f.workflow_status === 'ACTIVE')
              .map((f) => (
                <button className="template-card selectable" onClick={() => choose(f)} key={f.id}>
                  <span className="template-icon">
                    <FileText size={27} />
                  </span>
                  <span className="template-code">{f.code}</span>
                  <h2>{f.name}</h2>
                  <p>{f.description}</p>
                  <div className="template-bottom">
                    <span>
                      {f.fields.filter((x) => x.type !== 'SECTION').length} trường thông tin
                    </span>
                    <ArrowRight size={19} />
                  </div>
                </button>
              ))}
            {!forms.data?.some((f) => f.status === 'ACTIVE' && f.workflow_status === 'ACTIVE') && (
              <div className="empty">
                <h2>Chưa có mẫu đơn sẵn dùng</h2>
                <p>Hãy tạo mẫu đơn mới rồi gửi cấp trên thẩm định trước khi lập yêu cầu.</p>
                {can(actor, 'FORM_CREATE') && (
                  <Link className="button primary" href="/forms/new">
                    Tạo mẫu đơn mới
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </>
    );
  return (
    <>
      <div className="no-print">
        <button
          className="back-link"
          onClick={async () => {
            if (
              !dirty.current ||
              (await confirm(
                'Rời khỏi biểu mẫu?',
                'Dữ liệu bạn nhập đã được lưu tạm trên trình duyệt. Hãy lưu bản nháp để tiếp tục trên thiết bị khác.',
              ))
            ) {
              if (draft) onSaved?.();
              else {
                setSelected(null);
                createdId.current = null;
                savedRevision.current = undefined;
              }
            }
          }}
        >
          <ArrowLeft /> {draft ? 'Quay lại chi tiết' : 'Chọn biểu mẫu khác'}
        </button>
        <PageHeader
          eyebrow="SOẠN YÊU CẦU"
          title={name}
          description={
            draft?.status === 'RETURNED'
              ? 'Bổ sung theo góp ý rồi gửi lại. Quy trình sẽ chạy lại từ bước đầu theo phiên bản đã chốt.'
              : 'Hoàn thành các trường có dấu * trước khi gửi phê duyệt.'
          }
          actions={
            <button className="button" onClick={() => setPreview(true)}>
              <Eye size={18} />
              Xem trước A4
            </button>
          }
        />
      </div>
      <div className="request-layout">
        <section className="panel panel-pad">
          <div className="document-section-heading">
            <span className="template-icon">
              <FileText size={25} />
            </span>
            <div>
              <h2>Thông tin đề nghị</h2>
              <p>
                {code} · {fields.filter((f) => f.type !== 'SECTION').length} trường thông tin
              </p>
            </div>
          </div>
          <ErrorBox message={action.error} />
          <FormInputs
            fields={fields}
            values={values}
            onChange={change}
            errors={{ ...action.errors, ...errors }}
          />
          <div className="form-save-status">
            <CheckCircle size={16} />
            {localSaved
              ? 'Đã lưu tạm trên trình duyệt này'
              : 'Bản nháp chỉ được gửi khi bạn xác nhận'}
          </div>
          <div className="form-actions">
            <button className="button" disabled={action.busy} onClick={() => save(false)}>
              <FloppyDisk size={18} />
              {action.busy ? 'Đang lưu…' : 'Lưu bản nháp'}
            </button>
            <button className="button primary" disabled={action.busy} onClick={() => save(true)}>
              <PaperPlaneTilt size={18} />
              Gửi phê duyệt
            </button>
          </div>
        </section>
        <aside className="request-aside no-print">
          <section className="panel panel-pad">
            <h2>Hành trình yêu cầu</h2>
            <Step title="Soạn yêu cầu" description="Hoàn thiện thông tin và lưu nháp" active />
            <Step
              title="Chờ phê duyệt"
              description={
                selected?.approver_type === 'POSITION'
                  ? 'Người giữ chức danh ' + selected.target_position_name
                  : 'Quản lý trực tiếp của bạn'
              }
            />
            <Step title="Nhận kết quả" description="Theo dõi quyết định qua thông báo" />
          </section>
          <div className="info-note">
            <ShieldCheck size={22} />
            <p>
              <b>Thông tin được lưu theo hồ sơ</b>Đơn đã gửi giữ nguyên nội dung và người duyệt tại
              thời điểm gửi.
            </p>
          </div>
        </aside>
      </div>
      {preview && (
        <Modal title="Xem trước tài liệu A4" wide onClose={() => setPreview(false)}>
          <div className="preview-stage">
            <Paper name={name} code={code} fields={fields} values={values} />
          </div>
          <div className="modal-actions">
            <button className="button" onClick={() => setPreview(false)}>
              Tiếp tục soạn
            </button>
            <button className="button primary" onClick={() => window.print()}>
              <Printer size={18} />
              In / Lưu PDF
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function RequestDetail({ id }: { id: string }) {
  const resource = useResource<RequestItem>('requests/' + id),
    { actor, confirm } = useSession(),
    action = useAction(),
    router = useRouter();
  const [editing, setEditing] = useState(false),
    [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | 'RETURNED' | null>(null),
    [comment, setComment] = useState('');
  if (resource.loading) return <Loading />;
  if (resource.error)
    return (
      <>
        <ErrorBox message={resource.error} />
        <Link href="/requests" className="button">
          Về danh sách
        </Link>
      </>
    );
  const r = resource.data!;
  const task = r.tasks?.find(
    (t) => t.status === 'PENDING' && t.assignee_assignment_id === actor.assignmentId,
  );
  const own = r.requester_assignment_id === actor.assignmentId,
    reviewer = !!task;
  if (editing)
    return (
      <RequestEditor
        draft={r}
        onSaved={() => {
          setEditing(false);
          resource.reload();
        }}
      />
    );
  async function copy() {
    if (!can(actor, 'REQUEST_CREATE')) return;
    await action.run(async () => {
      const forms = await api<Template[]>('forms');
      const form = forms.find(
        (f) =>
          f.workflow_id === r.workflow_id &&
          f.status === 'ACTIVE' &&
          f.workflow_status === 'ACTIVE',
      );
      if (!form) throw new Error('Biểu mẫu đã ngừng hoạt động. Vui lòng chọn mẫu mới từ thư viện.');
      sessionStorage.setItem(
        'flowpilot:copy:' + actor.assignmentId,
        JSON.stringify({
          workflowId: r.workflow_id,
          formData: Object.fromEntries(
            form.fields
              .filter(
                (f) =>
                  f.type !== 'SECTION' &&
                  r.fields.some((old) => old.key === f.key && old.type === f.type) &&
                  (f.type !== 'SELECT' || f.options.includes(r.form_data[f.key])) &&
                  r.form_data[f.key] !== undefined,
              )
              .map((f) => [f.key, r.form_data[f.key]]),
          ),
        }),
      );
      router.push('/requests/new?template=' + form.id);
    });
  }
  return (
    <>
      <div className="no-print">
        <Link href={reviewer ? '/inbox' : '/requests'} className="back-link">
          <ArrowLeft size={18} />
          Về danh sách yêu cầu
        </Link>
        <PageHeader
          eyebrow={r.request_code || 'BẢN NHÁP · CHƯA CẤP MÃ'}
          title={r.form_name}
          description={
            'Tạo bởi ' +
            r.requester_name +
            ' · ' +
            fmtDate(r.created_at, true) +
            ' · Mẫu phiên bản ' +
            r.template_snapshot.version
          }
          actions={
            <>
              <button className="button" onClick={() => window.print()}>
                <Printer size={18} />
                In / Lưu PDF
              </button>
              {own && ['DRAFT', 'RETURNED'].includes(r.status) && (
                <button className="button primary" onClick={() => setEditing(true)}>
                  {r.status === 'RETURNED' ? 'Bổ sung và gửi lại' : 'Tiếp tục soạn'}{' '}
                  <ArrowRight size={18} />
                </button>
              )}
              {own && r.status === 'REJECTED' && (
                <button className="button primary" disabled={action.busy} onClick={copy}>
                  <Copy size={18} />
                  Tạo đơn mới từ đơn này
                </button>
              )}
            </>
          }
        />
        <ErrorBox message={action.error} />
        {action.error && (
          <button className="button" onClick={resource.reload}>
            Tải lại hồ sơ và nhiệm vụ
          </button>
        )}
        {r.instance?.status === 'BLOCKED' && (
          <div className="decision-note returned">
            <b>Quy trình cần kiểm tra</b>
            <p>{r.instance.blocked_reason}</p>
            {can(actor, 'WORKFLOW_OPERATE') && (
              <button
                className="button"
                disabled={action.busy}
                onClick={() =>
                  action.run(async () => {
                    await api('requests/' + id + '/retry', 'POST');
                    resource.reload();
                  }, 'Đã thử lại bước xử lý.')
                }
              >
                Thử lại sau khi khắc phục
              </button>
            )}
          </div>
        )}
      </div>
      <div className="request-layout detail-layout">
        <div className="document-canvas">
          <div className="document-toolbar no-print">
            <span>
              <FileText size={17} />
              Tài liệu yêu cầu
            </span>
            <span>A4 · 210 × 297 mm</span>
          </div>
          <Paper
            name={r.form_name}
            code={r.form_code}
            fields={r.fields}
            values={r.form_data}
            request={r}
          />
        </div>
        <aside className="request-aside no-print">
          <WorkflowProgress request={r} />
          <section className="panel panel-pad">
            <div className="panel-heading compact">
              <h2>Trạng thái xử lý</h2>
            </div>
            <Badge status={r.status} />
            <div className="definition-list">
              <div>
                <span>Người gửi</span>
                <b>{r.requester_name}</b>
              </div>
              <div>
                <span>Người duyệt</span>
                <b>{r.approver_name || 'Chọn khi gửi'}</b>
              </div>
              <div>
                <span>Ngày gửi</span>
                <b>{fmtDate(r.submitted_at, true)}</b>
              </div>
              {r.decided_at && (
                <div>
                  <span>Ngày quyết định</span>
                  <b>{fmtDate(r.decided_at, true)}</b>
                </div>
              )}
            </div>
            {r.decision_comment && (
              <div className={'decision-note ' + r.status.toLowerCase()}>
                <b>Nhận xét của người duyệt</b>
                <p>{r.decision_comment}</p>
              </div>
            )}
            {reviewer && r.status === 'PENDING' && (
              <div className="decision-actions">
                {can(actor, 'REQUEST_APPROVE') && (
                  <button
                    className="button primary full-button"
                    onClick={() => setDecision('APPROVED')}
                  >
                    <CheckCircle size={19} />
                    Đồng ý bước này
                  </button>
                )}
                {can(actor, 'REQUEST_REJECT') && (
                  <button
                    className="button danger-outline full-button"
                    onClick={() => setDecision('REJECTED')}
                  >
                    <XCircle size={19} />
                    Từ chối yêu cầu
                  </button>
                )}
              </div>
            )}
            {reviewer && r.status === 'PENDING' && can(actor, 'REQUEST_RETURN') && (
              <button className="button full-button" onClick={() => setDecision('RETURNED')}>
                Trả để bổ sung
              </button>
            )}
            {own &&
              ['DRAFT', 'PENDING', 'RETURNED'].includes(r.status) &&
              can(actor, 'REQUEST_CANCEL') && (
                <button
                  className="button danger-outline full-button"
                  disabled={action.busy}
                  onClick={async () => {
                    if (
                      await confirm(
                        'Hủy yêu cầu này?',
                        'Yêu cầu sẽ chuyển sang Đã hủy và không thể gửi lại. Hồ sơ vẫn được lưu trong lịch sử.',
                      )
                    )
                      action.run(async () => {
                        await api('requests/' + id + '/cancel', 'POST');
                        resource.reload();
                      }, 'Đã hủy yêu cầu.');
                  }}
                >
                  Hủy yêu cầu
                </button>
              )}
            {r.status === 'REJECTED' && own && (
              <p className="helper">
                Đơn này được giữ nguyên. Bạn có thể tạo đơn mới từ nội dung cũ để bổ sung và gửi
                lại.
              </p>
            )}
          </section>
          <section className="panel panel-pad">
            <h2>Lịch sử hoạt động</h2>
            <ol className="timeline">
              {r.logs.map((log: any) => (
                <li key={log.id}>
                  <span className="timeline-dot" />
                  <b>{eventLabels[log.event_type] || log.event_type}</b>
                  <p>{log.actor_name}</p>
                  <time>{fmtDate(log.occurred_at, true)}</time>
                  {log.details?.comment && <blockquote>{log.details.comment}</blockquote>}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      <SubmissionHistory request={r} />
      <RequestCollaboration request={r} onChanged={resource.reload} />
      {decision && (
        <Modal
          title={
            decision === 'APPROVED'
              ? 'Đồng ý bước phê duyệt'
              : decision === 'RETURNED'
                ? 'Trả đơn để bổ sung'
                : 'Từ chối nhiệm vụ'
          }
          onClose={() => {
            if (!action.busy) setDecision(null);
          }}
        >
          <p className="modal-description">
            {r.request_code} · {r.requester_name}
            <br />
            {decision === 'RETURNED'
              ? 'Người gửi sẽ bổ sung rồi gửi lại từ bước đầu. Lịch sử và phiên bản quy trình được giữ.'
              : `Nhiệm vụ: ${task?.step_name || ''}. Kết quả được kết hợp theo quy tắc của bước và lưu vào lịch sử.`}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action.run(
                  async () => {
                    await api('requests/' + id + '/decision', 'POST', {
                      decision,
                      comment,
                      taskId: task?.id,
                      expectedRevision: r.revision,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    resource.reload();
                  },
                  decision === 'APPROVED'
                    ? 'Đã đồng ý nhiệm vụ.'
                    : decision === 'RETURNED'
                      ? 'Đã trả đơn để bổ sung.'
                      : 'Đã từ chối nhiệm vụ.',
                )
              ) {
                setDecision(null);
                setComment('');
              }
            }}
          >
            <label className="field-label">
              Nhận xét {decision !== 'APPROVED' ? '*' : '(không bắt buộc)'}
              <textarea
                autoFocus
                required={decision !== 'APPROVED'}
                maxLength={2000}
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  decision === 'REJECTED'
                    ? 'Nêu rõ lý do và thông tin cần bổ sung…'
                    : 'Ý kiến dành cho người gửi…'
                }
              />
            </label>
            <ErrorBox message={action.error} />
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                disabled={action.busy}
                onClick={() => setDecision(null)}
              >
                Quay lại
              </button>
              <button
                className={'button ' + (decision === 'REJECTED' ? 'danger' : 'primary')}
                disabled={action.busy}
              >
                {action.busy
                  ? 'Đang xử lý…'
                  : 'Xác nhận ' +
                    (decision === 'APPROVED'
                      ? 'đồng ý'
                      : decision === 'RETURNED'
                        ? 'trả bổ sung'
                        : 'từ chối')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
