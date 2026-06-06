'use client'

import { useEffect, useRef, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, ClipboardCopy, Loader2, Pencil, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { MonthlyReport } from '@/lib/report'
import type { AiReport } from '@/lib/types'

// AI 재무 분석 섹션 — financial-advisor 스킬 결과를 붙여넣어 월별 저장.
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
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]"
    >
      {copied ? <Check size={15} className="text-[var(--color-income)]" /> : <ClipboardCopy size={15} />}
      {copied ? '복사됨' : '보고서 데이터 복사'}
    </button>
  )
}

export default function AiAnalysis({ report, year, month, monthStartDay }: { report: MonthlyReport; year: number; month: number; monthStartDay: number }) {
  const url = `/api/report/ai?year=${year}&month=${month}`
  const { data, mutate, isLoading } = useSWR<AiReport | null>(url, fetcher)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [streamed, setStreamed] = useState('')
  const [genError, setGenError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 월을 바꾸면 편집·생성 상태를 닫고 진행 중인 생성 요청을 취소한다.
  useEffect(() => {
    setEditing(false)
    setDraft('')
    setStreamed('')
    setGenError(null)
    setGenerating(false)
    abortRef.current?.abort()
  }, [year, month])
  // 언마운트 시에도 진행 중 요청 취소.
  useEffect(() => () => abortRef.current?.abort(), [])

  // 인앱 생성 — /api/report/ai/generate 스트리밍. 완료 후 서버가 ai_reports에 저장하므로
  // mutate()로 저장본을 다시 불러와 스트리밍 임시본을 정본으로 대체한다.
  // 워크플로: README.md "AI 재무 분석 워크플로" / 검증·저장 게이트: lib/ai-report.ts validateGeneratedReport.
  async function generate() {
    if (generating) return
    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setStreamed('')
    setGenError(null)
    try {
      const res = await fetch('/api/report/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, monthStartDay }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error('생성 요청에 실패했습니다.')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setStreamed(acc)
      }
      if (acc.trim().startsWith('오류')) {
        setGenError(acc.trim())
      } else {
        await mutate()
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return // 월 전환·언마운트로 취소됨
      setGenError(e instanceof Error ? e.message : '생성 중 오류가 발생했습니다.')
    } finally {
      // 더 새로운 생성/취소가 이 컨트롤러를 대체했다면 그쪽이 상태를 소유하므로 건드리지 않는다.
      if (abortRef.current === controller) {
        abortRef.current = null
        setGenerating(false)
        setStreamed('')
      }
    }
  }

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
        {!editing && !generating && data ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={generate}
              className="inline-flex h-11 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]"
            >
              <RefreshCw size={14} /> AI 재생성
            </button>
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex h-11 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]"
            >
              <Pencil size={14} /> 직접 편집
            </button>
            <button
              type="button"
              onClick={remove}
              className="inline-flex h-11 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-semibold text-[var(--color-expense)] hover:bg-[var(--color-surface-sub)]"
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

        {genError && !editing && !generating ? (
          <p className="mb-3 text-[13px] text-[var(--color-expense)]">{genError}</p>
        ) : null}

        {editing ? (
          <div className="space-y-3">
            <CopyReportButton report={report} />
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={14}
              placeholder="마크다운 보고서를 여기에 붙여넣으세요."
              className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[14px] font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!draft.trim() || saving}
                className="h-11 rounded-lg bg-[var(--color-primary)] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        ) : generating || streamed ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[13px] text-[var(--color-text-sub)]">
              <Loader2 size={14} className="animate-spin text-[var(--color-primary)]" /> AI가 분석을 작성하는 중...
            </p>
            {streamed ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {streamed}
              </ReactMarkdown>
            ) : null}
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
            <p className="text-[13px] leading-relaxed text-[var(--color-text-sub)]">
              <strong className="text-[var(--color-text-body)]">AI로 생성</strong>을 누르면 앱이 직접 보고서를 분석·저장합니다. 또는 보고서 데이터를 복사해 외부 AI에 붙여넣고 결과를 직접 저장할 수도 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                <Sparkles size={15} /> AI로 생성
              </button>
              <CopyReportButton report={report} />
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[14px] font-semibold text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)]"
              >
                <Pencil size={15} /> 직접 붙여넣기
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
