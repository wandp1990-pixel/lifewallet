import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'lifewallet-delete-'))
  // 실제 사용자 데이터에 접근하지 않고 로컬 임시 DB에서 API를 실행한다.
  process.env.TURSO_DATABASE_URL = `file:${join(dir, 'test.db')}`
  delete process.env.TURSO_AUTH_TOKEN
  const { default: db, initDb } = await import('../lib/db')
  const { DELETE, PATCH } = await import('../app/api/assets/[id]/route')
  const { GET } = await import('../app/api/assets/route')
  const remove = (id: string) => DELETE(new NextRequest(`http://localhost/api/assets/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
  try {
    await initDb()
    for (const id of ['target', 'other', 'rollback']) {
      await db.execute({ sql: "INSERT INTO assets (id,group_type,name,balance) VALUES (?,'bank',?,1000)", args: [id, id] })
    }
    for (const [id, asset, from, to] of [
      ['income', 'target', '', ''],
      ['outgoing', '', 'target', 'other'],
      ['incoming', '', 'other', 'target'],
      ['unrelated', 'other', '', ''],
      ['rollback-tx', 'rollback', '', ''],
    ]) {
      await db.execute({ sql: "INSERT INTO transactions (id,date,type,amount,asset_id,from_asset_id,to_asset_id) VALUES (?,'2026-10-10','transfer',100,?,?,?)", args: [id, asset, from, to] })
      await db.execute({ sql: "INSERT INTO recurring_transactions (id,type,amount,asset_id,from_asset_id,to_asset_id) VALUES (?,'transfer',100,?,?,?)", args: [id, asset, from, to] })
    }
    await db.execute("INSERT INTO categories (id,type,name,default_asset_id) VALUES ('cat','expense','category','target')")
    await db.execute("INSERT INTO savings_goals (id,name,asset_id,current_amount) VALUES ('goal','goal','target',500)")
    const beforeTx = (await db.execute('SELECT * FROM transactions ORDER BY id')).rows
    const beforeRecurring = (await db.execute('SELECT * FROM recurring_transactions ORDER BY id')).rows
    const hidden = await PATCH(new NextRequest('http://localhost/api/assets/target', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible: false }),
    }), { params: Promise.resolve({ id: 'target' }) })
    assert.equal(hidden.status, 200)
    assert.equal((await hidden.json()).visible, false)
    assert.equal((await (await GET()).json()).some((a: { id: string }) => a.id === 'target'), true)

    assert.equal((await remove('target')).status, 200)
    assert.equal((await (await GET()).json()).some((a: { id: string }) => a.id === 'target'), false)
    const unlink = (row: Record<string, unknown>) => ({ ...row,
      asset_id: row.asset_id === 'target' ? '' : row.asset_id,
      from_asset_id: row.from_asset_id === 'target' ? '' : row.from_asset_id,
      to_asset_id: row.to_asset_id === 'target' ? '' : row.to_asset_id,
    })
    assert.deepEqual((await db.execute('SELECT * FROM transactions ORDER BY id')).rows, beforeTx.map(unlink))
    assert.deepEqual((await db.execute('SELECT * FROM recurring_transactions ORDER BY id')).rows,
      beforeRecurring.map(r => ({ ...unlink(r), enabled: [r.asset_id, r.from_asset_id, r.to_asset_id].includes('target') ? 0 : r.enabled })))
    assert.equal((await db.execute("SELECT balance FROM assets WHERE id='other'")).rows[0].balance, 1000)
    assert.equal((await db.execute("SELECT default_asset_id FROM categories WHERE id='cat'")).rows[0].default_asset_id, '')
    const goal = (await db.execute("SELECT asset_id,current_amount FROM savings_goals WHERE id='goal'")).rows[0]
    assert.equal(goal.asset_id, '')
    assert.equal(goal.current_amount, 500)
    assert.equal((await remove('target')).status, 404)
    assert.equal((await remove('missing')).status, 404)

    await db.execute("CREATE TRIGGER reject_delete BEFORE DELETE ON assets WHEN OLD.id='rollback' BEGIN SELECT RAISE(ABORT,'test failure'); END")
    await assert.rejects(() => remove('rollback'))
    assert.equal((await db.execute("SELECT asset_id FROM transactions WHERE id='rollback-tx'")).rows[0].asset_id, 'rollback')
    const recurring = (await db.execute("SELECT asset_id,enabled FROM recurring_transactions WHERE id='rollback-tx'")).rows[0]
    assert.equal(recurring.asset_id, 'rollback')
    assert.equal(recurring.enabled, 1)
    assert.equal((await db.execute("SELECT COUNT(*) AS count FROM assets WHERE id='rollback'")).rows[0].count, 1)
    console.log('자산 삭제 검증 통과: 실제 삭제, 집계 제외 구분, 거래 보존, 연결 해제, 반복 거래 중지, 404, 원자적 롤백')
  } finally {
    db.close()
    await rm(dir, { recursive: true, force: true })
  }
}
main().catch(err => { console.error(err); process.exitCode = 1 })
