import { getBudgetForMonth } from './budget'
import { estimateLoanPayoff, getDebtBalance, getExpenseAmount, getLoanRepaymentAmount, getOutflowAmount, isDebtAssetType } from './finance'
import { getMonthRange } from './monthStart'
import type { Asset, Budget, Category, Essentiality, RecurringTransaction, SavingsGoal, Transaction, WishlistItem } from './types'
import { formatAmount } from './utils'

export type InsightKind = 'strength' | 'warning' | 'action'

export interface Insight {
  kind: InsightKind
  title: string
  detail?: string
  metric?: string
}

export type RecommendationSeverity = 'high' | 'medium' | 'low'

// Rule 기반 실행 권고. 트리거·우선순위는 SCHEMA.md `MonthlyReport.recommendations` 단일 소스.
export interface Recommendation {
  id: string                     // 안정적 React key
  severity: RecommendationSeverity
  title: string                  // 권고 헤드라인
  detail: string                 // 행동 설명 (시뮬레이션 결과 포함 가능)
  metric?: string                // 핵심 수치 (예: "8개월 단축", "1.2개월")
}

export type AnomalyKind = 'large_expense' | 'new_recurring' | 'missing_recurring'

// 이상치·패턴 탐지 항목. 탐지 규칙은 SCHEMA.md `MonthlyReport.anomalies` 단일 소스.
export interface AnomalyItem {
  id: string                 // 안정적 React key
  kind: AnomalyKind
  title: string              // 거래 내용 또는 카테고리명
  detail: string             // 카테고리·날짜·횟수 등 보조 설명
  amount: number             // 대표 금액 (큰 지출=거래액, 정기성=클러스터 평균)
  metric?: string            // 부가 수치 ("3회", "구독·누락 확인")
  date?: string              // large_expense 거래일 (YYYY-MM-DD)
}

// 50/30/20 + 카케이보 4분류 지출 구성. 분류 규칙·표준 비교는 SCHEMA.md `MonthlyReport.essentialityBreakdown` 단일 소스.
export interface EssentialityBucket {
  key: Essentiality
  label: string        // 필수 / 원함 / 저축 / 예상밖
  amount: number       // 해당 분류 expense 합
  share: number        // 전체 expense 대비 % (도넛). expense 0이면 0
}

export type HealthLevel = 'safe' | 'caution' | 'danger' | 'none'

export type HealthMetricKey =
  | 'savingsRate'
  | 'outflowRate'
  | 'emergencyFund'
  | 'debtRatio'
  | 'debtServiceRatio'
  | 'budgetUsageRate'
  | 'fixedCostRate'

export interface HealthMetric {
  key: HealthMetricKey
  label: string
  value: number | null   // 원시 수치 (% 또는 개월). 데이터 없으면 null
  display: string         // 화면 표시 문자열 ("25%", "4.2개월", "-")
  level: HealthLevel
  gauge: number           // 게이지 채움 비율 0~100
  target: string          // 안전 기준 설명 (예: "안전 20% 이상")
  benchmark: boolean      // 한국FP학회 가계재무비율 항목 여부
}

// 저축 목표 달성 페이스 판정 (Phase 8). 판정·시뮬레이션 규칙은 SCHEMA.md `MonthlyReport.savingsSummary` 단일 소스.
export type SavingsGoalStatus = 'on_track' | 'at_risk' | 'behind' | 'achieved' | 'no_deadline'

export interface MonthlyReportInput {
  year: number
  month: number
  monthStartDay: number
  transactions: Transaction[]
  previousTransactions: Transaction[]
  previousPreviousTransactions: Transaction[]
  annualTransactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  assets: Asset[]
  savingsGoals: SavingsGoal[]
  wishlist: WishlistItem[]
  recurringTransactions: RecurringTransaction[]
}

export interface MonthlyReport {
  period: {
    year: number
    month: number
    from: string
    to: string
    previousFrom: string
    previousTo: string
  }
  summary: {
    income: number
    expense: number
    loanRepayment: number
    outflow: number
    balance: number
    savingsRate: number | null
    incomeChangeRate: number | null
    expenseChangeRate: number | null
    income3mAvg: number
    expense3mAvg: number
    incomeVs3mRate: number | null
    expenseVs3mRate: number | null
    totalAssets: number
    totalDebt: number
    netWorth: number
    netWorthChange: number
  }
  categoryAnalysis: {
    categoryId: string
    name: string
    icon: string
    amount: number
    budget: number
    budgetRate: number | null
    share: number
    count: number
    overBudget: boolean
    avg3m: number
    vsAvg3mRate: number | null
  }[]
  debtStrategy: {
    loans: {
      assetId: string
      name: string
      balance: number
      monthlyPayment: number
      interestRate: number
      endDate: string
      paidThisMonth: number
      interestThisMonth: number
      monthlyInterestEstimate: number
      estimatedPayoffMonths: number | null
      estimatedPayoffDate: string
      totalInterestEstimate: number | null
      payoffStatus: 'paid_off' | 'not_configured' | 'payment_too_low' | 'ok'
      priority: 'high_interest' | 'quick_close' | 'heavy_payment' | 'normal'
    }[]
    totalBalance: number
    totalMonthlyPayment: number
    paidThisMonth: number
    interestThisMonth: number
  }
  savingsSummary: {
    goals: {
      id: string
      name: string
      currentAmount: number
      targetAmount: number
      progress: number
      targetDate: string
      remainingAmount: number
      requiredMonthlySavings: number | null
      status: SavingsGoalStatus      // 현 페이스 대비 목표일 달성 판정
      paceRatio: number | null       // avgMonthlySavings / requiredMonthlySavings (목표일·required 있을 때만)
      simulationHint: string | null  // "월 N원 더 저축…" 또는 "월 N원 추가 시 M개월 단축" 안내
    }[]
    totalCurrent: number
    totalTarget: number
    avgMonthlySavings: number         // 최근 3개월 평균 저축액(income - outflow) = 현 페이스
  }
  healthMetrics: HealthMetric[]
  nextMonthForecast: {
    year: number
    month: number
    recurringOutflow: number
    loanPayments: number
    budgetedExpense: number
    plannedExpense: number
    wishlistEvents: number
    totalPlannedOutflow: number
    items: { label: string; amount: number; source: string }[]
  }
  insights: {
    strengths: Insight[]
    warnings: Insight[]
    actions: Insight[]
  }
  recommendations: Recommendation[]
  cashflowTimeline: {
    date: string
    income: number
    outflow: number
    net: number
    cumulative: number
    mainItems: string[]
  }[]
  annualOutlook: {
    year: number
    month: number
    actualIncome: number
    actualOutflow: number
    budgetedExpense: number
    loanPayments: number
    expectedBalance: number
    events: string[]
  }[]
  anomalies: {
    largeExpenses: AnomalyItem[]     // 이번 달 큰 지출 Top 5
    newRecurring: AnomalyItem[]      // 신규 정기성 패턴 (반복 거래 등록 권장)
    missingRecurring: AnomalyItem[]  // 사라진 정기 결제 (구독 해지·누락 확인)
  }
  essentialityBreakdown: {
    buckets: EssentialityBucket[]      // 항상 4개, needs→wants→savings→unexpected 순
    totalExpense: number
    // 50/30/20 표준 비교 (income 기준). income 0이면 null.
    needsIncomeRatio: number | null    // needs / income (표준 ≤50%)
    wantsIncomeRatio: number | null    // wants / income (표준 ≤30%)
    savingsRate: number | null         // balance / income (=summary.savingsRate, 저축 레그 표준 ≥20%)
  }
}

function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

function changeRate(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return (numerator / denominator) * 100
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(1, (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1)
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function inRange(date: string, from: string, to: string) {
  return date >= from && date <= to
}

function sumExpenseByCategory(transactions: Transaction[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    map.set(tx.category_id, (map.get(tx.category_id) ?? 0) + tx.amount)
  }
  return map
}

function getCategoryName(categoryId: string, categories: Category[]) {
  const category = categories.find(c => c.id === categoryId)
  return {
    name: category?.name ?? '미분류',
    icon: category?.icon ?? '📦',
  }
}

interface InsightContext {
  hasActivity: boolean
  savingsRate: number | null
  outflowRate: number | null
  emergencyFundMonths: number | null
  debtRatio: number | null
  balance: number
  expenseChangeRate: number | null
  topOverBudgetCategory: { name: string; budgetRate: number } | null
  highInterestLoan: { name: string; interestRate: number } | null
  highBudgetRateCategory: { name: string; budgetRate: number } | null
  nextMonthPlannedOutflow: number
}

function formatLevelPercent(value: number) {
  return `${Math.round(value)}%`
}

function buildInsights(ctx: InsightContext): MonthlyReport['insights'] {
  if (!ctx.hasActivity) {
    return { strengths: [], warnings: [], actions: [] }
  }

  const strengths: Insight[] = []
  const warnings: Insight[] = []
  const actions: Insight[] = []

  if (ctx.savingsRate !== null && ctx.savingsRate >= 20) {
    strengths.push({ kind: 'strength', title: '저축률이 안전 구간', detail: '한국FP학회 권장 20% 이상', metric: formatLevelPercent(ctx.savingsRate) })
  }
  if (ctx.outflowRate !== null && ctx.outflowRate <= 70) {
    strengths.push({ kind: 'strength', title: '가계수지 안전', detail: '수입의 70% 이하 지출', metric: formatLevelPercent(ctx.outflowRate) })
  }
  if (ctx.emergencyFundMonths !== null && ctx.emergencyFundMonths >= 3 && ctx.emergencyFundMonths <= 6) {
    strengths.push({ kind: 'strength', title: '비상금 안전 구간', detail: '월 지출 3~6개월치 확보', metric: `${ctx.emergencyFundMonths.toFixed(1)}개월` })
  }
  if (ctx.expenseChangeRate !== null && ctx.expenseChangeRate <= -5) {
    strengths.push({ kind: 'strength', title: '지출이 줄었습니다', detail: '전월 대비 감소', metric: formatLevelPercent(ctx.expenseChangeRate) })
  }

  if (ctx.balance < 0) {
    warnings.push({ kind: 'warning', title: '이번 달 잔액 음수', detail: '수입보다 지출이 많습니다', metric: undefined })
  }
  if (ctx.savingsRate !== null && ctx.savingsRate < 0) {
    warnings.push({ kind: 'warning', title: '저축률 음수', detail: '고정비·대출 상환 부담 점검 필요', metric: formatLevelPercent(ctx.savingsRate) })
  }
  if (ctx.debtRatio !== null && ctx.debtRatio > 60) {
    warnings.push({ kind: 'warning', title: '부채 비율 위험', detail: '총자산 대비 부채 60% 초과', metric: formatLevelPercent(ctx.debtRatio) })
  }
  if (ctx.topOverBudgetCategory) {
    warnings.push({
      kind: 'warning',
      title: `${ctx.topOverBudgetCategory.name} 예산 초과`,
      detail: '월 예산을 넘어선 카테고리가 있습니다',
      metric: formatLevelPercent(ctx.topOverBudgetCategory.budgetRate),
    })
  }
  if (ctx.expenseChangeRate !== null && ctx.expenseChangeRate >= 25) {
    warnings.push({ kind: 'warning', title: '지출 급증', detail: '전월 대비 25% 이상 증가', metric: formatLevelPercent(ctx.expenseChangeRate) })
  }

  if (ctx.emergencyFundMonths !== null && ctx.emergencyFundMonths < 3) {
    actions.push({
      kind: 'action',
      title: '비상금 확보 필요',
      detail: '저축 목표에 우선 배정 권장',
      metric: `${ctx.emergencyFundMonths.toFixed(1)}개월`,
    })
  }
  if (ctx.highInterestLoan) {
    actions.push({
      kind: 'action',
      title: `고금리 대출 우선상환`,
      detail: `${ctx.highInterestLoan.name} 추가 상환 검토`,
      metric: `${ctx.highInterestLoan.interestRate.toFixed(1)}%`,
    })
  }
  if (ctx.highBudgetRateCategory) {
    actions.push({
      kind: 'action',
      title: `${ctx.highBudgetRateCategory.name} 예산 조정`,
      detail: '예산 상향 또는 지출 점검 필요',
      metric: formatLevelPercent(ctx.highBudgetRateCategory.budgetRate),
    })
  }
  if (ctx.nextMonthPlannedOutflow > 0 && ctx.balance < ctx.nextMonthPlannedOutflow) {
    actions.push({
      kind: 'action',
      title: '다음 달 지출 점검',
      detail: '이번 달 잔액보다 예정 지출이 많습니다',
      metric: undefined,
    })
  }

  return { strengths, warnings, actions }
}

function clampGauge(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

function roundPercent(value: number): string {
  return `${Math.round(value)}%`
}

function makeHealthMetric(
  key: HealthMetricKey,
  label: string,
  benchmark: boolean,
  value: number | null,
  display: string,
  level: HealthLevel,
  gaugeMax: number,
  target: string,
): HealthMetric {
  return {
    key,
    label,
    benchmark,
    value,
    display,
    level,
    target,
    gauge: value === null ? 0 : clampGauge(value, gaugeMax),
  }
}

interface HealthMetricInput {
  savingsRate: number | null
  outflowRate: number | null
  emergencyFundMonths: number | null
  debtRatio: number | null
  debtServiceRatio: number | null
  budgetUsageRate: number | null
  fixedCostRate: number | null
}

// 임계값은 SCHEMA.md `MonthlyReport.healthMetrics` "임계값·레벨 판정"(한국FP학회 가계재무비율 가이드라인) 단일 소스.
function buildHealthMetrics(input: HealthMetricInput): HealthMetric[] {
  const { savingsRate, outflowRate, emergencyFundMonths, debtRatio, debtServiceRatio, budgetUsageRate, fixedCostRate } = input

  return [
    // 저축률 — 높을수록 좋음 (안전 ≥20% / 주의 10~20% / 위험 <10%)
    makeHealthMetric(
      'savingsRate', '저축률', true,
      savingsRate,
      savingsRate === null ? '-' : roundPercent(savingsRate),
      savingsRate === null ? 'none' : savingsRate >= 20 ? 'safe' : savingsRate >= 10 ? 'caution' : 'danger',
      40, '안전 20% 이상',
    ),
    // 가계수지(지출률) — 낮을수록 좋음 (안전 ≤70% / 주의 70~85% / 위험 >85%)
    makeHealthMetric(
      'outflowRate', '가계수지(지출률)', true,
      outflowRate,
      outflowRate === null ? '-' : roundPercent(outflowRate),
      outflowRate === null ? 'none' : outflowRate <= 70 ? 'safe' : outflowRate <= 85 ? 'caution' : 'danger',
      100, '안전 70% 이하',
    ),
    // 비상자금 — 구간형 (안전 3~6개월 / 주의 1~3 또는 >6 / 위험 <1)
    makeHealthMetric(
      'emergencyFund', '비상자금', true,
      emergencyFundMonths,
      emergencyFundMonths === null ? '-' : `${emergencyFundMonths.toFixed(1)}개월`,
      emergencyFundMonths === null
        ? 'none'
        : emergencyFundMonths >= 3 && emergencyFundMonths <= 6
          ? 'safe'
          : emergencyFundMonths < 1
            ? 'danger'
            : 'caution',
      6, '안전 3~6개월',
    ),
    // 총부채부담 — 낮을수록 좋음 (안전 ≤40% / 주의 40~60% / 위험 >60%)
    makeHealthMetric(
      'debtRatio', '총부채부담', true,
      debtRatio,
      debtRatio === null ? '-' : roundPercent(debtRatio),
      debtRatio === null ? 'none' : debtRatio <= 40 ? 'safe' : debtRatio <= 60 ? 'caution' : 'danger',
      100, '안전 40% 이하',
    ),
    // 총부채상환비율 — 낮을수록 좋음 (안전 ≤30% / 주의 30~40% / 위험 >40%)
    makeHealthMetric(
      'debtServiceRatio', '총부채상환비율', true,
      debtServiceRatio,
      debtServiceRatio === null ? '-' : roundPercent(debtServiceRatio),
      debtServiceRatio === null ? 'none' : debtServiceRatio <= 30 ? 'safe' : debtServiceRatio <= 40 ? 'caution' : 'danger',
      50, '안전 30% 이하',
    ),
    // 예산 소진율 — 한국FP학회 항목 아님, 기존 유지 (안전 ≤100% / 주의 100~120% / 위험 >120%)
    makeHealthMetric(
      'budgetUsageRate', '예산 소진율', false,
      budgetUsageRate,
      budgetUsageRate === null ? '-' : roundPercent(budgetUsageRate),
      budgetUsageRate === null ? 'none' : budgetUsageRate <= 100 ? 'safe' : budgetUsageRate <= 120 ? 'caution' : 'danger',
      120, '예산 100% 이내',
    ),
    // 고정비 비중 — 한국FP학회 항목 아님, 기존 유지 (안전 ≤50% / 주의 50~70% / 위험 >70%)
    makeHealthMetric(
      'fixedCostRate', '고정비 비중', false,
      fixedCostRate,
      fixedCostRate === null ? '-' : roundPercent(fixedCostRate),
      fixedCostRate === null ? 'none' : fixedCostRate <= 50 ? 'safe' : fixedCostRate <= 70 ? 'caution' : 'danger',
      100, '권장 50% 이하',
    ),
  ]
}

// 시뮬레이션용 월 추가 상환액 (10만원) — "월 N원 추가 상환 시 M개월 단축" 계산 기준
const EXTRA_PAYMENT_SIM = 100000

interface RecommendationContext {
  hasActivity: boolean
  emergencyFundMonths: number | null
  savingsRate: number | null
  loans: MonthlyReport['debtStrategy']['loans']
  loanAssets: Asset[]
  reportDateKey: string
  savingsGoals: MonthlyReport['savingsSummary']['goals']
  overBudgetCategories: { name: string; amount: number; budget: number; budgetRate: number }[]
}

// 우선순위·트리거는 SCHEMA.md `MonthlyReport.recommendations` "Rule·우선순위" 단일 소스.
// 위험도 높은 권고 먼저(고금리 대출 → 비상금 부족 → 저축률 음수 → 예산 초과 → 비상금 초과분 배분). 최대 5개.
function buildRecommendations(ctx: RecommendationContext): Recommendation[] {
  if (!ctx.hasActivity) return []

  const items: { priority: number; rec: Recommendation }[] = []

  // 1. 고금리 대출(≥8%) 우선상환 — 비상금 3개월 이상 확보 시 (severity high)
  if (ctx.emergencyFundMonths !== null && ctx.emergencyFundMonths >= 3) {
    for (const loan of ctx.loans) {
      if (loan.priority !== 'high_interest' || loan.balance <= 0) continue
      const asset = ctx.loanAssets.find(a => a.id === loan.assetId)
      let detail = `금리 ${loan.interestRate.toFixed(1)}%의 고금리 대출입니다. 비상금이 확보된 만큼 여유 자금으로 우선 상환을 검토하세요.`
      let metric: string | undefined = `${formatAmount(loan.balance)}원`
      if (asset && loan.monthlyPayment > 0 && loan.estimatedPayoffMonths !== null) {
        const simulated = estimateLoanPayoff({
          balance: asset.balance,
          annualInterestRate: loan.interestRate,
          monthlyPayment: loan.monthlyPayment + EXTRA_PAYMENT_SIM,
          paymentDay: asset.payment_day ?? 0,
          fromDate: ctx.reportDateKey,
        })
        if (simulated.estimatedMonths !== null && simulated.estimatedMonths < loan.estimatedPayoffMonths) {
          const saved = loan.estimatedPayoffMonths - simulated.estimatedMonths
          detail = `월 ${formatAmount(EXTRA_PAYMENT_SIM)}원을 추가 상환하면 완납이 ${saved}개월 단축됩니다 (금리 ${loan.interestRate.toFixed(1)}%).`
          metric = `${saved}개월 단축`
        }
      }
      items.push({ priority: 1, rec: { id: `loan-${loan.assetId}`, severity: 'high', title: `${loan.name} 우선상환`, detail, metric } })
    }
  }

  // 2. 비상금 부족(< 3개월) (severity high)
  if (ctx.emergencyFundMonths !== null && ctx.emergencyFundMonths < 3) {
    items.push({
      priority: 2,
      rec: {
        id: 'emergency-low',
        severity: 'high',
        title: '비상금 확보가 필요합니다',
        detail: '권장 비상금(월 지출 3개월분)에 미달합니다. 저축 목표 "비상금"에 우선 배정하세요.',
        metric: `${ctx.emergencyFundMonths.toFixed(1)}개월`,
      },
    })
  }

  // 3. 저축률 음수 (severity high)
  if (ctx.savingsRate !== null && ctx.savingsRate < 0) {
    items.push({
      priority: 3,
      rec: {
        id: 'savings-negative',
        severity: 'high',
        title: '지출이 수입을 초과했습니다',
        detail: '저축률이 음수입니다. 고정비 비중과 대출 상환 부담을 점검하세요.',
        metric: roundPercent(ctx.savingsRate),
      },
    })
  }

  // 4. 예산 초과 카테고리 (단일월 기준 — 3개월 연속은 Phase 5 의존) (severity medium)
  const over = ctx.overBudgetCategories[0]
  if (over) {
    items.push({
      priority: 4,
      rec: {
        id: 'budget-over',
        severity: 'medium',
        title: `${over.name} 예산 초과`,
        detail: `예산 대비 ${Math.round(over.budgetRate)}% 지출(${formatAmount(over.amount - over.budget)}원 초과). 예산을 조정하거나 다음 달 지출을 점검하세요.`,
        metric: roundPercent(over.budgetRate),
      },
    })
  }

  // 5. 비상금 초과분(> 6개월) 저축 목표 배분 — 진척 50% 미만 목표가 있을 때 (severity low)
  if (ctx.emergencyFundMonths !== null && ctx.emergencyFundMonths > 6) {
    const goal = ctx.savingsGoals.find(g => g.progress < 50 && g.remainingAmount > 0)
    if (goal) {
      items.push({
        priority: 5,
        rec: {
          id: 'emergency-surplus',
          severity: 'low',
          title: '여유 비상금 활용',
          detail: `비상금이 ${ctx.emergencyFundMonths.toFixed(1)}개월분으로 충분합니다. "${goal.name}" 목표(진척 ${Math.round(goal.progress)}%)에 초과분 배분을 검토하세요.`,
          metric: `${ctx.emergencyFundMonths.toFixed(1)}개월`,
        },
      })
    }
  }

  return items
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map(item => item.rec)
}

// ── 이상치·패턴 탐지 (Phase 6) ─────────────────────────────────
// 탐지 규칙·임계값은 SCHEMA.md `MonthlyReport.anomalies` 단일 소스.
const LARGE_EXPENSE_LIMIT = 5
const ANOMALY_LIST_LIMIT = 5
const SIMILAR_AMOUNT_TOLERANCE = 0.1 // ±10% 유사 금액 판정

function isOutflowTx(tx: Pick<Transaction, 'type'>): boolean {
  return tx.type === 'expense' || tx.type === 'loan_repayment'
}

function normalizeContent(content: string | null | undefined): string {
  return (content ?? '').trim().toLowerCase()
}

// 두 금액이 ±10% 이내로 유사한지. 절댓값 큰 쪽 기준. 둘 다 0이면 동일 취급.
function isSimilarAmount(a: number, b: number): boolean {
  const larger = Math.max(Math.abs(a), Math.abs(b))
  if (larger === 0) return true
  return Math.abs(a - b) <= larger * SIMILAR_AMOUNT_TOLERANCE
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

interface AnomalyContext {
  hasActivity: boolean
  transactions: Transaction[]
  previousTransactions: Transaction[]
  previousPreviousTransactions: Transaction[]
  categories: Category[]
  recurringTransactions: RecurringTransaction[]
}

interface ContentGroupTx {
  amount: number
  month: string      // YYYY-MM
  bucket: 0 | 1 | 2  // 0=이번달 1=전월 2=전전월
  content: string    // 원본(트림) 표기
}

function buildEmptyAnomalies(): MonthlyReport['anomalies'] {
  return { largeExpenses: [], newRecurring: [], missingRecurring: [] }
}

function detectAnomalies(ctx: AnomalyContext): MonthlyReport['anomalies'] {
  if (!ctx.hasActivity) return buildEmptyAnomalies()

  const { transactions, previousTransactions, previousPreviousTransactions, categories, recurringTransactions } = ctx

  // 1. 이번 달 큰 지출 Top 5 — expense + loan_repayment 단일 거래 금액 상위
  const largeExpenses: AnomalyItem[] = transactions
    .filter(isOutflowTx)
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, LARGE_EXPENSE_LIMIT)
    .map(tx => {
      const isLoan = tx.type === 'loan_repayment'
      const category = isLoan ? { name: '대출 상환', icon: '💳' } : getCategoryName(tx.category_id, categories)
      return {
        id: `large-${tx.id}`,
        kind: 'large_expense' as const,
        title: tx.content?.trim() || category.name,
        detail: `${category.name} · ${tx.date.slice(5)}`,
        amount: tx.amount,
        date: tx.date,
      }
    })

  // 2·3 공통 — content 키별 3개월 거래 그룹 (content 비어있으면 식별 불가로 제외)
  const buckets = [
    transactions.filter(isOutflowTx),
    previousTransactions.filter(isOutflowTx),
    previousPreviousTransactions.filter(isOutflowTx),
  ]
  const groups = new Map<string, { categoryId: string; items: ContentGroupTx[] }>()
  buckets.forEach((bucket, bucketIndex) => {
    for (const tx of bucket) {
      const key = normalizeContent(tx.content)
      if (!key) continue
      const group = groups.get(key) ?? { categoryId: tx.category_id, items: [] }
      group.items.push({ amount: tx.amount, month: tx.date.slice(0, 7), bucket: bucketIndex as 0 | 1 | 2, content: tx.content.trim() })
      groups.set(key, group)
    }
  })

  // 등록된 반복 거래(enabled, 지출/대출상환) content 키 집합
  const registeredContentKeys = new Set(
    recurringTransactions
      .filter(rt => rt.enabled && isOutflowTx(rt))
      .map(rt => normalizeContent(rt.content))
      .filter(Boolean)
  )

  const newRecurring: AnomalyItem[] = []
  const missingRecurring: AnomalyItem[] = []

  for (const [key, group] of groups) {
    // 대표 금액(중앙값) ±10% 클러스터만 추려 일회성 변동 잡음 제거
    const mid = median(group.items.map(item => item.amount))
    const cluster = group.items.filter(item => isSimilarAmount(item.amount, mid))
    if (cluster.length === 0) continue
    const distinctMonths = new Set(cluster.map(item => item.month)).size
    const presentInCurrent = cluster.some(item => item.bucket === 0)
    const representativeAmount = Math.round(cluster.reduce((sum, item) => sum + item.amount, 0) / cluster.length)
    const label = cluster[0].content
    const category = getCategoryName(group.categoryId, categories)
    const isRegistered = registeredContentKeys.has(key)

    // 2. 신규 정기성 패턴 — 3개월 3회 이상 + 2개 이상 월에 분산 + 이번 달 발생 + 미등록
    if (!isRegistered && cluster.length >= 3 && distinctMonths >= 2 && presentInCurrent) {
      newRecurring.push({
        id: `new-recurring-${key}`,
        kind: 'new_recurring',
        title: label,
        detail: `${category.name} · 최근 3개월 ${cluster.length}회 · 반복 거래 미등록`,
        amount: representativeAmount,
        metric: `${cluster.length}회`,
      })
    }

    // 3-a. 사라진 정기 결제(미등록) — 전월·전전월 모두 발생했으나 이번 달 미발생
    if (!isRegistered && !presentInCurrent && cluster.some(item => item.bucket === 1) && cluster.some(item => item.bucket === 2)) {
      missingRecurring.push({
        id: `missing-${key}`,
        kind: 'missing_recurring',
        title: label,
        detail: `${category.name} · 지난 2개월 정기 발생, 이번 달 미발생`,
        amount: representativeAmount,
        metric: '구독·누락 확인',
      })
    }
  }

  // 3-b. 등록된 반복 거래인데 이번 달 미발생
  const currentContentKeys = new Set(
    transactions.filter(isOutflowTx).map(tx => normalizeContent(tx.content)).filter(Boolean)
  )
  for (const rt of recurringTransactions) {
    if (!rt.enabled || !isOutflowTx(rt)) continue
    const key = normalizeContent(rt.content)
    if (!key || currentContentKeys.has(key)) continue
    const category = getCategoryName(rt.category_id, categories)
    missingRecurring.push({
      id: `missing-recurring-${rt.id}`,
      kind: 'missing_recurring',
      title: rt.content?.trim() || category.name,
      detail: `${category.name} · 등록된 반복 거래가 이번 달 미발생`,
      amount: rt.amount,
      metric: '구독·누락 확인',
    })
  }

  return {
    largeExpenses,
    newRecurring: newRecurring.sort((a, b) => b.amount - a.amount).slice(0, ANOMALY_LIST_LIMIT),
    missingRecurring: missingRecurring.sort((a, b) => b.amount - a.amount).slice(0, ANOMALY_LIST_LIMIT),
  }
}

// ── 50/30/20 + 카케이보 필수성 분류 (Phase 7) ─────────────────
// 규칙·표준 비교는 SCHEMA.md `MonthlyReport.essentialityBreakdown` 단일 소스.
const ESSENTIALITY_LABEL: Record<Essentiality, string> = {
  needs: '필수',
  wants: '원함',
  savings: '저축',
  unexpected: '예상밖',
}
const ESSENTIALITY_ORDER: Essentiality[] = ['needs', 'wants', 'savings', 'unexpected']

function buildEssentialityBreakdown(
  transactions: Transaction[],
  categories: Category[],
  expense: number,
  income: number,
  savingsRate: number | null,
): MonthlyReport['essentialityBreakdown'] {
  const essentialityByCategory = new Map(categories.map(c => [c.id, c.essentiality]))
  const sums: Record<Essentiality, number> = { needs: 0, wants: 0, savings: 0, unexpected: 0 }
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    // 미분류·삭제된 카테고리 거래는 컬럼 기본값과 동일하게 'wants'로 본다.
    const key = essentialityByCategory.get(tx.category_id) ?? 'wants'
    sums[key] += tx.amount
  }
  const buckets: EssentialityBucket[] = ESSENTIALITY_ORDER.map(key => ({
    key,
    label: ESSENTIALITY_LABEL[key],
    amount: sums[key],
    share: ratio(sums[key], expense),
  }))
  return {
    buckets,
    totalExpense: expense,
    needsIncomeRatio: income > 0 ? ratio(sums.needs, income) : null,
    wantsIncomeRatio: income > 0 ? ratio(sums.wants, income) : null,
    savingsRate,
  }
}

// ── 저축 목표 on-track 판정 + 시뮬레이션 (Phase 8) ────────────
// 판정·시뮬레이션 규칙은 SCHEMA.md `MonthlyReport.savingsSummary` 단일 소스.
// 현 페이스(avgMonthlySavings)는 가계 전체 월 평균 저축액 — 여러 목표가 공유한다(근사). 목표별 required와 비교.
const SAVINGS_EXTRA_SIM = 100000 // 시뮬레이션용 월 추가 저축액(10만원). 대출 EXTRA_PAYMENT_SIM과 동일 기준.

function buildSavingsGoalProjection(
  remainingAmount: number,
  requiredMonthlySavings: number | null,
  avgMonthlySavings: number,
): { status: SavingsGoalStatus; paceRatio: number | null; simulationHint: string | null } {
  // 이미 달성
  if (remainingAmount <= 0) {
    return { status: 'achieved', paceRatio: null, simulationHint: null }
  }
  // 목표일 미설정 — 데드라인이 없으므로 페이스 기반 "M개월 단축" 시뮬레이션만 제공
  if (requiredMonthlySavings === null) {
    if (avgMonthlySavings > 0) {
      const monthsAtPace = Math.ceil(remainingAmount / avgMonthlySavings)
      const monthsWithExtra = Math.ceil(remainingAmount / (avgMonthlySavings + SAVINGS_EXTRA_SIM))
      const saved = monthsAtPace - monthsWithExtra
      const hint = saved > 0
        ? `월 ${formatAmount(SAVINGS_EXTRA_SIM)}원 추가 저축 시 ${saved}개월 단축 (약 ${monthsAtPace}→${monthsWithExtra}개월)`
        : null
      return { status: 'no_deadline', paceRatio: null, simulationHint: hint }
    }
    return { status: 'no_deadline', paceRatio: null, simulationHint: null }
  }
  // 목표일 설정 — required(필요 월 저축액)는 remaining>0이면 항상 ≥1
  if (requiredMonthlySavings <= 0) {
    return { status: 'on_track', paceRatio: null, simulationHint: null }
  }
  const paceRatio = avgMonthlySavings / requiredMonthlySavings
  if (paceRatio >= 1) {
    return { status: 'on_track', paceRatio, simulationHint: null }
  }
  // 부족 — 데드라인이 고정이므로 "목표일 달성에 필요한 추가 월 저축액"을 안내(actionable)
  const status: SavingsGoalStatus = paceRatio >= 0.5 ? 'at_risk' : 'behind'
  const shortfall = Math.ceil(requiredMonthlySavings - avgMonthlySavings)
  const hint = shortfall > 0
    ? `월 ${formatAmount(shortfall)}원 더 저축하면 목표일 내 달성 가능`
    : null
  return { status, paceRatio, simulationHint: hint }
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const { year, month, monthStartDay, transactions, previousTransactions, previousPreviousTransactions, annualTransactions, categories, budgets, assets, savingsGoals, wishlist, recurringTransactions } = input
  const { from, to } = getMonthRange(year, month, monthStartDay)
  const previous = previousMonth(year, month)
  const previousRange = getMonthRange(previous.year, previous.month, monthStartDay)

  const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const expense = getExpenseAmount(transactions)
  const loanRepayment = getLoanRepaymentAmount(transactions)
  const outflow = getOutflowAmount(transactions)
  const previousIncome = previousTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const previousExpense = getExpenseAmount(previousTransactions)
  const prev2Income = previousPreviousTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const prev2Expense = getExpenseAmount(previousPreviousTransactions)
  const balance = income - outflow
  const savingsRate = income > 0 ? ratio(balance, income) : null
  const outflowRate = income > 0 ? ratio(outflow, income) : null

  // 3개월 rolling 윈도우 — 거래가 있는 달만 분모로 사용해 신규 사용자(데이터 1~2개월)의 평균 왜곡 방지.
  // 단일 소스: SCHEMA.md `MonthlyReport.summary`/`categoryAnalysis` "3개월 rolling".
  const windowMonths = [transactions, previousTransactions, previousPreviousTransactions].filter(list => list.length > 0).length || 1
  const income3mAvg = Math.round((income + previousIncome + prev2Income) / windowMonths)
  const expense3mAvg = Math.round((expense + previousExpense + prev2Expense) / windowMonths)
  const incomeVs3mRate = income3mAvg > 0 ? ((income - income3mAvg) / income3mAvg) * 100 : null
  const expenseVs3mRate = expense3mAvg > 0 ? ((expense - expense3mAvg) / expense3mAvg) * 100 : null

  // 현 페이스 = 최근 3개월 평균 저축액(income - outflow). windowMonths 분모로 신규 사용자 왜곡 방지. (Phase 8)
  const previousOutflow = getOutflowAmount(previousTransactions)
  const prev2Outflow = getOutflowAmount(previousPreviousTransactions)
  const avgMonthlySavings = Math.round((balance + (previousIncome - previousOutflow) + (prev2Income - prev2Outflow)) / windowMonths)

  const expenseByCategory = new Map<string, { amount: number; count: number }>()
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const current = expenseByCategory.get(tx.category_id) ?? { amount: 0, count: 0 }
    expenseByCategory.set(tx.category_id, { amount: current.amount + tx.amount, count: current.count + 1 })
  }
  const prevExpenseByCategory = sumExpenseByCategory(previousTransactions)
  const prev2ExpenseByCategory = sumExpenseByCategory(previousPreviousTransactions)

  const categoryAnalysis = [...expenseByCategory.entries()]
    .map(([categoryId, value]) => {
      const budget = getBudgetForMonth(budgets, categoryId, year, month)
      const category = getCategoryName(categoryId, categories)
      const sum3m = value.amount + (prevExpenseByCategory.get(categoryId) ?? 0) + (prev2ExpenseByCategory.get(categoryId) ?? 0)
      const avg3m = Math.round(sum3m / windowMonths)
      return {
        categoryId,
        name: category.name,
        icon: category.icon,
        amount: value.amount,
        budget,
        budgetRate: budget > 0 ? ratio(value.amount, budget) : null,
        share: ratio(value.amount, expense),
        count: value.count,
        overBudget: budget > 0 && value.amount > budget,
        avg3m,
        vsAvg3mRate: avg3m > 0 ? ((value.amount - avg3m) / avg3m) * 100 : null,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  const reportDate = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00`)
  const reportDateKey = `${year}-${String(month).padStart(2, '0')}-01`
  const loanTransactions = transactions.filter(t => t.type === 'loan_repayment')
  const loanAssets = assets.filter(asset => asset.group_type === 'loan')
  const loans = loanAssets.map(asset => {
    const related = loanTransactions.filter(tx => tx.to_asset_id === asset.id)
    const paidThisMonth = related.reduce((sum, tx) => sum + tx.amount, 0)
    const interestThisMonth = related.reduce((sum, tx) => sum + (tx.fee ?? 0), 0)
    const balanceValue = getDebtBalance(asset.balance)
    const monthlyPayment = asset.monthly_payment ?? 0
    const interestRate = asset.interest_rate ?? 0
    const payoff = estimateLoanPayoff({
      balance: asset.balance,
      annualInterestRate: interestRate,
      monthlyPayment,
      paymentDay: asset.payment_day ?? 0,
      fromDate: reportDateKey,
    })
    let priority: MonthlyReport['debtStrategy']['loans'][number]['priority'] = 'normal'
    if (balanceValue > 0) {
      if (interestRate >= 8) priority = 'high_interest'
      else if (monthlyPayment > 0 && balanceValue <= monthlyPayment * 3) priority = 'quick_close'
      else if (income > 0 && monthlyPayment / income >= 0.2) priority = 'heavy_payment'
    }

    return {
      assetId: asset.id,
      name: asset.name,
      balance: balanceValue,
      monthlyPayment,
      interestRate,
      endDate: asset.end_date ?? '',
      paidThisMonth,
      interestThisMonth,
      monthlyInterestEstimate: payoff.monthlyInterest,
      estimatedPayoffMonths: payoff.estimatedMonths,
      estimatedPayoffDate: payoff.estimatedPayoffDate,
      totalInterestEstimate: payoff.totalInterest,
      payoffStatus: payoff.status,
      priority,
    }
  }).sort((a, b) => b.interestRate - a.interestRate || a.balance - b.balance)

  const savingsGoalsReport = savingsGoals.map(goal => {
    const remainingAmount = Math.max(goal.target_amount - goal.current_amount, 0)
    const requiredMonthlySavings = goal.target_date
      ? Math.ceil(remainingAmount / monthsBetween(reportDate, new Date(`${goal.target_date}T00:00:00`)))
      : null
    const projection = buildSavingsGoalProjection(remainingAmount, requiredMonthlySavings, avgMonthlySavings)
    return {
      id: goal.id,
      name: goal.name,
      currentAmount: goal.current_amount,
      targetAmount: goal.target_amount,
      progress: ratio(goal.current_amount, goal.target_amount),
      targetDate: goal.target_date,
      remainingAmount,
      requiredMonthlySavings,
      status: projection.status,
      paceRatio: projection.paceRatio,
      simulationHint: projection.simulationHint,
    }
  })

  const totalBudget = categories
    .filter(category => category.type === 'expense')
    .reduce((sum, category) => sum + getBudgetForMonth(budgets, category.id, year, month), 0)
  const visibleAssets = assets.filter(asset => asset.visible)
  const totalAssets = visibleAssets
    .filter(asset => !isDebtAssetType(asset.group_type))
    .reduce((sum, asset) => sum + asset.balance, 0)
  const totalDebt = visibleAssets
    .filter(asset => isDebtAssetType(asset.group_type))
    .reduce((sum, asset) => sum + getDebtBalance(asset.balance), 0)
  const netWorth = totalAssets - totalDebt
  const netWorthChange = balance
  const recurringOutflowThisMonth = recurringTransactions
    .filter(tx => tx.enabled && (tx.type === 'expense' || tx.type === 'loan_repayment'))
    .reduce((sum, tx) => sum + tx.amount, 0)

  const next = nextMonth(year, month)
  const nextRange = getMonthRange(next.year, next.month, monthStartDay)
  const nextBudgetedExpense = categories
    .filter(category => category.type === 'expense')
    .reduce((sum, category) => sum + getBudgetForMonth(budgets, category.id, next.year, next.month), 0)
  const nextWishlist = wishlist.filter(item => !item.is_done && item.target_date && inRange(item.target_date, nextRange.from, nextRange.to))
  const nextRecurringExpenses = recurringTransactions
    .filter(tx => tx.enabled && tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)
  const nextRecurringLoanPayments = recurringTransactions
    .filter(tx => tx.enabled && tx.type === 'loan_repayment')
    .reduce((sum, tx) => sum + tx.amount, 0)
  const nextLoanPayments = Math.max(
    loanAssets.reduce((sum, asset) => sum + (asset.monthly_payment ?? 0), 0),
    nextRecurringLoanPayments
  )
  const nextBaseExpense = Math.max(nextBudgetedExpense, nextRecurringExpenses)
  const nextWishlistAmount = nextWishlist.reduce((sum, item) => sum + item.price, 0)
  const forecastBreakdown = [
    { label: '생활비 기준', amount: nextBaseExpense, source: nextBudgetedExpense >= nextRecurringExpenses ? '예산' : '반복' },
    { label: '대출 상환', amount: nextLoanPayments, source: loanAssets.some(asset => (asset.monthly_payment ?? 0) > 0) ? '대출' : '반복' },
    { label: '예정 이벤트', amount: nextWishlistAmount, source: '위시' },
  ].filter(item => item.amount > 0)
  const nextItems = [
    ...recurringTransactions
      .filter(tx => tx.enabled && (tx.type === 'expense' || tx.type === 'loan_repayment'))
      .map(tx => ({ label: tx.content || (tx.type === 'loan_repayment' ? '반복 대출 상환' : '반복 지출'), amount: tx.amount, source: '반복' })),
    ...loanAssets
      .filter(asset => (asset.monthly_payment ?? 0) > 0)
      .map(asset => ({ label: asset.name, amount: asset.monthly_payment ?? 0, source: '대출' })),
    ...nextWishlist.map(item => ({ label: item.name, amount: item.price, source: item.type === 'event' ? '이벤트' : '위시' })),
  ].sort((a, b) => b.amount - a.amount)

  const timelineMap = new Map<string, { income: number; outflow: number; items: string[] }>()
  for (const tx of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const current = timelineMap.get(tx.date) ?? { income: 0, outflow: 0, items: [] }
    if (tx.type === 'income') current.income += tx.amount
    if (tx.type === 'expense' || tx.type === 'loan_repayment') current.outflow += tx.amount
    if (tx.type === 'transfer') current.outflow += tx.fee ?? 0
    if (tx.content) current.items.push(tx.content)
    timelineMap.set(tx.date, current)
  }
  let cumulative = 0
  const cashflowTimeline = [...timelineMap.entries()].map(([date, value]) => {
    const net = value.income - value.outflow
    cumulative += net
    return {
      date,
      income: value.income,
      outflow: value.outflow,
      net,
      cumulative,
      mainItems: value.items.slice(0, 3),
    }
  })

  const annualOutlook = Array.from({ length: 12 }, (_, index) => {
    const targetMonth = index + 1
    const range = getMonthRange(year, targetMonth, monthStartDay)
    const monthTransactions = annualTransactions.filter(tx => inRange(tx.date, range.from, range.to))
    const actualIncome = monthTransactions.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
    const actualOutflow = getOutflowAmount(monthTransactions)
    const budgetedExpense = categories
      .filter(category => category.type === 'expense')
      .reduce((sum, category) => sum + getBudgetForMonth(budgets, category.id, year, targetMonth), 0)
    const loanPayments = loanAssets.reduce((sum, asset) => sum + (asset.monthly_payment ?? 0), 0)
    const monthEvents = wishlist
      .filter(item => !item.is_done && item.target_date && inRange(item.target_date, range.from, range.to))
      .map(item => item.name)

    return {
      year,
      month: targetMonth,
      actualIncome,
      actualOutflow,
      budgetedExpense,
      loanPayments,
      expectedBalance: actualIncome > 0 || actualOutflow > 0 ? actualIncome - actualOutflow : -(budgetedExpense + loanPayments),
      events: monthEvents,
    }
  })

  const expenseChangeRateValue = changeRate(expense, previousExpense)
  const debtRatioValue = totalAssets > 0 ? ratio(totalDebt, totalAssets) : null
  const emergencyFundMonthsValue = expense > 0 ? totalAssets / expense : null
  // 총부채상환비율 = 월 부채상환액 / 월 총소득. 카드 결제는 별도 거래로 모델링되지 않아
  // 현재 추적 가능한 월 부채상환액 = loan_repayment 합(loanRepayment)으로 근사한다.
  const debtServiceRatioValue = income > 0 ? ratio(loanRepayment, income) : null
  const budgetUsageRateValue = totalBudget > 0 ? ratio(expense, totalBudget) : null
  const fixedCostRateValue = income > 0 ? ratio(recurringOutflowThisMonth, income) : null
  const overBudgetCategories = categoryAnalysis.filter(row => row.overBudget && row.budgetRate !== null)
  const topOverBudgetCategory = overBudgetCategories.length > 0
    ? { name: overBudgetCategories[0].name, budgetRate: overBudgetCategories[0].budgetRate ?? 0 }
    : null
  const highBudgetRateCategoryRow = categoryAnalysis.find(row => (row.budgetRate ?? 0) > 120)
  const highBudgetRateCategory = highBudgetRateCategoryRow
    ? { name: highBudgetRateCategoryRow.name, budgetRate: highBudgetRateCategoryRow.budgetRate ?? 0 }
    : null
  const highInterestLoanRow = loans.find(loan => loan.priority === 'high_interest' && loan.balance > 0)
  const highInterestLoan = highInterestLoanRow
    ? { name: highInterestLoanRow.name, interestRate: highInterestLoanRow.interestRate }
    : null
  const nextPlannedTotal = nextBaseExpense + nextLoanPayments + nextWishlistAmount
  const recommendations = buildRecommendations({
    hasActivity: income > 0 || outflow > 0,
    emergencyFundMonths: emergencyFundMonthsValue,
    savingsRate,
    loans,
    loanAssets,
    reportDateKey,
    savingsGoals: savingsGoalsReport,
    overBudgetCategories: overBudgetCategories.map(row => ({
      name: row.name,
      amount: row.amount,
      budget: row.budget,
      budgetRate: row.budgetRate ?? 0,
    })),
  })
  const insights = buildInsights({
    hasActivity: income > 0 || outflow > 0,
    savingsRate,
    outflowRate,
    emergencyFundMonths: emergencyFundMonthsValue,
    debtRatio: debtRatioValue,
    balance,
    expenseChangeRate: expenseChangeRateValue,
    topOverBudgetCategory,
    highInterestLoan,
    highBudgetRateCategory,
    nextMonthPlannedOutflow: nextPlannedTotal,
  })

  return {
    period: { year, month, from, to, previousFrom: previousRange.from, previousTo: previousRange.to },
    summary: {
      income,
      expense,
      loanRepayment,
      outflow,
      balance,
      savingsRate,
      incomeChangeRate: changeRate(income, previousIncome),
      expenseChangeRate: expenseChangeRateValue,
      income3mAvg,
      expense3mAvg,
      incomeVs3mRate,
      expenseVs3mRate,
      totalAssets,
      totalDebt,
      netWorth,
      netWorthChange,
    },
    categoryAnalysis,
    debtStrategy: {
      loans,
      totalBalance: loans.reduce((sum, loan) => sum + loan.balance, 0),
      totalMonthlyPayment: loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0),
      paidThisMonth: loans.reduce((sum, loan) => sum + loan.paidThisMonth, 0),
      interestThisMonth: loans.reduce((sum, loan) => sum + loan.interestThisMonth, 0),
    },
    savingsSummary: {
      goals: savingsGoalsReport,
      totalCurrent: savingsGoalsReport.reduce((sum, goal) => sum + goal.currentAmount, 0),
      totalTarget: savingsGoalsReport.reduce((sum, goal) => sum + goal.targetAmount, 0),
      avgMonthlySavings,
    },
    healthMetrics: buildHealthMetrics({
      savingsRate,
      outflowRate,
      emergencyFundMonths: emergencyFundMonthsValue,
      debtRatio: debtRatioValue,
      debtServiceRatio: debtServiceRatioValue,
      budgetUsageRate: budgetUsageRateValue,
      fixedCostRate: fixedCostRateValue,
    }),
    nextMonthForecast: {
      year: next.year,
      month: next.month,
      recurringOutflow: nextRecurringExpenses + nextRecurringLoanPayments,
      loanPayments: nextLoanPayments,
      budgetedExpense: nextBudgetedExpense,
      plannedExpense: nextBaseExpense,
      wishlistEvents: nextWishlistAmount,
      totalPlannedOutflow: nextPlannedTotal,
      items: [...forecastBreakdown, ...nextItems],
    },
    insights,
    recommendations,
    cashflowTimeline,
    annualOutlook,
    anomalies: detectAnomalies({
      hasActivity: income > 0 || outflow > 0,
      transactions,
      previousTransactions,
      previousPreviousTransactions,
      categories,
      recurringTransactions,
    }),
    essentialityBreakdown: buildEssentialityBreakdown(transactions, categories, expense, income, savingsRate),
  }
}
