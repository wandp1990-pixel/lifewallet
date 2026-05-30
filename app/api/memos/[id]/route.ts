import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import type { Memo } from '@/lib/types'

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM memos WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 메모를 찾을 수 없습니다' }, { status: 404 })

  // date·title·content·color는 '' 설정을 허용해야 하므로 undefined만 null로 (COALESCE 유지)
  const pinnedArg = body.pinned === undefined ? null : (body.pinned ? 1 : 0)
  await db.execute({
    sql: `UPDATE memos SET date=COALESCE(?,date), title=COALESCE(?,title),
          content=COALESCE(?,content), color=COALESCE(?,color), pinned=COALESCE(?,pinned) WHERE id=?`,
    args: [
      body.date ?? null,
      body.title ?? null,
      body.content ?? null,
      body.color ?? null,
      pinnedArg,
      id,
    ],
  })

  const updated = await db.execute({ sql: 'SELECT * FROM memos WHERE id = ?', args: [id] })
  return NextResponse.json(rowToMemo(updated.rows[0] as Record<string, unknown>))
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT * FROM memos WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 메모를 찾을 수 없습니다' }, { status: 404 })

  await db.execute({ sql: 'DELETE FROM memos WHERE id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
