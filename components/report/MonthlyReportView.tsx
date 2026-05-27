'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { AlertTriangle, ChevronLeft, ChevronRight, CircleDollarSign, Landmark, PiggyBank, WalletCards } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { getDisplayMonth, getMonthStartDay } from '@/lib/monthStart'
import type { MonthlyReport } from '@/lib/report'
import { cn, formatAmount } from '@/lib/utils'
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
    <div className="min-h-full bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
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
            <Summary report={report} />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-6">
                <CategoryAnalysis report={report} />
                <CashflowTimeline report={report} />
                <AnnualOutlook report={report} />
              </div>
              <aside className="space-y-6">
                <HealthMetrics report={report} />
                <DebtStrategy report={report} />
                <SavingsSummary report={report} />
                <NextMonthForecast report={report} />
              </aside>
            </div>
            <MonthlyEvents report={report} />
          </div>
        )}
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3 md:px-5 md:py-4">
        <h2 className="text-[16px] font-bold text-[var(--color-text)]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Summary({ report }: { report: MonthlyReport }) {
  const items = [
    { label: '총 수입', value: `${formatAmount(report.summary.income)}원`, sub: `전월 대비 ${formatPercent(report.summary.incomeChangeRate)}`, icon: CircleDollarSign, color: 'text-[var(--color-income)]' },
    { label: '소비 지출', value: `${formatAmount(report.summary.expense)}원`, sub: `전월 대비 ${formatPercent(report.summary.expenseChangeRate)}`, icon: WalletCards, color: 'text-[var(--color-expense)]' },
    { label: '총 지출', value: `${formatAmount(report.summary.outflow)}원`, sub: `대출 상환 ${formatAmount(report.summary.loanRepayment)}원 포함`, icon: Landmark, color: 'text-[var(--color-text)]' },
    { label: '잔액 / 저축률', value: formatSignedAmount(report.summary.balance), sub: formatPercent(report.summary.savingsRate), icon: PiggyBank, color: toneClass(report.summary.balance) },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-4">
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

function CategoryAnalysis({ report }: { report: MonthlyReport }) {
  return (
    <Section title="지출 카테고리 분석">
      <div className="md:hidden">
        {report.categoryAnalysis.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)]">이번 달 소비 지출이 없습니다.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {report.categoryAnalysis.map((row, index) => (
              <div key={row.categoryId || 'none'} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[12px] font-semibold text-[var(--color-text-sub)]">{index + 1}</span>
                    <CatIcon icon={row.icon} id={row.categoryId} size={30} />
                    <span className="min-w-0 truncate font-semibold text-[var(--color-text)]">{row.name}</span>
                  </div>
                  <span className="shrink-0 text-right text-[15px] font-bold tabular-nums text-[var(--color-text)]">{formatAmount(row.amount)}원</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
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
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--color-surface-sub)] text-[12px] text-[var(--color-text-body)]">
            <tr>
              <th className="px-5 py-3 font-semibold">순위</th>
              <th className="px-5 py-3 font-semibold">카테고리</th>
              <th className="px-5 py-3 text-right font-semibold">지출액</th>
              <th className="px-5 py-3 text-right font-semibold">월예산</th>
              <th className="px-5 py-3 text-right font-semibold">예산 대비</th>
              <th className="px-5 py-3 text-right font-semibold">비중</th>
              <th className="px-5 py-3 text-right font-semibold">건수</th>
            </tr>
          </thead>
          <tbody>
            {report.categoryAnalysis.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-[var(--color-text-sub)]">이번 달 소비 지출이 없습니다.</td></tr>
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

function HealthMetrics({ report }: { report: MonthlyReport }) {
  const metrics = [
    ['저축률', formatPercent(report.healthMetrics.savingsRate), report.healthMetrics.savingsRate === null || report.healthMetrics.savingsRate >= 0],
    ['지출률', formatPercent(report.healthMetrics.outflowRate), report.healthMetrics.outflowRate === null || report.healthMetrics.outflowRate <= 90],
    ['예산 소진율', formatPercent(report.healthMetrics.budgetUsageRate), (report.healthMetrics.budgetUsageRate ?? 0) <= 100],
    ['부채 비율', formatPercent(report.healthMetrics.debtRatio), (report.healthMetrics.debtRatio ?? 0) <= 50],
    ['고정비 비중', formatPercent(report.healthMetrics.fixedCostRate), (report.healthMetrics.fixedCostRate ?? 0) <= 50],
    ['비상금 추정', report.healthMetrics.emergencyFundMonths === null ? '-' : `${report.healthMetrics.emergencyFundMonths.toFixed(1)}개월`, (report.healthMetrics.emergencyFundMonths ?? 0) >= 3],
  ]

  return (
    <Section title="재정 건강 지표">
      <div className="divide-y divide-[var(--color-border)]">
        {metrics.map(([label, value, ok]) => (
          <div key={label.toString()} className="flex items-center justify-between px-5 py-3">
            <span className="text-[13px] text-[var(--color-text-body)]">{label}</span>
            <span className={cn('text-[14px] font-semibold tabular-nums', ok ? 'text-[var(--color-text)]' : 'text-[var(--color-expense)]')}>{value}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function DebtStrategy({ report }: { report: MonthlyReport }) {
  return (
    <Section title="대출 통합 전략">
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

function SavingsSummary({ report }: { report: MonthlyReport }) {
  return (
    <Section title="저축 현황">
      <div className="px-4 py-4 md:px-5">
        <Metric label="목표 합계" value={`${formatAmount(report.savingsSummary.totalTarget)}원`} />
        <Metric label="현재 달성" value={`${formatAmount(report.savingsSummary.totalCurrent)}원`} className="mt-3" />
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {report.savingsSummary.goals.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)] md:px-5">등록된 저축 목표가 없습니다.</p>
        ) : report.savingsSummary.goals.map(goal => (
          <div key={goal.id} className="px-4 py-4 md:px-5">
            <div className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-[var(--color-text)]">{goal.name}</span>
              <span className="shrink-0 tabular-nums text-[var(--color-text-body)]">{formatPercent(goal.progress, 0)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-sub)]">
              <div className="h-full bg-[var(--color-income)]" style={{ width: `${Math.min(goal.progress, 100)}%` }} />
            </div>
            <p className="mt-2 text-[12px] text-[var(--color-text-sub)]">
              남은 금액 {formatAmount(goal.remainingAmount)}원
              {goal.requiredMonthlySavings !== null ? ` · 월 ${formatAmount(goal.requiredMonthlySavings)}원 필요` : ''}
            </p>
          </div>
        ))}
      </div>
    </Section>
  )
}

function NextMonthForecast({ report }: { report: MonthlyReport }) {
  return (
    <Section title={`${report.nextMonthForecast.year}년 ${report.nextMonthForecast.month}월 예상 지출`}>
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

function CashflowTimeline({ report }: { report: MonthlyReport }) {
  return (
    <Section title="캐시플로우 타임라인">
      <div className="md:hidden">
        {report.cashflowTimeline.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--color-text-sub)]">이번 달 거래가 없습니다.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {report.cashflowTimeline.map(row => (
              <div key={row.date} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--color-text)]">{row.date.slice(5)}</p>
                    <p className="mt-1 truncate text-[12px] text-[var(--color-text-sub)]">{row.mainItems.join(', ') || '주요 항목 없음'}</p>
                  </div>
                  <p className={cn('shrink-0 text-right text-[15px] font-bold tabular-nums', toneClass(row.net))}>{formatSignedAmount(row.net)}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                  <MobileMetric label="수입" value={row.income ? `${formatAmount(row.income)}원` : '-'} className="text-[var(--color-income)]" />
                  <MobileMetric label="지출" value={row.outflow ? `${formatAmount(row.outflow)}원` : '-'} className="text-[var(--color-expense)]" />
                  <MobileMetric label="누적" value={formatSignedAmount(row.cumulative)} className={toneClass(row.cumulative)} />
                  <MobileMetric label="순수익" value={formatSignedAmount(row.net)} className={toneClass(row.net)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--color-surface-sub)] text-[12px] text-[var(--color-text-body)]">
            <tr>
              <th className="px-5 py-3 font-semibold">날짜</th>
              <th className="px-5 py-3 text-right font-semibold">수입</th>
              <th className="px-5 py-3 text-right font-semibold">지출</th>
              <th className="px-5 py-3 text-right font-semibold">일 순수익</th>
              <th className="px-5 py-3 text-right font-semibold">누적</th>
              <th className="px-5 py-3 font-semibold">주요 항목</th>
            </tr>
          </thead>
          <tbody>
            {report.cashflowTimeline.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-[var(--color-text-sub)]">이번 달 거래가 없습니다.</td></tr>
            ) : report.cashflowTimeline.map(row => (
              <tr key={row.date} className="border-t border-[var(--color-border)]">
                <td className="px-5 py-3 font-medium">{row.date.slice(5)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-[var(--color-income)]">{row.income ? `${formatAmount(row.income)}원` : '-'}</td>
                <td className="px-5 py-3 text-right tabular-nums text-[var(--color-expense)]">{row.outflow ? `${formatAmount(row.outflow)}원` : '-'}</td>
                <td className={cn('px-5 py-3 text-right font-semibold tabular-nums', toneClass(row.net))}>{formatSignedAmount(row.net)}</td>
                <td className={cn('px-5 py-3 text-right tabular-nums', toneClass(row.cumulative))}>{formatSignedAmount(row.cumulative)}</td>
                <td className="max-w-[260px] truncate px-5 py-3 text-[var(--color-text-body)]">{row.mainItems.join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function AnnualOutlook({ report }: { report: MonthlyReport }) {
  return (
    <Section title="연간 전망">
      <div className="md:hidden">
        <div className="divide-y divide-[var(--color-border)]">
          {report.annualOutlook.map(row => (
            <div key={row.month} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-[var(--color-text)]">{row.month}월</p>
                <p className={cn('shrink-0 text-right text-[15px] font-bold tabular-nums', toneClass(row.expectedBalance))}>{formatSignedAmount(row.expectedBalance)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
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

function MonthlyEvents({ report }: { report: MonthlyReport }) {
  return (
    <Section title="이번 달 특이사항">
      <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
        {report.events.length === 0 ? (
          <p className="text-sm text-[var(--color-text-sub)]">자동 감지된 특이사항이 없습니다.</p>
        ) : report.events.map(event => (
          <div key={event} className="flex gap-3 rounded-lg bg-[var(--color-surface-sub)] p-3 text-sm text-[var(--color-text)]">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
            <span>{event}</span>
          </div>
        ))}
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
    <div className="min-w-0 rounded-lg bg-[var(--color-surface-sub)] px-3 py-2">
      <p className="text-[11px] text-[var(--color-text-sub)]">{label}</p>
      <p className={cn('mt-1 break-words text-[13px] font-semibold tabular-nums text-[var(--color-text)]', danger && 'text-[var(--color-expense)]', className)}>{value}</p>
    </div>
  )
}
