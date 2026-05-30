'use client'

import { useState } from 'react'
import { Pin } from 'lucide-react'
import { MEMO_TEXT_DARK, MEMO_TEXT_DARK_SUB } from '@/lib/memoColors'
import type { Memo } from '@/lib/types'

const DAY_SHORT = ['일', '월', '화', '수', '목', '금', '토']

function dateLabel(d: string) {
  const obj = new Date(d + 'T00:00:00')
  return `${obj.getMonth() + 1}. ${obj.getDate()}. (${DAY_SHORT[obj.getDay()]})`
}

interface Props {
  memos: Memo[]
  year: number
  month: number
  onSelect: (memo: Memo) => void
}

function MemoCard({ memo, onSelect }: { memo: Memo; onSelect: (m: Memo) => void }) {
  const colored = !!memo.color
  return (
    <button
      onClick={() => onSelect(memo)}
      className="block w-full text-left px-3.5 py-3 rounded-xl relative active:opacity-70 transition-opacity"
      style={{
        background: memo.color || 'var(--color-surface)',
        border: colored ? 'none' : '1px solid var(--color-border)',
      }}
    >
      {memo.pinned && (
        <span className="absolute top-2.5 right-2.5 text-[var(--color-primary)]">
          <Pin size={13} fill="currentColor" />
        </span>
      )}
      {memo.title && (
        <p className="text-[14px] font-semibold leading-tight pr-5" style={{ color: colored ? MEMO_TEXT_DARK : 'var(--color-text)' }}>
          {memo.title}
        </p>
      )}
      {memo.content && (
        <p className="text-[13px] mt-0.5 leading-snug pr-5 whitespace-pre-wrap line-clamp-4" style={{ color: colored ? MEMO_TEXT_DARK_SUB : 'var(--color-text-sub)' }}>
          {memo.content}
        </p>
      )}
    </button>
  )
}

const SectionHeader = ({ children, pin = false }: { children: React.ReactNode; pin?: boolean }) => (
  <div className="px-4 h-[30px] flex items-center gap-1.5 bg-[var(--color-surface-sub)] border-y border-[var(--color-border)]">
    {pin && <Pin size={11} className="text-[var(--color-primary)]" fill="currentColor" />}
    <span className={`text-[13px] ${pin ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-sub)]'}`}>{children}</span>
  </div>
)

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center justify-center py-20 text-[var(--color-text-sub)]">
    <p className="text-sm">{text}</p>
  </div>
)

export default function MemoTab({ memos, year, month, onSelect }: Props) {
  const [sub, setSub] = useState<'dated' | 'undated'>('dated')
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const SubTabs = () => (
    <div className="flex bg-[var(--color-surface)] border-b border-[var(--color-border)]">
      {(['dated', 'undated'] as const).map(t => (
        <button
          key={t}
          onClick={() => setSub(t)}
          className={`flex-1 py-2 text-[13px] font-medium relative ${sub === t ? 'text-[var(--color-text)]' : 'text-[var(--color-text-sub)]'}`}
        >
          {t === 'dated' ? '날짜' : '날짜 없음'}
          {sub === t && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-primary)]" />}
        </button>
      ))}
    </div>
  )

  if (sub === 'dated') {
    const pinnedDated = memos.filter(m => m.pinned && m.date)
    const regular = memos
      .filter(m => !m.pinned && m.date && m.date.startsWith(prefix))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    const grouped = regular.reduce<Record<string, Memo[]>>((acc, m) => {
      ;(acc[m.date] ??= []).push(m)
      return acc
    }, {})
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

    return (
      <div className="flex flex-col">
        <SubTabs />
        <div className="pb-4">
          {pinnedDated.length > 0 && (
            <div className="mb-2">
              <SectionHeader pin>고정됨</SectionHeader>
              <div className="flex flex-col gap-1.5 mx-2 mt-1.5">
                {pinnedDated
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(memo => (
                    <div key={memo.id}>
                      <MemoCard memo={memo} onSelect={onSelect} />
                      <p className="text-[11px] text-[var(--color-text-sub)] mt-0.5 px-1">{dateLabel(memo.date)}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {sortedDates.length === 0 && pinnedDated.length === 0 ? (
            <EmptyState text="이번 달 날짜 메모가 없습니다." />
          ) : (
            sortedDates.map(d => (
              <div key={d} className="mb-2">
                <SectionHeader>{dateLabel(d)}</SectionHeader>
                <div className="flex flex-col gap-1.5 mx-2 mt-1.5">
                  {grouped[d].map(memo => <MemoCard key={memo.id} memo={memo} onSelect={onSelect} />)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // 날짜 없음
  const pinnedUndated = memos.filter(m => m.pinned && !m.date)
  const undated = memos
    .filter(m => !m.pinned && !m.date)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="flex flex-col">
      <SubTabs />
      <div className="pb-4 pt-2 px-2 flex flex-col gap-1.5">
        {pinnedUndated.length === 0 && undated.length === 0 ? (
          <EmptyState text="날짜 없는 메모가 없습니다." />
        ) : (
          <>
            {pinnedUndated.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-1 pt-0.5">
                  <Pin size={11} className="text-[var(--color-primary)]" fill="currentColor" />
                  <span className="text-[12px] text-[var(--color-primary)] font-medium">고정됨</span>
                </div>
                {pinnedUndated.map(memo => <MemoCard key={memo.id} memo={memo} onSelect={onSelect} />)}
                {undated.length > 0 && <div className="h-px bg-[var(--color-border)] my-1" />}
              </>
            )}
            {undated.map(memo => <MemoCard key={memo.id} memo={memo} onSelect={onSelect} />)}
          </>
        )}
      </div>
    </div>
  )
}
