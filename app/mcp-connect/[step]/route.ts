import { randomBytes } from 'node:crypto'
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider'
import { getWorkAuth } from '@/lib/work-auth'
import { isWorkOwner, workScopes } from '@/lib/work-auth-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const scriptValue = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

function page(content: string, script = '', status = 200) {
  const nonce = randomBytes(18).toString('base64')
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeWallet 연결</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#15202b;font:16px/1.6 system-ui,sans-serif}main{max-width:480px;margin:8vh auto;padding:32px;background:white;border-radius:20px}h1{font-size:25px}button{padding:14px 20px;border:0;border-radius:10px;background:#195c46;color:white;font:inherit;cursor:pointer;margin:8px 8px 0 0}button:disabled{opacity:.5}button.secondary{background:#e7ebee;color:#15202b}#status{color:#9a3026;overflow-wrap:anywhere}li{margin:10px 0}small{overflow-wrap:anywhere}@media(max-width:520px){main{margin:24px 12px;padding:24px}}</style></head><body><main>${content}<p id="status" role="status"></p></main>${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    },
  })
}

export async function GET(request: Request, context: { params: Promise<{ step: string }> }) {
  const { step } = await context.params
  if (!['login', 'consent', 'complete'].includes(step)) return page('<h1>페이지를 찾을 수 없습니다</h1>', '', 404)
  const auth = await getWorkAuth()
  if (!auth) return page('<h1>연결 준비 중</h1><p>Google 로그인 설정이 아직 완료되지 않았습니다. 설정이 끝나면 ChatGPT에서 LifeWallet 연결을 다시 시작해주세요.</p>', '', 503)
  if (step === 'complete') return page('<h1>로그인 완료</h1><p>ChatGPT로 돌아가 LifeWallet 연결을 계속해주세요.</p>')
  const query = new URL(request.url).search.slice(1)
  const { secret } = await auth.$context
  if (!await verifyOAuthQueryParams(query, secret)) return page('<h1>연결 요청이 만료됐습니다</h1><p>ChatGPT에서 LifeWallet 연결을 다시 시작해주세요.</p>', '', 400)

  if (step === 'login') return page('<h1>LifeWallet 연결</h1><p>본인의 가계부에 연결하려면 허용된 Google 계정으로 로그인해주세요.</p><button id="google">Google로 로그인</button>', `
    document.getElementById('google').addEventListener('click', async function () {
      this.disabled = true;
      try {
        const response = await fetch('/api/auth/sign-in/social', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({provider:'google',callbackURL:'/mcp-connect/complete',oauth_query:${scriptValue(query)}}) });
        const data = await response.json();
        if (!response.ok || !data.url || new URL(data.url).origin !== 'https://accounts.google.com') throw new Error();
        location.assign(data.url);
      } catch { document.getElementById('status').textContent = '로그인을 시작하지 못했습니다. ChatGPT에서 연결을 다시 시작해주세요.'; this.disabled = false; }
    });`)

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session || !isWorkOwner(session.user.email, session.user.emailVerified)) return page('<h1>연결할 수 없습니다</h1><p>허용된 계정으로 다시 로그인해주세요.</p>', '', 403)
  const params = new URLSearchParams(query)
  const scopes = (params.get('scope') ?? '').split(' ').filter(Boolean)
  if (scopes.some(scope => !workScopes.includes(scope))) return page('<h1>지원하지 않는 권한 요청입니다</h1>', '', 400)
  let client
  try { client = await auth.api.getOAuthClientPublic({ headers: request.headers, query: { client_id: params.get('client_id') ?? '' } }) }
  catch { return page('<h1>연결 앱을 확인할 수 없습니다</h1>', '', 400) }
  const labels: Record<string, string> = {
    openid: '로그인 계정 식별', profile: '계정 이름과 프로필 확인', email: '이메일 주소 확인',
    offline_access: '다시 로그인하지 않고 연결 유지', 'ledger:read': '자산·분류·거래와 합계 조회', 'ledger:write': '영수증 지출 저장 및 자산 잔액 반영',
  }
  let claimsText = ''
  if (params.has('claims')) {
    try { claimsText = `<p>추가 계정 정보 요청:</p><pre>${escapeHtml(JSON.stringify(JSON.parse(params.get('claims')!), null, 2))}</pre>` }
    catch { return page('<h1>잘못된 계정 정보 요청입니다</h1>', '', 400) }
  }
  const clientName = client.client_name || '연결 앱'
  const redirectOrigin = new URL(params.get('redirect_uri')!).origin
  return page(`<h1>가계부 연결 승인</h1><p><strong>${escapeHtml(clientName)}</strong>에서 다음 권한을 요청합니다.</p><small>연결 대상: ${escapeHtml(redirectOrigin)}</small><ul>${scopes.map(scope => `<li>${escapeHtml(labels[scope])}</li>`).join('')}</ul>${claimsText}<p>로그인 계정: ${escapeHtml(session.user.email)}</p><button id="accept">연결 허용</button><button id="deny" class="secondary">취소</button>`, `
    async function consent(accept) {
      document.querySelectorAll('button').forEach(button => button.disabled = true);
      try {
        const response = await fetch('/api/auth/oauth2/consent', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({accept,oauth_query:${scriptValue(query)}}) });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error();
        location.assign(data.url);
      } catch { document.getElementById('status').textContent = '연결을 완료하지 못했습니다. ChatGPT에서 다시 시작해주세요.'; document.querySelectorAll('button').forEach(button => button.disabled = false); }
    }
    document.getElementById('accept').addEventListener('click', () => consent(true));
    document.getElementById('deny').addEventListener('click', () => consent(false));`)
}
