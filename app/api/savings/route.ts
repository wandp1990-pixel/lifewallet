import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateId } from '@/lib/utils'
import type { SavingsGoal } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await db.execute('SELECT * FROM savings_goals ORDER BY created_at DESC')
  return NextResponse.json(rows.rows, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: '목표 이름을 입력해주세요' }, { status: 400 })

  const g: SavingsGoal = {
    id: generateId('sav'),
    name: body.name,
    target_amount: body.target_amount ?? 0,
    current_amount: body.current_amount ?? 0,
    target_date: body.target_date ?? '',
    asset_id: body.asset_id ?? '',
    memo: body.memo ?? '',
    created_at: new Date().toISOString(),
  }

  await db.execute({
    sql: 'INSERT INTO savings_goals (id,name,target_amount,current_amount,target_date,asset_id,memo,created_at) VALUES (?,?,?,?,?,?,?,?)',
    args: [g.id, g.name, g.target_amount, g.current_amount, g.target_date, g.asset_id, g.memo, g.created_at],
  })

  return NextResponse.json(g, { status: 201 })
}
