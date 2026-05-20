import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const menu = [
  { href: '/settings/categories/income', label: '수입 분류 설정' },
  { href: '/settings/categories/expense', label: '지출 분류 설정' },
  { href: '/settings/assets', label: '자산 설정' },
  { href: '/settings/budgets', label: '예산 설정' },
]

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <h1 className="text-xl font-bold text-[var(--color-text)]">설정</h1>

      <ul className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
        {menu.map(item => (
          <li key={item.href} className="border-b border-[var(--color-border)] last:border-b-0">
            <Link
              href={item.href}
              className="flex items-center justify-between px-4 py-3.5 hover:bg-[var(--color-surface-sub)] transition-colors"
            >
              <span className="text-[15px] text-[var(--color-text)]">{item.label}</span>
              <ChevronRight size={18} className="text-[var(--color-text-sub)]" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
