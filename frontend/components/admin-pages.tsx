'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Buildings,
  Plus,
  PencilSimple,
  Users,
  UserPlus,
  ShieldCheck,
  LockKey,
  CheckCircle,
  Clock,
  ArrowRight,
  GitBranch,
  DownloadSimple,
} from '@phosphor-icons/react';
import { api, can, downloadCsv, eventLabels, fmtDate } from '../lib/api';
import {
  Avatar,
  Badge,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  Search,
  useAction,
  useResource,
  useSession,
} from './ui';
const unitTypes: Record<string, string> = {
  COMPANY: 'Công ty',
  DIVISION: 'Khối',
  DEPARTMENT: 'Phòng ban',
  TEAM: 'Nhóm',
};
const positionTypes: Record<string, string> = {
  EXECUTIVE: 'Điều hành',
  MANAGEMENT: 'Quản lý',
  STAFF: 'Nhân viên',
};
const roleNames: Record<string, string> = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  WORKFLOW_MANAGER: 'Quản lý quy trình',
  REQUESTER: 'Người gửi yêu cầu',
  APPROVER: 'Người phê duyệt',
  AUDITOR: 'Kiểm soát viên',
};
function activeAssignment(a: any) {
  return !a.ended_at || new Date(a.ended_at) > new Date();
}
export function Organization() {
  const resource = useResource<any>('organization'),
    { actor } = useSession(),
    action = useAction();
  const [tab, setTab] = useState('units'),
    [search, setSearch] = useState(''),
    [editing, setEditing] = useState<any>(null);
  const editable = can(actor, 'ORGANIZATION_MANAGE');
  const rows = (resource.data?.[tab] || []).filter((r: any) =>
    (r.name + ' ' + r.code).toLowerCase().includes(search.toLowerCase()),
  );
  function create() {
    setEditing(
      tab === 'units'
        ? { name: '', code: '', type: 'DEPARTMENT', status: 'ACTIVE', parentId: resource.data?.units.find((u:any)=>u.type==='COMPANY')?.id || '', kind: 'units' }
        : { name: '', code: '', type: 'STAFF', status: 'ACTIVE', rankLevel: 1, kind: 'positions' },
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="TỔ CHỨC"
        title="Cơ cấu tổ chức"
        description="Quản lý các đơn vị và chức danh trong doanh nghiệp."
        actions={
          editable && (
            <button className="button primary" onClick={create}>
              <Plus size={18} />
              Thêm {tab === 'units' ? 'đơn vị' : 'chức danh'}
            </button>
          )
        }
      />
      <ErrorBox message={resource.error || action.error} />
      <section className="panel">
        <div className="list-toolbar">
          <div className="tabs">
            <button className={tab === 'units' ? 'active' : ''} onClick={() => setTab('units')}>
              <Buildings size={18} />
              Đơn vị tổ chức
            </button>
            <button
              className={tab === 'positions' ? 'active' : ''}
              onClick={() => setTab('positions')}
            >
              <Users size={18} />
              Chức danh
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <Search value={search} onChange={setSearch} placeholder="Tìm theo tên hoặc mã…" />
          <span className="muted">
            {rows.length} {tab === 'units' ? 'đơn vị' : 'chức danh'}
          </span>
        </div>
        {resource.loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{tab === 'units' ? 'Đơn vị' : 'Chức danh'}</th>
                  <th>Phân loại</th>
                  <th>{tab === 'units' ? 'Đơn vị cấp trên' : 'Cấp bậc'}</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <div className="person-cell">
                        <span className="table-icon">
                          {tab === 'units' ? <Buildings size={22} /> : <Users size={22} />}
                        </span>
                        <div>
                          <b>{r.name}</b>
                          <span className="subtext mono">{r.code}</span>
                        </div>
                      </div>
                    </td>
                    <td>{(tab === 'units' ? unitTypes : positionTypes)[r.type]}</td>
                    <td>
                      {tab === 'units'
                        ? resource.data.units.find((u: any) => u.id === r.parent_id)?.name ||
                          'Cấp cao nhất'
                        : r.rank_level}
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      {editable && (
                        <button
                          className="icon-button"
                          aria-label={'Sửa ' + r.name}
                          onClick={() =>
                            setEditing({
                              ...r,
                              kind: tab,
                              parentId: r.parent_id || '',
                              rankLevel: r.rank_level,
                            })
                          }
                        >
                          <PencilSimple size={19} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <Empty />}
          </div>
        )}
      </section>
      {editing && (
        <Modal
          title={
            (editing.id ? 'Chỉnh sửa ' : 'Thêm ') +
            (editing.kind === 'units' ? 'đơn vị' : 'chức danh')
          }
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action.run(async () => {
                  await api(
                    'organization/' + editing.kind + (editing.id ? '/' + editing.id : ''),
                    editing.id ? 'PUT' : 'POST',
                    editing,
                  );
                  resource.reload();
                }, 'Đã lưu danh mục tổ chức.')
              )
                setEditing(null);
            }}
          >
            <label className="field-label">
              Tên {editing.kind === 'units' ? 'đơn vị' : 'chức danh'} *
              <input
                required
                maxLength={150}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <div className="form-fields">
              <label className="field-label">
                Mã *
                <input
                  required
                  maxLength={30}
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                />
              </label>
              <label className="field-label">
                Phân loại
                <select
                  value={editing.type}
                  onChange={(e) => {
                    const next = e.target.value;
                    const parentTypes = ({COMPANY:[],DIVISION:['COMPANY'],DEPARTMENT:['COMPANY','DIVISION'],TEAM:['DEPARTMENT']} as Record<string,string[]>)[next];
                    setEditing({ ...editing, type: next, parentId: editing.kind === 'units' ? (resource.data?.units.find((u:any)=>u.id === editing.parentId && parentTypes.includes(u.type))?.id || resource.data?.units.find((u:any)=>parentTypes.includes(u.type))?.id || '') : editing.parentId });
                  }}
                >
                  {Object.entries(editing.kind === 'units' ? unitTypes : positionTypes).map(
                    ([v, l]) => (
                      <option value={v} key={v}>
                        {l}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
            {editing.kind === 'units' ? (
              <label className="field-label">
                Đơn vị cấp trên
                <select
                  value={editing.parentId}
                  onChange={(e) => setEditing({ ...editing, parentId: e.target.value })}
                  required={editing.type !== 'COMPANY'}
                  disabled={editing.type === 'COMPANY'}
                >
                  <option value="">{editing.type === 'COMPANY' ? 'Cấp cao nhất' : 'Chọn đơn vị cấp trên'}</option>
                  {resource.data?.units
                    .filter((u: any) => u.id !== editing.id && u.status === 'ACTIVE' && ({COMPANY:[],DIVISION:['COMPANY'],DEPARTMENT:['COMPANY','DIVISION'],TEAM:['DEPARTMENT']} as Record<string,string[]>)[editing.type]?.includes(u.type))
                    .map((u: any) => (
                      <option value={u.id} key={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label className="field-label">
                Cấp bậc
                <input
                  required
                  type="number"
                  min={0}
                  max={100}
                  value={editing.rankLevel}
                  onChange={(e) => setEditing({ ...editing, rankLevel: Number(e.target.value) })}
                />
              </label>
            )}
            <label className="field-label">
              Trạng thái
              <select
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value })}
              >
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </select>
            </label>
            <ErrorBox message={action.error} />
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setEditing(null)}>
                Hủy
              </button>
              <button className="button primary" disabled={action.busy}>
                Lưu thay đổi
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function People() {
  const people = useResource<any[]>('people'),
    directory = useResource<any>('organization'),
    { actor, confirm } = useSession(),
    action = useAction();
  const [search, setSearch] = useState(''),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [mode, setMode] = useState<string | null>(null),
    [form, setForm] = useState<any>({});
  const selected = people.data?.find((p) => p.id === selectedId),
    editable = can(actor, 'USER_MANAGE');
  const assignments =
    people.data?.flatMap((p) =>
      p.assignments
        .filter(activeAssignment)
        .map((a: any) => ({ ...a, full_name: p.full_name, user_id: p.id })),
    ) || [];
  function newAssignment(person: any) {
    setSelectedId(person.id);
    setForm({
      userId: person.id,
      unitId: '',
      positionId: '',
      managerAssignmentId: '',
      isPrimary: !person.assignments.some((a: any) => a.is_primary && activeAssignment(a)),
      isUnitHead: false,
      type: 'REGULAR',
    });
    setMode('assignment');
  }
  return (
    <>
      <PageHeader
        eyebrow="NHÂN SỰ"
        title="Nhân sự & phân công"
        description="Tài khoản, vị trí công tác và quản lý trực tiếp của từng nhân sự."
        actions={
          editable && (
            <button
              className="button primary"
              onClick={() => {
                setForm({ fullName: '', email: '', password: '' });
                setMode('new');
              }}
            >
              <UserPlus size={19} />
              Thêm nhân sự
            </button>
          )
        }
      />
      <ErrorBox message={people.error || directory.error || action.error} />
      <section className="panel">
        <div className="filter-bar">
          <Search value={search} onChange={setSearch} placeholder="Tìm theo họ tên hoặc email…" />
          <span className="muted">{people.data?.length || 0} nhân sự</span>
        </div>
        {people.loading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nhân sự</th>
                  <th>Đơn vị / chức danh</th>
                  <th>Vai trò đang có</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {people.data
                  ?.filter((p) =>
                    (p.full_name + ' ' + p.email).toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((p) => {
                    const a =
                      p.assignments.find((a: any) => a.is_primary && activeAssignment(a)) ||
                      p.assignments.find(activeAssignment);
                    return (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="person-cell row-button"
                            onClick={() => {
                              setSelectedId(p.id);
                              setMode('detail');
                            }}
                          >
                            <Avatar name={p.full_name} />
                            <div>
                              <b>{p.full_name}</b>
                              <span className="subtext">{p.email}</span>
                            </div>
                          </button>
                        </td>
                        <td>
                          {a ? (
                            <>
                              <b>{a.unit_name}</b>
                              <span className="subtext">{a.position_name}</span>
                            </>
                          ) : (
                            <span className="muted">Chưa phân công</span>
                          )}
                        </td>
                        <td>
                          <div className="tag-wrap">
                            {a?.roles
                              .filter(
                                (r: any) =>
                                  !r.revoked_at &&
                                  (!r.valid_until || new Date(r.valid_until) > new Date()),
                              )
                              .map((r: any) => (
                                <span className="tag" key={r.id}>
                                  {r.name}
                                </span>
                              )) || '—'}
                          </div>
                        </td>
                        <td>
                          <Badge status={p.status} />
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={'Chi tiết ' + p.full_name}
                            onClick={() => {
                              setSelectedId(p.id);
                              setMode('detail');
                            }}
                          >
                            <ArrowRight size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {mode === 'new' && (
        <Modal title="Thêm nhân sự" onClose={() => setMode(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await action.run(async () => {
                const person = await api('people', 'POST', form);
                people.reload();
                newAssignment({ ...person, assignments: [] });
              }, 'Đã tạo tài khoản. Tiếp tục thiết lập phân công.');
            }}
          >
            <label className="field-label">
              Họ và tên *
              <input
                required
                maxLength={150}
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </label>
            <label className="field-label">
              Email công việc *
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="field-label">
              Mật khẩu ban đầu *
              <input
                type="password"
                minLength={10}
                autoComplete="new-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <small>Tối thiểu 10 ký tự. Nhân sự có thể đổi trong cài đặt tài khoản.</small>
            </label>
            <ErrorBox message={action.error} />
            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setMode(null)}>
                Hủy
              </button>
              <button className="button primary" disabled={action.busy}>
                Tạo và phân công <ArrowRight size={18} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {mode === 'assignment' && (
        <Modal
          title={'Phân công công tác' + (selected ? ' · ' + selected.full_name : '')}
          onClose={() => setMode(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action.run(async () => {
                  await api('assignments', 'POST', form);
                  people.reload();
                }, 'Đã tạo phân công. Cấp vai trò trong mục Vai trò & quyền để nhân sự sử dụng hệ thống.')
              )
                setMode('detail');
            }}
          >
            <label className="field-label">
              Đơn vị *
              <select
                required
                value={form.unitId}
                onChange={(e) => setForm({ ...form, unitId: e.target.value })}
              >
                <option value="">Chọn đơn vị</option>
                {directory.data?.units
                  .filter((u: any) => u.status === 'ACTIVE')
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Chức danh *
              <select
                required
                value={form.positionId}
                onChange={(e) => setForm({ ...form, positionId: e.target.value })}
              >
                <option value="">Chọn chức danh</option>
                {directory.data?.positions
                  .filter((p: any) => p.status === 'ACTIVE')
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Quản lý trực tiếp
              <select
                value={form.managerAssignmentId}
                onChange={(e) => setForm({ ...form, managerAssignmentId: e.target.value })}
              >
                <option value="">Không có</option>
                {assignments
                  .filter((a) => a.user_id !== form.userId)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.full_name} · {a.position_name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Loại phân công
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="REGULAR">Chính thức</option>
                <option value="ACTING">Quyền / tạm thời</option>
                <option value="SECONDMENT">Biệt phái</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
              />
              Phân công chính
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.isUnitHead}
                onChange={(e) => setForm({ ...form, isUnitHead: e.target.checked })}
              />
              Người đứng đầu đơn vị
            </label>
            <ErrorBox message={action.error} />
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setMode(null)}>
                Hủy
              </button>
              <button className="button primary" disabled={action.busy}>
                Lưu phân công
              </button>
            </div>
          </form>
        </Modal>
      )}
      {mode === 'detail' && selected && (
        <Modal title="Hồ sơ nhân sự" wide onClose={() => setMode(null)}>
          <div className="profile-heading">
            <Avatar name={selected.full_name} />
            <div>
              <h2>{selected.full_name}</h2>
              <p>{selected.email}</p>
            </div>
            <Badge status={selected.status} />
          </div>
          <div className="section-heading">
            <h3>Lịch sử phân công</h3>
            {editable && (
              <button className="button small-button" onClick={() => newAssignment(selected)}>
                <Plus size={17} />
                Thêm phân công
              </button>
            )}
          </div>
          {selected.assignments.length ? (
            selected.assignments.map((a: any) => (
              <div className="assignment-card" key={a.id}>
                <div className="section-heading">
                  <div>
                    <b>{a.position_name}</b>
                    <p>{a.unit_name}</p>
                  </div>
                  <Badge status={activeAssignment(a) ? 'ACTIVE' : 'INACTIVE'} />
                </div>
                <p className="muted">
                  Quản lý: {a.manager_name || 'Không có'} ·{' '}
                  {a.is_primary ? 'Phân công chính' : 'Kiêm nhiệm'}
                </p>
                <p className="subtext">
                  {fmtDate(a.started_at)} → {a.ended_at ? fmtDate(a.ended_at) : 'Hiện tại'}
                </p>
                <div className="tag-wrap">
                  {a.roles
                    .filter((r: any) => !r.revoked_at)
                    .map((r: any) => (
                      <span className="tag" key={r.id}>
                        {r.name}
                      </span>
                    ))}
                </div>
                {editable && activeAssignment(a) && (
                  <button
                    className="text-link danger-text"
                    disabled={action.busy}
                    onClick={async () => {
                      if (
                        await confirm(
                          'Kết thúc phân công?',
                          'Quyền gắn với phân công này sẽ được thu hồi. Lịch sử hồ sơ được giữ nguyên.',
                        )
                      )
                        action.run(async () => {
                          await api('assignments/' + a.id + '/end', 'POST');
                          people.reload();
                        }, 'Đã kết thúc phân công.');
                    }}
                  >
                    Kết thúc phân công
                  </button>
                )}
              </div>
            ))
          ) : (
            <Empty
              title="Chưa có phân công"
              description="Thêm phân công trước khi cấp vai trò và đăng nhập."
            />
          )}
          <ErrorBox message={action.error} />
          <div className="modal-actions">
            {editable && (
              <button
                className="button danger-outline"
                disabled={action.busy || selected.id === actor.userId}
                onClick={async () => {
                  const status = selected.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
                  if (
                    await confirm(
                      status === 'LOCKED' ? 'Khóa tài khoản?' : 'Mở tài khoản?',
                      status === 'LOCKED'
                        ? 'Nhân sự sẽ bị đăng xuất và không thể đăng nhập.'
                        : 'Nhân sự có thể đăng nhập với phân công đang hiệu lực.',
                    )
                  )
                    action.run(async () => {
                      await api('people/' + selected.id + '/status', 'PATCH', { status });
                      people.reload();
                    }, 'Đã cập nhật tài khoản.');
                }}
              >
                <LockKey size={17} />
                {selected.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở tài khoản'}
              </button>
            )}
            <Link className="button primary" href="/roles">
              Quản lý vai trò <ArrowRight size={17} />
            </Link>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Roles() {
  const roles = useResource<any[]>('roles'),
    people = useResource<any[]>('people'),
    { confirm } = useSession(),
    action = useAction();
  const [grant, setGrant] = useState(false),
    [form, setForm] = useState({
      assignmentId: '',
      roleId: '',
      scopeType: 'ORGANIZATIONAL_UNIT',
      validUntil: '',
    }),
    [search, setSearch] = useState('');
  const assignments =
    people.data?.flatMap((p) =>
      p.assignments.filter(activeAssignment).map((a: any) => ({ ...a, full_name: p.full_name })),
    ) || [];
  const grants = assignments
    .flatMap((a) => a.roles.map((r: any) => ({ ...r, assignment: a })))
    .filter((r) =>
      (r.assignment.full_name + ' ' + r.name).toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <>
      <PageHeader
        eyebrow="PHÂN QUYỀN"
        title="Vai trò & quyền"
        description="Cấp quyền theo phân công, phạm vi và thời hạn cụ thể."
        actions={
          <button className="button primary" onClick={() => setGrant(true)}>
            <Plus size={18} />
            Cấp vai trò
          </button>
        }
      />
      <ErrorBox message={roles.error || people.error || action.error} />
      <div className="role-grid">
        {roles.loading ? (
          <Loading />
        ) : (
          roles.data?.map((r) => (
            <article className="panel role-card" key={r.id}>
              <span className="role-icon">
                <ShieldCheck size={25} />
              </span>
              <h2>{r.name}</h2>
              <span className="template-code">{r.code}</span>
              <p>{r.permissions.length} quyền được cấp</p>
              <details>
                <summary>Xem các quyền</summary>
                <ul>
                  {r.permissions.map((p: any) => (
                    <li key={p.code}>
                      {p.name}
                      <code>{p.code}</code>
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))
        )}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Phân quyền nhân sự</h2>
            <p>Quyền có hiệu lực trên phân công đang hoạt động</p>
          </div>
          <Search value={search} onChange={setSearch} placeholder="Tìm nhân sự, vai trò…" />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nhân sự / phân công</th>
                <th>Vai trò</th>
                <th>Phạm vi</th>
                <th>Thời hạn</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {grants.map((r: any) => {
                const active =
                  !r.revoked_at && (!r.valid_until || new Date(r.valid_until) > new Date());
                return (
                  <tr key={r.id}>
                    <td>
                      <b>{r.assignment.full_name}</b>
                      <span className="subtext">
                        {r.assignment.position_name} · {r.assignment.unit_name}
                      </span>
                    </td>
                    <td>{r.name}</td>
                    <td>
                      {r.scope_type === 'ORGANIZATION' ? 'Toàn tổ chức' : r.assignment.unit_name}
                    </td>
                    <td>{r.valid_until ? fmtDate(r.valid_until) : 'Không thời hạn'}</td>
                    <td>
                      <Badge status={active ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    <td>
                      {active && (
                        <button
                          className="text-link danger-text"
                          disabled={action.busy}
                          onClick={async () => {
                            if (
                              await confirm(
                                'Thu hồi vai trò?',
                                'Quyền từ vai trò này sẽ ngừng hiệu lực ngay sau khi thu hồi.',
                              )
                            )
                              action.run(async () => {
                                await api('role-assignments/' + r.id + '/revoke', 'POST');
                                people.reload();
                              }, 'Đã thu hồi vai trò.');
                          }}
                        >
                          Thu hồi
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {grant && (
        <Modal title="Cấp vai trò cho phân công" onClose={() => setGrant(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action.run(async () => {
                  await api('role-assignments', 'POST', form);
                  people.reload();
                }, 'Đã cấp vai trò.')
              )
                setGrant(false);
            }}
          >
            <label className="field-label">
              Nhân sự / phân công *
              <select
                required
                value={form.assignmentId}
                onChange={(e) => setForm({ ...form, assignmentId: e.target.value })}
              >
                <option value="">Chọn phân công</option>
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name} · {a.position_name} · {a.unit_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Vai trò *
              <select
                required
                value={form.roleId}
                onChange={(e) => {
                  const role = roles.data?.find((r) => r.id === e.target.value);
                  setForm({
                    ...form,
                    roleId: e.target.value,
                    scopeType: ['SYSTEM_ADMIN', 'WORKFLOW_MANAGER','FORM_PUBLISHER'].includes(role?.code)
                      ? 'ORGANIZATION'
                      : form.scopeType,
                  });
                }}
              >
                <option value="">Chọn vai trò</option>
                {roles.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Phạm vi
              <select
                value={form.scopeType}
                onChange={(e) => setForm({ ...form, scopeType: e.target.value })}
              >
                <option value="ORGANIZATIONAL_UNIT">Đơn vị của phân công</option>
                <option value="ORGANIZATION">Toàn tổ chức</option>
              </select>
            </label>
            <label className="field-label">
              Hết hiệu lực vào (không bắt buộc)
              <input
                type="date"
                min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              />
            </label>
            <ErrorBox message={action.error} />
            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setGrant(false)}>
                Hủy
              </button>
              <button className="button primary" disabled={action.busy}>
                Cấp vai trò
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Audit() {
  const [page, setPage] = useState(1),
    [event, setEvent] = useState(''),
    [search, setSearch] = useState(''),
    [expanded, setExpanded] = useState<string | null>(null),
    action = useAction();
  const resource = useResource<any>(
    'audit?' + new URLSearchParams({ page: String(page), event, search }),
  );
  async function exportLogs() {
    await action.run(async () => {
      let rows: any[] = [];
      let p = 1;
      while (true) {
        const d = await api('audit?' + new URLSearchParams({ page: String(p++), event, search }));
        rows.push(...d.items);
        if (rows.length >= d.total || !d.items.length) break;
      }
      downloadCsv(
        'flowpilot-nhat-ky.csv',
        ['Thời gian', 'Người thao tác', 'Sự kiện', 'Mã yêu cầu', 'Biểu mẫu', 'Chi tiết'],
        rows.map((r) => [
          fmtDate(r.occurred_at, true),
          r.actor_name,
          eventLabels[r.event_type],
          r.request_code,
          r.form_name,
          JSON.stringify(r.details || {}),
        ]),
      );
    }, 'Đã xuất nhật ký.');
  }
  return (
    <>
      <PageHeader
        eyebrow="KIỂM SOÁT"
        title="Nhật ký hoạt động"
        description="Dấu vết các thay đổi quy trình và toàn bộ vòng đời yêu cầu."
        actions={
          <button className="button" disabled={action.busy} onClick={exportLogs}>
            <DownloadSimple size={18} />
            Xuất CSV
          </button>
        }
      />
      <div className="info-banner">
        <ShieldCheck size={23} />
        <span>
          Nhật ký được ghi tự động cùng giao dịch nghiệp vụ và được bảo vệ khỏi chỉnh sửa, xóa.
        </span>
      </div>
      <ErrorBox message={resource.error || action.error} />
      <section className="panel">
        <div className="filter-bar">
          <Search
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Tìm mã đơn, biểu mẫu, người thao tác…"
          />
          <select
            aria-label="Lọc loại sự kiện"
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả sự kiện</option>
            {Object.entries(eventLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {resource.loading ? (
          <Loading />
        ) : (
          resource.data && (
            <>
              <div className="audit-list">
                {resource.data.items.map((log: any) => (
                  <div className="audit-item" key={log.id}>
                    <span className="audit-icon">
                      {log.event_type.startsWith('WORKFLOW') ? (
                        <GitBranch size={20} />
                      ) : (
                        <Clock size={20} />
                      )}
                    </span>
                    <div className="audit-content">
                      <div className="section-heading">
                        <b>{eventLabels[log.event_type] || log.event_type}</b>
                        <time>{fmtDate(log.occurred_at, true)}</time>
                      </div>
                      <p>
                        <strong>{log.actor_name}</strong> · {log.form_name}{' '}
                        {log.request_code && (
                          <>
                            ·{' '}
                            <Link className="text-link" href={'/requests/' + log.request_id}>
                              {log.request_code}
                            </Link>
                          </>
                        )}
                      </p>
                      {log.details && (
                        <>
                          <button
                            className="text-link"
                            onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                          >
                            {expanded === log.id ? 'Ẩn chi tiết' : 'Xem dữ liệu sự kiện'}
                          </button>
                          {expanded === log.id && (
                            <pre className="audit-json">{JSON.stringify(log.details, null, 2)}</pre>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!resource.data.items.length && <Empty title="Chưa có hoạt động phù hợp" />}
              <Pagination {...resource.data} onChange={setPage} />
            </>
          )
        )}
      </section>
    </>
  );
}
