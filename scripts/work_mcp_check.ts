import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const directory = await mkdtemp(join(tmpdir(),'lifewallet-work-'))
  process.env.TURSO_DATABASE_URL = `file:${join(directory,'test.db')}`
  delete process.env.TURSO_AUTH_TOKEN
  const { default: db, initDb } = await import('../lib/db')
  const { callWorkTool } = await import('../lib/work-tools')
  try {
    await initDb()
    await db.execute("INSERT INTO assets (id,group_type,name,balance) VALUES ('bank','bank','테스트 계좌',100000)")
    await db.execute("INSERT INTO categories (id,type,name) VALUES ('food','expense','식비')")
    const input = { request_id: 'receipt-1', date: '2026-10-09', amount: 12000, asset_id: 'bank', category_id: 'food', content: '점심' }
    const results = await Promise.all([callWorkTool('record_receipt', input),callWorkTool('record_receipt', input)])
    assert.equal(results.filter(r => 'duplicate' in r && r.duplicate).length,1)
    assert.equal((await db.execute("SELECT balance FROM assets WHERE id='bank'")).rows[0].balance,88000)
    await assert.rejects(callWorkTool('record_receipt',{ ...input, amount: 13000 }))
    await assert.rejects(callWorkTool('record_receipt',{ ...input,request_id:'bad-date',date:'2026-02-30' }))
    await assert.rejects(callWorkTool('record_receipt',{ ...input,request_id:'bad-category',category_id:'missing' }))
    const result = await callWorkTool('query_ledger',{ from:'2026-10-01',to:'2026-10-31',limit:1 })
    assert.ok('totals' in result)
    assert.equal(result.totals?.expense,12000)
    assert.equal(result.totals?.count,1)
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM transactions')).rows[0].n,1)
    const { NextRequest } = await import('next/server')
    const { POST } = await import('../app/api/mcp/route')
    process.env.WORK_MCP_TOKEN = 'test-token-with-at-least-32-characters'
    const request = (body: unknown, authorized = true) => new NextRequest('https://example.com/api/mcp',{ method:'POST',headers:{ 'content-type':'application/json', ...(authorized ? { authorization:`Bearer ${process.env.WORK_MCP_TOKEN}` } : {}) },body:JSON.stringify(body) })
    assert.equal((await POST(request({ jsonrpc:'2.0',id:1,method:'tools/list' },false))).status,401)
    const list = await (await POST(request({ jsonrpc:'2.0',id:1,method:'tools/list' }))).json()
    assert.equal(list.result.tools.length,3)
    const notification = await POST(request({ jsonrpc:'2.0',method:'notifications/initialized' }))
    assert.equal(notification.status,202)
    console.log('Work MCP: 인증, 동시 재시도, 잔액, 날짜·분류 검증, DB 합계 통과')
  } finally { db.close(); await rm(directory,{ recursive:true,force:true }) }
}
main().catch(error => { console.error(error); process.exitCode=1 })
