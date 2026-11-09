import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Econary 관리',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
