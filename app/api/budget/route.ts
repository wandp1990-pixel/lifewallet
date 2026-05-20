import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await db.execute('SELECT * FROM budgets')
  return NextResponse.json(rows.rows, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { year, month, category_id, amount } = body

  await db.execute({
    sql: 'INSERT INTO budgets (year,month,category_id,amount) VALUES (?,?,?,?) ON CONFLICT(year,month,category_id) DO UPDATE SET amount=excluded.amount',
    args: [year, month, category_id, amount],
  })

  return NextResponse.json({ year, month, category_id, amount })
}
