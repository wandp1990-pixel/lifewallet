import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

function parseBudgetInput(body: Record<string, unknown>) {
  const year = Number(body.year)
  const month = Number(body.month)
  const categoryId = String(body.category_id ?? '').trim()
  const amount = Number(body.amount)

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: '연도를 확인해주세요' }
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: '월을 확인해주세요' }
  }
  if (!categoryId) {
    return { error: '카테고리를 선택해주세요' }
  }
  if (!Number.isInteger(amount) || amount < 0) {
    return { error: '예산 금액을 확인해주세요' }
  }

  return { year, month, categoryId, amount }
}

async function validateExpenseCategory(categoryId: string) {
  const category = await db.execute({
    sql: "SELECT id FROM categories WHERE id = ? AND type = 'expense'",
    args: [categoryId],
  })
  return category.rows.length > 0
}

export async function GET() {
  const rows = await db.execute('SELECT * FROM budgets')
  return NextResponse.json(rows.rows, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = parseBudgetInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { year, month, categoryId, amount } = parsed
  if (!(await validateExpenseCategory(categoryId))) {
    return NextResponse.json({ error: '지출 카테고리를 찾을 수 없습니다' }, { status: 400 })
  }

  await db.execute({
    sql: 'INSERT INTO budgets (year,month,category_id,amount) VALUES (?,?,?,?) ON CONFLICT(year,month,category_id) DO UPDATE SET amount=excluded.amount',
    args: [year, month, categoryId, amount],
  })

  return NextResponse.json({ year, month, category_id: categoryId, amount })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const parsed = parseBudgetInput({ ...body, amount: 0 })
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { year, month, categoryId } = parsed
  await db.execute({
    sql: 'DELETE FROM budgets WHERE year = ? AND month = ? AND category_id = ?',
    args: [year, month, categoryId],
  })

  return NextResponse.json({ ok: true, year, month, category_id: categoryId })
}
