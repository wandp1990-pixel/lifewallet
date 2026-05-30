import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateId } from '@/lib/utils'
import type { Memo } from '@/lib/types'

export const dynamic = 'force-dynamic'

function rowToMemo(row: Record<string, unknown>): Memo {
  return {
    id: row.id as string,
    date: (row.date as string) ?? '',
    title: (row.title as string) ?? '',
    content: (row.content as string) ?? '',
    color: (row.color as string) ?? '',
    pinned: Boolean(row.pinned),
    created_at: row.created_at as string,
  }
}

export async function GET() {
  const rows = await db.execute('SELECT * FROM memos ORDER BY pinned DESC, date DESC, created_at DESC')
  return NextResponse.json(rows.rows.map(r => rowToMemo(r as Record<string, unknown>)), {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.title?.trim() && !body.content?.trim()) {
    return NextResponse.json({ error: '제목이나 내용을 입력해주세요' }, { status: 400 })
  }

  const m: Memo = {
    id: generateId('memo'),
    date: body.date ?? '',
    title: body.title?.trim() ?? '',
    content: body.content?.trim() ?? '',
    color: body.color ?? '',
    pinned: Boolean(body.pinned),
    created_at: new Date().toISOString(),
  }

  await db.execute({
    sql: 'INSERT INTO memos (id,date,title,content,color,pinned,created_at) VALUES (?,?,?,?,?,?,?)',
    args: [m.id, m.date, m.title, m.content, m.color, m.pinned ? 1 : 0, m.created_at],
  })

  return NextResponse.json(m, { status: 201 })
}
