export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'loan_repayment'
  | 'asset'

export type AssetGroupType =
  | 'cash' | 'bank' | 'card' | 'check_card' | 'prepaid_card'
  | 'savings' | 'investment' | 'minus_account' | 'loan' | 'insurance' | 'other'

export interface Transaction {
  id: string
  date: string
  type: TransactionType
  amount: number
  category_id: string
  asset_id: string
  content: string
  note: string
  from_asset_id: string
  to_asset_id: string
  fee: number
  created_at: string
}

// 50/30/20 + 카케이보 4분류. expense 카테고리에만 의미 있음 (income/asset은 'wants' 기본값 유지·보고서 미사용)
export type Essentiality = 'needs' | 'wants' | 'savings' | 'unexpected'

export interface Category {
  id: string
  type: 'income' | 'expense' | 'asset'
  name: string
  icon: string
  order: number
  visible: boolean
  is_system: boolean
  essentiality: Essentiality
}

export interface Asset {
  id: string
  group_type: AssetGroupType
  group_name: string
  name: string
  balance: number
  balance_date: string
  order: number
  visible: boolean
  track_detail: boolean
  principal?: number
  interest_rate?: number
  start_date?: string
  end_date?: string
  payment_day?: number
  monthly_payment?: number
}

export interface Budget {
  year: number
  month: number
  category_id: string
  amount: number
}

export interface SavingsGoal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  target_date: string
  asset_id: string
  memo: string
  created_at: string
}

export interface WishlistItem {
  id: string
  type: 'wish' | 'event'
  name: string
  price: number
  priority: 1 | 2 | 3
  target_date: string
  is_done: boolean
  memo: string
  created_at: string
}

export interface Memo {
  id: string
  date: string       // YYYY-MM-DD, '' 가능 ('' = 날짜 없음)
  title: string
  content: string
  color: string      // '' = 기본(서피스), 그 외 파스텔 hex
  pinned: boolean
  created_at: string
}

export interface RecurringTransaction {
  id: string
  type: TransactionType
  amount: number
  category_id: string
  asset_id: string
  from_asset_id: string
  to_asset_id: string
  content: string
  note: string
  fee: number
  day_of_month: number
  enabled: boolean
  last_applied_month: string
  created_at: string
}
