import { Bell, ChartLineUp, FileText, ListChecks, PlusCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { User } from '../types';

export type View = 'dashboard' | 'requests' | 'create' | 'tasks';

const navigation: Array<{ id: View; label: string; icon: typeof ChartLineUp }> = [
  { id: 'dashboard', label: 'Tổng quan', icon: ChartLineUp },
  { id: 'requests', label: 'Hồ sơ của tôi', icon: FileText },
  { id: 'create', label: 'Tạo đề nghị', icon: PlusCircle },
  { id: 'tasks', label: 'Hộp việc duyệt', icon: ListChecks },
];

interface AppShellProps {
  children: ReactNode;
  view: View;
  onNavigate: (view: View) => void;
  users: User[];
  currentUserId: string;
  onUserChange: (id: string) => void;
  pendingTasks: number;
}

export function AppShell({ children, view, onNavigate, users, currentUserId, onUserChange, pendingTasks }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Điều hướng chính">
        <div className="brand"><span className="brand-mark">FP</span><span>FlowPilot</span></div>
        <p className="workspace-label">Không gian làm việc</p>
        <p className="workspace-name">Công ty ACME Demo</p>
        <nav className="nav-list">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => onNavigate(id)}>
              <Icon size={20} weight={view === id ? 'fill' : 'regular'} aria-hidden="true" />
              <span>{label}</span>
              {id === 'tasks' && pendingTasks > 0 ? <span className="nav-count" aria-label={`${pendingTasks} việc chờ`}>{pendingTasks}</span> : null}
            </a>
          ))}
        </nav>
        <div className="sidebar-note"><strong>Chế độ demo</strong><span>Dữ liệu được reset khi khởi động lại API.</span></div>
      </aside>
      <div className="content-column">
        <header className="topbar">
          <div><p className="eyebrow">Nền tảng phê duyệt nội bộ</p><p className="topbar-title">MVP học tập</p></div>
          <div className="top-actions">
            <span className="notification-dot" title="Thông báo demo"><Bell size={20} aria-hidden="true" /></span>
            <label className="user-picker"><span className="sr-only">Chọn người dùng demo</span>
              <select value={currentUserId} onChange={(event) => onUserChange(event.target.value)}>
                {users.map((user) => <option key={user.id} value={user.id}>{user.displayName} - {user.roleLabel}</option>)}
              </select>
            </label>
          </div>
        </header>
        <main id="main-content" className="main-content">{children}</main>
      </div>
    </div>
  );
}
