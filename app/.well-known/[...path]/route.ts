import { getWorkAuth } from '@/lib/work-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await getWorkAuth()
  if (!auth) return Response.json({ error: 'OAuth is not configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  return auth.handler(request)
}
