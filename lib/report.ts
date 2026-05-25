import { getBudgetForMonth } from './budget'
import { getDebtBalance, getExpenseAmount, getLoanRepaymentAmount, getOutflowAmount } from './finance'
import { getMonthRange } from './monthStart'
import type { Asset, Budget, Category, RecurringTransaction, SavingsGoal, Transaction, WishlistItem } from './types'

export interface MonthlyReportInput {
  year: number
  month: number
  monthStartDay: number
  transactions: Transaction[]
  previousTransactions: Transaction[]
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
    }[]
    totalCurrent: number
    totalTarget: number
  }
  healthMetrics: {
    savingsRate: number | null
    outflowRate: number | null
    budgetUsageRate: number | null
    debtRatio: number | null
    fixedCostRate: number | null
    emergencyFundMonths: number | null
  }
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
  events: string[]
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

function getCategoryName(categoryId: string, categories: Category[]) {
  const category = categories.find(c => c.id === categoryId)
  return {
    name: category?.name ?? '미분류',
    icon: category?.icon ?? '📦',
  }
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const { year, month, monthStartDay, transactions, previousTransactions, annualTransactions, categories, budgets, assets, savingsGoals, wishlist, recurringTransactions } = input
  const { from, to } = getMonthRange(year, month, monthStartDay)
  const previous = previousMonth(year, month)
  const previousRange = getMonthRange(previous.year, previous.month, monthStartDay)

  const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const expense = getExpenseAmount(transactions)
  const loanRepayment = getLoanRepaymentAmount(transactions)
  const outflow = getOutflowAmount(transactions)
  const previousIncome = previousTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const previousExpense = getExpenseAmount(previousTransactions)
  const balance = income - outflow
  const savingsRate = income > 0 ? ratio(balance, income) : null
  const outflowRate = income > 0 ? ratio(outflow, income) : null

  const expenseByCategory = new Map<string, { amount: number; count: number }>()
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const current = expenseByCategory.get(tx.category_id) ?? { amount: 0, count: 0 }
    expenseByCategory.set(tx.category_id, { amount: current.amount + tx.amount, count: current.count + 1 })
  }

  const categoryAnalysis = [...expenseByCategory.entries()]
    .map(([categoryId, value]) => {
      const budget = getBudgetForMonth(budgets, categoryId, year, month)
      const category = getCategoryName(categoryId, categories)
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
      }
    })
    .sort((a, b) => b.amount - a.amount)

  const loanTransactions = transactions.filter(t => t.type === 'loan_repayment')
  const loanAssets = assets.filter(asset => asset.group_type === 'loan')
  const loans = loanAssets.map(asset => {
    const related = loanTransactions.filter(tx => tx.to_asset_id === asset.id)
    const paidThisMonth = related.reduce((sum, tx) => sum + tx.amount, 0)
    const interestThisMonth = related.reduce((sum, tx) => sum + (tx.fee ?? 0), 0)
    const balanceValue = getDebtBalance(asset.balance)
    const monthlyPayment = asset.monthly_payment ?? 0
    const interestRate = asset.interest_rate ?? 0
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
      priority,
    }
  }).sort((a, b) => b.interestRate - a.interestRate || a.balance - b.balance)

  const reportDate = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00`)
  const savingsGoalsReport = savingsGoals.map(goal => {
    const remainingAmount = Math.max(goal.target_amount - goal.current_amount, 0)
    const requiredMonthlySavings = goal.target_date
      ? Math.ceil(remainingAmount / monthsBetween(reportDate, new Date(`${goal.target_date}T00:00:00`)))
      : null
    return {
      id: goal.id,
      name: goal.name,
      currentAmount: goal.current_amount,
      targetAmount: goal.target_amount,
      progress: ratio(goal.current_amount, goal.target_amount),
      targetDate: goal.target_date,
      remainingAmount,
      requiredMonthlySavings,
    }
  })

  const totalBudget = categories
    .filter(category => category.type === 'expense')
    .reduce((sum, category) => sum + getBudgetForMonth(budgets, category.id, year, month), 0)
  const totalAssets = assets
    .filter(asset => !['card', 'minus_account', 'loan', 'insurance'].includes(asset.group_type))
    .reduce((sum, asset) => sum + Math.max(asset.balance, 0), 0)
  const totalDebt = assets
    .filter(asset => ['card', 'minus_account', 'loan', 'insurance'].includes(asset.group_type))
    .reduce((sum, asset) => sum + getDebtBalance(asset.balance), 0)
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

  const events = [
    ...categoryAnalysis.filter(row => row.overBudget).map(row => `${row.name}이 예산의 ${Math.round(row.budgetRate ?? 0)}%를 사용했습니다.`),
    ...(balance < 0 ? ['이번 달 잔액이 음수입니다. 소비 지출과 대출 상환 부담을 확인해야 합니다.'] : []),
    ...(changeRate(expense, previousExpense) !== null && (changeRate(expense, previousExpense) ?? 0) >= 25
      ? [`소비 지출이 전월 대비 ${Math.round(changeRate(expense, previousExpense) ?? 0)}% 증가했습니다.`]
      : []),
    ...(savingsRate !== null && savingsRate < 0 ? ['저축률이 음수입니다.'] : []),
  ].slice(0, 8)

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
      expenseChangeRate: changeRate(expense, previousExpense),
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
    },
    healthMetrics: {
      savingsRate,
      outflowRate,
      budgetUsageRate: totalBudget > 0 ? ratio(expense, totalBudget) : null,
      debtRatio: totalAssets > 0 ? ratio(totalDebt, totalAssets) : null,
      fixedCostRate: income > 0 ? ratio(recurringOutflowThisMonth, income) : null,
      emergencyFundMonths: expense > 0 ? totalAssets / expense : null,
    },
    nextMonthForecast: {
      year: next.year,
      month: next.month,
      recurringOutflow: nextRecurringExpenses + nextRecurringLoanPayments,
      loanPayments: nextLoanPayments,
      budgetedExpense: nextBudgetedExpense,
      plannedExpense: nextBaseExpense,
      wishlistEvents: nextWishlistAmount,
      totalPlannedOutflow: nextBaseExpense + nextLoanPayments + nextWishlistAmount,
      items: [...forecastBreakdown, ...nextItems],
    },
    events,
    cashflowTimeline,
    annualOutlook,
  }
}
