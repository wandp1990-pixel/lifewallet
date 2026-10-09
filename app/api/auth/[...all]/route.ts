import { getWorkAuth } from '@/lib/work-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await getWorkAuth()
  if (!auth) return Response.json({ error: 'Google 로그인 설정을 준비 중입니다' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  return auth.handler(request)
}
export const POST = GET
