import { useEffect, useMemo, useState } from 'react';
import { AppShell, type View } from './components/AppShell';
import { api } from './lib/api';
import { DashboardPage } from './pages/DashboardPage';
import { RequestFormPage } from './pages/RequestFormPage';
import { RequestsPage } from './pages/RequestsPage';
import { TasksPage } from './pages/TasksPage';
import type { User } from './types';

function viewFromHash(): View {
  const candidate = window.location.hash.replace('#', '');
  return ['dashboard', 'requests', 'create', 'tasks'].includes(candidate) ? candidate as View : 'dashboard';
}

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState('user-huy');
  const [view, setView] = useState<View>(viewFromHash);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingTasks, setPendingTasks] = useState(0);

  useEffect(() => { api.users().then(setUsers).catch((cause: Error) => setError(cause.message)); }, []);
  useEffect(() => { const updateView = () => setView(viewFromHash()); window.addEventListener('hashchange', updateView); return () => window.removeEventListener('hashchange', updateView); }, []);
  useEffect(() => {
    let active = true;
    api.tasks(currentUserId).then((tasks) => active && setPendingTasks(tasks.filter((task) => task.status === 'PENDING').length)).catch(() => active && setPendingTasks(0));
    return () => { active = false; };
  }, [currentUserId, refreshKey]);
  const currentUser = useMemo(() => users.find((user) => user.id === currentUserId) ?? users[0], [users, currentUserId]);
  const navigate = (next: View) => { window.location.hash = next; setView(next); };

  if (error) return <div className="fatal-error" role="alert"><h1>Không thể tải MVP</h1><p>{error}</p><p>Hãy kiểm tra backend NestJS đang chạy tại http://localhost:3000.</p></div>;
  if (!currentUser) return <div className="app-loading" aria-live="polite">Đang khởi tạo không gian demo...</div>;
  const completeRequest = () => { setRefreshKey((key) => key + 1); navigate('requests'); };

  return <AppShell view={view} onNavigate={navigate} users={users} currentUserId={currentUser.id} onUserChange={(id) => { setCurrentUserId(id); setRefreshKey((key) => key + 1); }} pendingTasks={pendingTasks}>
    {view === 'dashboard' ? <DashboardPage key={`${currentUser.id}-${refreshKey}`} userId={currentUser.id} /> : null}
    {view === 'requests' ? <RequestsPage key={`${currentUser.id}-${refreshKey}`} user={currentUser} /> : null}
    {view === 'create' ? <RequestFormPage user={currentUser} onComplete={completeRequest} /> : null}
    {view === 'tasks' ? <TasksPage key={`${currentUser.id}-${refreshKey}`} user={currentUser} onTaskUpdated={() => setRefreshKey((key) => key + 1)} /> : null}
  </AppShell>;
}
