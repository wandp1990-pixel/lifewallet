import type { Metadata, Viewport } from 'next'
import './globals.css'
import { StoreProvider } from '@/lib/store'
import AppLayout from '@/components/layout/AppLayout'

export const metadata: Metadata = {
  title: 'LifeWallet',
  description: '내 인생의 모든 재무를 관리하는 개인 전용 앱',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700&display=swap" />
      </head>
      <body className="h-full">
        <StoreProvider>
          <AppLayout>{children}</AppLayout>
        </StoreProvider>
      </body>
    </html>
  )
}
