'use client'

import { RefreshCw } from 'lucide-react'

export default function AppRefreshButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="flex w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--color-surface-sub)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text)]"
    >
      <span className="text-[15px] text-[var(--color-text)]">앱 새로고침</span>
      <RefreshCw size={18} aria-hidden="true" className="text-[var(--color-text-sub)]" />
    </button>
  )
}
