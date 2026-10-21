import { randomUUID, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isWorkOwner } from './work-auth-config'
import { errorResult, LedgerError } from './ledger-errors'

// This database is one owner's ledger. Never accept a user/owner ID from input.
export function legacyOwnerToken(request: Request) {
  const secret = process.env.WORK_MCP_TOKEN
  if (!secret || secret.length < 32) return false
  const expected = Buffer.from('Bearer ' + secret)
  const actual = Buffer.from(request.headers.get('authorization') ?? '')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
export function hasForeignOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    // Next may normalize request.url to localhost behind its HTTP adapter.
    // Use the actual Host header, never untrusted X-Forwarded-Host.
    const url = new URL(request.url)
    const host = request.headers.get('host')
    if (host && /[\\/@\s]/.test(host)) return true
    const expected = host ? new URL(url.protocol + '//' + host).origin : url.origin
    return origin !== expected
  } catch {
    return true
  }
}
export function ownerApi<T extends unknown[]>(
  handler: (request: NextRequest, ...args: T) => Promise<Response>,
) {
  return async (request: NextRequest, ...args: T): Promise<Response> => {
    const headers = { 'Cache-Control': 'no-store' }
    if (hasForeignOrigin(request))
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers })
    if (!legacyOwnerToken(request)) {
      const { getWorkAuth } = await import('./work-auth')
      const auth = await getWorkAuth()
      if (!auth)
        return NextResponse.json(
          { error: '소유자 인증 설정이 필요합니다' },
          { status: 503, headers },
        )
      const session = await auth.api.getSession({ headers: request.headers })
      if (!session)
        return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401, headers })
      if (!isWorkOwner(session.user.email, session.user.emailVerified))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
    }
    try {
      const response = await handler(request, ...args)
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch (error) {
      const detail = errorResult(error)
      return NextResponse.json(
        { error: detail.message, error_detail: detail },
        {
          status: error instanceof LedgerError ? (error.code === 'NOT_FOUND' ? 404 : 400) : 500,
          headers,
        },
      )
    }
  }
}
export function requestKey(request: Request) {
  return request.headers.get('idempotency-key') ?? 'app_' + randomUUID()
}
