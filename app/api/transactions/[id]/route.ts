import { ownerApi } from '@/lib/ledger-api'
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { ledgerWrite, saveTransaction, selectTransaction, deleteTransaction, withBalanceEffects } from '@/lib/ledger-service'
import { requestKey } from '@/lib/ledger-api'
export const dynamic = 'force-dynamic'

async function handleGET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [id] })
  if (!result.rows[0]) return NextResponse.json({ error: '해당 거래를 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json((await withBalanceEffects(result.rows))[0], { headers: { 'Cache-Control': 'no-store' } })
}

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const key = requestKey(req)
  const result = await ledgerWrite('app.update_transaction', key, { id, body }, async tx => saveTransaction(tx, key, body, await selectTransaction(tx, { transaction_id: id })))
  return NextResponse.json(result.transaction)
}
async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const key = requestKey(req)
  const result = await ledgerWrite('app.delete_transaction', key, { id }, async tx => deleteTransaction(tx, key, await selectTransaction(tx, { transaction_id: id })))
  return NextResponse.json({ ok: true, ...result })
}

export const GET = ownerApi(handleGET)
export const PATCH = ownerApi(handlePATCH)
export const DELETE = ownerApi(handleDELETE)
