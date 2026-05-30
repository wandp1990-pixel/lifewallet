'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getDisplayMonth, getMonthRange, getMonthStartDay } from './monthStart'
import type { Transaction, Category, Asset, Budget, SavingsGoal, WishlistItem, Memo } from './types'

interface StoreState {
  transactions: Transaction[]
  categories: Category[]
  assets: Asset[]
  budgets: Budget[]
  savingsGoals: SavingsGoal[]
  wishlist: WishlistItem[]
  memos: Memo[]
  ready: boolean
}

interface StoreActions {
  addTransaction: (t: Transaction) => void
  updateTransaction: (t: Transaction) => void
  deleteTransaction: (id: string) => void

  addAsset: (a: Asset) => void
  updateAsset: (a: Asset) => void
  deleteAsset: (id: string) => void
  reorderAssets: (assets: Asset[]) => void

  addCategory: (c: Category) => void
  updateCategory: (c: Category) => void
  deleteCategory: (id: string) => void
  reorderCategories: (categories: Category[]) => void

  setBudget: (b: Budget) => void
  deleteBudget: (year: number, month: number, categoryId: string) => void

  addSavingsGoal: (g: SavingsGoal) => void
  updateSavingsGoal: (g: SavingsGoal) => void
  deleteSavingsGoal: (id: string) => void

  addWishlistItem: (w: WishlistItem) => void
  updateWishlistItem: (w: WishlistItem) => void
  deleteWishlistItem: (id: string) => void

  addMemo: (m: Memo) => void
  updateMemo: (m: Memo) => void
  deleteMemo: (id: string) => void

  refresh: () => Promise<void>
}

const StoreContext = createContext<(StoreState & StoreActions) | null>(null)

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch error: ${url}`)
  return res.json()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>({
    transactions: [],
    categories: [],
    assets: [],
    budgets: [],
    savingsGoals: [],
    wishlist: [],
    memos: [],
    ready: false,
  })

  const refresh = async () => {
    const now = new Date()
    const monthStartDay = getMonthStartDay()
    const { year, month } = getDisplayMonth(now, monthStartDay)
    const { from, to } = getMonthRange(year, month, monthStartDay)
    const [transactions, categories, assets, budgets, savingsGoals, wishlist, memos] = await Promise.all([
      fetchJson<Transaction[]>(`/api/transactions?from=${from}&to=${to}`),
      fetchJson<Category[]>('/api/categories'),
      fetchJson<Asset[]>('/api/assets'),
      fetchJson<Budget[]>('/api/budget'),
      fetchJson<SavingsGoal[]>('/api/savings'),
      fetchJson<WishlistItem[]>('/api/wishlist'),
      fetchJson<Memo[]>('/api/memos'),
    ])
    setState({ transactions, categories, assets, budgets, savingsGoals, wishlist, memos, ready: true })
  }

  useEffect(() => { refresh() }, [])

  const actions: StoreActions = {
    addTransaction: (t) => setState(s => ({ ...s, transactions: [t, ...s.transactions] })),
    updateTransaction: (t) => setState(s => ({ ...s, transactions: s.transactions.map(x => x.id === t.id ? t : x) })),
    deleteTransaction: (id) => setState(s => ({ ...s, transactions: s.transactions.filter(x => x.id !== id) })),

    addAsset: (a) => setState(s => ({ ...s, assets: [...s.assets, a] })),
    updateAsset: (a) => setState(s => ({ ...s, assets: s.assets.map(x => x.id === a.id ? a : x) })),
    deleteAsset: (id) => setState(s => ({ ...s, assets: s.assets.filter(x => x.id !== id) })),
    reorderAssets: (assets) => setState(s => ({ ...s, assets })),

    addCategory: (c) => setState(s => ({ ...s, categories: [...s.categories, c] })),
    updateCategory: (c) => setState(s => ({ ...s, categories: s.categories.map(x => x.id === c.id ? c : x) })),
    deleteCategory: (id) => setState(s => ({ ...s, categories: s.categories.filter(x => x.id !== id) })),
    reorderCategories: (categories) => setState(s => ({ ...s, categories })),

    setBudget: (b) => setState(s => ({
      ...s,
      budgets: s.budgets.some(x => x.year === b.year && x.month === b.month && x.category_id === b.category_id)
        ? s.budgets.map(x => x.year === b.year && x.month === b.month && x.category_id === b.category_id ? b : x)
        : [...s.budgets, b],
    })),
    deleteBudget: (year, month, categoryId) => setState(s => ({
      ...s,
      budgets: s.budgets.filter(x => !(x.year === year && x.month === month && x.category_id === categoryId)),
    })),

    addSavingsGoal: (g) => setState(s => ({ ...s, savingsGoals: [...s.savingsGoals, g] })),
    updateSavingsGoal: (g) => setState(s => ({ ...s, savingsGoals: s.savingsGoals.map(x => x.id === g.id ? g : x) })),
    deleteSavingsGoal: (id) => setState(s => ({ ...s, savingsGoals: s.savingsGoals.filter(x => x.id !== id) })),

    addWishlistItem: (w) => setState(s => ({ ...s, wishlist: [...s.wishlist, w] })),
    updateWishlistItem: (w) => setState(s => ({ ...s, wishlist: s.wishlist.map(x => x.id === w.id ? w : x) })),
    deleteWishlistItem: (id) => setState(s => ({ ...s, wishlist: s.wishlist.filter(x => x.id !== id) })),

    addMemo: (m) => setState(s => ({ ...s, memos: [m, ...s.memos] })),
    updateMemo: (m) => setState(s => ({ ...s, memos: s.memos.map(x => x.id === m.id ? m : x) })),
    deleteMemo: (id) => setState(s => ({ ...s, memos: s.memos.filter(x => x.id !== id) })),

    refresh,
  }

  return <StoreContext.Provider value={{ ...state, ...actions }}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
