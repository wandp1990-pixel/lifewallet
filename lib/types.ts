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

export interface Category {
  id: string
  type: 'income' | 'expense'
  name: string
  icon: string
  order: number
}

export interface Asset {
  id: string
  group_type: AssetGroupType
  group_name: string
  name: string
  balance: number
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
