import { randomBytes } from 'node:crypto'
export const dynamic = 'force-dynamic'
export async function GET() {
  const nonce = randomBytes(18).toString('base64')
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeWallet 로그인</title></head><body><main><h1>LifeWallet 로그인</h1><p>본인 장부를 열려면 허용된 Google 계정으로 로그인해주세요.</p><button id="google">Google로 로그인</button><p id="status" role="status"></p></main><script nonce="${nonce}">document.getElementById('google').onclick=async function(){this.disabled=true;try{const r=await fetch('/api/auth/sign-in/social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:'/'})});const d=await r.json();if(!r.ok||!d.url||new URL(d.url).origin!=='https://accounts.google.com')throw Error();location.assign(d.url)}catch{document.getElementById('status').textContent='로그인을 시작할 수 없습니다. 인증 설정을 확인해주세요.';this.disabled=false}};</script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}
