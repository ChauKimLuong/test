import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const orvaFont = localFont({
  src: [
    { path: './fonts/BeVietnamPro-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/BeVietnamPro-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/BeVietnamPro-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/BeVietnamPro-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-orva',
  display: 'swap',
  preload: false,
});
export const metadata: Metadata = {
  title: 'ORVA · Quản lý phê duyệt',
  applicationName: 'ORVA',
  description: 'Không gian làm việc và phê duyệt nội bộ doanh nghiệp',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={orvaFont.variable}>
      <body>{children}</body>
    </html>
  );
}
