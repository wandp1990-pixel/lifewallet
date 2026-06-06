import { NextRequest, NextResponse } from 'next/server'
import db, { initDb, rowToAsset } from '@/lib/db'
import { getMonthRange } from '@/lib/monthStart'
import { buildMonthlyReport } from '@/lib/report'
import type { Budget, Category, RecurringTransaction, SavingsGoal, Transaction, WishlistItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

function parseInteger(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function rowToRecurring(row: Record<string, unknown>): RecurringTransaction {
  return {
    id: row.id as string,
    type: row.type as RecurringTransaction['type'],
    amount: Number(row.amount ?? 0),
    category_id: row.category_id as string,
    asset_id: row.asset_id as string,
    from_asset_id: row.from_asset_id as string,
    to_asset_id: row.to_asset_id as string,
    content: row.content as string,
    note: row.note as string,
    fee: Number(row.fee ?? 0),
    day_of_month: Number(row.day_of_month ?? 1),
    enabled: Boolean(row.enabled),
    last_applied_month: row.last_applied_month as string,
    created_at: row.created_at as string,
  }
}

export async function GET(req: NextRequest) {
  await initDb()

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const year = parseInteger(searchParams.get('year'), now.getFullYear())
  const month = parseInteger(searchParams.get('month'), now.getMonth() + 1)
  const monthStartDay = parseInteger(searchParams.get('monthStartDay'), 1)

  if (month < 1 || month > 12 || monthStartDay < 1 || monthStartDay > 28) {
    return NextResponse.json({ error: '보고서 기준 월을 확인해주세요' }, { status: 400 })
  }

  const currentRange = getMonthRange(year, month, monthStartDay)
  const previous = previousMonth(year, month)
  const previousRange = getMonthRange(previous.year, previous.month, monthStartDay)
  const previousPrevious = previousMonth(previous.year, previous.month)
  const previousPreviousRange = getMonthRange(previousPrevious.year, previousPrevious.month, monthStartDay)
  const annualFrom = getMonthRange(year, 1, monthStartDay).from
  const annualTo = getMonthRange(year, 12, monthStartDay).to

  const [
    transactionRows,
    previousTransactionRows,
    previousPreviousTransactionRows,
    annualTransactionRows,
    laterTransactionRows,
    categoryRows,
    budgetRows,
    assetRows,
    savingRows,
    wishlistRows,
    recurringRows,
  ] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC', args: [currentRange.from, currentRange.to] }),
    db.execute({ sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC', args: [previousRange.from, previousRange.to] }),
    db.execute({ sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC', args: [previousPreviousRange.from, previousPreviousRange.to] }),
    db.execute({ sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC', args: [annualFrom, annualTo] }),
    // 보고 월 말 이후 ~ 현재까지 모든 거래 — 시점 잔액 복원용 (lib/report.ts reconstructBalanceAsOf)
    db.execute({ sql: 'SELECT * FROM transactions WHERE date > ? ORDER BY date ASC, created_at ASC', args: [currentRange.to] }),
    db.execute('SELECT id,type,name,icon,ord as "order",visible,is_system,essentiality,budget_excluded FROM categories ORDER BY ord ASC'),
    db.execute('SELECT * FROM budgets'),
    db.execute('SELECT * FROM assets ORDER BY ord ASC'),
    db.execute('SELECT * FROM savings_goals ORDER BY created_at DESC'),
    db.execute('SELECT * FROM wishlist ORDER BY created_at DESC'),
    db.execute('SELECT * FROM recurring_transactions ORDER BY day_of_month ASC, created_at ASC'),
  ])

  const report = buildMonthlyReport({
    year,
    month,
    monthStartDay,
    transactions: transactionRows.rows as unknown as Transaction[],
    previousTransactions: previousTransactionRows.rows as unknown as Transaction[],
    previousPreviousTransactions: previousPreviousTransactionRows.rows as unknown as Transaction[],
    annualTransactions: annualTransactionRows.rows as unknown as Transaction[],
    laterTransactions: laterTransactionRows.rows as unknown as Transaction[],
    categories: categoryRows.rows.map(row => ({
      ...(row as unknown as Category),
      visible: Boolean((row as Record<string, unknown>).visible),
      is_system: Boolean((row as Record<string, unknown>).is_system),
      budget_excluded: Boolean((row as Record<string, unknown>).budget_excluded),
    })),
    budgets: budgetRows.rows as unknown as Budget[],
    assets: assetRows.rows.map(rowToAsset),
    savingsGoals: savingRows.rows as unknown as SavingsGoal[],
    wishlist: wishlistRows.rows.map(row => ({ ...(row as unknown as WishlistItem), is_done: Boolean((row as Record<string, unknown>).is_done) })),
    recurringTransactions: recurringRows.rows.map(rowToRecurring),
  })

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
}
