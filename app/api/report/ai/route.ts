import { NextRequest, NextResponse } from 'next/server'
import db, { initDb } from '@/lib/db'
import { generateId } from '@/lib/utils'
import type { AiReport } from '@/lib/types'

export const dynamic = 'force-dynamic'

function rowToAiReport(row: Record<string, unknown>): AiReport {
  return {
    id: row.id as string,
    year: Number(row.year),
    month: Number(row.month),
    content: (row.content as string) ?? '',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function parseYearMonth(searchParams: URLSearchParams): { year: number; month: number } | null {
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

export async function GET(req: NextRequest) {
  await initDb()
  const ym = parseYearMonth(new URL(req.url).searchParams)
  if (!ym) return NextResponse.json({ error: '연·월을 확인해주세요' }, { status: 400 })

  const rows = await db.execute({
    sql: 'SELECT * FROM ai_reports WHERE year = ? AND month = ? LIMIT 1',
    args: [ym.year, ym.month],
  })
  const report = rows.rows[0] ? rowToAiReport(rows.rows[0] as Record<string, unknown>) : null
  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest) {
  await initDb()
  const body = await req.json()
  const year = Number(body.year)
  const month = Number(body.month)
  const content = typeof body.content === 'string' ? body.content : ''
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: '연·월을 확인해주세요' }, { status: 400 })
  }
  if (!content.trim()) {
    return NextResponse.json({ error: '저장할 분석 내용을 입력해주세요' }, { status: 400 })
  }

  const now = new Date().toISOString()
  // (year, month) UNIQUE. 같은 달에 다시 저장하면 content·updated_at 덮어쓰기 — SCHEMA.md `AiReport`
  await db.execute({
    sql: `INSERT INTO ai_reports (id, year, month, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(year, month) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    args: [generateId('aireport'), year, month, content, now, now],
  })

  const rows = await db.execute({
    sql: 'SELECT * FROM ai_reports WHERE year = ? AND month = ? LIMIT 1',
    args: [year, month],
  })
  return NextResponse.json(rowToAiReport(rows.rows[0] as Record<string, unknown>), { status: 200 })
}

export async function DELETE(req: NextRequest) {
  await initDb()
  const ym = parseYearMonth(new URL(req.url).searchParams)
  if (!ym) return NextResponse.json({ error: '연·월을 확인해주세요' }, { status: 400 })

  await db.execute({
    sql: 'DELETE FROM ai_reports WHERE year = ? AND month = ?',
    args: [ym.year, ym.month],
  })
  return NextResponse.json({ ok: true })
}
