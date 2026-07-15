import { NextRequest, NextResponse } from 'next/server'
import db, { applyTransactionBalance } from '@/lib/db'
import { clampLoanRepaymentToBalance, getDebtBalance, normalizeAssetBalance, validateTransactionInput } from '@/lib/finance'
import { getDateInDisplayMonth } from '@/lib/monthStart'
import { generateId } from '@/lib/utils'
import type { Asset, Category, Transaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const targetMonth: string = body.month // "2026-05"
  const monthStartDay = Number(body.month_start_day ?? body.monthStartDay ?? 1)

  const result = await db.execute({ sql: 'SELECT * FROM recurring_transactions WHERE id=?', args: [id] })
  if (!result.rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const r = result.rows[0] as Record<string, unknown>

  // 이미 이번 달 적용됨
  if (r.last_applied_month === targetMonth) {
    return NextResponse.json({ error: '이미 이번 달에 적용되었습니다' }, { status: 400 })
  }

  // 적용일: 화면의 회계월 안에 들어오는 day_of_month
  const dayOfMonth = r.day_of_month as number
  const [yyyy, mm] = targetMonth.split('-')
  const appliedDate = getDateInDisplayMonth(Number(yyyy), Number(mm), dayOfMonth, monthStartDay)

  const t: Transaction = {
    id: generateId('txn'),
    date: appliedDate,
    type: r.type as Transaction['type'],
    amount: r.amount as number,
    category_id: r.category_id as string,
    asset_id: r.asset_id as string,
    content: r.content as string,
    note: r.note as string,
    from_asset_id: r.from_asset_id as string,
    to_asset_id: r.to_asset_id as string,
    fee: r.fee as number,
    created_at: new Date().toISOString(),
  }

  const assets = (await db.execute({ sql: 'SELECT id, group_type, visible, balance FROM assets' })).rows as unknown as Pick<Asset, 'id' | 'group_type' | 'visible' | 'balance'>[]
  const categories = (await db.execute({ sql: 'SELECT id, type, visible FROM categories' })).rows as unknown as Pick<Category, 'id' | 'type' | 'visible'>[]

  // 반복 대출 상환도 원금이 남은 잔액을 초과하면 잘라 정확히 완제(잔액 0)되게 보정한다.
  if (t.type === 'loan_repayment') {
    const loan = assets.find(a => a.id === t.to_asset_id)
    if (loan) {
      const outstanding = getDebtBalance(normalizeAssetBalance(loan.group_type, Number(loan.balance ?? 0)))
      const clamped = clampLoanRepaymentToBalance(t, outstanding)
      t.amount = clamped.amount
      t.fee = clamped.fee
    }
  }

  const validationError = validateTransactionInput(t, assets, categories, [String(r.category_id ?? '')])
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  await db.execute({
    sql: `INSERT INTO transactions (id,date,type,amount,category_id,asset_id,content,note,from_asset_id,to_asset_id,fee,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [t.id, t.date, t.type, t.amount, t.category_id, t.asset_id, t.content, t.note, t.from_asset_id, t.to_asset_id, t.fee, t.created_at],
  })
  await applyTransactionBalance(t)

  await db.execute({
    sql: 'UPDATE recurring_transactions SET last_applied_month=? WHERE id=?',
    args: [targetMonth, id],
  })

  return NextResponse.json({ transaction: t, applied_month: targetMonth }, { status: 201 })
}
