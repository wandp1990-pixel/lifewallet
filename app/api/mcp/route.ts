import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { callWorkTool, workTools } from '@/lib/work-tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
function authorize(req: NextRequest) {
  const secret = process.env.WORK_MCP_TOKEN
  if (!secret || secret.length < 32) return NextResponse.json({ error: 'MCP 인증 설정이 필요합니다' }, { status: 503, headers })
  const expected = Buffer.from(`Bearer ${secret}`)
  const supplied = Buffer.from(req.headers.get('authorization') ?? '')
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers })
}
export async function POST(req: NextRequest) {
  const denied = authorize(req)
  if (denied) return denied
  const rpcError = (id: unknown, code: number, message: string) => NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { headers })
  if (!req.headers.get('content-type')?.includes('application/json')) return new NextResponse(null, { status: 415, headers })
  let body
  try { body = JSON.parse(await req.text()) } catch { return rpcError(null,-32700,'Parse error') }
  if (!body || Array.isArray(body) || body.jsonrpc !== '2.0' || typeof body.method !== 'string' || (body.id !== undefined && typeof body.id !== 'string' && typeof body.id !== 'number')) return rpcError(null,-32600,'Invalid request')
  const id = body.id ?? null
  const respond = (result: unknown) => NextResponse.json({ jsonrpc: '2.0', id, result }, { headers })
  if (body.id === undefined) return new NextResponse(null, { status: 202, headers })
  if (body.method === 'initialize') return respond({ protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'lifewallet', version: '1.0.0' }, instructions: 'Read ledger context before saving receipts. Never invent missing receipt facts. Answer financial questions using query_ledger, not links or memory.' })
  if (body.method === 'ping') return respond({})
  if (body.method === 'tools/list') return respond({ tools: workTools })
  if (body.method !== 'tools/call') return rpcError(id,-32601,'Method not found')
  const params = body.params
  if (!params || typeof params.name !== 'string' || (params.arguments !== undefined && (!params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) return rpcError(id,-32602,'Invalid params')
  try {
    const result = await callWorkTool(params.name, params.arguments ?? {})
    return respond({ content: [{ type: 'text', text: JSON.stringify(result) }] })
  } catch (error) {
    const message = error instanceof Error && !('code' in error) ? error.message : 'DB 처리에 실패했습니다. 저장 성공으로 간주하지 말고 같은 request_id로 재시도하세요.'
    return respond({ isError: true, content: [{ type: 'text', text: message }] })
  }
}
export async function GET(req: NextRequest) {
  return authorize(req) ?? new NextResponse(null, { status: 405, headers: { ...headers, Allow: 'POST' } })
}
export const DELETE = GET
