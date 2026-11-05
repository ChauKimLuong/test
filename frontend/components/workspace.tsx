'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Plus,
  Files,
  Clock,
  CheckCircle,
  TrendUp,
  DownloadSimple,
  Bell,
  Checks,
  FileText,
  ShieldCheck,
  SignOut,
  ArrowUpRight,
} from '@phosphor-icons/react';
import { api, can, downloadCsv, fmtDate, RequestItem, statusLabels } from '../lib/api';
import {
  Avatar,
  Badge,
  Empty,
  ErrorBox,
  Loading,
  PageHeader,
  Pagination,
  RequestTable,
  Search,
  Stat,
  useAction,
  useResource,
  useSession,
} from './ui';
export function Dashboard() {
  const { actor } = useSession(),
    { data, error, loading, reload } = useResource<any>('dashboard');
  if (loading) return <Loading />;
  if (error)
    return (
      <>
        <ErrorBox message={error} />
        <button className="button" onClick={reload}>
          Thử lại
        </button>
      </>
    );
  const d = data!,
    max = Math.max(1, ...d.byMonth.map((m: any) => m.count));
  return (
    <>
      <PageHeader
        eyebrow="KHÔNG GIAN LÀM VIỆC"
        title={'Chào ' + actor.fullName.split(' ').at(-1) + ', một ngày hiệu quả!'}
        description="Nắm bắt yêu cầu, theo dõi tiến độ và xử lý công việc trong ngày."
        actions={
          can(actor, 'REQUEST_CREATE') && (
            <Link className="button primary" href="/requests/new">
              <Plus size={18} />
              Tạo yêu cầu
            </Link>
          )
        }
      />
      <div className="stats-grid">
        <Stat
          label="Yêu cầu của tôi"
          value={Object.values(d.mine).reduce((s: number, v: any) => s + v, 0)}
          note="Tất cả yêu cầu đã tạo"
          icon={<Files size={22} />}
        />
        <Stat
          label="Đang chờ phê duyệt"
          value={d.mine.PENDING}
          note="Đã gửi đến người phụ trách"
          icon={<Clock size={22} />}
          tone="amber"
        />
        <Stat
          label="Đã được phê duyệt"
          value={d.mine.APPROVED}
          note="Yêu cầu đã hoàn tất"
          icon={<CheckCircle size={22} />}
          tone="green"
        />
        <Stat
          label={can(actor, 'REQUEST_APPROVE') ? 'Cần bạn xử lý' : 'Bản nháp của tôi'}
          value={can(actor, 'REQUEST_APPROVE') ? d.pendingInbox : d.mine.DRAFT}
          note={
            can(actor, 'REQUEST_APPROVE')
              ? 'Trong hộp phê duyệt của bạn'
              : 'Tiếp tục hoàn thiện và gửi'
          }
          icon={<TrendUp size={22} />}
          tone="violet"
        />
      </div>
      <div className="dashboard-top">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Nhịp độ công việc</h2>
              <p>Yêu cầu được gửi trong 6 tháng gần nhất</p>
            </div>
            <span className="chart-legend">
              <i />
              Số yêu cầu
            </span>
          </div>
          <div
            className="chart"
            role="img"
            aria-label={d.byMonth.map((m: any) => m.month + ': ' + m.count + ' yêu cầu').join(', ')}
          >
            <div className="chart-grid">
              <span>{max}</span>
              <span>{Math.round(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="chart-bars">
              {d.byMonth.map((m: any, i: number) => (
                <div className="chart-column" key={m.month}>
                  <span className="chart-value">{m.count}</span>
                  <div
                    className={'chart-bar ' + (i === 5 ? 'current' : '')}
                    style={{ height: Math.max(3, (m.count / max) * 135) + 'px' }}
                  />
                  <span className="chart-label">Tháng {Number(m.month.slice(5))}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-summary">
            <span>
              <b>{d.approvalRate}%</b> tỷ lệ chấp thuận
            </span>
            <span>
              <b>{d.averageHours} giờ</b> xử lý trung bình
            </span>
            <small>Trong phạm vi truy cập của bạn</small>
          </div>
        </section>
        <section className="quick-panel">
          <div className="quick-decoration">
            <Files size={80} weight="duotone" />
          </div>
          <span className="eyebrow">BẮT ĐẦU TỪ MỘT BIỂU MẪU</span>
          <h2>
            Bớt thủ tục.
            <br /> Thêm thời gian cho công việc.
          </h2>
          <p>Chọn mẫu phù hợp, điền thông tin và gửi đúng người phê duyệt.</p>
          <Link href="/forms" className="button">
            Khám phá biểu mẫu <ArrowUpRight size={18} />
          </Link>
          {can(actor, 'FORM_CREATE') && (
            <Link href="/forms/new" className="button">
              Tạo mẫu đơn mới <Plus size={18} />
            </Link>
          )}
          <div className="quick-foot">
            <ShieldCheck size={17} />
            Lịch sử được lưu trong từng yêu cầu
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Yêu cầu gần đây</h2>
              <p>Cập nhật mới nhất trong không gian của bạn</p>
            </div>
            <Link className="text-link" href="/requests">
              Xem tất cả <ArrowRight size={16} />
            </Link>
          </div>
          <RequestTable items={d.recent} compact />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{can(actor, 'REQUEST_APPROVE') ? 'Cần bạn phê duyệt' : 'Tiếp tục công việc'}</h2>
              <p>
                {can(actor, 'REQUEST_APPROVE')
                  ? 'Ưu tiên những yêu cầu đang chờ'
                  : 'Các lối tắt thường dùng'}
              </p>
            </div>
          </div>
          {can(actor, 'REQUEST_APPROVE') ? (
            d.inbox.length ? (
              <div className="inbox-preview">
                {d.inbox.map((r: RequestItem) => (
                  <Link href={'/requests/' + r.id} className="inbox-preview-item" key={r.id}>
                    <Avatar name={r.requester_name} small />
                    <div>
                      <b>{r.form_name}</b>
                      <p>{r.requester_name}</p>
                      <span className="subtext">{fmtDate(r.submitted_at)}</span>
                    </div>
                    <ArrowRight size={18} />
                  </Link>
                ))}
                <Link className="button full-button" href="/inbox">
                  Mở hộp phê duyệt
                </Link>
              </div>
            ) : (
              <Empty
                title="Đã xử lý hết công việc"
                description="Yêu cầu mới sẽ xuất hiện tại đây."
              />
            )
          ) : (
            <div className="shortcuts">
              {can(actor, 'FORM_CREATE') && (
                <Link href="/forms/new">
                  <FileText size={23} />
                  <span>
                    <b>Tạo mẫu đơn mới</b>
                    <small>Thiết kế A4 và gửi cấp trên thẩm định</small>
                  </span>
                  <ArrowRight />
                </Link>
              )}
              <Link href="/requests/new">
                <FileText size={23} />
                <span>
                  <b>Tạo yêu cầu mới</b>
                  <small>Từ biểu mẫu của doanh nghiệp</small>
                </span>
                <ArrowRight />
              </Link>
              <Link href="/requests">
                <Clock size={23} />
                <span>
                  <b>Theo dõi yêu cầu</b>
                  <small>Trạng thái và lịch sử xử lý</small>
                </span>
                <ArrowRight />
              </Link>
              <Link href="/notifications">
                <Bell size={23} />
                <span>
                  <b>Thông báo của bạn</b>
                  <small>Cập nhật kết quả phê duyệt</small>
                </span>
                <ArrowRight />
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
export function RequestsList({ inbox }: { inbox: boolean }) {
  const { actor } = useSession(),
    action = useAction();
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(inbox ? 'PENDING' : ''),
    [page, setPage] = useState(1),
    [view, setView] = useState(inbox ? 'inbox' : 'mine');
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const params = new URLSearchParams({ view, status, search: query, page: String(page) }),
    resource = useResource<any>('requests?' + params);
  async function exportAll() {
    await action.run(async () => {
      let rows: RequestItem[] = [];
      let p = 1;
      while (true) {
        const x = await api<any>(
          'requests?' + new URLSearchParams({ view, status, search: query, page: String(p++) }),
        );
        rows.push(...x.items);
        if (rows.length >= x.total || !x.items.length) break;
      }
      downloadCsv(
        'orva-yeu-cau.csv',
        ['Mã yêu cầu', 'Biểu mẫu', 'Người gửi', 'Trạng thái', 'Ngày gửi', 'Người duyệt'],
        rows.map((r) => [
          r.request_code,
          r.form_name,
          r.requester_name,
          statusLabels[r.status],
          fmtDate(r.submitted_at, true),
          r.approver_name,
        ]),
      );
    }, 'Đã xuất danh sách yêu cầu.');
  }
  return (
    <>
      <PageHeader
        eyebrow={inbox ? 'PHÊ DUYỆT' : 'YÊU CẦU'}
        title={inbox ? 'Hộp phê duyệt' : 'Yêu cầu của tôi'}
        description={
          inbox
            ? 'Xem nội dung, kiểm tra thông tin và đưa ra quyết định.'
            : 'Tất cả đề xuất và bản nháp của bạn, được theo dõi ở một nơi.'
        }
        actions={
          <>
            <button className="button" disabled={action.busy} onClick={exportAll}>
              <DownloadSimple size={18} />
              Xuất CSV
            </button>
            {!inbox && can(actor, 'REQUEST_CREATE') && (
              <Link href="/requests/new" className="button primary">
                <Plus size={18} />
                Tạo yêu cầu
              </Link>
            )}
          </>
        }
      />
      <ErrorBox message={action.error} />
      <section className="panel">
        <div className="list-toolbar">
          <div className="tabs" aria-label="Phạm vi yêu cầu">
            <button
              className={view === (inbox ? 'inbox' : 'mine') ? 'active' : ''}
              onClick={() => {
                setView(inbox ? 'inbox' : 'mine');
                setPage(1);
              }}
            >
              {inbox ? 'Được giao cho tôi' : 'Của tôi'}
            </button>
            {!inbox && can(actor, 'REQUEST_VIEW') && (
              <button
                className={view === 'all' ? 'active' : ''}
                onClick={() => {
                  setView('all');
                  setPage(1);
                }}
              >
                Trong phạm vi quản lý
              </button>
            )}
          </div>
          <span className="count-label">{resource.data?.total ?? '—'} yêu cầu</span>
        </div>
        <div className="filter-bar">
          <Search
            value={search}
            onChange={setSearch}
            placeholder="Tìm theo mã, biểu mẫu, người gửi…"
          />
          <select
            aria-label="Lọc trạng thái"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusLabels)
              .filter(([s]) =>
                ['DRAFT', 'PENDING', 'RETURNED', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(s),
              )
              .map(([s, l]) => (
                <option value={s} key={s}>
                  {l}
                </option>
              ))}
          </select>
        </div>
        <ErrorBox message={resource.error} />
        {resource.loading ? (
          <Loading />
        ) : (
          resource.data && (
            <>
              <RequestTable items={resource.data.items} />
              <Pagination {...resource.data} onChange={setPage} />
            </>
          )
        )}
      </section>
    </>
  );
}
export function Notifications() {
  const { data, error, loading, reload } = useResource<any[]>('notifications'),
    action = useAction();
  const [filter, setFilter] = useState('all');
  const router = useRouter();
  return (
    <>
      <PageHeader
        eyebrow="CẬP NHẬT"
        title="Thông báo"
        description="Những thay đổi cần biết về yêu cầu, mẫu đơn và công việc của bạn."
        actions={
          <button
            className="button"
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                await api('notifications/all/read', 'POST');
                reload();
              }, 'Đã đánh dấu tất cả là đã đọc.')
            }
          >
            <Checks size={19} />
            Đánh dấu tất cả đã đọc
          </button>
        }
      />
      <ErrorBox message={error || action.error} />
      <section className="panel">
        <div className="list-toolbar">
          <div className="tabs">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              Tất cả
            </button>
            <button
              className={filter === 'unread' ? 'active' : ''}
              onClick={() => setFilter('unread')}
            >
              Chưa đọc ({data?.filter((n) => !n.read_at).length || 0})
            </button>
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : data?.filter((n) => filter === 'all' || !n.read_at).length ? (
          <div>
            {data
              .filter((n) => filter === 'all' || !n.read_at)
              .map((n) => (
                <button
                  className={'notification-row ' + (!n.read_at ? 'unread' : '')}
                  key={n.id}
                  onClick={() =>
                    action.run(async () => {
                      await api('notifications/' + n.id + '/read', 'POST');
                      router.push(n.form_template_id ? '/forms' : '/requests/' + n.request_id);
                    })
                  }
                >
                  <span
                    className={
                      'notification-type ' +
                      (n.type.includes('REJECTED')
                        ? 'red'
                        : n.type.includes('APPROVED')
                          ? 'green'
                          : 'blue')
                    }
                  >
                    <Bell size={23} />
                  </span>
                  <div>
                    <b>{n.title}</b>
                    <p>{n.message}</p>
                    <small>{fmtDate(n.created_at, true)}</small>
                  </div>
                  {!n.read_at && <span className="unread-dot" />}
                  <ArrowRight size={18} />
                </button>
              ))}
          </div>
        ) : (
          <Empty
            title="Bạn đã xem hết thông báo"
            description="Khi có cập nhật mới, thông báo sẽ xuất hiện ở đây."
          />
        )}
      </section>
    </>
  );
}
export function Settings({ assignments }: { assignments: any[] }) {
  const { actor, refresh, confirm } = useSession(),
    action = useAction(),
    router = useRouter();
  const [currentPassword, setCurrent] = useState(''),
    [newPassword, setNew] = useState(''),
    [repeat, setRepeat] = useState('');
  return (
    <>
      <PageHeader
        eyebrow="CÁ NHÂN"
        title="Cài đặt tài khoản"
        description="Thông tin đăng nhập và phân công đang sử dụng."
      />
      <ErrorBox message={action.error} />
      <div className="settings-grid">
        <section className="panel panel-pad">
          <div className="profile-heading">
            <Avatar name={actor.fullName} />
            <div>
              <h2>{actor.fullName}</h2>
              <p>{actor.email}</p>
            </div>
          </div>
          <div className="definition-list">
            <div>
              <span>Đơn vị</span>
              <b>{actor.unitName}</b>
            </div>
            <div>
              <span>Chức danh</span>
              <b>{actor.positionName}</b>
            </div>
            <div>
              <span>Vai trò</span>
              <b>{actor.roles.join(', ') || 'Chưa được cấp vai trò'}</b>
            </div>
          </div>
          <label className="field-label">
            Phân công làm việc
            <select
              value={actor.assignmentId}
              disabled={action.busy}
              onChange={(e) =>
                action.run(async () => {
                  await api('auth/assignment', 'POST', { assignmentId: e.target.value });
                  refresh();
                  router.push('/dashboard');
                }, 'Đã chuyển phân công.')
              }
            >
              {assignments.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.positionName} · {a.unitName}
                </option>
              ))}
            </select>
          </label>
          <p className="helper">Quyền và hộp công việc thay đổi theo phân công được chọn.</p>
          <button
            className="button danger-outline"
            disabled={action.busy}
            onClick={async () => {
              if (
                await confirm(
                  'Đăng xuất tài khoản?',
                  'Bạn có thể đăng nhập lại để tiếp tục công việc.',
                )
              )
                action.run(async () => {
                  await api('auth/logout', 'POST');
                  refresh();
                });
            }}
          >
            <SignOut size={18} />
            Đăng xuất
          </button>
        </section>
        <section className="panel panel-pad">
          <h2>Đổi mật khẩu</h2>
          <p className="muted">Mật khẩu mới cần ít nhất 10 ký tự.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newPassword !== repeat) {
                action.setError('Mật khẩu xác nhận không trùng khớp.');
                return;
              }
              action.run(async () => {
                await api('auth/password', 'POST', { currentPassword, newPassword });
                setCurrent('');
                setNew('');
                setRepeat('');
              }, 'Đã đổi mật khẩu và đăng xuất các phiên khác.');
            }}
          >
            <label className="field-label">
              Mật khẩu hiện tại
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label className="field-label">
              Mật khẩu mới
              <input
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
              />
            </label>
            <label className="field-label">
              Nhập lại mật khẩu mới
              <input
                type="password"
                minLength={10}
                required
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={action.busy}>
              Cập nhật mật khẩu
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
