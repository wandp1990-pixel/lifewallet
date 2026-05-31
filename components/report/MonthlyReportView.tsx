'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Landmark, PieChart as PieChartIcon, PiggyBank, Scale, Sparkles, Target, WalletCards } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { fetcher } from '@/lib/fetcher'
import { getDisplayMonth, getMonthStartDay } from '@/lib/monthStart'
import type { MonthlyReport } from '@/lib/report'
import { cn, formatAmount } from '@/lib/utils'
import { ESSENTIALITY_COLOR } from '@/lib/colors'
import CatIcon from '@/components/ui/CatIcon'

function moveMonth(year: number, month: number, delta: -1 | 1) {
  if (delta === -1) return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

function formatSignedAmount(amount: number) {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''
  return `${sign}${formatAmount(amount)}원`
}

function formatPercent(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) return '-'
  return `${value.toFixed(digits)}%`
}

function formatSignedPercent(value: number | null, digits = 0) {
  if (value === null || Number.isNaN(value)) return '-'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function toneClass(value: number, positiveGood = true) {
  if (value === 0) return 'text-[var(--color-text)]'
  const good = positiveGood ? value > 0 : value < 0
  return good ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'
}

function priorityLabel(priority: MonthlyReport['debtStrategy']['loans'][number]['priority']) {
  if (priority === 'high_interest') return '고금리'
  if (priority === 'quick_close') return '단기 종료'
  if (priority === 'heavy_payment') return '부담 큼'
  return '일반'
}

function payoffLabel(loan: MonthlyReport['debtStrategy']['loans'][number]) {
  if (loan.payoffStatus === 'paid_off') return '완납'
  if (loan.payoffStatus === 'ok') return `${loan.estimatedPayoffDate} (${loan.estimatedPayoffMonths}회)`
  if (loan.payoffStatus === 'payment_too_low') return '월 상환액 부족'
  return loan.endDate ? `등록 만기 ${loan.endDate}` : '월 상환액 미입력'
}

export default function MonthlyReportView() {
  const [year, setYear] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const [monthStartDay, setMonthStartDay] = useState<number | null>(null)

  useEffect(() => {
    const startDay = getMonthStartDay()
    const displayMonth = getDisplayMonth(new Date(), startDay)
    setYear(displayMonth.year)
    setMonth(displayMonth.month)
    setMonthStartDay(startDay)
  }, [])

  const url = useMemo(() => {
    if (year === null || month === null || monthStartDay === null) return null
    return `/api/report?year=${year}&month=${month}&monthStartDay=${monthStartDay}`
  }, [year, month, monthStartDay])

  const { data: report, error, isLoading, mutate } = useSWR<MonthlyReport>(url, fetcher)

  function changeMonth(delta: -1 | 1) {
    if (year === null || month === null) return
    const next = moveMonth(year, month, delta)
    setYear(next.year)
    setMonth(next.month)
  }

  if (year === null || month === null || monthStartDay === null) return null

  return (
    <div className="min-h-full bg-[var(--color-surface)]">
      {/* 월 네비게이션 고정 — 긴 보고서를 스크롤하면서 월을 바로 바꿀 수 있도록 헤더(타이틀·기준기간·월 이동)를 상단 sticky. 상세는 PAGES.md `/report` "헤더" 단일 소스. */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-4 md:px-5 md:py-5">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold text-[var(--color-text)] md:text-[24px]">재무 보고서</h1>
            <p className="mt-1 text-[13px] text-[var(--color-text-body)]">
              {report ? `${report.period.from} - ${report.period.to}` : `${year}년 ${month}월`}
            </p>
          </div>
          <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-start">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)] md:h-10 md:w-10"
              aria-label="이전 월"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0 flex-1 text-center text-[15px] font-semibold text-[var(--color-text)] md:min-w-[116px] md:flex-none">
              {year}년 {month}월
            </div>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-body)] hover:bg-[var(--color-surface-sub)] md:h-10 md:w-10"
              aria-label="다음 월"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-4 md:px-5 md:py-6">
        {error ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-16 text-center">
            <p className="text-sm font-semibold text-[var(--color-text)]">보고서를 불러오지 못했습니다.</p>
            <p className="mt-2 text-[13px] text-[var(--color-text-body)]">잠시 후 다시 시도하거나 입력 데이터를 확인해주세요.</p>
            <button
              type="button"
              onClick={() => mutate()}
              className="mt-5 h-10 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
            >
              다시 시도
            </button>
          </div>
        ) : isLoading || !report ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-16 text-center text-sm text-[var(--color-text-body)]">
            보고서를 불러오는 중...
          </div>
        ) : (
          <div className="space-y-6">
            {/* 단일 컬럼 · 중요도 순 (지금 상태 → 원인 분석 → 목표·부채 → 미래 → 실행 → 보조 그래프).
                순서 변경 시 PAGES.md `/report` "주요 섹션" 표와 함께 맞출 것. */}
            {/* A. 지금 상태 */}
            <KeyInsights report={report} />
            <Summary report={report} />
            <HealthMetrics report={report} />
            {/* B. 원인 분석 */}
            <EssentialityBreakdown report={report} />
            <CategoryAnalysis report={report} />
            <AnomalyDetection report={report} />
            {/* C. 목표·부채 */}
            <SavingsSummary report={report} />
            <DebtStrategy report={report} />
            {/* D. 미래 */}
            <NextMonthForecast report={report} />
            <AnnualOutlook report={report} />
            {/* E. 실행 + 보조 그래프 */}
            <ActionItems report={report} />
            <CashflowTimeline report={report} />
          </div>
        )}
      </main>
    </div>
  )
}

// 모바일에서만 접기. PC(md:)는 접기 UI를 숨기고 항상 펼침 — 상세는 PAGES.md `/report` "섹션 접기 (모바일)" 단일 소스.
function Section({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:cursor-default md:px-5 md:py-4"
      >
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-[16px] font-bold text-[var(--color-text)]">{title}</h2>
          {summary ? (
            <span className={cn('min-w-0 truncate text-[12px] tabular-nums text-[var(--color-text-sub)] md:hidden', open && 'hidden')}>
              {summary}
            </span>
          ) : null}
        </div>
        <ChevronDown
          size={18}
          aria-hidden
          className={cn('shrink-0 text-[var(--color-text-sub)] transition-transform md:hidden', open && 'rotate-180')}
        />
      </button>
      <div className={cn('border-t border-[var(--color-border)] md:block', open ? 'block' : 'hidden')}>{children}</div>
    </section>
  )
}

type InsightCardConfig = {
  kind: 'strength' | 'warning' | 'action'
  label: string
  icon: typeof Sparkles
  emoji: string
  accent: string
  ring: string
  emptyMessage: string
}

const INSIGHT_CARDS: InsightCardConfig[] = [
  {
    kind: 'strength',
    label: '잘한 점',
    icon: Sparkles,
    emoji: '💪',
    accent: 'text-[var(--color-income)]',
    ring: 'border-[var(--color-income)]/30 bg-[var(--color-income)]/5',
    emptyMessage: '이번 달 두드러진 강점이 아직 보이지 않습니다.',
  },
  {
    kind: 'warning',
    label: '주의',
    icon: AlertTriangle,
    emoji: '⚠️',
    accent: 'text-[var(--color-warning)]',
    ring: 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5',
    emptyMessage: '특별한 위험 신호는 감지되지 않았습니다.',
  },
  {
    kind: 'action',
    label: '다음 액션',
    icon: Target,
    emoji: '🎯',
    accent: 'text-[var(--color-primary)]',
    ring: 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5',
    emptyMessage: '권장할 액션이 아직 없습니다.',
  },
]

function KeyInsights({ report }: { report: MonthlyReport }) {
  const hasActivity = report.summary.income > 0 || report.summary.outflow > 0

  return (
    // 모바일: 2열 그리드 — 잘한 점·주의 위 한 줄, 다음 액션 아래 전체 폭. PC(xl:↑): 3열.
    // 상세는 PAGES.md `/report` "핵심 인사이트 카드 동작 규칙" / "모바일 레이아웃" 단일 소스.
    <section aria-label="핵심 인사이트" className="grid grid-cols-2 gap-3 xl:grid-cols-3">
      {INSIGHT_CARDS.map(card => {
        const list =
          card.kind === 'strength'
            ? report.insights.strengths
            : card.kind === 'warning'
              ? report.insights.warnings
              : report.insights.actions
        const item = list[0]
        const Icon = card.icon
        return (
          <div
            key={card.kind}
            className={cn(
              'flex min-h-[100px] flex-col rounded-lg border p-3.5 md:p-5',
              card.kind === 'action' && 'col-span-2 xl:col-span-1',
              card.ring,
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-[17px]">{card.emoji}</span>
                <span className={cn('text-[13px] font-semibold', card.accent)}>{card.label}</span>
              </div>
              <Icon size={16} className={cn('shrink-0', card.accent)} />
            </div>
            {item ? (
              <div className="mt-2 flex flex-1 flex-col">
                <p className="break-words text-[15px] font-bold leading-snug text-[var(--color-text)]">{item.title}</p>
                {item.detail ? (
                  <p className="mt-0.5 break-words text-[12px] leading-snug text-[var(--color-text-body)]">{item.detail}</p>
                ) : null}
                {item.metric ? (
                  <p className={cn('mt-auto pt-1.5 text-[18px] font-bold tabular-nums', card.accent)}>{item.metric}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 break-words text-[12px] leading-snug text-[var(--color-text-sub)]">
                {hasActivity ? card.emptyMessage : '거래를 입력하면 자동 분석이 시작됩니다.'}
              </p>
            )}
          </div>
        )
      })}
    </section>
  )
}

function Summary({ report }: { report: MonthlyReport }) {
  const items = [
    { label: '총 수입', value: `${formatAmount(report.summary.income)}원`, sub: `전월 ${formatPercent(report.summary.incomeChangeRate)} · 3개월 평균 ${formatSignedPercent(report.summary.incomeVs3mRate)}`, icon: CircleDollarSign, color: 'text-[var(--color-income)]' },
    { label: '소비 지출', value: `${formatAmount(report.summary.expense)}원`, sub: `전월 ${formatPercent(report.summary.expenseChangeRate)} · 3개월 평균 ${formatSignedPercent(report.summary.expenseVs3mRate)}`, icon: WalletCards, color: 'text-[var(--color-expense)]' },
    { label: '총 지출', value: `${formatAmount(report.summary.outflow)}원`, sub: `대출 상환 ${formatAmount(report.summary.loanRepayment)}원 포함`, icon: Landmark, color: 'text-[var(--color-text)]' },
    { label: '잔액 / 저축률', value: formatSignedAmount(report.summary.balance), sub: formatPercent(report.summary.savingsRate), icon: PiggyBank, color: toneClass(report.summary.balance) },
    {
      label: '순자산',
      value: formatSignedAmount(report.summary.netWorth),
      sub: `자산 ${formatAmount(report.summary.totalAssets)}원 − 부채 ${formatAmount(report.summary.totalDebt)}원 · 월 변동 ${formatSignedAmount(report.summary.netWorthChange)}`,
      icon: Scale,
      color: toneClass(report.summary.netWorth),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-5">
      {items.map(item => {
        const Icon = item.icon
        return (
          <div key={item.label} className="min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-[var(--color-text-body)]">{item.label}</p>
              <Icon size={18} className={cn('shrink-0', item.color)} />
            </div>
            <p className={cn('mt-3 break-words text-[19px] font-bold leading-tight tabular-nums md:text-[24px]', item.color)}>{item.value}</p>
            <p className="mt-1 text-[12px] text-[var(--color-text-sub)]">{item.sub}</p>
          </div>
        )
      })}
    </div>
  )
}

type StandardLeg = {
  label: string
  ratio: number | null
  target: number
  dir: 'max' | 'min'   // max: 표준 이하면 안전 / min: 표준 이상이면 안전
  color: string
}

function legTone(leg: StandardLeg): { text: string; ok: boolean | null } {
  if (leg.ratio === null) return { text: 'text-[var(--color-text-sub)]', ok: null }
  const ok = leg.dir === 'max' ? leg.ratio <= leg.target : leg.ratio >= leg.target
  return { text: ok ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]', ok }
}

function EssentialityBreakdown({ report }: { report: MonthlyReport }) {
  const e = report.essentialityBreakdown
  const donutData = e.buckets.filter(b => b.amount > 0)
  const legs: StandardLeg[] = [
    { label: '필수 (needs)', ratio: e.needsIncomeRatio, target: 50, dir: 'max', color: ESSENTIALITY_COLOR.needs },
    { label: '원함 (wants)', ratio: e.wantsIncomeRatio, target: 30, dir: 'max', color: ESSENTIALITY_COLOR.wants },
    { label: '저축 (savings)', ratio: e.savingsRate, target: 20, dir: 'min', color: ESSENTIALITY_COLOR.savings },
  ]
  const summary =
    e.totalExpense === 0
      ? '지출 없음'
      : `필수 ${formatPercent(e.needsIncomeRatio, 0)} · 원함 ${formatPercent(e.wantsIncomeRatio, 0)} · 저축 ${formatPercent(e.savingsRate, 0)}`

  return (
    <Section title="지출 구성 (50/30/20)" summary={summary}>
      {e.totalExpense === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)] md:px-5">이번 달 소비 지출이 없습니다.</p>
      ) : (
        <div className="grid gap-5 px-4 py-4 md:grid-cols-2 md:px-5">
          {/* 도넛 + 범례: 지출 구성 (kakeibo 4분류) */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <ResponsiveContainer width={128} height={128}>
                <PieChart>
                  <Pie data={donutData} dataKey="amount" nameKey="label" innerRadius={38} outerRadius={60} strokeWidth={0}>
                    {donutData.map(b => <Cell key={b.key} fill={ESSENTIALITY_COLOR[b.key]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <PieChartIcon size={14} className="text-[var(--color-text-sub)]" />
                <p className="mt-0.5 text-[10px] text-[var(--color-text-sub)]">지출 구성</p>
              </div>
            </div>
            <ul className="flex-1 space-y-1.5">
              {e.buckets.map(b => (
                <li key={b.key} className="flex items-center gap-2 text-[12px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ESSENTIALITY_COLOR[b.key] }} />
                  <span className="flex-1 truncate text-[var(--color-text-body)]">{b.label}</span>
                  <span className="shrink-0 tabular-nums text-[var(--color-text-sub)]">{formatPercent(b.share, 0)}</span>
                  <span className="w-20 shrink-0 text-right tabular-nums font-medium text-[var(--color-text)]">{formatAmount(b.amount)}원</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 50/30/20 표준 대비 (수입 기준) */}
          <div className="flex flex-col justify-center gap-3">
            <p className="text-[12px] text-[var(--color-text-sub)]">수입 대비 배분 · 50/30/20 표준 비교</p>
            {legs.map(leg => {
              const tone = legTone(leg)
              const targetLabel = leg.dir === 'max' ? `표준 ≤${leg.target}%` : `표준 ≥${leg.target}%`
              return (
                <div key={leg.label}>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-[var(--color-text-body)]">{leg.label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={cn('font-bold tabular-nums', tone.text)}>{formatPercent(leg.ratio, 0)}</span>
                      <span className="text-[11px] text-[var(--color-text-sub)]">{targetLabel}</span>
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-sub)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${leg.ratio === null ? 0 : Math.max(Math.min(leg.ratio, 100), 0)}%`, backgroundColor: leg.color }}
                    />
                    <span
                      className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-[var(--color-text-sub)]"
                      style={{ left: `${Math.min(leg.target, 100)}%` }}
                      aria-hidden
                    />
                  </div>
                </div>
              )
            })}
            <p className="text-[11px] leading-snug text-[var(--color-text-sub)]">
              저축은 잔액(수입−지출) 기준입니다. 카테고리별 필수성은 카테고리 관리에서 조정할 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </Section>
  )
}

function CategoryAnalysis({ report }: { report: MonthlyReport }) {
  const top = report.categoryAnalysis[0]
  const summary = top ? `${report.categoryAnalysis.length}개 · 최다 ${top.name} ${formatAmount(top.amount)}원` : '지출 없음'
  return (
    <Section title="지출 카테고리 분석" summary={summary}>
      <div className="md:hidden">
        {report.categoryAnalysis.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)]">이번 달 소비 지출이 없습니다.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {report.categoryAnalysis.map((row, index) => (
              <div key={row.categoryId || 'none'} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[12px] font-semibold text-[var(--color-text-sub)]">{index + 1}</span>
                    <CatIcon icon={row.icon} id={row.categoryId} size={28} />
                    <span className="min-w-0 truncate font-semibold text-[var(--color-text)]">{row.name}</span>
                  </div>
                  <span className="shrink-0 text-right text-[15px] font-bold tabular-nums text-[var(--color-text)]">{formatAmount(row.amount)}원</span>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[12px]">
                  <MobileMetric label="3개월 평균" value={row.avg3m > 0 ? `${formatAmount(row.avg3m)}원` : '-'} />
                  <MobileMetric label="평균 대비" value={formatSignedPercent(row.vsAvg3mRate)} className={row.vsAvg3mRate !== null ? toneClass(row.vsAvg3mRate, false) : undefined} />
                  <MobileMetric label="월예산" value={row.budget > 0 ? `${formatAmount(row.budget)}원` : '-'} />
                  <MobileMetric label="예산 대비" value={formatPercent(row.budgetRate)} danger={row.overBudget} />
                  <MobileMetric label="비중" value={formatPercent(row.share)} />
                  <MobileMetric label="건수" value={`${row.count}건`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-[var(--color-surface-sub)] text-[12px] text-[var(--color-text-body)]">
            <tr>
              <th className="px-5 py-3 font-semibold">순위</th>
              <th className="px-5 py-3 font-semibold">카테고리</th>
              <th className="px-5 py-3 text-right font-semibold">지출액</th>
              <th className="px-5 py-3 text-right font-semibold">3개월 평균</th>
              <th className="px-5 py-3 text-right font-semibold">평균 대비</th>
              <th className="px-5 py-3 text-right font-semibold">월예산</th>
              <th className="px-5 py-3 text-right font-semibold">예산 대비</th>
              <th className="px-5 py-3 text-right font-semibold">비중</th>
              <th className="px-5 py-3 text-right font-semibold">건수</th>
            </tr>
          </thead>
          <tbody>
            {report.categoryAnalysis.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-10 text-center text-[var(--color-text-sub)]">이번 달 소비 지출이 없습니다.</td></tr>
            ) : report.categoryAnalysis.map((row, index) => (
              <tr key={row.categoryId || 'none'} className="border-t border-[var(--color-border)]">
                <td className="px-5 py-3 text-[var(--color-text-sub)]">{index + 1}</td>
                <td className="px-5 py-3 font-medium text-[var(--color-text)]">
                  <span className="flex items-center gap-2">
                    <CatIcon icon={row.icon} id={row.categoryId} size={28} />
                    {row.name}
                  </span>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{formatAmount(row.amount)}원</td>
                <td className="px-5 py-3 text-right tabular-nums text-[var(--color-text-body)]">{row.avg3m > 0 ? `${formatAmount(row.avg3m)}원` : '-'}</td>
                <td className={cn('px-5 py-3 text-right tabular-nums', row.vsAvg3mRate !== null ? toneClass(row.vsAvg3mRate, false) : 'text-[var(--color-text-body)]')}>{formatSignedPercent(row.vsAvg3mRate)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-[var(--color-text-body)]">{row.budget > 0 ? `${formatAmount(row.budget)}원` : '-'}</td>
                <td className={cn('px-5 py-3 text-right tabular-nums', row.overBudget && 'font-semibold text-[var(--color-expense)]')}>{formatPercent(row.budgetRate)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-[var(--color-text-body)]">{formatPercent(row.share)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-[var(--color-text-body)]">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

const HEALTH_LEVEL: Record<MonthlyReport['healthMetrics'][number]['level'], { bar: string; text: string; label: string }> = {
  safe: { bar: 'bg-[var(--color-income)]', text: 'text-[var(--color-income)]', label: '안전' },
  caution: { bar: 'bg-[var(--color-warning)]', text: 'text-[var(--color-warning)]', label: '주의' },
  danger: { bar: 'bg-[var(--color-expense)]', text: 'text-[var(--color-expense)]', label: '위험' },
  none: { bar: 'bg-[var(--color-text-sub)]', text: 'text-[var(--color-text-sub)]', label: '데이터 부족' },
}

function HealthMetrics({ report }: { report: MonthlyReport }) {
  const danger = report.healthMetrics.filter(m => m.level === 'danger').length
  const caution = report.healthMetrics.filter(m => m.level === 'caution').length
  const summary = danger === 0 && caution === 0 ? '모두 안전' : `위험 ${danger} · 주의 ${caution}`
  return (
    <Section title="재정 건강 지표" summary={summary} defaultOpen>
      <div className="divide-y divide-[var(--color-border)]">
        {report.healthMetrics.map(metric => {
          const tone = HEALTH_LEVEL[metric.level]
          return (
            <div key={metric.key} className="px-4 py-3 md:px-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[var(--color-text-body)]">{metric.label}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[14px] font-bold tabular-nums text-[var(--color-text)]">{metric.display}</span>
                  <span className={cn('rounded-full bg-[var(--color-surface-sub)] px-2 py-0.5 text-[11px] font-semibold', tone.text)}>
                    {tone.label}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-sub)]">
                <div
                  className={cn('h-full rounded-full transition-all', tone.bar)}
                  style={{ width: `${metric.level === 'none' ? 0 : Math.max(metric.gauge, 2)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--color-text-sub)]">{metric.target}</p>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function DebtStrategy({ report }: { report: MonthlyReport }) {
  const summary =
    report.debtStrategy.loans.length === 0
      ? '등록된 대출 없음'
      : `잔액 ${formatAmount(report.debtStrategy.totalBalance)}원 · 월 상환 ${formatAmount(report.debtStrategy.totalMonthlyPayment)}원`
  return (
    <Section title="대출 통합 전략" summary={summary}>
      <div className="px-4 py-4 md:px-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="잔액" value={`${formatAmount(report.debtStrategy.totalBalance)}원`} />
          <Metric label="월 상환" value={`${formatAmount(report.debtStrategy.totalMonthlyPayment)}원`} />
          <Metric label="이번 달 상환" value={`${formatAmount(report.debtStrategy.paidThisMonth)}원`} />
          <Metric label="이번 달 이자" value={`${formatAmount(report.debtStrategy.interestThisMonth)}원`} />
        </div>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {report.debtStrategy.loans.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)] md:px-5">등록된 대출 자산이 없습니다.</p>
        ) : report.debtStrategy.loans.map(loan => (
          <div key={loan.assetId} className="px-4 py-4 md:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--color-text)]">{loan.name}</p>
                <p className="mt-1 text-[12px] text-[var(--color-text-sub)]">
                  금리 {loan.interestRate.toFixed(2)}% · 월 이자 예상 {formatAmount(loan.monthlyInterestEstimate)}원 · {priorityLabel(loan.priority)}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--color-text-sub)]">
                  예상 완납 {payoffLabel(loan)}
                </p>
              </div>
              <p className="shrink-0 text-right text-[14px] font-bold tabular-nums">{formatAmount(loan.balance)}원</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// 저축 목표 페이스 판정 배지 — 정의는 SCHEMA.md `MonthlyReport.savingsSummary` 단일 소스.
const SAVINGS_STATUS: Record<MonthlyReport['savingsSummary']['goals'][number]['status'], { text: string; bar: string; label: string } | null> = {
  on_track: { text: 'text-[var(--color-income)]', bar: 'bg-[var(--color-income)]', label: '정상 페이스' },
  at_risk: { text: 'text-[var(--color-warning)]', bar: 'bg-[var(--color-warning)]', label: '주의' },
  behind: { text: 'text-[var(--color-expense)]', bar: 'bg-[var(--color-expense)]', label: '부족' },
  achieved: { text: 'text-[var(--color-income)]', bar: 'bg-[var(--color-income)]', label: '달성' },
  no_deadline: null,
}

function SavingsSummary({ report }: { report: MonthlyReport }) {
  const s = report.savingsSummary
  const progress = s.totalTarget > 0 ? (s.totalCurrent / s.totalTarget) * 100 : 0
  const summary = s.goals.length === 0 ? '목표 없음' : `${s.goals.length}목표 · 달성 ${formatPercent(progress, 0)}`
  return (
    <Section title="저축 현황" summary={summary}>
      <div className="px-4 py-4 md:px-5">
        <Metric label="목표 합계" value={`${formatAmount(report.savingsSummary.totalTarget)}원`} />
        <Metric label="현재 달성" value={`${formatAmount(report.savingsSummary.totalCurrent)}원`} className="mt-3" />
        <Metric label="현 페이스 (월 평균 저축)" value={formatSignedAmount(report.savingsSummary.avgMonthlySavings)} className="mt-3" />
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {report.savingsSummary.goals.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)] md:px-5">등록된 저축 목표가 없습니다.</p>
        ) : report.savingsSummary.goals.map(goal => {
          const status = SAVINGS_STATUS[goal.status]
          const barColor = status?.bar ?? 'bg-[var(--color-income)]'
          return (
            <div key={goal.id} className="px-4 py-4 md:px-5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-[var(--color-text)]">{goal.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {status && (
                    <span className={cn('rounded-full bg-[var(--color-surface-sub)] px-2 py-0.5 text-[11px] font-semibold', status.text)}>{status.label}</span>
                  )}
                  <span className="tabular-nums text-[var(--color-text-body)]">{formatPercent(goal.progress, 0)}</span>
                </div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-sub)]">
                <div className={cn('h-full', barColor)} style={{ width: `${Math.min(goal.progress, 100)}%` }} />
              </div>
              <p className="mt-2 text-[12px] text-[var(--color-text-sub)]">
                남은 금액 {formatAmount(goal.remainingAmount)}원
                {goal.requiredMonthlySavings !== null ? ` · 월 ${formatAmount(goal.requiredMonthlySavings)}원 필요` : ''}
              </p>
              {goal.simulationHint && (
                <p className="mt-1 text-[12px] font-medium text-[var(--color-text-body)]">💡 {goal.simulationHint}</p>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function NextMonthForecast({ report }: { report: MonthlyReport }) {
  return (
    <Section
      title={`${report.nextMonthForecast.year}년 ${report.nextMonthForecast.month}월 예상 지출`}
      summary={`${formatAmount(report.nextMonthForecast.totalPlannedOutflow)}원`}
    >
      <div className="px-4 py-4 md:px-5">
        <p className="break-words text-[24px] font-bold leading-tight tabular-nums text-[var(--color-text)] md:text-[26px]">{formatAmount(report.nextMonthForecast.totalPlannedOutflow)}원</p>
        <p className="mt-1 text-[12px] text-[var(--color-text-sub)]">
          생활비 {formatAmount(report.nextMonthForecast.plannedExpense)}원
          {' '}· 대출 {formatAmount(report.nextMonthForecast.loanPayments)}원
          {' '}· 이벤트 {formatAmount(report.nextMonthForecast.wishlistEvents)}원
        </p>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {report.nextMonthForecast.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)] md:px-5">다음 달 예정 지출 데이터가 없습니다.</p>
        ) : report.nextMonthForecast.items.slice(0, 8).map((item, index) => (
          <div key={`${item.source}-${item.label}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm md:px-5">
            <span className="min-w-0 truncate text-[var(--color-text-body)]">{item.source} · {item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[var(--color-text)]">{formatAmount(item.amount)}원</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function CashflowTooltip({ active, payload }: { active?: boolean; payload?: { payload: CashflowPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] shadow-md">
      <p className="font-semibold text-[var(--color-text)]">{row.label}</p>
      <div className="mt-1 space-y-0.5">
        <p className="text-[var(--color-income)]">수입 {row.income ? `${formatAmount(row.income)}원` : '-'}</p>
        <p className="text-[var(--color-expense)]">지출 {row.outflow ? `${formatAmount(row.outflow)}원` : '-'}</p>
        <p className={toneClass(row.net)}>순수익 {formatSignedAmount(row.net)}</p>
        <p className={cn('font-semibold', toneClass(row.cumulative))}>누적 {formatSignedAmount(row.cumulative)}</p>
      </div>
      {row.mainItems.length > 0 ? (
        <p className="mt-1 max-w-[180px] truncate text-[var(--color-text-sub)]">{row.mainItems.join(', ')}</p>
      ) : null}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

type CashflowPoint = {
  label: string
  cumulative: number
  net: number
  income: number
  outflow: number
  mainItems: string[]
}

function CashflowTimeline({ report }: { report: MonthlyReport }) {
  // 누적 잔고(area)와 일별 순수익(bar)은 자릿수가 크게 달라, Y축을 분리해 막대가 묻히지 않게 한다.
  const data: CashflowPoint[] = report.cashflowTimeline.map(row => ({
    label: row.date.slice(5),
    cumulative: row.cumulative,
    net: row.net,
    income: row.income,
    outflow: row.outflow,
    mainItems: row.mainItems,
  }))
  const summary = data.length === 0 ? '거래 없음' : `말 잔고 ${formatSignedAmount(data[data.length - 1].cumulative)}`
  return (
    <Section title="캐시플로우" summary={summary}>
      {data.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[var(--color-text-sub)]">이번 달 거래가 없습니다.</p>
      ) : (
        <div className="px-2 py-5 md:px-4">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-sub)' }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis yAxisId="net" hide />
              <YAxis yAxisId="cumulative" hide />
              <Tooltip content={<CashflowTooltip />} cursor={{ fill: 'var(--color-surface-sub)' }} />
              <Bar yAxisId="net" dataKey="net" maxBarSize={20} radius={[2, 2, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.net >= 0 ? 'var(--color-income)' : 'var(--color-expense)'} />
                ))}
              </Bar>
              <Area yAxisId="cumulative" type="monotone" dataKey="cumulative" stroke="var(--color-primary)" strokeWidth={2} fill="var(--color-primary)" fillOpacity={0.08} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-[var(--color-text-sub)]">
            <LegendDot color="var(--color-primary)" label="누적 잔고" />
            <LegendDot color="var(--color-income)" label="일 순수익 (+)" />
            <LegendDot color="var(--color-expense)" label="일 순수익 (−)" />
          </div>
        </div>
      )}
    </Section>
  )
}

function AnnualOutlook({ report }: { report: MonthlyReport }) {
  const expectedSum = report.annualOutlook.reduce((s, r) => s + r.expectedBalance, 0)
  return (
    <Section title="연간 전망" summary={`예상 잔액 합계 ${formatSignedAmount(expectedSum)}`}>
      <div className="md:hidden">
        <div className="divide-y divide-[var(--color-border)]">
          {report.annualOutlook.map(row => (
            <div key={row.month} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-[var(--color-text)]">{row.month}월</p>
                <p className={cn('shrink-0 text-right text-[15px] font-bold tabular-nums', toneClass(row.expectedBalance))}>{formatSignedAmount(row.expectedBalance)}</p>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[12px]">
                <MobileMetric label="실제 수입" value={row.actualIncome ? `${formatAmount(row.actualIncome)}원` : '-'} />
                <MobileMetric label="실제 지출" value={row.actualOutflow ? `${formatAmount(row.actualOutflow)}원` : '-'} />
                <MobileMetric label="생활비 예산" value={`${formatAmount(row.budgetedExpense)}원`} />
                <MobileMetric label="대출 상환" value={`${formatAmount(row.loanPayments)}원`} />
              </div>
              {row.events.length > 0 ? (
                <p className="mt-3 rounded-lg bg-[var(--color-surface-sub)] px-3 py-2 text-[12px] text-[var(--color-text-body)]">{row.events.join(', ')}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--color-surface-sub)] text-[12px] text-[var(--color-text-body)]">
            <tr>
              <th className="px-5 py-3 font-semibold">월</th>
              <th className="px-5 py-3 text-right font-semibold">실제 수입</th>
              <th className="px-5 py-3 text-right font-semibold">실제 지출</th>
              <th className="px-5 py-3 text-right font-semibold">생활비 예산</th>
              <th className="px-5 py-3 text-right font-semibold">대출 상환</th>
              <th className="px-5 py-3 text-right font-semibold">예상 잔액</th>
              <th className="px-5 py-3 font-semibold">이벤트</th>
            </tr>
          </thead>
          <tbody>
            {report.annualOutlook.map(row => (
              <tr key={row.month} className="border-t border-[var(--color-border)]">
                <td className="px-5 py-3 font-medium">{row.month}월</td>
                <td className="px-5 py-3 text-right tabular-nums">{row.actualIncome ? `${formatAmount(row.actualIncome)}원` : '-'}</td>
                <td className="px-5 py-3 text-right tabular-nums">{row.actualOutflow ? `${formatAmount(row.actualOutflow)}원` : '-'}</td>
                <td className="px-5 py-3 text-right tabular-nums text-[var(--color-text-body)]">{formatAmount(row.budgetedExpense)}원</td>
                <td className="px-5 py-3 text-right tabular-nums text-[var(--color-text-body)]">{formatAmount(row.loanPayments)}원</td>
                <td className={cn('px-5 py-3 text-right font-semibold tabular-nums', toneClass(row.expectedBalance))}>{formatSignedAmount(row.expectedBalance)}</td>
                <td className="max-w-[220px] truncate px-5 py-3 text-[var(--color-text-body)]">{row.events.join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

type AnomalyGroupKey = 'largeExpenses' | 'newRecurring' | 'missingRecurring'

const ANOMALY_GROUPS: { key: AnomalyGroupKey; label: string; emoji: string; accent: string; empty: string; numbered: boolean }[] = [
  { key: 'largeExpenses', label: '이번 달 큰 지출', emoji: '💸', accent: 'text-[var(--color-expense)]', empty: '이번 달 큰 지출 거래가 없습니다.', numbered: true },
  { key: 'newRecurring', label: '신규 정기성 패턴', emoji: '🔁', accent: 'text-[var(--color-primary)]', empty: '새로 감지된 정기 패턴이 없습니다.', numbered: false },
  { key: 'missingRecurring', label: '사라진 정기 결제', emoji: '🔕', accent: 'text-[var(--color-warning)]', empty: '이번 달 누락된 정기 결제가 없습니다.', numbered: false },
]

function AnomalyDetection({ report }: { report: MonthlyReport }) {
  const hasActivity = report.summary.income > 0 || report.summary.outflow > 0
  const a = report.anomalies
  const summary = `큰 지출 ${a.largeExpenses.length} · 신규 ${a.newRecurring.length} · 누락 ${a.missingRecurring.length}`
  return (
    <Section title="이상치·패턴 탐지" summary={summary}>
      <div className="grid gap-px bg-[var(--color-border)] md:grid-cols-3">
        {ANOMALY_GROUPS.map(group => {
          const items = report.anomalies[group.key]
          return (
            <div key={group.key} className="bg-[var(--color-surface)] px-4 py-4 md:px-5">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-[15px]">{group.emoji}</span>
                <h3 className={cn('text-[13px] font-semibold', group.accent)}>{group.label}</h3>
              </div>
              {items.length === 0 ? (
                <p className="mt-3 text-[12px] leading-snug text-[var(--color-text-sub)]">
                  {hasActivity ? group.empty : '거래를 입력하면 패턴 분석이 시작됩니다.'}
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {items.map((item, index) => (
                    <li key={item.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {group.numbered ? (
                            <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--color-text-sub)]">{index + 1}</span>
                          ) : null}
                          <p className="min-w-0 truncate text-[13px] font-semibold text-[var(--color-text)]">{item.title}</p>
                        </div>
                        <p className="mt-0.5 break-words text-[11px] leading-snug text-[var(--color-text-sub)]">{item.detail}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-bold tabular-nums text-[var(--color-text)]">{formatAmount(item.amount)}원</p>
                        {item.metric ? <p className={cn('mt-0.5 text-[11px] font-semibold', group.accent)}>{item.metric}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

const RECOMMENDATION_SEVERITY: Record<MonthlyReport['recommendations'][number]['severity'], { dot: string; text: string; label: string }> = {
  high: { dot: 'bg-[var(--color-expense)]', text: 'text-[var(--color-expense)]', label: '높음' },
  medium: { dot: 'bg-[var(--color-warning)]', text: 'text-[var(--color-warning)]', label: '중간' },
  low: { dot: 'bg-[var(--color-primary)]', text: 'text-[var(--color-primary)]', label: '낮음' },
}

function ActionItems({ report }: { report: MonthlyReport }) {
  const hasActivity = report.summary.income > 0 || report.summary.outflow > 0
  const summary = report.recommendations.length === 0 ? '권고 없음' : `권고 ${report.recommendations.length}건`
  return (
    <Section title="실행 권고" summary={summary} defaultOpen>
      <div className="divide-y divide-[var(--color-border)]">
        {report.recommendations.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)] md:px-5">
            {hasActivity ? '지금 시급히 권장할 액션이 없습니다. 좋은 흐름을 유지하세요.' : '거래를 입력하면 맞춤 권고가 표시됩니다.'}
          </p>
        ) : report.recommendations.map((rec, index) => {
          const tone = RECOMMENDATION_SEVERITY[rec.severity]
          return (
            <div key={rec.id} className="flex gap-3 px-4 py-4 md:px-5">
              <span className="mt-0.5 shrink-0 text-[12px] font-bold tabular-nums text-[var(--color-text-sub)]">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 break-words font-semibold text-[var(--color-text)]">{rec.title}</p>
                  <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-surface-sub)] px-2 py-0.5 text-[11px] font-semibold', tone.text)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden />
                    {tone.label}
                  </span>
                </div>
                <p className="mt-1 break-words text-[13px] leading-snug text-[var(--color-text-body)]">{rec.detail}</p>
                {rec.metric ? (
                  <p className={cn('mt-2 text-[14px] font-bold tabular-nums', tone.text)}>{rec.metric}</p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-3', className)}>
      <span className="shrink-0 text-[13px] text-[var(--color-text-body)]">{label}</span>
      <span className="min-w-0 break-words text-right text-[14px] font-semibold tabular-nums text-[var(--color-text)]">{value}</span>
    </div>
  )
}

function MobileMetric({ label, value, danger, className }: { label: string; value: string; danger?: boolean; className?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--color-surface-sub)] px-2.5 py-1">
      <p className="text-[11px] leading-tight text-[var(--color-text-sub)]">{label}</p>
      <p className={cn('break-words text-[13px] font-semibold leading-tight tabular-nums text-[var(--color-text)]', danger && 'text-[var(--color-expense)]', className)}>{value}</p>
    </div>
  )
}
