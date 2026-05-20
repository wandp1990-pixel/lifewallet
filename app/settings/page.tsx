import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const MORE_ITEMS = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/savings', label: '저축 목표' },
  { href: '/wishlist', label: '위시리스트' },
]

const CATEGORY_ITEMS = [
  { href: '/settings/categories/income', label: '수입 카테고리 관리' },
  { href: '/settings/categories/expense', label: '지출 카테고리 관리' },
  { href: '/statistics/budget-settings', label: '예산 설정' },
]

const LEDGER_ITEMS = [
  { href: '/settings/recurring', label: '반복 거래 관리' },
]

function MenuList({ items }: { items: { href: string; label: string }[] }) {
  return (
    <ul className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
      {items.map(item => (
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
  )
}

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">설정</h1>

      {/* 더보기 — 모바일에서 SideNav에 없는 항목 진입 */}
      <section className="md:hidden flex flex-col gap-2">
        <p className="text-xs font-semibold text-[var(--color-text-sub)] px-1">더보기</p>
        <MenuList items={MORE_ITEMS} />
      </section>

      {/* 분류 */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-[var(--color-text-sub)] px-1">분류</p>
        <MenuList items={CATEGORY_ITEMS} />
      </section>

      {/* 가계부 */}
      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-[var(--color-text-sub)] px-1">가계부</p>
        <MenuList items={LEDGER_ITEMS} />
      </section>
    </div>
  )
}
