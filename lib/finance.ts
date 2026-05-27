import type { Asset, AssetGroupType, Category, Transaction, TransactionType } from './types'

export const DEBT_TYPES: AssetGroupType[] = ['card', 'minus_account', 'loan', 'insurance']

export function isDebtAssetType(groupType: AssetGroupType): boolean {
  return DEBT_TYPES.includes(groupType)
}

export function getDebtBalance(balance: number): number {
  return Math.abs(balance)
}

export function normalizeAssetBalance(groupType: AssetGroupType, balance: number): number {
  return isDebtAssetType(groupType) ? -Math.abs(balance) : balance
}

export function isLoanReceivedTransaction(tx: Pick<Transaction, 'type' | 'from_asset_id'>, assets: Pick<Asset, 'id' | 'group_type'>[]): boolean {
  return tx.type === 'transfer' && assets.some(a => a.id === tx.from_asset_id && a.group_type === 'loan')
}

export function isExpenseLikeType(type: TransactionType | string): boolean {
  return type === 'expense' || type === 'loan_repayment'
}

type ValidationAsset = Pick<Asset, 'id' | 'group_type'> & { visible?: boolean | number; balance?: number }
type ValidationCategory = Pick<Category, 'id' | 'type'> & { visible?: boolean | number }

function findAssetType(assetId: string, assets: Pick<Asset, 'id' | 'group_type'>[]): AssetGroupType | null {
  return assets.find(asset => asset.id === assetId)?.group_type ?? null
}

function findAsset(assetId: string, assets: ValidationAsset[]): ValidationAsset | null {
  return assets.find(asset => asset.id === assetId) ?? null
}

function findCategory(categoryId: string, categories: ValidationCategory[]): ValidationCategory | null {
  return categories.find(category => category.id === categoryId) ?? null
}

function isHiddenCategory(category: ValidationCategory): boolean {
  return category.visible === false || category.visible === 0
}

export function getExpenseAmount(transactions: Pick<Transaction, 'type' | 'amount'>[]): number {
  return transactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0)
}

export function getLoanRepaymentAmount(transactions: Pick<Transaction, 'type' | 'amount'>[]): number {
  return transactions
    .filter(tx => tx.type === 'loan_repayment')
    .reduce((sum, tx) => sum + tx.amount, 0)
}

export function getLoanRepaymentPrincipal(
  tx: Pick<Transaction, 'type' | 'amount' | 'fee'>
): number {
  if (tx.type !== 'loan_repayment') return 0
  return tx.amount - (tx.fee ?? 0)
}

export interface LoanPayoffEstimate {
  balance: number
  monthlyInterest: number
  firstPrincipalPayment: number
  estimatedMonths: number | null
  estimatedPayoffDate: string
  totalInterest: number | null
  status: 'paid_off' | 'not_configured' | 'payment_too_low' | 'ok'
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function clampDay(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return Math.min(day, lastDay)
}

function estimatePayoffDate(fromDate: string, months: number, paymentDay?: number): string {
  if (months <= 0) return fromDate
  const base = new Date(`${fromDate}T00:00:00`)
  if (Number.isNaN(base.getTime())) return ''

  const desiredDay = paymentDay && paymentDay >= 1 && paymentDay <= 31
    ? paymentDay
    : base.getDate()
  const firstOffset = paymentDay && base.getDate() > desiredDay ? 1 : 0
  const monthIndex = base.getMonth() + firstOffset + months - 1
  const year = base.getFullYear() + Math.floor(monthIndex / 12)
  const normalizedMonthIndex = ((monthIndex % 12) + 12) % 12
  const day = clampDay(year, normalizedMonthIndex, desiredDay)

  return formatDateKey(new Date(year, normalizedMonthIndex, day))
}

export function estimateLoanPayoff({
  balance,
  annualInterestRate = 0,
  monthlyPayment = 0,
  paymentDay = 0,
  fromDate = new Date().toISOString().slice(0, 10),
}: {
  balance: number
  annualInterestRate?: number
  monthlyPayment?: number
  paymentDay?: number
  fromDate?: string
}): LoanPayoffEstimate {
  const debtBalance = getDebtBalance(balance)
  const monthlyRate = Math.max(annualInterestRate, 0) / 100 / 12
  const monthlyInterest = Math.round(debtBalance * monthlyRate)

  if (debtBalance <= 0) {
    return {
      balance: 0,
      monthlyInterest: 0,
      firstPrincipalPayment: 0,
      estimatedMonths: 0,
      estimatedPayoffDate: fromDate,
      totalInterest: 0,
      status: 'paid_off',
    }
  }

  if (monthlyPayment <= 0) {
    return {
      balance: debtBalance,
      monthlyInterest,
      firstPrincipalPayment: 0,
      estimatedMonths: null,
      estimatedPayoffDate: '',
      totalInterest: null,
      status: 'not_configured',
    }
  }

  const firstPrincipalPayment = Math.min(monthlyPayment - monthlyInterest, debtBalance)
  if (monthlyPayment - monthlyInterest <= 0) {
    return {
      balance: debtBalance,
      monthlyInterest,
      firstPrincipalPayment,
      estimatedMonths: null,
      estimatedPayoffDate: '',
      totalInterest: null,
      status: 'payment_too_low',
    }
  }

  let remaining = debtBalance
  let totalInterest = 0
  let months = 0

  while (remaining > 0 && months < 1200) {
    const interest = Math.round(remaining * monthlyRate)
    const principal = monthlyPayment - interest
    if (principal <= 0) {
      return {
        balance: debtBalance,
        monthlyInterest,
        firstPrincipalPayment,
        estimatedMonths: null,
        estimatedPayoffDate: '',
        totalInterest: null,
        status: 'payment_too_low',
      }
    }
    totalInterest += interest
    remaining -= Math.min(principal, remaining)
    months += 1
  }

  if (remaining > 0) {
    return {
      balance: debtBalance,
      monthlyInterest,
      firstPrincipalPayment,
      estimatedMonths: null,
      estimatedPayoffDate: '',
      totalInterest: null,
      status: 'payment_too_low',
    }
  }

  return {
    balance: debtBalance,
    monthlyInterest,
    firstPrincipalPayment,
    estimatedMonths: months,
    estimatedPayoffDate: estimatePayoffDate(fromDate, months, paymentDay),
    totalInterest,
    status: 'ok',
  }
}

export function getOutflowAmount(transactions: (Pick<Transaction, 'type' | 'amount'> & { fee?: number })[]): number {
  return transactions.reduce((sum, tx) => {
    if (isExpenseLikeType(tx.type)) return sum + tx.amount
    if (tx.type === 'transfer') return sum + (tx.fee ?? 0)
    return sum
  }, 0)
}

export function validateTransactionInput(
  tx: Pick<Transaction, 'type' | 'amount' | 'asset_id' | 'from_asset_id' | 'to_asset_id' | 'category_id'> & { fee?: number },
  assets: ValidationAsset[],
  categories: ValidationCategory[] = [],
  allowedHiddenCategoryIds: string[] = []
) {
  if (!tx.amount || tx.amount <= 0) return '금액은 0보다 커야 합니다'
  if ((tx.fee ?? 0) < 0) return '수수료는 0 이상이어야 합니다'

  if (tx.type === 'income' || tx.type === 'expense' || tx.type === 'asset') {
    if (!tx.asset_id) return '자산을 선택해주세요'
    const asset = findAsset(tx.asset_id, assets)
    if (!asset) return '선택한 자산을 찾을 수 없습니다'
  }

  if (tx.type === 'transfer' || tx.type === 'loan_repayment') {
    if (!tx.from_asset_id || !tx.to_asset_id) return '출금 자산과 입금 자산을 선택해주세요'
    if (tx.from_asset_id === tx.to_asset_id) return '같은 자산끼리는 처리할 수 없습니다'
    const fromAsset = findAsset(tx.from_asset_id, assets)
    const toAsset = findAsset(tx.to_asset_id, assets)
    if (!fromAsset || !toAsset) return '선택한 자산을 찾을 수 없습니다'
  }

  const fromAssetType = tx.from_asset_id ? findAssetType(tx.from_asset_id, assets) : null
  const toAssetType = tx.to_asset_id ? findAssetType(tx.to_asset_id, assets) : null

  if (tx.type === 'loan_repayment') {
    const interestAmount = tx.fee ?? 0
    if (interestAmount > tx.amount) return '이자는 상환 금액보다 클 수 없습니다'
    if (toAssetType !== 'loan') return '대출 상환 대상은 대출 자산이어야 합니다'
    if (!fromAssetType || isDebtAssetType(fromAssetType)) return '대출 상환 출금 계좌는 일반 자산이어야 합니다'

    const loanAsset = findAsset(tx.to_asset_id, assets)
    const principalAmount = tx.amount - interestAmount
    if (loanAsset?.balance !== undefined && principalAmount > getDebtBalance(loanAsset.balance)) {
      return '상환 원금은 남은 대출 잔액을 초과할 수 없습니다'
    }
  }

  if (tx.type === 'transfer') {
    if (fromAssetType !== 'loan' && toAssetType === 'loan') {
      return '대출 계좌로 보내는 거래는 대출 상환으로 입력해주세요'
    }
    if (fromAssetType === 'loan' && toAssetType === 'loan') {
      return '대출 계좌끼리 직접 이체할 수 없습니다'
    }
    if (fromAssetType === 'loan' && toAssetType && isDebtAssetType(toAssetType)) {
      return '대출금 수령 계좌는 일반 자산이어야 합니다'
    }
  }

  if ((tx.type === 'income' || tx.type === 'expense') && !tx.category_id) {
    return '분류를 선택해주세요'
  }

  if (tx.type === 'income' || tx.type === 'expense') {
    const category = findCategory(tx.category_id, categories)
    if (!category) return '선택한 분류를 찾을 수 없습니다'
    if (category.type !== tx.type) return '분류 유형이 맞지 않습니다'
    if (isHiddenCategory(category) && !allowedHiddenCategoryIds.includes(category.id)) {
      return '숨긴 분류에는 새 거래를 입력할 수 없습니다'
    }
  }

  return null
}
