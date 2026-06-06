import { NextRequest } from 'next/server'
import db, { initDb, rowToAsset } from '@/lib/db'
import { getMonthRange } from '@/lib/monthStart'
import { buildMonthlyReport } from '@/lib/report'
import { streamFinancialReport, validateGeneratedReport } from '@/lib/ai-report'
import { generateId } from '@/lib/utils'
import type { Budget, Category, RecurringTransaction, SavingsGoal, Transaction, WishlistItem } from '@/lib/types'

export const dynamic = 'force-dynamic'
// Gemini 스트리밍 응답 최대 대기 — 재무 분석은 긴 텍스트라 넉넉히 설정
export const maxDuration = 60

function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
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

export async function POST(req: NextRequest) {
  const body = await req.json()
  const year = Number(body.year)
  const month = Number(body.month)
  const monthStartDay = Number(body.monthStartDay ?? 1)

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return new Response('연·월을 확인해주세요', { status: 400 })
  }

  await initDb()

  const currentRange = getMonthRange(year, month, monthStartDay)
  const previous = previousMonth(year, month)
  const previousRange = getMonthRange(previous.year, previous.month, monthStartDay)
  const previousPrevious = previousMonth(previous.year, previous.month)
  const previousPreviousRange = getMonthRange(previousPrevious.year, previousPrevious.month, monthStartDay)
  const annualFrom = getMonthRange(year, 1, monthStartDay).from
  const annualTo = getMonthRange(year, 12, monthStartDay).to

  const [
    transactionRows, previousTransactionRows, previousPreviousTransactionRows,
    annualTransactionRows, laterTransactionRows,
    categoryRows, budgetRows, assetRows, savingRows, wishlistRows, recurringRows,
  ] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC', args: [currentRange.from, currentRange.to] }),
    db.execute({ sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC', args: [previousRange.from, previousRange.to] }),
    db.execute({ sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC', args: [previousPreviousRange.from, previousPreviousRange.to] }),
    db.execute({ sql: 'SELECT * FROM transactions WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC', args: [annualFrom, annualTo] }),
    db.execute({ sql: 'SELECT * FROM transactions WHERE date > ? ORDER BY date ASC, created_at ASC', args: [currentRange.to] }),
    db.execute('SELECT id,type,name,icon,ord as "order",visible,is_system,essentiality,budget_excluded FROM categories ORDER BY ord ASC'),
    db.execute('SELECT * FROM budgets'),
    db.execute('SELECT * FROM assets ORDER BY ord ASC'),
    db.execute('SELECT * FROM savings_goals ORDER BY created_at DESC'),
    db.execute('SELECT * FROM wishlist ORDER BY created_at DESC'),
    db.execute('SELECT * FROM recurring_transactions ORDER BY day_of_month ASC, created_at ASC'),
  ])

  const report = buildMonthlyReport({
    year, month, monthStartDay,
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

  // 생성 완료 후 ai_reports에 upsert. 검증 hard fail 시 저장을 건너뛰어 기존 저장본을 보호한다.
  async function saveResult(text: string) {
    const { ok } = validateGeneratedReport(text, report)
    if (!ok) return
    const now = new Date().toISOString()
    await db.execute({
      sql: `INSERT INTO ai_reports (id, year, month, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(year, month) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
      args: [generateId('aireport'), year, month, text, now, now],
    })
  }

  const stream = streamFinancialReport(report, saveResult)
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
  })
}
