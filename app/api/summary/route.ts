import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year')
  const month = searchParams.get('month')

  if (!year || !month) return NextResponse.json({ error: 'year, month 파라미터가 필요합니다' }, { status: 400 })

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = `${year}-${String(month).padStart(2, '0')}-31`

  const rows = await db.execute({
    sql: `SELECT
            SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
            SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
          FROM transactions WHERE date >= ? AND date <= ?`,
    args: [from, to],
  })

  const row = rows.rows[0] as Record<string, unknown>
  return NextResponse.json(
    { income: row.income ?? 0, expense: row.expense ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
