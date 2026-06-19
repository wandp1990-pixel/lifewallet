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
  // 주의: 이 라우트는 force-dynamic이라 Vercel이 stale-while-revalidate를 제거하고 `private, max-age=0`로
  //       정규화한다 → 실제 SWR 캐시 효과 없음(무해). 상세·대안은 DEPLOY.md 트러블슈팅 표 참조.
  // 금액 데이터(자산·거래·예산 등)는 수정 후 즉시 정확성이 필요하므로 no-store 유지.
  return NextResponse.json(
    rows.rows.map(r => ({
      ...r,
      order: r.ord,
      visible: Boolean(r.visible),
      is_system: Boolean(r.is_system),
      budget_excluded: Boolean(r.budget_excluded),
      default_asset_id: r.default_asset_id ?? '',
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
    // 예산 비대상은 expense 카테고리에만 의미. 다른 타입은 항상 false.
    budget_excluded: body.type === 'expense' ? Boolean(body.budget_excluded) : false,
    default_asset_id: typeof body.default_asset_id === 'string' ? body.default_asset_id : '',
  }

  await db.execute({
    sql: 'INSERT INTO categories (id,type,name,icon,ord,visible,is_system,essentiality,budget_excluded,default_asset_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    args: [c.id, c.type, c.name, c.icon, c.order, 1, 0, c.essentiality, c.budget_excluded ? 1 : 0, c.default_asset_id],
  })

  return NextResponse.json(c, { status: 201 })
}
