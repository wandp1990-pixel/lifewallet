'use client'

import { useEffect, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, ClipboardCopy, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { MonthlyReport } from '@/lib/report'
import type { AiReport } from '@/lib/types'

// AI 재무 분석 섹션 — financial-advisor 스킬 결과를 월별로 저장·열람.
// 앱은 LLM을 호출하지 않고 사용자가 스킬 결과를 붙여넣는다(수동 왕복).
// 워크플로: README.md "AI 재무 분석 워크플로" / UX: PAGES.md `/report` "AI 재무 분석".

const MD_COMPONENTS = {
  h1: (p: ComponentPropsWithoutRef<'h1'>) => <h1 className="mt-5 mb-2 text-[18px] font-bold text-[var(--color-text)] first:mt-0" {...p} />,
  h2: (p: ComponentPropsWithoutRef<'h2'>) => <h2 className="mt-5 mb-2 text-[16px] font-bold text-[var(--color-text)] first:mt-0" {...p} />,
  h3: (p: ComponentPropsWithoutRef<'h3'>) => <h3 className="mt-4 mb-1.5 text-[14px] font-semibold text-[var(--color-text)] first:mt-0" {...p} />,
  p: (p: ComponentPropsWithoutRef<'p'>) => <p className="my-2 text-[14px] leading-relaxed text-[var(--color-text-body)]" {...p} />,
  ul: (p: ComponentPropsWithoutRef<'ul'>) => <ul className="my-2 list-disc space-y-1 pl-5 text-[14px] text-[var(--color-text-body)]" {...p} />,
  ol: (p: ComponentPropsWithoutRef<'ol'>) => <ol className="my-2 list-decimal space-y-1 pl-5 text-[14px] text-[var(--color-text-body)]" {...p} />,
  li: (p: ComponentPropsWithoutRef<'li'>) => <li className="leading-relaxed" {...p} />,
  strong: (p: ComponentPropsWithoutRef<'strong'>) => <strong className="font-semibold text-[var(--color-text)]" {...p} />,
  a: (p: ComponentPropsWithoutRef<'a'>) => <a className="text-[var(--color-primary)] underline" {...p} />,
  blockquote: (p: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="my-3 border-l-2 border-[var(--color-primary)] bg-[var(--color-surface-sub)] px-3 py-2 text-[13px] text-[var(--color-text-body)]" {...p} />
  ),
  hr: () => <hr className="my-4 border-[var(--color-border)]" />,
  code: (p: ComponentPropsWithoutRef<'code'>) => (
    <code className="rounded bg-[var(--color-surface-sub)] px-1 py-0.5 text-[13px] text-[var(--color-text)]" {...p} />
  ),
  table: (p: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]" {...p} />
    </div>
  ),
  th: (p: ComponentPropsWithoutRef<'th'>) => (
    <th className="border border-[var(--color-border)] bg-[var(--color-surface-sub)] px-2 py-1.5 text-left font-semibold text-[var(--color-text)]" {...p} />
  ),
  td: (p: ComponentPropsWithoutRef<'td'>) => (
    <td className="border border-[var(--color-border)] px-2 py-1.5 text-[var(--color-text-body)]" {...p} />
  ),
}

function CopyReportButton({ report }: { report: MonthlyReport }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]"
    >
      {copied ? <Check size={15} className="text-[var(--color-income)]" /> : <ClipboardCopy size={15} />}
      {copied ? '복사됨' : '보고서 데이터 복사'}
    </button>
  )
}

export default function AiAnalysis({ report, year, month }: { report: MonthlyReport; year: number; month: number }) {
  const url = `/api/report/ai?year=${year}&month=${month}`
  const { data, mutate, isLoading } = useSWR<AiReport | null>(url, fetcher)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  // 월을 바꾸면 편집 상태를 닫는다 — 이전 달 draft가 다른 달에 저장되는 것을 방지.
  useEffect(() => {
    setEditing(false)
    setDraft('')
  }, [year, month])

  function startEdit() {
    setDraft(data?.content ?? '')
    setEditing(true)
  }

  async function save() {
    if (!draft.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/report/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, content: draft }),
      })
      if (!res.ok) throw new Error('save failed')
      await mutate()
      setEditing(false)
    } catch {
      alert('저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm('이 달의 AI 재무 분석을 삭제할까요?')) return
    await fetch(url, { method: 'DELETE' })
    await mutate(null, { revalidate: false })
    setEditing(false)
  }

  return (
    <section className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 md:px-5 md:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles size={18} className="shrink-0 text-[var(--color-primary)]" aria-hidden />
          <h2 className="text-[16px] font-bold text-[var(--color-text)]">AI 재무 분석</h2>
        </div>
        {!editing && data ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[13px] font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]"
            >
              <Pencil size={14} /> 다시 작성
            </button>
            <button
              type="button"
              onClick={remove}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[13px] font-semibold text-[var(--color-expense)] hover:bg-[var(--color-surface-sub)]"
            >
              <Trash2 size={14} /> 삭제
            </button>
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4 md:px-5">
        <p className="mb-3 text-[12px] text-[var(--color-text-sub)]">
          참고용 정보입니다. 전문가의 재무·세무·투자 상담을 대체하지 않습니다.
        </p>

        {editing ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CopyReportButton report={report} />
              <span className="text-[12px] text-[var(--color-text-sub)]">
                복사한 데이터를 Claude의 재무 분석 스킬에 붙여넣고, 결과 마크다운을 아래에 붙여넣어 저장하세요.
              </span>
            </div>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={14}
              placeholder="financial-advisor 스킬이 작성한 마크다운 보고서를 여기에 붙여넣으세요."
              className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[14px] font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!draft.trim() || saving}
                className="h-10 rounded-lg bg-[var(--color-primary)] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <p className="py-6 text-center text-[13px] text-[var(--color-text-sub)]">불러오는 중...</p>
        ) : data ? (
          <>
            <p className="mb-3 text-[12px] text-[var(--color-text-sub)]">
              생성일 {new Date(data.updated_at).toLocaleString('ko-KR')}
            </p>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {data.content}
            </ReactMarkdown>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-[14px] text-[var(--color-text-body)]">이 달의 AI 재무 분석이 아직 없습니다.</p>
            <ol className="list-decimal space-y-1 pl-5 text-[13px] text-[var(--color-text-sub)]">
              <li>아래 <strong className="font-semibold text-[var(--color-text-body)]">보고서 데이터 복사</strong>를 눌러 이 달 보고서를 복사</li>
              <li>Claude에 붙여넣고 재무 분석(financial-advisor 스킬)을 요청</li>
              <li>받은 결과를 붙여넣고 저장하면 이 달에 보관됩니다</li>
            </ol>
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-[14px] font-semibold text-white"
            >
              <Sparkles size={15} /> AI 분석 작성
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
