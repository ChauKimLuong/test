import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'FlowPilot · Quản lý phê duyệt',
  description: 'Không gian làm việc và phê duyệt nội bộ doanh nghiệp',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
