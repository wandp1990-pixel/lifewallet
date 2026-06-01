import { getBudgetForMonth } from './budget'
import { assetBalanceDelta, estimateLoanPayoff, getDebtBalance, getExpenseAmount, getLoanRepaymentAmount, getOutflowAmount, isDebtAssetType } from './finance'
import { getMonthRange } from './monthStart'
import type { Asset, AssetGroupType, Budget, Category, Essentiality, RecurringTransaction, SavingsGoal, Transaction, WishlistItem } from './types'
import { formatAmount } from './utils'

// 유동자산(비상자금 분자) 그룹 타입 — 즉시 인출 가능한 현금성. (REPORT_SPEC §5a)
const LIQUID_GROUP_TYPES: AssetGroupType[] = ['cash', 'bank', 'savings']

// 부채 전략 섹션 대상 그룹 타입 — loan + card + 마이너스통장. insurance는 '상환' 부채로 모호해 제외. (REPORT_SPEC §3)
const DEBT_STRATEGY_TYPES: AssetGroupType[] = ['loan', 'card', 'minus_account']

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
  label: string        // 필수 / 원함 / 저축 / 기타
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
  // 보고 월 말일(period.to) 이후 ~ 현재까지의 모든 거래. 시점 잔액 복원에 사용 (reconstructBalanceAsOf).
  laterTransactions: Transaction[]
  categories: Category[]
  budgets: Budget[]
  assets: Asset[]
  savingsGoals: SavingsGoal[]
  wishlist: WishlistItem[]
  recurringTransactions: RecurringTransaction[]
}

// 보고 월 말(asOf) 시점의 자산 잔액을 거래로 복원한다.
// asset.balance는 "현재" 단일 스냅샷이므로, asOf 이후 거래의 부호 델타를 역산해 그 달 말 잔액을 구한다.
// 수동 잔액 앵커(balance_date)가 asOf보다 뒤면 거래만으로 복원 불가 → uncertain.
// 부호 규칙은 finance.ts assetBalanceDelta 단일 소스 (DB 쓰기·자산 상세 러닝밸런스와 공유).
function reconstructBalanceAsOf(
  asset: Asset,
  laterDeltaByAsset: Map<string, number>,
  asOf: string,
): { balance: number; uncertain: boolean } {
  if (asset.balance_date && asset.balance_date > asOf) {
    return { balance: asset.balance, uncertain: true }
  }
  const delta = laterDeltaByAsset.get(asset.id) ?? 0
  return { balance: asset.balance - delta, uncertain: false }
}

// 보고 월 말(asOf) 시점에 아직 개설되지 않은 자산(시작일이 asOf보다 뒤)은 그 달에 존재하지 않았으므로
// 시점 집계(부채 목록·totalAssets/totalDebt/netWorth)에서 제외한다. (예: 4월 실행 대출이 3월 보고서에 잡히는 문제)
// 시작일(start_date)이 없으면 개설 시점을 판별할 수 없으므로 어쩔 수 없이 포함한다. → DESIGN.md LF5
function existedAsOf(asset: Asset, asOf: string): boolean {
  return !asset.start_date || asset.start_date <= asOf
}

// 거래 배열의 자산별 부호 델타 합 맵. 시점 잔액 복원용. 부호 규칙은 finance.ts assetBalanceDelta 단일 소스.
function buildDeltaMap(transactions: Transaction[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const tx of transactions) {
    const ids = [tx.asset_id, tx.from_asset_id, tx.to_asset_id].filter((id, i, arr) => id && arr.indexOf(id) === i)
    for (const id of ids) {
      map.set(id, (map.get(id) ?? 0) + assetBalanceDelta(tx, id))
    }
  }
  return map
}

// asOf 시점의 순자산 = visible·existedAsOf 자산의 (비부채 잔액 합 − 부채 잔액 합). 잔액은 deltaMap으로 복원. (REPORT_SPEC §1.5/§1.6)
function netWorthAsOf(assets: Asset[], deltaMap: Map<string, number>, asOf: string): number {
  let total = 0
  let debt = 0
  for (const asset of assets) {
    if (!asset.visible || !existedAsOf(asset, asOf)) continue
    const bal = reconstructBalanceAsOf(asset, deltaMap, asOf).balance
    if (isDebtAssetType(asset.group_type)) debt += getDebtBalance(bal)
    else total += bal
  }
  return total - debt
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
    // 시점 잔액(totalAssets/totalDebt/netWorth, 대출 balance)은 보고 월 말 기준으로 거래 역산 복원한 값.
    // 수동 잔액 앵커가 보고 월보다 뒤인 자산이 있어 일부 복원이 불확실하면 true.
    pointInTimeUncertain: boolean
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
      paidOffThisMonth: boolean // 이번 달에 완납됨(잔액 0 + 당월상환 > 0). 과거에 이미 정리된 잔액 0 대출과 구분.
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
    savingsRate: number | null         // savings 자산 순변동 / income (=summary.savingsRate, 저축 레그 표준 ≥20%)
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
  income: number
  expense: number
  outflow: number
  balance: number
  previousExpense: number
  savingsRate: number | null
  emergencyFundMonths: number | null
  emergencyFundExpenseBase: number  // 비상자금 개월수 분모와 동일한 월 지출 기준(3개월 평균). 부족액 계산을 분모와 일치시킨다.
  debtRatio: number | null
  expenseChangeRate: number | null
  incomeChangeRate: number | null
  netWorth: number
  netWorthChange: number
  avgMonthlySavings: number
  categoryAnalysis: MonthlyReport['categoryAnalysis']
  highInterestLoan: { name: string; interestRate: number; balance: number } | null
  savingsGoals: MonthlyReport['savingsSummary']['goals']
  nextMonthPlannedOutflow: number
}

function formatLevelPercent(value: number) {
  return `${Math.round(value)}%`
}

function signedLevelPercent(value: number) {
  return `${value > 0 ? '+' : ''}${Math.round(value)}%`
}

function wonText(value: number) {
  return `${formatAmount(Math.round(value))}원`
}

function signedWonText(value: number) {
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : rounded < 0 ? '-' : ''}${formatAmount(Math.abs(rounded))}원`
}

// 헤드라인 인사이트는 "보고서 전체에서 가장 중요한 것"을 점수순으로 끌어올린 요약이다.
// 후보를 score와 함께 모아 정렬 후 카드별 상위 N개만 노출한다(1줄만 버리던 구버전 폐기).
// 모든 항목은 구체 수치(원/%/개월)를 동반한다. 규칙·점수·폴백은 SCHEMA.md `MonthlyReport.insights` 단일 소스.
type ScoredInsight = { score: number; insight: Insight }

// 카드별 노출 개수. 잘한 점·주의는 좁은 2열이라 2개, 다음 액션은 전체 폭이라 3개.
const INSIGHT_LIMIT: Record<InsightKind, number> = { strength: 2, warning: 2, action: 3 }

function topInsights(pool: ScoredInsight[], limit: number): Insight[] {
  return [...pool].sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.insight)
}

function buildInsights(ctx: InsightContext): MonthlyReport['insights'] {
  if (!ctx.hasActivity) {
    return { strengths: [], warnings: [], actions: [] }
  }

  const strengths: ScoredInsight[] = []
  const warnings: ScoredInsight[] = []
  const actions: ScoredInsight[] = []

  // 파생 신호 (이미 계산된 categoryAnalysis·savingsGoals 재활용)
  const topCategory = ctx.categoryAnalysis[0] ?? null
  const spikeCategory = ctx.categoryAnalysis
    .filter(c => c.vsAvg3mRate !== null && c.vsAvg3mRate >= 50 && c.avg3m > 0 && c.amount - c.avg3m >= 30000)
    .sort((a, b) => (b.amount - b.avg3m) - (a.amount - a.avg3m))[0] ?? null
  const reducerCategory = ctx.categoryAnalysis
    .filter(c => c.vsAvg3mRate !== null && c.vsAvg3mRate <= -10 && c.avg3m > 0)
    .sort((a, b) => (a.vsAvg3mRate ?? 0) - (b.vsAvg3mRate ?? 0))[0] ?? null
  const budgetedCategories = ctx.categoryAnalysis.filter(c => c.budget > 0)
  const overBudget = ctx.categoryAnalysis
    .filter(c => c.overBudget && c.budgetRate !== null)
    .sort((a, b) => (b.amount - b.budget) - (a.amount - a.budget))
  const behindGoal = ctx.savingsGoals.find(g => (g.status === 'behind' || g.status === 'at_risk') && g.requiredMonthlySavings !== null)
  const achievedGoal = ctx.savingsGoals.find(g => g.status === 'achieved')

  // ── 잘한 점 (strengths) ─────────────────────────────────────
  if (ctx.balance > 0) {
    strengths.push({ score: 80 + Math.min(ctx.balance / 10000, 30), insight: { kind: 'strength', title: '이번 달 흑자', detail: `수입 ${wonText(ctx.income)} − 지출 ${wonText(ctx.outflow)}`, metric: signedWonText(ctx.balance) } })
  }
  if (ctx.savingsRate !== null && ctx.savingsRate >= 20) {
    strengths.push({ score: 90 + ctx.savingsRate, insight: { kind: 'strength', title: '저축률 안전 구간', detail: '한국FP학회 권장 20% 이상', metric: formatLevelPercent(ctx.savingsRate) } })
  } else if (ctx.savingsRate !== null && ctx.savingsRate >= 10) {
    strengths.push({ score: 55 + ctx.savingsRate, insight: { kind: 'strength', title: '저축률 양호', detail: '20% 안전 구간이 머지않았습니다', metric: formatLevelPercent(ctx.savingsRate) } })
  }
  if (ctx.emergencyFundMonths !== null && ctx.emergencyFundMonths >= 3 && ctx.emergencyFundMonths <= 6) {
    strengths.push({ score: 75, insight: { kind: 'strength', title: '비상금 안전 구간', detail: '월 지출 3~6개월치 확보', metric: `${ctx.emergencyFundMonths.toFixed(1)}개월` } })
  } else if (ctx.emergencyFundMonths !== null && ctx.emergencyFundMonths > 6) {
    strengths.push({ score: 55, insight: { kind: 'strength', title: '비상금 충분', detail: '권장 6개월분 이상 확보', metric: `${ctx.emergencyFundMonths.toFixed(1)}개월` } })
  }
  if (ctx.expenseChangeRate !== null && ctx.expenseChangeRate <= -5) {
    strengths.push({ score: 50 + Math.min(-ctx.expenseChangeRate, 30), insight: { kind: 'strength', title: '지출 감소', detail: `전월 대비 ${wonText(Math.max(ctx.previousExpense - ctx.expense, 0))} 줄였습니다`, metric: signedLevelPercent(ctx.expenseChangeRate) } })
  }
  if (ctx.incomeChangeRate !== null && ctx.incomeChangeRate >= 5) {
    strengths.push({ score: 45, insight: { kind: 'strength', title: '수입 증가', detail: '전월 대비 수입이 늘었습니다', metric: signedLevelPercent(ctx.incomeChangeRate) } })
  }
  if (budgetedCategories.length > 0 && overBudget.length === 0) {
    strengths.push({ score: 48, insight: { kind: 'strength', title: '예산 모두 준수', detail: `예산 설정한 ${budgetedCategories.length}개 카테고리 모두 예산 내`, metric: undefined } })
  }
  if (achievedGoal) {
    strengths.push({ score: 60, insight: { kind: 'strength', title: `목표 달성: ${achievedGoal.name}`, detail: '저축 목표를 달성했습니다', metric: formatLevelPercent(achievedGoal.progress) } })
  }
  // 폴백 — 적자 달에도 노출할 상대적 긍정 신호 (잘한 점 빈 카드 방지)
  if (ctx.netWorthChange > 0) {
    strengths.push({ score: 40, insight: { kind: 'strength', title: '순자산 증가', detail: '이번 달 자산이 늘었습니다', metric: signedWonText(ctx.netWorthChange) } })
  } else if (ctx.netWorth > 0) {
    strengths.push({ score: 25, insight: { kind: 'strength', title: '순자산 플러스 유지', detail: `자산이 부채보다 ${wonText(ctx.netWorth)} 많습니다`, metric: signedWonText(ctx.netWorth) } })
  }
  if (reducerCategory && reducerCategory.vsAvg3mRate !== null) {
    strengths.push({ score: 30, insight: { kind: 'strength', title: `${reducerCategory.name} 절약`, detail: `평소(${wonText(reducerCategory.avg3m)})보다 적게 썼습니다`, metric: signedLevelPercent(reducerCategory.vsAvg3mRate) } })
  }
  // 평소 수준을 유지한(±10% 이내, 예산 내) 최대 지출 카테고리 — 적자 달에도 노출할 안정 신호
  const stableCategory = ctx.categoryAnalysis.find(c => !c.overBudget && c.vsAvg3mRate !== null && Math.abs(c.vsAvg3mRate) <= 10 && c.avg3m > 0)
  if (stableCategory) {
    strengths.push({ score: 18, insight: { kind: 'strength', title: `${stableCategory.name} 지출 안정`, detail: '평소 수준을 유지했습니다', metric: undefined } })
  }
  // 최후 폴백 — 그래도 강점이 하나도 없으면 기록 습관을 격려 (빈 카드 절대 방지)
  if (strengths.length === 0) {
    const expenseCount = ctx.categoryAnalysis.reduce((sum, c) => sum + c.count, 0)
    if (expenseCount > 0) {
      strengths.push({ score: 10, insight: { kind: 'strength', title: '기록을 이어가고 있어요', detail: '꾸준한 기록이 개선의 출발점입니다', metric: `${expenseCount}건` } })
    }
  }

  // ── 주의 (warnings) — 모든 항목이 금액/비율을 동반 ──────────────
  if (ctx.balance < 0) {
    warnings.push({ score: 95 + Math.min(-ctx.balance / 10000, 30), insight: { kind: 'warning', title: '이번 달 적자', detail: `수입 ${wonText(ctx.income)} < 지출 ${wonText(ctx.outflow)}`, metric: signedWonText(ctx.balance) } })
  }
  if (ctx.savingsRate !== null && ctx.savingsRate < 0) {
    warnings.push({ score: 78, insight: { kind: 'warning', title: '저축률 음수', detail: '고정비·대출 상환 부담을 점검하세요', metric: formatLevelPercent(ctx.savingsRate) } })
  }
  if (ctx.debtRatio !== null && ctx.debtRatio > 60) {
    warnings.push({ score: 80, insight: { kind: 'warning', title: '부채 비율 위험', detail: '총자산 대비 부채 60% 초과', metric: cappedPercent(ctx.debtRatio, 100) } })
  }
  for (const cat of overBudget.slice(0, 2)) {
    const overage = cat.amount - cat.budget
    warnings.push({ score: 60 + Math.min(overage / 10000, 20), insight: { kind: 'warning', title: `${cat.name} 예산 초과`, detail: `예산 ${wonText(cat.budget)} 대비 ${wonText(overage)} 초과`, metric: formatLevelPercent(cat.budgetRate ?? 0) } })
  }
  if (ctx.expenseChangeRate !== null && ctx.expenseChangeRate >= 25) {
    warnings.push({ score: 65, insight: { kind: 'warning', title: '지출 급증', detail: `전월 대비 ${wonText(Math.max(ctx.expense - ctx.previousExpense, 0))} 늘었습니다`, metric: signedLevelPercent(ctx.expenseChangeRate) } })
  }
  if (spikeCategory && spikeCategory.vsAvg3mRate !== null) {
    warnings.push({ score: 55, insight: { kind: 'warning', title: `${spikeCategory.name} 지출 급증`, detail: `평소 ${wonText(spikeCategory.avg3m)} → ${wonText(spikeCategory.amount)}`, metric: signedLevelPercent(spikeCategory.vsAvg3mRate) } })
  }
  if (topCategory && topCategory.share > 40) {
    warnings.push({ score: 45, insight: { kind: 'warning', title: '지출 편중', detail: `이번 달 지출의 상당 부분이 ${topCategory.name}에 집중`, metric: formatLevelPercent(topCategory.share) } })
  }

  // ── 다음 액션 (actions) — 목표 수치를 동반한 구체 행동 ──────────
  if (ctx.highInterestLoan) {
    actions.push({ score: 82, insight: { kind: 'action', title: `${ctx.highInterestLoan.name} 우선상환`, detail: `금리 ${ctx.highInterestLoan.interestRate.toFixed(1)}% 고금리 · 잔액 ${wonText(ctx.highInterestLoan.balance)}`, metric: `${ctx.highInterestLoan.interestRate.toFixed(1)}%` } })
  }
  if (ctx.emergencyFundMonths !== null && ctx.emergencyFundMonths < 3 && ctx.emergencyFundExpenseBase > 0) {
    const shortfall = Math.max((3 - ctx.emergencyFundMonths) * ctx.emergencyFundExpenseBase, 0)
    actions.push({ score: 75, insight: { kind: 'action', title: '비상금 우선 확보', detail: `월 지출 3개월분까지 ${wonText(shortfall)} 부족 — 저축 목표에 우선 배정`, metric: `${ctx.emergencyFundMonths.toFixed(1)}개월` } })
  }
  if (ctx.nextMonthPlannedOutflow > 0 && ctx.balance < ctx.nextMonthPlannedOutflow) {
    actions.push({ score: 60, insight: { kind: 'action', title: '다음 달 지출 대비', detail: `예정 지출 ${wonText(ctx.nextMonthPlannedOutflow)} > 이번 달 잔액 ${signedWonText(ctx.balance)}`, metric: undefined } })
  }
  const overBudgetAction = overBudget.find(c => (c.budgetRate ?? 0) > 120)
  if (overBudgetAction) {
    actions.push({ score: 55, insight: { kind: 'action', title: `${overBudgetAction.name} 예산 조정`, detail: `예산 ${wonText(overBudgetAction.budget)} 대비 ${formatLevelPercent(overBudgetAction.budgetRate ?? 0)} 지출 — 상향 또는 절감`, metric: formatLevelPercent(overBudgetAction.budgetRate ?? 0) } })
  }
  if (behindGoal && behindGoal.requiredMonthlySavings !== null) {
    actions.push({ score: 50, insight: { kind: 'action', title: `${behindGoal.name} 저축 페이스`, detail: `목표일까지 월 ${wonText(behindGoal.requiredMonthlySavings)} 필요 · 현 페이스 ${signedWonText(ctx.avgMonthlySavings)}`, metric: `월 ${wonText(behindGoal.requiredMonthlySavings)}` } })
  }
  if (ctx.balance > 0 && behindGoal) {
    actions.push({ score: 45, insight: { kind: 'action', title: '흑자분 목표 배정', detail: `이번 달 흑자 ${wonText(ctx.balance)}을 "${behindGoal.name}"에 배정 검토`, metric: signedWonText(ctx.balance) } })
  }
  // 폴백 — 건전한 달에도 한 줄 제시 (목표 미설정 시 설정 유도)
  if (ctx.savingsGoals.length === 0 && ctx.balance > 0) {
    actions.push({ score: 30, insight: { kind: 'action', title: '저축 목표 설정', detail: '여유 자금을 목표에 배정해 자동 추적하세요', metric: undefined } })
  }

  return {
    strengths: topInsights(strengths, INSIGHT_LIMIT.strength),
    warnings: topInsights(warnings, INSIGHT_LIMIT.warning),
    actions: topInsights(actions, INSIGHT_LIMIT.action),
  }
}

function clampGauge(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

function roundPercent(value: number): string {
  return `${Math.round(value)}%`
}

// 표시 상한 — 분모가 작을 때(자산 미입력·희소한 달 등) ratio()가 무한정 커지는 값을
// 읽을 수 있는 상한으로 묶는다. 레벨 판정·게이지는 원시값(value)을 그대로 쓰므로
// 임계값을 넘은 지점에서 이미 포화돼 정보 손실이 없다.
// 단일 소스: SCHEMA.md `MonthlyReport.healthMetrics` "표시 상한".
function cappedPercent(value: number, cap: number): string {
  if (value > cap) return `${cap}%+`
  if (value < -cap) return `-${cap}%`
  return `${Math.round(value)}%`
}
function cappedMonths(value: number, cap: number): string {
  if (value > cap) return `${cap}개월+`
  return `${value.toFixed(1)}개월`
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
      savingsRate === null ? '-' : cappedPercent(savingsRate, 100),
      savingsRate === null ? 'none' : savingsRate >= 20 ? 'safe' : savingsRate >= 10 ? 'caution' : 'danger',
      40, '안전 20% 이상',
    ),
    // 가계수지(지출률) — 낮을수록 좋음 (안전 ≤70% / 주의 70~85% / 위험 >85%)
    makeHealthMetric(
      'outflowRate', '가계수지(지출률)', true,
      outflowRate,
      outflowRate === null ? '-' : cappedPercent(outflowRate, 300),
      outflowRate === null ? 'none' : outflowRate <= 70 ? 'safe' : outflowRate <= 85 ? 'caution' : 'danger',
      100, '안전 70% 이하',
    ),
    // 비상자금 — 구간형 (안전 3~6개월 / 주의 1~3 또는 >6 / 위험 <1)
    makeHealthMetric(
      'emergencyFund', '비상자금', true,
      emergencyFundMonths,
      emergencyFundMonths === null ? '-' : cappedMonths(emergencyFundMonths, 60),
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
      debtRatio === null ? '-' : cappedPercent(debtRatio, 100),
      debtRatio === null ? 'none' : debtRatio <= 40 ? 'safe' : debtRatio <= 60 ? 'caution' : 'danger',
      100, '안전 40% 이하',
    ),
    // 총부채상환비율 — 낮을수록 좋음 (안전 ≤30% / 주의 30~40% / 위험 >40%)
    makeHealthMetric(
      'debtServiceRatio', '총부채상환비율', true,
      debtServiceRatio,
      debtServiceRatio === null ? '-' : cappedPercent(debtServiceRatio, 100),
      debtServiceRatio === null ? 'none' : debtServiceRatio <= 30 ? 'safe' : debtServiceRatio <= 40 ? 'caution' : 'danger',
      50, '안전 30% 이하 · 대출 상환 기준',
    ),
    // 예산 소진율 — 한국FP학회 항목 아님, 기존 유지 (안전 ≤100% / 주의 100~120% / 위험 >120%)
    makeHealthMetric(
      'budgetUsageRate', '예산 소진율', false,
      budgetUsageRate,
      budgetUsageRate === null ? '-' : cappedPercent(budgetUsageRate, 300),
      budgetUsageRate === null ? 'none' : budgetUsageRate <= 100 ? 'safe' : budgetUsageRate <= 120 ? 'caution' : 'danger',
      120, '예산 100% 이내',
    ),
    // 고정비 비중 — 한국FP학회 항목 아님, 기존 유지 (안전 ≤50% / 주의 50~70% / 위험 >70%)
    makeHealthMetric(
      'fixedCostRate', '고정비 비중', false,
      fixedCostRate,
      fixedCostRate === null ? '-' : cappedPercent(fixedCostRate, 100),
      fixedCostRate === null ? 'none' : fixedCostRate <= 50 ? 'safe' : fixedCostRate <= 70 ? 'caution' : 'danger',
      100, '권장 50% 이하 · 등록 반복거래 기준',
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
  unexpected: '기타',
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

// savings_tracking=true 자산의 이달 순변동 합계.
// income/expense → 해당 자산 직접 효과. transfer → to/from 양쪽 적용. 출금·인출도 반영.
// `asset`(잔액 조정) 거래는 평가손익·수기보정이라 '적립'이 아니므로 제외 — 저축률은 실제 적립만 반영. (REPORT_SPEC §0.1b)
// 평가증가는 순자산 증감(시점차, REPORT_SPEC §1.6)이 별도로 잡는다.
function getSavingsNetChange(transactions: Transaction[], assets: Asset[]): number {
  const savingsIds = new Set(assets.filter(a => a.savings_tracking).map(a => a.id))
  return transactions.reduce((sum, tx) => {
    if (tx.type === 'income'  && savingsIds.has(tx.asset_id))    return sum + tx.amount
    if (tx.type === 'expense' && savingsIds.has(tx.asset_id))    return sum - tx.amount
    if (tx.type === 'loan_repayment' && savingsIds.has(tx.to_asset_id)) return sum + tx.amount
    if (tx.type === 'transfer') {
      if (savingsIds.has(tx.to_asset_id))   sum += tx.amount
      if (savingsIds.has(tx.from_asset_id)) sum -= (tx.amount + (tx.fee ?? 0))
    }
    return sum
  }, 0)
}

// 단일 자산의 순변동 합(부호 델타). 저축 목표 페이스 계산용. `asset`(잔액 조정) 거래는 적립이 아니므로 제외(REPORT_SPEC §0.1b/§4).
function getAssetNetChange(transactions: Transaction[], assetId: string): number {
  return transactions.reduce((sum, tx) => (tx.type === 'asset' ? sum : sum + assetBalanceDelta(tx, assetId)), 0)
}

// ── 저축 목표 on-track 판정 + 시뮬레이션 (Phase 8) ────────────
// 판정·시뮬레이션 규칙은 SCHEMA.md `MonthlyReport.savingsSummary` 단일 소스.
// 페이스는 목표별로 산정한다(REPORT_SPEC §4): 연결 자산 3개월 평균 순변동을 잔여액 비중 안분, 미연결 목표는 avgMonthlySavings 폴백.
// 요약 카드의 avgMonthlySavings는 savings 자산 순변동 3개월 평균(전체 페이스 요약값).
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
  const { year, month, monthStartDay, transactions, previousTransactions, previousPreviousTransactions, annualTransactions, laterTransactions, categories, budgets, assets, savingsGoals, wishlist, recurringTransactions } = input
  const { from, to } = getMonthRange(year, month, monthStartDay)

  // 시점 잔액 복원 — 보고 월 말(to) 이후 거래의 부호 델타를 자산별로 합산해두고, 현재 잔액에서 역산한다.
  const laterDeltaByAsset = buildDeltaMap(laterTransactions)
  const balanceAsOfByAsset = new Map<string, number>()
  let pointInTimeUncertain = false
  for (const asset of assets) {
    if (!existedAsOf(asset, to)) continue // 보고월에 미존재(시작일이 보고월 이후) → 시점 집계 제외
    const recon = reconstructBalanceAsOf(asset, laterDeltaByAsset, to)
    balanceAsOfByAsset.set(asset.id, recon.balance)
    if (asset.visible && recon.uncertain) pointInTimeUncertain = true
  }
  const balanceAsOf = (asset: Asset) => balanceAsOfByAsset.get(asset.id) ?? asset.balance
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
  const savingsNetChange = getSavingsNetChange(transactions, assets)
  const savingsRate = income > 0 ? ratio(savingsNetChange, income) : null
  const outflowRate = income > 0 ? ratio(outflow, income) : null

  // 3개월 rolling 윈도우 — 거래가 있는 달만 분모로 사용해 신규 사용자(데이터 1~2개월)의 평균 왜곡 방지.
  // 단일 소스: SCHEMA.md `MonthlyReport.summary`/`categoryAnalysis` "3개월 rolling".
  const windowMonths = [transactions, previousTransactions, previousPreviousTransactions].filter(list => list.length > 0).length || 1
  const income3mAvg = Math.round((income + previousIncome + prev2Income) / windowMonths)
  const expense3mAvg = Math.round((expense + previousExpense + prev2Expense) / windowMonths)
  const incomeVs3mRate = income3mAvg > 0 ? ((income - income3mAvg) / income3mAvg) * 100 : null
  const expenseVs3mRate = expense3mAvg > 0 ? ((expense - expense3mAvg) / expense3mAvg) * 100 : null

  // 현 페이스 = 최근 3개월 savings 자산 순변동 평균. 출금 포함 순변동이므로 음수 가능. windowMonths 분모로 신규 사용자 왜곡 방지. (Phase 8)
  const previousSavingsNetChange = getSavingsNetChange(previousTransactions, assets)
  const prev2SavingsNetChange = getSavingsNetChange(previousPreviousTransactions, assets)
  const avgMonthlySavings = Math.round((savingsNetChange + previousSavingsNetChange + prev2SavingsNetChange) / windowMonths)

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
  // loanAssets(loan 한정)는 예측·권고·연간 전망의 대출 상환 투영에 사용(monthly_payment·interest 필드 의존).
  const loanAssets = assets.filter(asset => asset.group_type === 'loan' && existedAsOf(asset, to))
  // 부채 전략 섹션 대상: loan + card + 마이너스통장. (REPORT_SPEC §3)
  const debtStrategyAssets = assets.filter(asset => DEBT_STRATEGY_TYPES.includes(asset.group_type) && existedAsOf(asset, to))
  const loans = debtStrategyAssets.map(asset => {
    const isLoanType = asset.group_type === 'loan'
    // loan은 loan_repayment 거래(to_asset_id)로 상환 추적(이자=fee). card·마통은 '부채자산으로의 이체'로 상환 추적(이자 모델 없음). (REPORT_SPEC §3)
    let paidThisMonth: number
    let interestThisMonth: number
    if (isLoanType) {
      const related = loanTransactions.filter(tx => tx.to_asset_id === asset.id)
      paidThisMonth = related.reduce((sum, tx) => sum + tx.amount, 0)
      interestThisMonth = related.reduce((sum, tx) => sum + (tx.fee ?? 0), 0)
    } else {
      const repayments = transactions.filter(tx => tx.type === 'transfer' && tx.to_asset_id === asset.id)
      paidThisMonth = repayments.reduce((sum, tx) => sum + tx.amount, 0)
      interestThisMonth = 0
    }
    // 잔액은 현재 스냅샷이 아니라 보고 월 말 복원값 사용 (과거 달 보고서 정확도).
    const reconBalance = balanceAsOf(asset)
    const balanceValue = getDebtBalance(reconBalance)
    const monthlyPayment = asset.monthly_payment ?? 0
    const interestRate = asset.interest_rate ?? 0
    const payoff = estimateLoanPayoff({
      balance: reconBalance,
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
      paidOffThisMonth: balanceValue <= 0 && paidThisMonth > 0,
      priority,
    }
  }).sort((a, b) => b.interestRate - a.interestRate || a.balance - b.balance)

  // 목표별 페이스 — 연결 자산(asset_id)의 3개월 평균 순변동을, 같은 자산을 공유하는 목표끼리 remainingAmount 비중으로 안분. (REPORT_SPEC §4)
  const goalRemaining = (g: SavingsGoal) => Math.max(g.target_amount - g.current_amount, 0)
  const remainingSumByAsset = new Map<string, number>()
  for (const g of savingsGoals) {
    if (!g.asset_id) continue
    remainingSumByAsset.set(g.asset_id, (remainingSumByAsset.get(g.asset_id) ?? 0) + goalRemaining(g))
  }
  const sharedGoalCountByAsset = new Map<string, number>()
  for (const g of savingsGoals) {
    if (!g.asset_id) continue
    sharedGoalCountByAsset.set(g.asset_id, (sharedGoalCountByAsset.get(g.asset_id) ?? 0) + 1)
  }
  const assetPaceCache = new Map<string, number>()
  const assetMonthlyPace = (assetId: string): number => {
    const cached = assetPaceCache.get(assetId)
    if (cached !== undefined) return cached
    const net = getAssetNetChange(transactions, assetId)
      + getAssetNetChange(previousTransactions, assetId)
      + getAssetNetChange(previousPreviousTransactions, assetId)
    const pace = Math.round(net / windowMonths)
    assetPaceCache.set(assetId, pace)
    return pace
  }

  const savingsGoalsReport = savingsGoals.map(goal => {
    const remainingAmount = goalRemaining(goal)
    const requiredMonthlySavings = goal.target_date
      ? Math.ceil(remainingAmount / monthsBetween(reportDate, new Date(`${goal.target_date}T00:00:00`)))
      : null
    // 목표별 페이스: asset_id 있으면 연결 자산 페이스를 잔여액 비중 안분(합 0이면 균등), 없으면 전체 평균 폴백.
    let goalPace: number
    if (goal.asset_id) {
      const assetPace = assetMonthlyPace(goal.asset_id)
      const totalRemaining = remainingSumByAsset.get(goal.asset_id) ?? 0
      if (totalRemaining > 0) {
        goalPace = Math.round(assetPace * (remainingAmount / totalRemaining))
      } else {
        goalPace = Math.round(assetPace / (sharedGoalCountByAsset.get(goal.asset_id) ?? 1))
      }
    } else {
      goalPace = avgMonthlySavings
    }
    const projection = buildSavingsGoalProjection(remainingAmount, requiredMonthlySavings, goalPace)
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
  const visibleAssets = assets.filter(asset => asset.visible && existedAsOf(asset, to))
  const totalAssets = visibleAssets
    .filter(asset => !isDebtAssetType(asset.group_type))
    .reduce((sum, asset) => sum + balanceAsOf(asset), 0)
  const totalDebt = visibleAssets
    .filter(asset => isDebtAssetType(asset.group_type))
    .reduce((sum, asset) => sum + getDebtBalance(balanceAsOf(asset)), 0)
  // 비상자금 분자 = 즉시 인출 가능한 유동자산만(현금·은행·저축). 투자·보험·기타 제외. (REPORT_SPEC §5a)
  const liquidAssets = visibleAssets
    .filter(asset => LIQUID_GROUP_TYPES.includes(asset.group_type))
    .reduce((sum, asset) => sum + balanceAsOf(asset), 0)
  const netWorth = totalAssets - totalDebt
  // 순자산 증감 = 보고월 말 순자산 − 전월 말 순자산 (시점차). 전월 말 잔액은 "전월말 이후 거래"(=이번 달 + later)의
  // 델타로 복원. 수지 근사 폐기 — 대출 원금상환(부채↓)·자산 평가조정이 순자산에 올바르게 반영된다. (REPORT_SPEC §1.6)
  const prevNetWorth = netWorthAsOf(assets, buildDeltaMap([...transactions, ...laterTransactions]), previousRange.to)
  const netWorthChange = netWorth - prevNetWorth
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

  // 연간 전망 대출상환 (REPORT_SPEC §7): 과거·현재 달=실제 부채상환, 미래 달=완납추정 투영.
  const debtStrategyAssetIds = new Set(debtStrategyAssets.map(a => a.id))
  const actualDebtPayments = (txs: Transaction[]): number => txs.reduce((sum, tx) => {
    if (tx.type === 'loan_repayment') return sum + tx.amount                                       // loan 상환
    if (tx.type === 'transfer' && debtStrategyAssetIds.has(tx.to_asset_id)) return sum + tx.amount // card·마통 상환 이체
    return sum
  }, 0)
  const loanProjections = loanAssets.map(asset => {
    const payoff = estimateLoanPayoff({
      balance: balanceAsOf(asset),
      annualInterestRate: asset.interest_rate ?? 0,
      monthlyPayment: asset.monthly_payment ?? 0,
      paymentDay: asset.payment_day ?? 0,
      fromDate: reportDateKey,
    })
    return { monthlyPayment: asset.monthly_payment ?? 0, estimatedMonths: payoff.estimatedMonths }
  })
  // 보고월로부터 offset개월 뒤 미래 달의 투영 대출상환 — 완납 추정(estimatedMonths) 이내 달에만 월상환 계상. null(추정불가)은 지속 상환으로 본다.
  const projectedLoanPayments = (offset: number): number => loanProjections.reduce((sum, p) => {
    if (p.monthlyPayment <= 0) return sum
    if (p.estimatedMonths === null || offset <= p.estimatedMonths) return sum + p.monthlyPayment
    return sum
  }, 0)

  const annualOutlook = Array.from({ length: 12 }, (_, index) => {
    const targetMonth = index + 1
    const range = getMonthRange(year, targetMonth, monthStartDay)
    const monthTransactions = annualTransactions.filter(tx => inRange(tx.date, range.from, range.to))
    const actualIncome = monthTransactions.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0)
    const actualOutflow = getOutflowAmount(monthTransactions)
    const budgetedExpense = categories
      .filter(category => category.type === 'expense')
      .reduce((sum, category) => sum + getBudgetForMonth(budgets, category.id, year, targetMonth), 0)
    // 과거·현재 달(targetMonth ≤ 보고월): 실제 부채상환. 미래 달: 완납추정 투영. (REPORT_SPEC §7)
    const loanPayments = targetMonth <= month
      ? actualDebtPayments(monthTransactions)
      : projectedLoanPayments(targetMonth - month)
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
  // 비상자금 개월수 = 유동자산 / 3개월 평균 지출(expense3mAvg). 분자는 유동자산만(REPORT_SPEC §5a),
  // 분모는 단일 월이 아닌 3개월 평균이라 희소한 달의 분모 폭증을 막고 summary의 3개월 rolling과 일관.
  const emergencyFundMonthsValue = expense3mAvg > 0 ? liquidAssets / expense3mAvg : null
  // 총부채상환비율 = 월 부채상환액 / 월 총소득. 카드 결제는 별도 거래로 모델링되지 않아
  // 현재 추적 가능한 월 부채상환액 = loan_repayment 합(loanRepayment)으로 근사한다.
  const debtServiceRatioValue = income > 0 ? ratio(loanRepayment, income) : null
  const budgetUsageRateValue = totalBudget > 0 ? ratio(expense, totalBudget) : null
  const fixedCostRateValue = income > 0 ? ratio(recurringOutflowThisMonth, income) : null
  const overBudgetCategories = categoryAnalysis.filter(row => row.overBudget && row.budgetRate !== null)
  const highInterestLoanRow = loans.find(loan => loan.priority === 'high_interest' && loan.balance > 0)
  const highInterestLoan = highInterestLoanRow
    ? { name: highInterestLoanRow.name, interestRate: highInterestLoanRow.interestRate, balance: highInterestLoanRow.balance }
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
    income,
    expense,
    outflow,
    balance,
    previousExpense,
    savingsRate,
    emergencyFundMonths: emergencyFundMonthsValue,
    emergencyFundExpenseBase: expense3mAvg,
    debtRatio: debtRatioValue,
    expenseChangeRate: expenseChangeRateValue,
    incomeChangeRate: changeRate(income, previousIncome),
    netWorth,
    netWorthChange,
    avgMonthlySavings,
    categoryAnalysis,
    highInterestLoan,
    savingsGoals: savingsGoalsReport,
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
      pointInTimeUncertain,
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
