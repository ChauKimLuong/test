'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-loading">
      <h1>Không thể tải trang</h1>
      <p>Vui lòng thử lại để tiếp tục công việc.</p>
      <button className="button primary" onClick={reset}>
        Thử lại
      </button>
    </main>
  );
}
