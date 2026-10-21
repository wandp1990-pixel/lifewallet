import { ownerApi } from '@/lib/ledger-api'
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { ledgerWrite, saveCategory } from '@/lib/ledger-service'
import { requestKey } from '@/lib/ledger-api'
export const dynamic = 'force-dynamic'

async function handleGET() {
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

async function handlePOST(req: NextRequest) {
  const body = await req.json()
  const key = requestKey(req)
  const result = await ledgerWrite('app.create_category', key, body, tx => saveCategory(tx, key, body))
  return NextResponse.json(result.category, { status: 201 })
}

export const GET = ownerApi(handleGET)
export const POST = ownerApi(handlePOST)
