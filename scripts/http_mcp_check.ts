import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { randomBytes, createHmac } from 'node:crypto'

// Requires an already-built .next directory. All HTTP writes use this temporary
// SQLite database and locally generated test credentials, never .env.local.
async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'lifewallet-http-'))
  const port = 38721
  const origin = 'http://127.0.0.1:' + port
  Object.assign(process.env, {
    TURSO_DATABASE_URL: 'file:' + join(directory, 'test.db'),
    TURSO_AUTH_TOKEN: '',
    WORK_MCP_ORIGIN: 'https://http-fixture.invalid',
    WORK_MCP_TOKEN: randomBytes(32).toString('hex'),
    WORK_MCP_ALLOWED_EMAIL: 'fixture@example.com',
    WORK_AUTH_SECRET: randomBytes(32).toString('hex'),
    GOOGLE_CLIENT_ID: 'fixture',
    GOOGLE_CLIENT_SECRET: 'fixture',
    GEMINI_API_KEY: '',
  })
  const { default: db, initDb } = await import('../lib/db')
  const { getWorkAuth } = await import('../lib/work-auth')
  const { koreaToday } = await import('../lib/ledger-errors')
  let server: ReturnType<typeof spawn> | undefined
  let output = ''
  try {
    await initDb()
    await db.execute('PRAGMA journal_mode=WAL')
    const auth = await getWorkAuth()
    assert.ok(auth)
    const ctx = await auth.$context
    const owner = await ctx.internalAdapter.createUser(
      { email: 'fixture@example.com', emailVerified: true, name: 'Fixture' },
      { method: 'oauth' },
    )
    const session = randomBytes(32).toString('hex')
    const now = new Date().toISOString()
    await db.execute({
      sql: 'INSERT INTO work_auth_session (id,token,userId,expiresAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
      args: [
        'http-session',
        session,
        owner.id,
        new Date(Date.now() + 3600000).toISOString(),
        now,
        now,
      ],
    })
    const cookieName = ctx.authCookies.sessionToken.name
    // Production HTTPS cookie name; the requests explicitly provide this cookie.
    const cookie =
      cookieName +
      '=' +
      session +
      '.' +
      createHmac('sha256', ctx.secret).update(session).digest('base64')
    server = spawn(process.execPath, ['.next/standalone/server.js'], {
      env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const capture = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8000)
    }
    server.stdout?.on('data', capture)
    server.stderr?.on('data', capture)
    let ready = false
    for (let i = 0; i < 150; i++) {
      if (server.exitCode !== null) throw new Error('Local server exited before ready')
      try {
        const response = await fetch(origin + '/login')
        if (response.ok) {
          ready = true
          break
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'Local server readiness')
    const root = await fetch(origin + '/', { redirect: 'manual' })
    assert.equal(root.status, 307)
    assert.equal(new URL(root.headers.get('location')!, origin).pathname, '/login')
    const login = await fetch(origin + '/login')
    assert.equal(login.status, 200)
    assert.ok((await login.text()).includes('Google로 로그인'))
    assert.ok(login.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"))
    assert.equal((await fetch(origin + '/api/assets')).status, 401)
    assert.equal(
      (await fetch(origin + '/api/assets', { headers: { cookie: cookieName + '=forged' } })).status,
      401,
    )
    const page = await fetch(origin + '/', { headers: { cookie } })
    assert.equal(page.status, 200)
    assert.ok((await page.text()).includes('LifeWallet'))
    const assets = await fetch(origin + '/api/assets', { headers: { cookie } })
    assert.equal(assets.status, 200)
    assert.deepEqual(await assets.json(), [])
    const authorization = 'Bearer ' + process.env.WORK_MCP_TOKEN
    let request = 0
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const response = await fetch(origin + '/api/mcp', {
        method: 'POST',
        headers: { authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++request,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      const body = await response.json()
      assert.ok(!body.result.isError, JSON.stringify(body.result.structuredContent))
      return body.result.structuredContent
    }
    const today = koreaToday()
    const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10)
    const category = (
      await rpc('create_category', { request_id: 'http-category', type: 'income', name: '급여' })
    ).category.id
    const bank = (
      await rpc('create_asset', {
        request_id: 'http-bank',
        group_type: 'bank',
        name: '자동이체',
        balance: 0,
        balance_date: yesterday,
      })
    ).asset.id
    const input = {
      request_id: 'http-salary',
      type: 'income',
      date: today,
      amount: 2_800_000,
      asset_id: bank,
      category_id: category,
    }
    const transaction = (await rpc('record_transaction', input)).transaction
    assert.equal((await rpc('record_transaction', input)).duplicate, true)
    const storedAssets = await (await fetch(origin + '/api/assets', { headers: { cookie } })).json()
    assert.equal(storedAssets[0].balance, 2_800_000)
    const balanceUpdate = await fetch(origin + '/api/assets/' + bank, {
      method: 'PATCH',
      headers: {
        cookie,
        origin,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'http-current-balance',
      },
      body: JSON.stringify({ balance: 2_800_000, balance_date: yesterday }),
    })
    assert.equal(balanceUpdate.status, 200)
    assert.equal(
      (await balanceUpdate.json()).balance,
      2_800_000,
      'App current balance must not add later transactions twice',
    )
    const patch = await fetch(origin + '/api/transactions/' + transaction.id, {
      method: 'PATCH',
      headers: {
        cookie,
        origin,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'http-edit',
      },
      body: JSON.stringify({ amount: 2_700_000 }),
    })
    assert.equal(patch.status, 200, await patch.clone().text())
    assert.equal((await patch.json()).amount, 2_700_000)
    const totals = await rpc('query_ledger', { from: yesterday, to: today })
    assert.equal(totals.totals.income, 2_700_000)
    assert.equal(
      (await rpc('get_financial_overview', { from: yesterday, to: today, as_of: today })).net_worth,
      2_700_000,
    )
    const crossOrigin = await fetch(origin + '/api/transactions/' + transaction.id, {
      method: 'DELETE',
      headers: { cookie, origin: 'https://attacker.invalid' },
    })
    assert.equal(crossOrigin.status, 403)
    const removed = await fetch(origin + '/api/transactions/' + transaction.id, {
      method: 'DELETE',
      headers: { cookie, origin, 'Idempotency-Key': 'http-delete' },
    })
    assert.equal(removed.status, 200)
    assert.equal((await rpc('query_ledger', { from: yesterday, to: today })).totals.count, 0)
    assert.equal(
      (await db.execute({ sql: 'SELECT balance FROM assets WHERE id=?', args: [bank] })).rows[0]
        .balance,
      0,
    )
    console.log(
      'HTTP PASS: production build login/redirect, forged-cookie denial, owner session, MCP→DB→app read, app update→MCP totals, delete→zero balance, retry and cross-origin protection; temporary DB only.',
    )
  } catch (error) {
    console.error(output)
    throw error
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        server!.once('exit', () => resolve())
        setTimeout(resolve, 2000)
      })
    }
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
