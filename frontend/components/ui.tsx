'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useId,
  ReactNode,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  MagnifyingGlass,
  X,
  WarningCircle,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import { Actor, api, ApiError, RequestItem, fmtDate, statusLabels, initials } from '../lib/api';
export const SessionContext = createContext<{
  actor: Actor;
  refresh: () => void;
  notify: (message: string) => void;
  confirm: (title: string, description: string) => Promise<boolean>;
}>({} as any);
export const useSession = () => useContext(SessionContext);
export function useResource<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let live = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    api<T>(path)
      .then((x) => {
        if (live) setData(x);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, version]);
  return { data, error, loading, reload, setData };
}
export function useAction() {
  const { notify } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({});
  async function run(fn: () => Promise<unknown>, message?: string) {
    if (busy) return false;
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await fn();
      if (message) notify(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) setErrors(e.errors);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, errors, run, setError };
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={'badge ' + status.toLowerCase()}>
      <span className="status-dot" />
      {statusLabels[status] || status}
    </span>
  );
}
export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return <span className={'avatar ' + (small ? 'small' : '')}>{initials(name)}</span>;
}
export function Empty({
  title = 'Chưa có dữ liệu',
  description = 'Dữ liệu sẽ xuất hiện tại đây khi có hoạt động mới.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <FileText size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorBox({ message }: { message?: string }) {
  return message ? (
    <div className="error-box" role="alert">
      <WarningCircle size={20} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="skeleton-list" aria-label="Đang tải dữ liệu" role="status">
      <div />
      <div />
      <div />
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
export function Search({
  value,
  onChange,
  placeholder = 'Tìm kiếm…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <MagnifyingGlass size={19} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total ? (page - 1) * pageSize + 1 + '–' + Math.min(page * pageSize, total) : 0} trên{' '}
        {total} kết quả
      </span>
      <div className="actions">
        <button
          className="icon-button"
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <CaretLeft />
        </button>
        <span>
          Trang {page} / {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          className="icon-button"
          aria-label="Trang sau"
          disabled={page * pageSize >= total}
          onClick={() => onChange(page + 1)}
        >
          <CaretRight />
        </button>
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '')}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Đóng" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function RequestTable({
  items,
  compact = false,
}: {
  items: RequestItem[];
  compact?: boolean;
}) {
  if (!items.length)
    return (
      <Empty
        title="Chưa có yêu cầu"
        description="Tạo yêu cầu đầu tiên hoặc thay đổi bộ lọc để xem kết quả."
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Yêu cầu</th>
            {!compact && <th>Người gửi</th>}
            <th>Trạng thái</th>
            <th>Ngày tạo</th>
            <th>
              <span className="sr-only">Chi tiết</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>
                <Link className="table-title" href={'/requests/' + r.id}>
                  {r.form_name}
                </Link>
                <span className="subtext mono">{r.request_code || 'Chưa cấp mã · Bản nháp'}</span>
              </td>
              {!compact && (
                <td>
                  <div className="person-cell">
                    <Avatar name={r.requester_name} small />
                    <div>
                      {r.requester_name}
                      <span className="subtext">{r.unit_name}</span>
                    </div>
                  </div>
                </td>
              )}
              <td>
                <Badge status={r.status} />
              </td>
              <td className="nowrap muted">{fmtDate(r.created_at)}</td>
              <td>
                <Link
                  className="icon-button"
                  href={'/requests/' + r.id}
                  aria-label={'Xem ' + (r.request_code || r.form_name)}
                >
                  <ArrowRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Stat({
  label,
  value,
  note,
  icon,
  tone = 'blue',
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={'stat-icon ' + tone}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
export function Step({
  title,
  description,
  done,
  active,
}: {
  title: string;
  description: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className={'flow-step ' + (done ? 'done' : active ? 'active' : '')}>
      <span>{done ? <CheckCircle weight="fill" size={23} /> : <Clock size={22} />}</span>
      <div>
        <b>{title}</b>
        <p>{description}</p>
      </div>
    </div>
  );
}
