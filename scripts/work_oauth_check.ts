import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'lifewallet-oauth-'))
  const origin = 'https://lifewallet.example'
  process.env.TURSO_DATABASE_URL = `file:${join(directory, 'auth.db')}`
  delete process.env.TURSO_AUTH_TOKEN
  process.env.WORK_MCP_ORIGIN = origin
  process.env.WORK_AUTH_SECRET = randomBytes(32).toString('hex')
  process.env.WORK_MCP_ALLOWED_EMAIL = 'owner@example.com'
  process.env.GOOGLE_CLIENT_ID = 'local-test-client'
  process.env.GOOGLE_CLIENT_SECRET = 'local-test-secret'
  process.env.WORK_MCP_TOKEN = randomBytes(32).toString('hex')
  const { getWorkAuth } = await import('../lib/work-auth')
  const { isWorkOwner } = await import('../lib/work-auth-config')
  const { default: db } = await import('../lib/db')
  const originalFetch = globalThis.fetch
  try {
    assert.equal(isWorkOwner('OWNER@example.com', true), true)
    assert.equal(isWorkOwner('attacker@example.com', true), false)
    assert.equal(isWorkOwner('owner@example.com', false), false)
    const auth = await getWorkAuth()
    assert.ok(auth)
    globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      if (new URL(request.url).origin !== origin) throw new Error('External network forbidden in OAuth tests')
      return auth.handler(request)
    }
    const ctx = await auth.$context
    await assert.rejects(ctx.internalAdapter.createUser({ email: 'attacker@example.com', emailVerified: true, name: 'Denied' }, { method: 'oauth' }))
    await assert.rejects(ctx.internalAdapter.createUser({ email: 'owner@example.com', emailVerified: false, name: 'Unverified' }, { method: 'oauth' }))
    const owner = await ctx.internalAdapter.createUser({ email: 'owner@example.com', emailVerified: true, name: 'Owner' }, { method: 'oauth' })
    // Fixture represents a verified Google login; no external Google credentials are used.
    const sessionToken = randomBytes(32).toString('hex')
    const now = new Date()
    await db.execute({ sql: 'INSERT INTO work_auth_session (id,token,userId,expiresAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?)', args: ['test-session', sessionToken, owner.id, new Date(Date.now() + 3600000).toISOString(), now.toISOString(), now.toISOString()] })
    const signature = createHmac('sha256', ctx.secret).update(sessionToken).digest('base64')
    const cookie = `${ctx.authCookies.sessionToken.name}=${sessionToken}.${signature}`
    const request = (path: string, method = 'GET', body?: unknown, signedIn = false) => new Request(origin + path, {
      method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(signedIn ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    assert.equal((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id, owner.id)
    const { initDb } = await import('../lib/db')
    await initDb()
    await db.execute("INSERT INTO assets (id,group_type,name,balance,balance_date) VALUES ('owner-bank','bank','fixture',1000,'2026-10-01')")
    // A validly signed session for another account must not reach ANY app data
    // endpoint, even when it knows an existing owner's record ID.
    const attackerToken = randomBytes(32).toString('hex')
    await db.execute({sql:'INSERT INTO work_auth_user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',args:['attacker','Attacker','attacker@example.com',1,now.toISOString(),now.toISOString()]})
    await db.execute({sql:'INSERT INTO work_auth_session (id,token,userId,expiresAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',args:['attacker-session',attackerToken,'attacker',new Date(Date.now()+3600000).toISOString(),now.toISOString(),now.toISOString()]})
    const attackerCookie = ctx.authCookies.sessionToken.name+'='+attackerToken+'.'+createHmac('sha256',ctx.secret).update(attackerToken).digest('base64')
    const { NextRequest: ApiRequest } = await import('next/server')
    let protectedMethods = 0
    async function inspectRoutes(directory: string) {
      for (const entry of await readdir(directory,{withFileTypes:true})) {
        if (entry.isDirectory() && !['auth','mcp'].includes(entry.name)) await inspectRoutes(join(directory,entry.name))
        if (entry.name !== 'route.ts') continue
        const file = join(directory,entry.name)
        const module = await import(pathToFileURL(file).href)
        for (const method of ['GET','POST','PATCH','PUT','DELETE']) if (typeof module[method] === 'function') {
          const path = file.slice(join(process.cwd(),'app').length).replace('/route.ts','').replace('[id]','owner-bank')
          const make = (sessionCookie?: string) => new ApiRequest(origin+path,{method,headers:{'Content-Type':'application/json',...(sessionCookie?{cookie:sessionCookie}:{})},...(['GET','HEAD'].includes(method)?{}:{body:JSON.stringify({asset_id:'owner-bank',amount:999})})})
          const context = {params:Promise.resolve({id:'owner-bank'})}
          assert.equal((await module[method](make(),context)).status,401,path+' anonymous '+method)
          assert.equal((await module[method](make(attackerCookie),context)).status,403,path+' foreign owner '+method)
          protectedMethods++
        }
      }
    }
    await inspectRoutes(join(process.cwd(),'app/api'))
    assert.ok(protectedMethods>=40)
    const { GET: appAssets } = await import('../app/api/assets/route')
    assert.equal((await appAssets(new ApiRequest(origin+'/api/assets',{headers:{cookie}}))).status,200)
    assert.equal((await db.execute("SELECT balance FROM assets WHERE id='owner-bank'")).rows[0].balance,1000)
    const metadata = await auth.handler(request('/.well-known/oauth-authorization-server/api/auth'))
    assert.equal(metadata.status, 200)
    const discovery = await metadata.json()
    assert.ok(discovery.code_challenge_methods_supported.includes('S256'))
    assert.ok(discovery.scopes_supported.includes('offline_access'))
    const resource = await auth.handler(request('/.well-known/oauth-protected-resource/api/mcp'))
    assert.equal(resource.status, 200)
    assert.equal((await resource.json()).resource, origin + '/api/mcp')
    const register = await auth.handler(request('/api/auth/oauth2/register', 'POST', {
      client_name: 'OAuth integration test', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], scope: 'openid email offline_access ledger:read ledger:write',
    }))
    assert.equal(register.status, 201, 'DCR registration')
    const client = await register.json()
    const verifier = randomBytes(32).toString('base64url')
    const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', scope: 'openid email offline_access ledger:read', state: 'test-state', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: origin + '/api/mcp' })
    const authorizePath = '/api/auth/oauth2/authorize?' + params
    const login = await auth.handler(request(authorizePath))
    assert.equal(login.status, 302)
    assert.ok(login.headers.get('location')?.includes('/mcp-connect/login'))
    const { GET: connect } = await import('../app/mcp-connect/[step]/route')
    const loginPage = await connect(new Request(new URL(login.headers.get('location')!, origin)), { params: Promise.resolve({ step: 'login' }) })
    assert.equal(loginPage.status, 200)
    const social = await auth.handler(request('/api/auth/sign-in/social', 'POST', { provider: 'google', callbackURL: '/mcp-connect/complete', oauth_query: new URL(login.headers.get('location')!, origin).search.slice(1) }))
    assert.equal(social.status, 200)
    const googleUrl = new URL((await social.json()).url)
    assert.equal(googleUrl.origin, 'https://accounts.google.com')
    assert.equal(googleUrl.searchParams.get('redirect_uri'), origin + '/api/auth/callback/google')
    const invalidPage = await connect(new Request(origin + '/mcp-connect/consent?client_id=forged'), { params: Promise.resolve({ step: 'consent' }) })
    assert.equal(invalidPage.status, 400)
    const consent = await auth.handler(request(authorizePath, 'GET', undefined, true))
    assert.equal(consent.status, 302)
    const consentUrl = new URL(consent.headers.get('location')!, origin)
    assert.equal(consentUrl.pathname, '/mcp-connect/consent')
    const consentPage = await connect(new Request(consentUrl, { headers: { cookie } }), { params: Promise.resolve({ step: 'consent' }) })
    assert.equal(consentPage.status, 200)
    assert.ok((await consentPage.text()).includes('자산·분류·거래와 합계 조회'))
    const approved = await auth.handler(request('/api/auth/oauth2/consent', 'POST', { accept: true, oauth_query: consentUrl.search.slice(1) }, true))
    assert.equal(approved.status, 200)
    const redirect = new URL((await approved.json()).url)
    assert.equal(redirect.searchParams.get('state'), 'test-state')
    const code = redirect.searchParams.get('code')!
    const tokenRequest = async (fields: Record<string, string>) => auth.handler(new Request(origin + '/api/auth/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }))
    const tokenFields = { grant_type: 'authorization_code', client_id: client.client_id, code, code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: origin + '/api/mcp' }
    const wrongVerifier = await tokenRequest({ ...tokenFields, code_verifier: randomBytes(32).toString('base64url') })
    assert.ok([400, 401].includes(wrongVerifier.status))
    const freshAuthorization = await auth.handler(request(authorizePath, 'GET', undefined, true))
    const freshLocation = new URL(freshAuthorization.headers.get('location')!, origin)
    assert.ok(freshLocation.searchParams.get('code'), 'A failed PKCE attempt consumes its code; obtain a new code')
    tokenFields.code = freshLocation.searchParams.get('code')!
    const exchanged = await tokenRequest(tokenFields)
    assert.equal(exchanged.status, 200)
    const tokens = await exchanged.json()
    assert.ok(tokens.access_token && tokens.refresh_token)
    const { POST } = await import('../app/api/mcp/route')
    const { NextRequest } = await import('next/server')
    const rpc = (token: string, method: string, params?: unknown) => POST(new NextRequest(origin + '/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }))
    const unauthorized = await rpc('invalid', 'tools/list')
    assert.equal(unauthorized.status, 401)
    assert.ok(unauthorized.headers.get('www-authenticate')?.includes('oauth-protected-resource'))
    const listing = await rpc(tokens.access_token, 'tools/list')
    if (listing.status !== 200) { const failure = await listing.json(); console.error({ status: listing.status, error: failure.error, description: failure.error_description }) }
    assert.equal(listing.status, 200)
    const ledger = await rpc(tokens.access_token, 'tools/call', { name: 'query_ledger', arguments: { from: '2026-10-01', to: '2026-10-09' } })
    assert.equal(ledger.status, 200)
    assert.ok(!(await ledger.json()).result.isError)
    assert.equal((await rpc(tokens.access_token, 'tools/call', { name: 'record_receipt', arguments: {} })).status, 403, 'Read-only token cannot save receipts')
    const { workTools, isWriteTool } = await import('../lib/work-tools')
    for (const tool of workTools.filter(tool=>isWriteTool(tool.name))) assert.equal((await rpc(tokens.access_token,'tools/call',{name:tool.name,arguments:{}})).status,403,'Read-only token blocked: '+tool.name)
    params.set('scope','openid email offline_access ledger:read ledger:write')
    const writeAuthorization = await auth.handler(request('/api/auth/oauth2/authorize?'+params,'GET',undefined,true))
    let writeRedirect = new URL(writeAuthorization.headers.get('location')!,origin)
    if (writeRedirect.pathname === '/mcp-connect/consent') {
      const writeConsent = await auth.handler(request('/api/auth/oauth2/consent','POST',{accept:true,oauth_query:writeRedirect.search.slice(1)},true))
      assert.equal(writeConsent.status,200)
      writeRedirect = new URL((await writeConsent.json()).url)
    }
    const writeTokensResponse = await tokenRequest({...tokenFields,code:writeRedirect.searchParams.get('code')!})
    assert.equal(writeTokensResponse.status,200)
    const writeTokens = await writeTokensResponse.json()
    const writeArgs={request_id:'oauth-category',name:'OAuth fixture',type:'income'}
    const saved = await rpc(writeTokens.access_token,'tools/call',{name:'create_category',arguments:writeArgs})
    assert.equal(saved.status,200)
    const savedResult=(await saved.json()).result
    assert.ok(!savedResult.isError)
    assert.ok(savedResult.structuredContent.category.id)
    assert.equal((await (await rpc(writeTokens.access_token,'tools/call',{name:'create_category',arguments:writeArgs})).json()).result.structuredContent.duplicate,true)
    const refreshed = await tokenRequest({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: tokens.refresh_token, resource: origin + '/api/mcp' })
    if (refreshed.status !== 200) { const failure = await refreshed.json(); console.error({ error: failure.error, description: failure.error_description }) }
    assert.equal(refreshed.status, 200)
    const renewed = await refreshed.json()
    assert.ok(renewed.refresh_token !== tokens.refresh_token)
    assert.equal((await rpc(renewed.access_token, 'tools/list')).status, 200)
    assert.equal((await tokenRequest(tokenFields)).status, 400, 'Authorization code must be single-use')
    assert.equal((await tokenRequest({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: renewed.refresh_token, resource: origin + '/api/mcp' })).status, 400, 'Code replay revokes the refresh grant')
    process.env.WORK_MCP_ALLOWED_EMAIL = 'different@example.com'
    assert.equal((await rpc(renewed.access_token, 'tools/list')).status, 403, 'Owner changes invalidate access')
    for (const tool of workTools) assert.equal((await rpc(renewed.access_token,'tools/call',{name:tool.name,arguments:{transaction_id:'owner-bank'}})).status,403,'Foreign owner blocked before IDs: '+tool.name)
    assert.equal((await appAssets(new ApiRequest(origin+'/api/assets',{headers:{cookie}}))).status,403)
    delete process.env.GOOGLE_CLIENT_SECRET
    assert.equal(await getWorkAuth(), null)
    assert.equal((await rpc(process.env.WORK_MCP_TOKEN!, 'tools/list')).status, 200, 'Legacy token still works without Google setup')
    console.log('OAuth checks PASS: owner restriction, discovery, DCR, signed login/consent, PKCE, single-use code, JWT reads/writes, all write scopes, foreign-user/anonymous rejection on '+protectedMethods+' app methods and 18 MCP tools, refresh rotation, configuration fail-closed, legacy token')
  } finally {
    globalThis.fetch = originalFetch
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error instanceof Error ? error.stack : 'OAuth test failed'); process.exitCode = 1 })
