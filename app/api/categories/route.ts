import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { generateId } from '@/lib/utils'
import type { Category, Essentiality } from '@/lib/types'

export const dynamic = 'force-dynamic'

const ESSENTIALITIES: Essentiality[] = ['needs', 'wants', 'savings', 'unexpected']

function isEssentiality(value: unknown): value is Essentiality {
  return typeof value === 'string' && ESSENTIALITIES.includes(value as Essentiality)
}

export async function GET() {
  const rows = await db.execute('SELECT * FROM categories ORDER BY type, is_system DESC, ord ASC')
  // 카테고리는 변경 빈도가 낮은 참조 데이터(이름·아이콘·성격)다.
  // stale-while-revalidate: 브라우저가 캐시본을 즉시 내주고 백그라운드에서 갱신 → 반복 로드 가속.
  // 금액 데이터(자산·거래·예산 등)는 수정 후 즉시 정확성이 필요하므로 no-store 유지.
  return NextResponse.json(
    rows.rows.map(r => ({
      ...r,
      order: r.ord,
      visible: Boolean(r.visible),
      is_system: Boolean(r.is_system),
    })),
    { headers: { 'Cache-Control': 'private, max-age=0, stale-while-revalidate=60' } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: '카테고리 이름을 입력해주세요' }, { status: 400 })
  if (body.type === 'expense' && !isEssentiality(body.essentiality)) {
    return NextResponse.json({ error: '지출 성격을 선택해주세요' }, { status: 400 })
  }

  const c: Category = {
    id: generateId('cat'),
    type: body.type,
    name: body.name,
    icon: body.icon ?? '',
    order: body.order ?? 0,
    visible: true,
    is_system: false,
    essentiality: isEssentiality(body.essentiality) ? body.essentiality : 'wants',
  }

  await db.execute({
    sql: 'INSERT INTO categories (id,type,name,icon,ord,visible,is_system,essentiality) VALUES (?,?,?,?,?,?,?,?)',
    args: [c.id, c.type, c.name, c.icon, c.order, 1, 0, c.essentiality],
  })

  return NextResponse.json(c, { status: 201 })
}
