'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SquaresFour,
  Files,
  FileText,
  CheckSquare,
  Stack,
  GitBranch,
  Buildings,
  Users,
  ShieldCheck,
  ClockCounterClockwise,
  Bell,
  Gear,
  SignOut,
  ArrowUpRight,
  Plus,
  List,
  X,
  CheckCircle,
  ArrowRight,
  Eye,
  EyeSlash,
  CaretDown,
} from '@phosphor-icons/react';
import { api, Actor, can, initials } from '../lib/api';
import { Avatar, ErrorBox, Modal, SessionContext } from './ui';
import { Dashboard, RequestsList, Notifications, Settings } from './workspace';
import { RequestEditor, RequestDetail } from './request-pages';
import { FormLibrary, FormBuilder, Workflows } from './form-pages';
import { Organization, People, Roles, Audit } from './admin-pages';
import { Delegations, WorkflowMetrics } from './operations-pages';
const navigation = [
  {
    title: 'KHÔNG GIAN LÀM VIỆC',
    items: [
      { path: '/dashboard', label: 'Tổng quan', icon: SquaresFour },
      { path: '/requests', label: 'Yêu cầu của tôi', icon: Files },
      { path: '/inbox', label: 'Hộp phê duyệt', icon: CheckSquare, permission: 'REQUEST_APPROVE' },
      {
        path: '/delegations',
        label: 'Ủy quyền phê duyệt',
        icon: Users,
        permission: 'TASK_DELEGATE',
      },
      {
        path: '/metrics',
        label: 'Thời hạn & điểm chậm',
        icon: ClockCounterClockwise,
        permission: 'METRICS_VIEW',
      },
      { path: '/forms', label: 'Thư viện biểu mẫu', icon: Stack, permission: 'FORM_VIEW' },
    ],
  },
  {
    title: 'TẠO MỚI',
    items: [
      { path: '/requests/new', label: 'Tạo yêu cầu', icon: Plus, permission: 'REQUEST_CREATE' },
      { path: '/forms/new', label: 'Tạo mẫu đơn mới', icon: FileText, permission: 'FORM_CREATE' },
    ],
  },
  {
    title: 'QUẢN TRỊ',
    items: [
      {
        path: '/workflows',
        label: 'Quy trình phê duyệt',
        icon: GitBranch,
        permission: 'WORKFLOW_VIEW',
      },
      {
        path: '/organization',
        label: 'Cơ cấu tổ chức',
        icon: Buildings,
        permission: 'ORGANIZATION_VIEW',
      },
      { path: '/people', label: 'Nhân sự & phân công', icon: Users, permission: 'USER_VIEW' },
      { path: '/roles', label: 'Vai trò & quyền', icon: ShieldCheck, permission: 'ROLE_ASSIGN' },
      {
        path: '/audit',
        label: 'Nhật ký hoạt động',
        icon: ClockCounterClockwise,
        permission: 'AUDIT_VIEW',
      },
    ],
  },
];
export default function Application() {
  const path = usePathname(),
    router = useRouter();
  const [session, setSession] = useState<{ actor: Actor; assignments: any[] } | null>(null),
    [loading, setLoading] = useState(true),
    [sessionError, setSessionError] = useState(''),
    [toast, setToast] = useState(''),
    [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState<any[]>([]),
    [confirmation, setConfirmation] = useState<{
      title: string;
      description: string;
      resolve: (v: boolean) => void;
    } | null>(null);
  async function refresh() {
    try {
      setSession(await api('auth/me'));
      setSessionError('');
    } catch (e: any) {
      if (e.status === 401) {
        setSession(null);
        if (path !== '/login' && path !== '/register') router.replace('/login');
      } else setSessionError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    const expired = () => {
      setSession(null);
      router.replace('/login');
    };
    window.addEventListener('flowpilot:session-expired', expired);
    return () => window.removeEventListener('flowpilot:session-expired', expired);
  }, [router]);
  useEffect(() => {
    setMobile(false);
  }, [path]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const update = () =>
      api<any[]>('notifications')
        .then((n) => {
          if (live) setNotifications(n);
        })
        .catch(() => {});
    update();
    const timer = setInterval(update, 30000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [session, path]);
  if (loading)
    return (
      <div className="page-loading">
        <div className="brand-mark">O</div>
        <span className="spinner" />
        Đang mở không gian làm việc…
      </div>
    );
  if (sessionError)
    return (
      <main className="page-loading">
        <ErrorBox message={sessionError} />
        <button className="button primary" onClick={refresh}>
          Kết nối lại
        </button>
      </main>
    );
  if (!session)
    return (
      <Login
        onSuccess={(value) => {
          setSession(value);
          router.replace('/dashboard');
        }}
      />
    );
  const actor = session.actor,
    unread = notifications.filter((n) => !n.read_at).length;
  const allowed = (permission?: string) => !permission || can(actor, permission);
  const navItems = navigation.flatMap((g) => g.items);
  const active = navItems
    .filter((n) => path === n.path || path.startsWith(n.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const current =
    active?.label ||
    (path === '/notifications'
      ? 'Thông báo'
      : path === '/settings'
        ? 'Tài khoản'
        : 'Không gian làm việc');
  let content: React.ReactNode;
  const segments = path.split('/').filter(Boolean);
  if (path === '/dashboard' || path === '/' || path === '/login') content = <Dashboard />;
  else if (path === '/requests/new') content = <RequestEditor />;
  else if (segments[0] === 'requests' && segments[1]) content = <RequestDetail id={segments[1]} />;
  else if (path === '/requests' || path === '/inbox')
    content = <RequestsList inbox={path === '/inbox'} />;
  else if (path === '/forms/new') content = <FormBuilder />;
  else if (segments[0] === 'forms' && segments[1]) content = <FormBuilder id={segments[1]} />;
  else if (path === '/forms') content = <FormLibrary />;
  else if (path === '/workflows') content = <Workflows />;
  else if (path === '/delegations') content = <Delegations />;
  else if (path === '/metrics') content = <WorkflowMetrics />;
  else if (path === '/organization') content = <Organization />;
  else if (path === '/people') content = <People />;
  else if (path === '/roles') content = <Roles />;
  else if (path === '/audit') content = <Audit />;
  else if (path === '/notifications') content = <Notifications />;
  else if (path === '/settings') content = <Settings assignments={session.assignments} />;
  else
    content = (
      <div className="empty">
        <h1>Không tìm thấy trang</h1>
        <Link className="button primary" href="/dashboard">
          Về tổng quan
        </Link>
      </div>
    );
  if (active?.permission && !allowed(active.permission))
    content = (
      <div className="empty">
        <ShieldCheck size={40} />
        <h1>Bạn chưa có quyền truy cập</h1>
        <p>Liên hệ quản trị viên để được cấp vai trò phù hợp.</p>
      </div>
    );
  return (
    <SessionContext.Provider
      value={{
        actor,
        refresh,
        notify: setToast,
        confirm: (title, description) =>
          new Promise((resolve) => setConfirmation({ title, description, resolve })),
      }}
    >
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      <div className="app-shell">
        {mobile && (
          <button
            className="nav-backdrop"
            aria-label="Đóng điều hướng"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={'sidebar ' + (mobile ? 'open' : '')}>
          <Link href="/dashboard" className="brand">
            <span className="brand-mark">
              O<span />
            </span>
            <span>
              ORVA<span className="brand-subtitle">APPROVAL WORKSPACE</span>
            </span>
          </Link>
          <div className="workspace-switch">
            <span className="workspace-icon">
              <Buildings size={20} />
            </span>
            <div>
              <b>FlowPilot Corporation</b>
              <span>Không gian doanh nghiệp</span>
            </div>
            <CaretDown size={13} />
          </div>
          <nav aria-label="Điều hướng chính">
            {navigation.map((group) => {
              const items = group.items.filter((item) => allowed(item.permission));
              return items.length ? (
                <div className="nav-group" key={group.title}>
                  <p>{group.title}</p>
                  {items.map((item) => (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={'nav-item ' + (active?.path === item.path ? 'selected' : '')}
                      aria-current={active?.path === item.path ? 'page' : undefined}
                    >
                      <item.icon
                        size={21}
                        weight={active?.path === item.path ? 'fill' : 'regular'}
                      />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              ) : null;
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="workspace-note">
              <span className="note-dot" />
              <b>Mọi phê duyệt, một nơi</b>
              <p>
                Rõ người phụ trách.
                <br />
                Đầy đủ lịch sử xử lý.
              </p>
            </div>
            <Link
              className={'nav-item ' + (path === '/settings' ? 'selected' : '')}
              href="/settings"
            >
              <Gear size={21} />
              Cài đặt tài khoản
            </Link>
            <button className="profile-card" onClick={() => router.push('/settings')}>
              <Avatar name={actor.fullName} />
              <span>
                <b>{actor.fullName}</b>
                <small>{actor.positionName}</small>
              </span>
              <CaretDown />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-toggle"
                aria-label="Mở điều hướng"
                onClick={() => setMobile(!mobile)}
              >
                <List size={24} />
              </button>
              <span className="breadcrumb">
                Không gian làm việc <span>/</span> <b>{current}</b>
              </span>
            </div>
            <div className="actions">
              <span className="workspace-date">
                {new Intl.DateTimeFormat('vi-VN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }).format(new Date())}
              </span>
              <Link
                href="/notifications"
                className="icon-button notification-button"
                aria-label={'Thông báo, ' + unread + ' chưa đọc'}
              >
                <Bell size={22} />
                {unread > 0 && <span className="notification-dot" />}
              </Link>
              <span className="topbar-divider" />
              <Avatar name={actor.fullName} small />
            </div>
          </header>
          <main id="main-content" className="main-content" key={path}>
            {content}
          </main>
          <footer className="app-footer">
            <span>ORVA · Hệ thống phê duyệt nội bộ</span>
            <span>Rõ ràng trong từng quyết định</span>
          </footer>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={22} weight="fill" />
          {toast}
          <button aria-label="Đóng thông báo" onClick={() => setToast('')}>
            <X />
          </button>
        </div>
      )}
      {confirmation && (
        <Modal
          title={confirmation.title}
          onClose={() => {
            confirmation.resolve(false);
            setConfirmation(null);
          }}
        >
          <p className="modal-description">{confirmation.description}</p>
          <div className="modal-actions">
            <button
              className="button"
              onClick={() => {
                confirmation.resolve(false);
                setConfirmation(null);
              }}
            >
              Quay lại
            </button>
            <button
              className="button primary"
              onClick={() => {
                confirmation.resolve(true);
                setConfirmation(null);
              }}
            >
              Xác nhận
            </button>
          </div>
        </Modal>
      )}
    </SessionContext.Provider>
  );
}
function Login({ onSuccess }: { onSuccess: (value: any) => void }) {
  const path = usePathname(),
    register = path === '/register';
  const [email, setEmail] = useState(''),
    [fullName, setFullName] = useState(''),
    [password, setPassword] = useState(''),
    [repeat, setRepeat] = useState(''),
    [complete, setComplete] = useState(false),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="login-page">
      <section className="login-story">
        <Link href="/" className="brand inverse">
          <span className="brand-mark">
            O<span />
          </span>
          <span>
            ORVA<span className="brand-subtitle">APPROVAL WORKSPACE</span>
          </span>
        </Link>
        <div className="login-message">
          <span className="login-kicker">VẬN HÀNH RÕ RÀNG. QUYẾT ĐỊNH NHANH HƠN.</span>
          <h1>
            Mỗi đề xuất đều
            <br /> có một hành trình.
          </h1>
          <p>Kết nối biểu mẫu, con người và phê duyệt trong một không gian làm việc thống nhất.</p>
          <div className="login-illustration">
            <div className="illustration-top">
              <span>
                <Files size={22} /> Đề nghị mua sắm
              </span>
              <span className="badge approved">Đã phê duyệt</span>
            </div>
            <div className="illustration-line" />
            <div className="illustration-line short" />
            <div className="illustration-flow">
              <span>
                <CheckCircle weight="fill" />
                Tạo yêu cầu
              </span>
              <i />
              <span>
                <CheckCircle weight="fill" />
                Phê duyệt
              </span>
              <i />
              <span>
                <CheckCircle weight="fill" />
                Hoàn tất
              </span>
            </div>
          </div>
        </div>
        <p className="login-foot">Thiết kế cho cách doanh nghiệp của bạn làm việc.</p>
      </section>
      <section className="login-form-panel">
        <div className="login-form">
          <span className="eyebrow">{register ? 'THAM GIA ORVA' : 'CHÀO MỪNG TRỞ LẠI'}</span>
          <h2>{register ? 'Đăng ký tài khoản' : 'Đăng nhập không gian làm việc'}</h2>
          <p>
            {register
              ? 'Tạo tài khoản, sau đó CEO sẽ phân công và kích hoạt quyền truy cập.'
              : 'Sử dụng tài khoản doanh nghiệp để tiếp tục.'}
          </p>
          {complete && (
            <div className="info-banner">
              <CheckCircle size={21} />
              Đã đăng ký thành công. CEO sẽ phân công, cấp vai trò và kích hoạt tài khoản.{' '}
              <Link href="/login">Về đăng nhập</Link>
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                if (register) {
                  if (password !== repeat) throw new Error('Mật khẩu xác nhận không khớp.');
                  await api('auth/register', 'POST', { fullName, email, password });
                  setComplete(true);
                } else onSuccess(await api('auth/login', 'POST', { email, password }));
              } catch (err: any) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {register && (
              <label className="field-label">
                Họ và tên
                <input
                  required
                  maxLength={150}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="Nguyễn Văn A"
                />
              </label>
            )}
            <label className="field-label">
              Email công việc
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@congty.vn"
                autoComplete="username"
              />
            </label>
            <label className="field-label">
              Mật khẩu
              <span className="password-field">
                <input
                  type={show ? 'text' : 'password'}
                  required
                  minLength={register ? 10 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                />
                <button
                  type="button"
                  aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeSlash size={20} /> : <Eye size={20} />}
                </button>
              </span>
            </label>
            {register && (
              <label className="field-label">
                Xác nhận mật khẩu
                <input
                  type="password"
                  required
                  minLength={10}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            )}
            <ErrorBox message={error} />
            <button className="button primary full-button" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" />
                  Đang đăng nhập…
                </>
              ) : (
                <>
                  {register ? 'Gửi đăng ký' : 'Đăng nhập'} <ArrowRight size={19} />
                </>
              )}
            </button>
          </form>
          <div className="login-help">
            <ShieldCheck size={20} />
            <span>
              {register ? (
                <Link href="/login">Đã có tài khoản? Đăng nhập</Link>
              ) : (
                <Link href="/register">Chưa có tài khoản? Đăng ký tại đây</Link>
              )}
            </span>
          </div>
          <div className="demo-hint">
            <b>Không gian demo TLCN</b>
            <p>Tài khoản dùng thử và hướng dẫn nằm trong README của dự án.</p>
          </div>
        </div>
        <span className="login-copyright">© {new Date().getFullYear()} ORVA</span>
      </section>
    </div>
  );
}
