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

// 일시적 실패(Turso 콜드스타트·순간 네트워크 끊김)를 짧은 재시도로 흡수한다.
// 이게 없으면 한 번의 순간 실패가 Promise.allSettled에서 영구 빈 데이터로 고착된다. → LF3
async function fetchJson<T>(url: string, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`fetch error: ${url} (${res.status})`)
      return res.json()
    } catch (err) {
      if (attempt >= retries) throw err
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
    }
  }
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

  // allSettled로 부분 실패를 허용한다: 7개 중 하나가 끝까지 실패해도 나머지는 반영하고,
  // 실패 항목은 빈 배열로 덮어쓰지 않고 이전 상태를 유지한다. 실패가 남으면 백그라운드에서
  // 자가 복구를 시도한다(최대 3회). → LF3
  const load = async (retriesLeft = 3): Promise<void> => {
    const now = new Date()
    const monthStartDay = getMonthStartDay()
    const { year, month } = getDisplayMonth(now, monthStartDay)
    const { from, to } = getMonthRange(year, month, monthStartDay)
    const results = await Promise.allSettled([
      fetchJson<Transaction[]>(`/api/transactions?from=${from}&to=${to}`),
      fetchJson<Category[]>('/api/categories'),
      fetchJson<Asset[]>('/api/assets'),
      fetchJson<Budget[]>('/api/budget'),
      fetchJson<SavingsGoal[]>('/api/savings'),
      fetchJson<WishlistItem[]>('/api/wishlist'),
      fetchJson<Memo[]>('/api/memos'),
    ])
    const [txR, catR, astR, budR, savR, wishR, memoR] = results
    setState(s => ({
      transactions: txR.status === 'fulfilled' ? txR.value : s.transactions,
      categories: catR.status === 'fulfilled' ? catR.value : s.categories,
      assets: astR.status === 'fulfilled' ? astR.value : s.assets,
      budgets: budR.status === 'fulfilled' ? budR.value : s.budgets,
      savingsGoals: savR.status === 'fulfilled' ? savR.value : s.savingsGoals,
      wishlist: wishR.status === 'fulfilled' ? wishR.value : s.wishlist,
      memos: memoR.status === 'fulfilled' ? memoR.value : s.memos,
      ready: true,
    }))
    if (results.some(r => r.status === 'rejected') && retriesLeft > 0) {
      setTimeout(() => { load(retriesLeft - 1) }, 2000)
    }
  }

  const refresh = () => load()

  // 거래 추가/수정/삭제는 서버에서 연결 자산 잔액을 함께 바꾼다(applyTransactionBalance).
  // store의 자산 잔액을 즉시 재동기화하지 않으면, 이후 자산 수정 폼이 낡은 잔액을
  // 프리필→재전송해 방금 거래의 잔액 반영을 "잔액 조정"으로 되돌린다. → DESIGN.md LF7
  const refreshAssets = () => {
    fetchJson<Asset[]>('/api/assets')
      .then(assets => setState(s => ({ ...s, assets })))
      .catch(() => {}) // 실패 시 이전 상태 유지 — 다음 전체 로드에서 회복 (LF3과 동일 원칙)
  }

  useEffect(() => { load() }, [])

  const actions: StoreActions = {
    addTransaction: (t) => { setState(s => ({ ...s, transactions: [t, ...s.transactions] })); refreshAssets() },
    updateTransaction: (t) => { setState(s => ({ ...s, transactions: s.transactions.map(x => x.id === t.id ? t : x) })); refreshAssets() },
    deleteTransaction: (id) => { setState(s => ({ ...s, transactions: s.transactions.filter(x => x.id !== id) })); refreshAssets() },

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
