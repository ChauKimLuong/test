'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ArrowsClockwise,
  Calendar,
  CaretDown,
  CheckSquare,
  Copy,
  DotsSixVertical,
  Eye,
  FileText,
  FloppyDisk,
  GitBranch,
  Hash,
  ListBullets,
  Plus,
  TextT,
  TextAlignLeft,
  Trash,
  ArrowCounterClockwise,
  ArrowClockwise,
  Printer,
  ShieldCheck,
  PencilSimple,
} from '@phosphor-icons/react';
import { api, can, Field, Template } from '../lib/api';
import {
  Badge,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  Search,
  useAction,
  useResource,
  useSession,
} from './ui';
import { Paper } from './request-pages';
const fieldTypes = [
  { type: 'TEXT', label: 'Văn bản ngắn', icon: TextT },
  { type: 'TEXTAREA', label: 'Văn bản dài', icon: TextAlignLeft },
  { type: 'NUMBER', label: 'Số', icon: Hash },
  { type: 'DATE', label: 'Ngày tháng', icon: Calendar },
  { type: 'SELECT', label: 'Danh sách chọn', icon: ListBullets },
  { type: 'CHECKBOX', label: 'Xác nhận', icon: CheckSquare },
  { type: 'SECTION', label: 'Tiêu đề nhóm', icon: FileText },
];
function toPayload(fields: Field[]) {
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    isRequired: f.is_required,
    fullWidth: f.full_width,
    options: f.options,
  }));
}
export function FormLibrary() {
  const { actor, confirm } = useSession(),
    resource = useResource<Template[]>('forms'),
    directory = useResource<any>(can(actor, 'FORM_REVIEW') ? 'organization' : null),
    reviewers = useResource<any[]>(can(actor, 'FORM_CREATE') ? 'forms/reviewers' : null),
    action = useAction(),
    router = useRouter();
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [preview, setPreview] = useState<Template | null>(null),
    [review, setReview] = useState<Template | null>(null),
    [approverType, setApproverType] = useState('DIRECT_MANAGER'),
    [targetPositionId, setTargetPositionId] = useState(''),
    [reviewComment, setReviewComment] = useState(''),
    [proposal, setProposal] = useState<Template | null>(null),
    [reviewerId, setReviewerId] = useState('');
  const creator = can(actor, 'FORM_CREATE'), reviewer = can(actor, 'FORM_REVIEW');
  function clone(f: Template) {
    sessionStorage.setItem('flowpilot:template-copy', JSON.stringify(f));
    router.push('/forms/new');
  }
  return (
    <>
      <PageHeader
        eyebrow="BIỂU MẪU DOANH NGHIỆP"
        title="Thư viện biểu mẫu"
        description="Thiết kế mẫu đơn dùng chung, thẩm định và chọn mẫu đã duyệt để gửi yêu cầu."
        actions={
          creator && (
            <Link href="/forms/new" className="button primary">
              <Plus size={18} />
              Tạo mẫu đơn mới
            </Link>
          )
        }
      />
      <div className="info-banner">
        <FileText size={21} />
        <span>{can(actor,'FORM_PUBLISH') ? 'Bạn có quyền ban hành: mẫu mới được dùng ngay sau khi lưu. Bạn cũng có thể chỉnh sửa mẫu dùng chung; đơn đã tạo giữ nguyên phiên bản cũ.' : 'Mọi thành viên đều có thể đề xuất mẫu. Thiết kế A4, lưu nháp rồi chọn cấp trên hoặc lãnh đạo thẩm định. Mẫu được duyệt sẽ xuất hiện trong thư viện dùng chung.'}</span>
      </div>
      <ErrorBox message={resource.error || action.error} />
      <div className="library-toolbar">
        <Search value={search} onChange={setSearch} placeholder="Tìm biểu mẫu theo tên hoặc mã…" />
        {(creator || reviewer) && (
          <select
            aria-label="Trạng thái biểu mẫu"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            {creator && <option value="DRAFT">Bản nháp</option>}
            <option value="PENDING_REVIEW">Chờ thẩm định</option>
            {creator && <option value="RETURNED">Cần bổ sung</option>}
            <option value="INACTIVE">Ngừng hoạt động</option>
          </select>
        )}
        <span className="muted">{resource.data?.length || 0} biểu mẫu</span>
      </div>
      {resource.loading ? (
        <Loading />
      ) : (
        <div className="template-grid">
          {resource.data
            ?.filter(
              (f) =>
                (filter === 'all' || f.status === filter) &&
                (f.name + ' ' + f.code).toLowerCase().includes(search.toLowerCase()),
            )
            .map((f) => (
              <article className="template-card" key={f.id}>
                <div className="template-card-top">
                  <span className="template-icon">
                    <FileText size={27} />
                  </span>
                  <Badge status={f.status} />
                </div>
                <span className="template-code">{f.code}</span>
                <span className="subtext">Phiên bản {f.version}</span>
                <h2>{f.name}</h2>
                <p>{f.description || 'Biểu mẫu dùng trong nội bộ doanh nghiệp.'}</p>
                {f.creator_name && <p className="subtext">Người thiết kế: {f.creator_name}</p>}
                {f.status === 'PENDING_REVIEW' && f.reviewer_name && <p className="subtext">Đang chờ: {f.reviewer_name}</p>}
                {f.review_comment && f.status === 'RETURNED' && <p className="subtext">Góp ý: {f.review_comment}</p>}
                <div className="template-facts">
                  <span>
                    <ListBullets size={16} />
                    {f.fields.filter((x) => x.type !== 'SECTION').length} trường thông tin
                  </span>
                  <span>
                    <GitBranch size={16} />
                  {f.status === 'ACTIVE' || f.status === 'INACTIVE' ? (f.approver_type === 'POSITION' ? f.target_position_name : 'Quản lý trực tiếp') : 'Người thẩm định sẽ thiết lập'}
                  </span>
                </div>
                <div className="template-bottom">
                  <button className="text-link" onClick={() => setPreview(f)}>
                    <Eye size={17} />
                    Xem mẫu
                  </button>
                  {f.status === 'ACTIVE' &&
                    f.workflow_status === 'ACTIVE' &&
                    can(actor, 'REQUEST_CREATE') && (
                      <Link href={'/requests/new?template=' + f.id} className="button small-button">
                        Sử dụng <ArrowRight size={16} />
                      </Link>
                    )}
                </div>
                {(creator || reviewer) && (
                  <div className="template-admin">
                    {creator && <button
                      className="icon-button"
                      aria-label={'Nhân bản ' + f.name}
                      title="Nhân bản"
                      onClick={() => clone(f)}
                    >
                      <Copy size={18} />
                    </button>}
                    {f.can_edit && <Link
                      className="button small-button"
                      href={'/forms/' + f.id + '/edit'}
                      aria-label={'Chỉnh sửa ' + f.name}
                      title="Chỉnh sửa"
                    >
                      <PencilSimple size={18} />
                      Chỉnh sửa
                    </Link>}
                    {can(actor,'WORKFLOW_UPDATE') && ['ACTIVE','INACTIVE'].includes(f.status) && <Link
                      className="icon-button"
                      href={'/workflows?form=' + f.id}
                      aria-label={'Cấu hình duyệt ' + f.name}
                      title="Cấu hình duyệt"
                    >
                      <GitBranch size={18} />
                    </Link>}
                    {creator && f.created_by_assignment_id === actor.assignmentId && ['DRAFT','RETURNED'].includes(f.status) && <button className="button small-button" disabled={action.busy} onClick={() => {setProposal(f);setReviewerId(reviewers.data?.[0]?.id || '');}}>
                      Gửi thẩm định <ArrowRight size={16}/>
                    </button>}
                    {reviewer && f.status === 'PENDING_REVIEW' && f.reviewer_assignment_id === actor.assignmentId && <button className="button small-button primary" onClick={() => {setReview(f);setApproverType('DIRECT_MANAGER');setTargetPositionId('');setReviewComment('');}}>Thẩm định mẫu</button>}
                    {can(actor,'FORM_MANAGE') && ['ACTIVE','INACTIVE'].includes(f.status) && <button
                      className="text-link"
                      disabled={action.busy}
                      onClick={async () => {
                        const next = f.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
                        if (
                          await confirm(
                            next === 'ACTIVE' ? 'Kích hoạt biểu mẫu?' : 'Ngừng sử dụng biểu mẫu?',
                            next === 'ACTIVE'
                              ? 'Biểu mẫu sẽ xuất hiện trong thư viện để nhân viên tạo yêu cầu.'
                              : 'Nhân viên sẽ không thể tạo hoặc gửi đơn mới từ mẫu này. Đơn đang chờ vẫn được xử lý.',
                          )
                        )
                          action.run(async () => {
                            await api('forms/' + f.id + '/status', 'PATCH', { status: next });
                            resource.reload();
                          }, 'Đã cập nhật trạng thái biểu mẫu.');
                      }}
                    >
                      {f.status === 'ACTIVE' ? 'Ngừng sử dụng' : 'Kích hoạt'}
                    </button>}
                  </div>
                )}
              </article>
            ))}
        </div>
      )}
      {!resource.loading && resource.data?.length === 0 && (
        <Empty
          title="Chưa có biểu mẫu"
          description="Tạo mẫu đơn mới và chọn người thẩm định hoặc ban hành theo quyền của bạn."
        />
      )}
      {preview && (
        <Modal title={preview.name} wide onClose={() => setPreview(null)}>
          <div className="preview-stage">
            <Paper name={preview.name} code={preview.code} fields={preview.fields} values={{}} />
          </div>
          <TemplateVersions template={preview} />
          {!!preview.review_events?.length && <div className="form-review-history"><h3>Lịch sử mẫu đơn</h3><ol>{preview.review_events.map(event => <li key={event.id}><b>{({CREATED:'Tạo mẫu',UPDATED:'Chỉnh sửa',SUBMITTED:'Gửi thẩm định',APPROVED:'Duyệt mẫu',RETURNED:'Trả bổ sung',STATUS_CHANGED:'Đổi trạng thái'} as Record<string,string>)[event.event_type] || event.event_type}</b> · {event.actor_name} · {new Date(event.occurred_at).toLocaleString('vi-VN')}{event.comment && <p>{event.comment}</p>}</li>)}</ol></div>}
          <div className="modal-actions">
            <button className="button" onClick={() => window.print()}>
              <Printer size={18} />
              In biểu mẫu
            </button>
            <button className="button primary" onClick={() => setPreview(null)}>
              Đóng xem trước
            </button>
          </div>
        </Modal>
      )}
      {review && <Modal title={'Thẩm định · '+review.name} wide onClose={() => setReview(null)}>
        <p className="modal-description">Mẫu do {review.creator_name} thiết kế · phiên bản {review.version}. Xem A4, chỉnh sửa nếu cần rồi chọn người duyệt các yêu cầu sử dụng mẫu này.</p>
        {review.can_edit && <Link className="button" href={'/forms/'+review.id+'/edit'}>Chỉnh sửa mẫu trước khi duyệt</Link>}
        <div className="preview-stage"><Paper name={review.name} code={review.code} fields={review.fields} values={{}}/></div>
        <label className="field-label">Người duyệt yêu cầu
          <select value={approverType} onChange={e => setApproverType(e.target.value)}><option value="DIRECT_MANAGER">Quản lý trực tiếp</option><option value="POSITION">Theo chức danh</option></select>
        </label>
        {approverType === 'POSITION' && <label className="field-label">Chức danh *<select required value={targetPositionId} onChange={e=>setTargetPositionId(e.target.value)}><option value="">Chọn chức danh</option>{directory.data?.positions?.filter((p:any)=>p.status==='ACTIVE').map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="field-label">Nhận xét<textarea value={reviewComment} onChange={e=>setReviewComment(e.target.value)} placeholder="Ghi chú khi duyệt hoặc lý do cần bổ sung"/></label>
        <ErrorBox message={action.error}/>
        <div className="modal-actions">
          <button className="button" disabled={action.busy} onClick={() => action.run(async()=>{await api('forms/'+review.id+'/review','POST',{decision:'RETURN',comment:reviewComment,version:review.version});setReview(null);resource.reload();},'Đã trả mẫu để nhân viên bổ sung.')}>Trả để bổ sung</button>
          <button className="button primary" disabled={action.busy || (approverType==='POSITION' && !targetPositionId)} onClick={() => action.run(async()=>{await api('forms/'+review.id+'/review','POST',{decision:'APPROVE',version:review.version,approverType,targetPositionId:approverType==='POSITION'?targetPositionId:null,comment:reviewComment});setReview(null);resource.reload();},'Đã thẩm định và lưu mẫu dùng chung.')}>Duyệt và lưu mẫu</button>
        </div>
      </Modal>}
      {proposal && <Modal title={'Gửi thẩm định · '+proposal.name} onClose={()=>setProposal(null)}>
        <p className="modal-description">Chọn cấp trên hoặc lãnh đạo có quyền thẩm định. Người được giao có thể chỉnh sửa mẫu trước khi duyệt.</p>
        <ErrorBox message={reviewers.error || action.error}/>
        <label className="field-label">Người thẩm định *<select value={reviewerId} onChange={e=>setReviewerId(e.target.value)}><option value="">Chọn người thẩm định</option>{reviewers.data?.map(r=><option key={r.id} value={r.id}>{r.full_name} · {r.position_name}{r.is_direct ? ' (quản lý trực tiếp)' : ''}</option>)}</select></label>
        {!reviewers.loading && !reviewers.data?.length && <p>Chưa có người thẩm định phù hợp. Quản trị viên cần phân công cấp trên hoặc cấp quyền thẩm định.</p>}
        <div className="modal-actions"><button className="button" onClick={()=>setProposal(null)}>Quay lại</button><button className="button primary" disabled={action.busy || !reviewerId} onClick={()=>action.run(async()=>{await api('forms/'+proposal.id+'/submit','POST',{reviewerAssignmentId:reviewerId});setProposal(null);resource.reload();},'Đã gửi mẫu đến người thẩm định.')} >Gửi thẩm định</button></div>
      </Modal>}
    </>
  );
}
function TemplateVersions({template}:{template:Template}) {
  const history=useResource<any[]>('forms/'+template.id+'/revisions');
  const [selected,setSelected]=useState<string>('');
  const revision=history.data?.find(r=>r.id===selected);
  return <details className="form-review-history"><summary>Lịch sử phiên bản ({history.data?.length || 0})</summary><ErrorBox message={history.error}/><label className="field-label">Xem lại phiên bản<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Chọn phiên bản</option>{history.data?.map(r=><option key={r.id} value={r.id}>Phiên bản {r.version} · {r.actor_name || 'Hệ thống'} · {new Date(r.created_at).toLocaleString('vi-VN')}</option>)}</select></label>{revision && <div className="preview-stage"><Paper name={revision.snapshot.name} code={revision.snapshot.code} fields={revision.snapshot.fields} values={{}}/></div>}</details>;
}
export function FormBuilder({ id }: { id?: string }) {
  const { actor, confirm } = useSession(),
    router = useRouter(),
    resource = useResource<Template[]>(id ? 'forms' : null),
    directory = useResource<any>(!id && can(actor,'FORM_PUBLISH') ? 'organization' : null),
    action = useAction();
  const [name, setName] = useState('Biểu mẫu mới'),
    [code, setCode] = useState('BM-MOI'),
    [description, setDescription] = useState(''),
    [fields, setFields] = useState<Field[]>([
      {
        key: 'noiDung',
        label: 'Nội dung đề nghị',
        type: 'TEXTAREA',
        is_required: true,
        full_width: true,
        options: [],
      },
    ]),
    [selected, setSelected] = useState('noiDung'),
    [preview, setPreview] = useState(false),
    [loaded, setLoaded] = useState(false),
    [approverType,setApproverType] = useState('DIRECT_MANAGER'),
    [targetPositionId,setTargetPositionId] = useState(''),
    [dirty, setDirty] = useState(false);
  const history = useRef<Field[][]>([]),
    future = useRef<Field[][]>([]),
    dragged = useRef<number | null>(null);
  useEffect(() => {
    if (loaded) return;
    let f: Template | undefined;
    if (id) {
      f = resource.data?.find((x) => x.id === id);
      if (!resource.data) return;
    } else {
      try {
        const s = sessionStorage.getItem('flowpilot:template-copy');
        if (s) {
          f = JSON.parse(s);
          sessionStorage.removeItem('flowpilot:template-copy');
        }
      } catch {}
    }
    if (f) {
      setName(f.name + (id ? '' : ' (bản sao)'));
      setCode(f.code + (id ? '' : '-COPY'));
      setDescription(f.description);
      setFields(f.fields);
      setSelected(f.fields[0]?.key || '');
    }
    setLoaded(true);
  }, [resource.data, id, loaded]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  function edit(next: Field[]) {
    history.current.push(fields);
    if (history.current.length > 60) history.current.shift();
    future.current = [];
    setFields(next);
    setDirty(true);
  }
  function undo() {
    const prev = history.current.pop();
    if (prev) {
      future.current.push(fields);
      setFields(prev);
      setDirty(true);
    }
  }
  function redo() {
    const next = future.current.pop();
    if (next) {
      history.current.push(fields);
      setFields(next);
      setDirty(true);
    }
  }
  function add(type: string) {
    const f: Field = {
      key: 'field_' + Date.now().toString(36),
      label: fieldTypes.find((x) => x.type === type)!.label,
      type,
      is_required: false,
      full_width: ['TEXTAREA', 'SECTION'].includes(type),
      options: type === 'SELECT' ? ['Lựa chọn 1', 'Lựa chọn 2'] : [],
    };
    edit([...fields, f]);
    setSelected(f.key);
  }
  function update(field: Partial<Field>) {
    edit(fields.map((f) => (f.key === selected ? { ...f, ...field } : f)));
    if (field.key) setSelected(field.key);
  }
  function move(index: number, to: number) {
    if (to < 0 || to >= fields.length) return;
    const copy = [...fields],
      f = copy.splice(index, 1)[0];
    copy.splice(to, 0, f);
    edit(copy);
  }
  const current = fields.find((f) => f.key === selected);
  const used = false;
  if (!can(actor, 'FORM_CREATE')) return <Empty title="Bạn chưa có quyền thiết kế biểu mẫu" />;
  if (id && resource.loading) return <Loading />;
  if (id && (!resource.data?.some((f) => f.id === id) || resource.error))
    return <ErrorBox message={resource.error || 'Không tìm thấy biểu mẫu.'} />;
  if (id && !resource.data?.some(f => f.id === id && f.can_edit))
    return <Empty title="Bạn chưa có quyền chỉnh sửa mẫu này"/>;
  return (
    <>
      <div className="no-print">
        <button
          className="back-link"
          onClick={async () => {
            if (
              !dirty ||
              (await confirm('Rời trình thiết kế?', 'Các thay đổi chưa lưu sẽ bị mất.'))
            )
              router.push('/forms');
          }}
        >
          <ArrowLeft size={18} />
          Thư viện biểu mẫu
        </button>
        <PageHeader
          eyebrow="TRÌNH THIẾT KẾ"
          title={id ? 'Chỉnh sửa biểu mẫu' : 'Tạo biểu mẫu doanh nghiệp'}
          description="Thêm thành phần, sắp xếp bố cục và xem trước tài liệu A4."
          actions={
            <>
              <button className="button" onClick={() => setPreview(true)}>
                <Eye size={18} />
                Xem trước
              </button>
              <button
                className="button primary"
                disabled={action.busy || used || (!id && can(actor,'FORM_PUBLISH') && approverType==='POSITION' && !targetPositionId)}
                onClick={() =>
                  action.run(
                    async () => {
                      const b = { name, code, description, fields: toPayload(fields),version:resource.data?.find(f=>f.id===id)?.version,approverType,targetPositionId:targetPositionId || null };
                      await api(id ? 'forms/' + id : 'forms', id ? 'PUT' : 'POST', b);
                      setDirty(false);
                      router.push('/forms');
                    },
                    id
                      ? 'Đã cập nhật biểu mẫu.'
                      : can(actor,'FORM_PUBLISH') ? 'Đã ban hành mẫu dùng chung.' : 'Đã lưu mẫu nháp. Chọn người thẩm định trong thư viện.',
                  )
                }
              >
                <FloppyDisk size={18} />
                {action.busy ? 'Đang lưu…' : id ? 'Lưu phiên bản mới' : can(actor,'FORM_PUBLISH') ? 'Ban hành mẫu' : 'Lưu mẫu nháp'}
              </button>
            </>
          }
        />
        <ErrorBox message={action.error} />
        {id && resource.data?.find(f=>f.id===id)?.request_count! > 0 && (
          <div className="info-banner">
            <ShieldCheck size={23} />
            <span>
              Mỗi lần lưu tạo một phiên bản mới. Đơn đã tạo tiếp tục dùng nội dung của phiên bản cũ; mẫu mới áp dụng cho đơn tạo sau khi lưu.
            </span>
          </div>
        )}
        {!id && can(actor,'FORM_PUBLISH') && <section className="panel panel-pad"><h2>Ban hành trực tiếp</h2><p className="muted">Mẫu sẽ dùng được ngay sau khi lưu. Chọn cách xác định người duyệt các yêu cầu dùng mẫu này.</p><label className="field-label">Người duyệt yêu cầu<select value={approverType} onChange={e=>setApproverType(e.target.value)}><option value="DIRECT_MANAGER">Quản lý trực tiếp</option><option value="POSITION">Theo chức danh</option></select></label>{approverType==='POSITION' && <label className="field-label">Chức danh *<select value={targetPositionId} onChange={e=>setTargetPositionId(e.target.value)}><option value="">Chọn chức danh</option>{directory.data?.positions?.filter((p:any)=>p.status==='ACTIVE').map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<ErrorBox message={directory.error}/></section>}
        <section className="panel builder-metadata">
          <label className="field-label">
            Tên biểu mẫu
            <input
              value={name}
              disabled={used}
              maxLength={150}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label className="field-label">
            Mã biểu mẫu
            <input
              value={code}
              disabled={!!id}
              maxLength={30}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setDirty(true);
              }}
            />
          </label>
          <label className="field-label metadata-description">
            Mô tả
            <input
              value={description}
              maxLength={500}
              disabled={used}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
              placeholder="Biểu mẫu này dùng để làm gì?"
            />
          </label>
        </section>
        <div className="builder-layout">
          <aside className="panel builder-palette">
            <div className="panel-heading compact">
              <div>
                <h2>Thành phần</h2>
                <p>Nhấn để thêm vào biểu mẫu</p>
              </div>
            </div>
            <div className="palette-items">
              {fieldTypes.map((t) => (
                <button
                  key={t.type}
                  disabled={used || fields.length >= 60}
                  onClick={() => add(t.type)}
                >
                  <t.icon size={22} />
                  <span>{t.label}</span>
                  <Plus size={15} />
                </button>
              ))}
            </div>
            <div className="builder-tip">
              <b>Bố cục tự động</b>
              <p>Trường ngắn dùng ½ hàng. Nội dung dài và tiêu đề nhóm chiếm toàn bộ hàng.</p>
            </div>
          </aside>
          <section className="builder-canvas">
            <div className="builder-toolbar">
              <span>
                <FileText size={17} />
                A4 · {fields.length} thành phần
              </span>
              <div className="actions">
                <button
                  className="icon-button"
                  aria-label="Hoàn tác"
                  disabled={used || !history.current.length}
                  onClick={undo}
                >
                  <ArrowCounterClockwise size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Làm lại"
                  disabled={used || !future.current.length}
                  onClick={redo}
                >
                  <ArrowClockwise size={18} />
                </button>
              </div>
            </div>
            <div className="builder-sheet">
              <div className="builder-sheet-heading">
                <span>FLOWPILOT CORPORATION</span>
                <small>{code}</small>
                <h2>{name}</h2>
                <p>{description || 'Mô tả biểu mẫu của bạn'}</p>
              </div>
              <div className="builder-fields">
                {fields.map((f, i) => (
                  <div
                    role="group"
                    aria-label={f.label}
                    key={f.key}
                    className={
                      'builder-field ' +
                      (f.full_width ? 'span-2 ' : '') +
                      (selected === f.key ? 'focused' : '')
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragged.current !== null && !used) move(dragged.current, i);
                      dragged.current = null;
                    }}
                  >
                    <button
                      type="button"
                      className="builder-field-select"
                      onClick={() => setSelected(f.key)}
                    >
                      <b>
                        {f.label}
                        {f.is_required && <span className="required"> *</span>}
                      </b>
                      {f.type !== 'SECTION' && (
                        <span className={'fake-input ' + (f.type === 'TEXTAREA' ? 'textarea' : '')}>
                          {f.type === 'SELECT'
                            ? 'Chọn một giá trị'
                            : f.type === 'DATE'
                              ? 'dd/mm/yyyy'
                              : f.type === 'CHECKBOX'
                                ? '□ Xác nhận'
                                : f.type === 'NUMBER'
                                  ? '0'
                                  : 'Nhập thông tin…'}
                        </span>
                      )}
                    </button>
                    <div className="field-tools">
                      <button
                        className="icon-button grab-handle"
                        draggable={!used}
                        disabled={used}
                        onDragStart={() => {
                          dragged.current = i;
                        }}
                        aria-label={'Kéo để di chuyển ' + f.label}
                      >
                        <DotsSixVertical size={17} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={used || i === 0}
                        aria-label={'Đưa ' + f.label + ' lên'}
                        onClick={() => move(i, i - 1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="icon-button"
                        disabled={used || i === fields.length - 1}
                        aria-label={'Đưa ' + f.label + ' xuống'}
                        onClick={() => move(i, i + 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        className="icon-button danger-text"
                        disabled={used}
                        aria-label={'Xóa ' + f.label}
                        onClick={() => edit(fields.filter((x) => x.key !== f.key))}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!fields.length && (
                <Empty title="Bắt đầu thiết kế" description="Thêm thành phần từ bảng bên trái." />
              )}
              <div className="builder-page-foot">Biểu mẫu được tự động phân trang khi in.</div>
            </div>
          </section>
          <aside className="panel builder-properties">
            <div className="panel-heading compact">
              <div>
                <h2>Thuộc tính</h2>
                <p>{current ? 'Thiết lập thành phần đang chọn' : 'Chọn một thành phần'}</p>
              </div>
            </div>
            {current ? (
              <fieldset disabled={used}>
                <label className="field-label">
                  Nhãn hiển thị
                  <input
                    value={current.label}
                    maxLength={120}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </label>
                <label className="field-label">
                  Mã trường dữ liệu
                  <input
                    value={current.key}
                    maxLength={60}
                    onChange={(e) => update({ key: e.target.value })}
                  />
                  <small>Chữ, số, dấu gạch dưới. Không trùng nhau.</small>
                </label>
                <label className="field-label">
                  Loại thành phần
                  <select
                    value={current.type}
                    onChange={(e) =>
                      update({
                        type: e.target.value,
                        options: e.target.value === 'SELECT' ? ['Lựa chọn 1', 'Lựa chọn 2'] : [],
                        full_width: ['SECTION', 'TEXTAREA'].includes(e.target.value),
                        is_required: e.target.value === 'SECTION' ? false : current.is_required,
                      })
                    }
                  >
                    {fieldTypes.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {current.type === 'SELECT' && (
                  <label className="field-label">
                    Các lựa chọn
                    <textarea
                      rows={5}
                      value={current.options.join('\n')}
                      onChange={(e) => update({ options: e.target.value.split('\n') })}
                    />
                    <small>Mỗi lựa chọn trên một dòng.</small>
                  </label>
                )}
                <div className="property-toggles">
                  {current.type !== 'SECTION' && (
                    <label>
                      <span>Bắt buộc nhập</span>
                      <input
                        type="checkbox"
                        checked={current.is_required}
                        onChange={(e) => update({ is_required: e.target.checked })}
                      />
                    </label>
                  )}
                  <label>
                    <span>Toàn bộ chiều rộng</span>
                    <input
                      type="checkbox"
                      checked={current.full_width}
                      onChange={(e) => update({ full_width: e.target.checked })}
                    />
                  </label>
                </div>
                <button
                  className="button full-button"
                  onClick={() => {
                    const f = {
                      ...current,
                      key: 'field_' + Date.now().toString(36),
                      label: current.label + ' (bản sao)',
                    };
                    edit([...fields, f]);
                    setSelected(f.key);
                  }}
                >
                  <Copy size={17} />
                  Nhân bản thành phần
                </button>
              </fieldset>
            ) : (
              <p className="muted panel-pad">Chọn một thành phần trên trang để chỉnh sửa.</p>
            )}
          </aside>
        </div>
      </div>
      {preview && (
        <Modal title="Xem trước biểu mẫu A4" wide onClose={() => setPreview(false)}>
          <div className="preview-stage">
            <Paper name={name} code={code} fields={fields} values={{}} />
          </div>
          <div className="modal-actions">
            <button className="button" onClick={() => window.print()}>
              <Printer size={18} />
              In / Lưu PDF
            </button>
            <button className="button primary" onClick={() => setPreview(false)}>
              Tiếp tục thiết kế
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Workflows() {
  const openedFromLink = useRef<string | null>(null);
  const resource = useResource<any[]>('workflows'),
    directory = useResource<any>('organization'),
    { actor } = useSession(),
    action = useAction();
  const [selected, setSelected] = useState<any>(null),
    [type, setType] = useState('DIRECT_MANAGER'),
    [position, setPosition] = useState(''),
    [status, setStatus] = useState('ACTIVE');
  function choose(w: any) {
    setSelected(w);
    setType(w.approver_type);
    setPosition(w.target_position_id || '');
    setStatus(w.status);
  }
  useEffect(() => {
    const form = new URLSearchParams(window.location.search).get('form');
    if (resource.data && form && openedFromLink.current !== form) {
      const w = resource.data.find((x) => x.form_template_id === form);
      if (w) { openedFromLink.current = form; choose(w); }
    }
  }, [resource.data]);
  return (
    <>
      <PageHeader
        eyebrow="THIẾT LẬP PHÊ DUYỆT"
        title="Quy trình phê duyệt"
        description="Mỗi biểu mẫu, một người chịu trách nhiệm. Cấu hình cách hệ thống tìm người duyệt."
      />
      <div className="info-banner">
        <ShieldCheck size={24} />
        <span>
          <b>Thay đổi áp dụng cho lần gửi tiếp theo.</b> Người duyệt của những đơn đã gửi được giữ
          nguyên để bảo toàn lịch sử.
        </span>
      </div>
      <ErrorBox message={resource.error || directory.error || action.error} />
      {resource.loading ? (
        <Loading />
      ) : (
        <div className="workflow-list">
          {resource.data?.map((w) => (
            <section className="panel workflow-card" key={w.id}>
              <div className="workflow-info">
                <span className="template-icon">
                  <GitBranch size={25} />
                </span>
                <div>
                  <span className="template-code">{w.code}</span>
                  <h2>{w.name}</h2>
                  <Badge status={w.status} />
                </div>
              </div>
              <div className="workflow-path">
                <span>
                  <FileText size={21} />
                  <b>Người gửi</b>
                </span>
                <div className="flow-connector" />
                <span className="workflow-node">
                  <ShieldCheck size={21} />
                  <b>
                    {w.approver_type === 'DIRECT_MANAGER'
                      ? 'Quản lý trực tiếp'
                      : w.target_position_name}
                  </b>
                  <small>01 người phê duyệt</small>
                </span>
                <div className="flow-connector" />
                <span>
                  <CheckSquare size={21} />
                  <b>Hoàn tất</b>
                </span>
              </div>
              {can(actor, 'WORKFLOW_UPDATE') && (
                <button className="button" onClick={() => choose(w)}>
                  <PencilSimple size={18} />
                  Cấu hình
                </button>
              )}
            </section>
          ))}
        </div>
      )}
      {selected && (
        <Modal
          title={'Cấu hình · ' + selected.name}
          onClose={() => {
            if (!action.busy) setSelected(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action.run(async () => {
                  await api('workflows/' + selected.id, 'PUT', {
                    approverType: type,
                    targetPositionId: position || null,
                    status,
                  });
                  resource.reload();
                }, 'Đã lưu cấu hình và ghi nhật ký thay đổi.')
              )
                setSelected(null);
            }}
          >
            <label className="field-label">
              Cách chọn người duyệt
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="DIRECT_MANAGER">Quản lý trực tiếp của người gửi</option>
                <option value="POSITION">Người giữ chức danh</option>
              </select>
            </label>
            {type === 'POSITION' && (
              <label className="field-label">
                Chức danh phê duyệt
                <select required value={position} onChange={(e) => setPosition(e.target.value)}>
                  <option value="">Chọn chức danh</option>
                  {directory.data?.positions
                    .filter((p: any) => p.status === 'ACTIVE')
                    .map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.code}
                      </option>
                    ))}
                </select>
                <small>
                  Cần đúng một phân công đang hoạt động giữ chức danh này và có quyền duyệt.
                </small>
              </label>
            )}
            <label className="field-label">
              Trạng thái quy trình
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
            </label>
            <ErrorBox message={action.error} />
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setSelected(null)}>
                Hủy
              </button>
              <button className="button primary" disabled={action.busy}>
                Lưu cấu hình
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
