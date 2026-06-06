import type { Metadata, Viewport } from 'next'
import './globals.css'
import { StoreProvider } from '@/lib/store'
import AppLayout from '@/components/layout/AppLayout'
import SWRProvider from '@/components/SWRProvider'

export const metadata: Metadata = {
  title: 'LifeWallet',
  description: '내 인생의 모든 재무를 관리하는 개인 전용 앱',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'LifeWallet',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-dvh overflow-hidden" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700&display=swap" />
      </head>
      <body className="h-dvh overflow-hidden">
        <SWRProvider>
          <StoreProvider>
            <AppLayout>{children}</AppLayout>
          </StoreProvider>
        </SWRProvider>
      </body>
    </html>
  )
}
