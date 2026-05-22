import { NextResponse } from 'next/server'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await db.execute({
    sql: `SELECT content, COUNT(*) as cnt FROM transactions
          WHERE content != ''
          GROUP BY content
          ORDER BY cnt DESC
          LIMIT 50`,
    args: [],
  })
  return NextResponse.json(rows.rows.map(r => r.content as string))
}
