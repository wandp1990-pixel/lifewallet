import { NextRequest, NextResponse } from 'next/server'
import db, { applyTransactionBalance, reverseTransactionBalance } from '@/lib/db'
import { getLoanRepaymentPrincipal, normalizeAssetBalance, validateTransactionInput } from '@/lib/finance'
import type { Asset, Category, Transaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

type ValidationAsset = Pick<Asset, 'id' | 'group_type' | 'visible' | 'balance'>

function addBalanceDelta(assets: ValidationAsset[], assetId: string, delta: number) {
  const asset = assets.find(a => a.id === assetId)
  if (!asset) return
  asset.balance = normalizeAssetBalance(asset.group_type, asset.balance) + delta
}

function applyTransactionToSnapshot(assets: ValidationAsset[], tx: Transaction, sign: 1 | -1) {
  if (tx.type === 'income') {
    addBalanceDelta(assets, tx.asset_id, sign * tx.amount)
  } else if (tx.type === 'expense') {
    addBalanceDelta(assets, tx.asset_id, sign * -tx.amount)
  } else if (tx.type === 'transfer') {
    addBalanceDelta(assets, tx.from_asset_id, sign * -(tx.amount + (tx.fee ?? 0)))
    addBalanceDelta(assets, tx.to_asset_id, sign * tx.amount)
  } else if (tx.type === 'loan_repayment') {
    addBalanceDelta(assets, tx.from_asset_id, sign * -tx.amount)
    addBalanceDelta(assets, tx.to_asset_id, sign * getLoanRepaymentPrincipal(tx))
  } else if (tx.type === 'asset') {
    addBalanceDelta(assets, tx.asset_id, sign * tx.amount)
  }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [id] })
  if (!result.rows[0]) return NextResponse.json({ error: '해당 거래를 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json(result.rows[0], { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 거래를 찾을 수 없습니다' }, { status: 404 })

  const old = existing.rows[0] as unknown as Transaction
  const updated: Transaction = { ...old, ...body, id }
  const assets = (await db.execute({ sql: 'SELECT id, group_type, visible, balance FROM assets' })).rows as unknown as ValidationAsset[]
  const validationAssets = assets.map(asset => ({
    ...asset,
    balance: normalizeAssetBalance(asset.group_type, asset.balance),
  }))
  applyTransactionToSnapshot(validationAssets, old, -1)
  const categories = (await db.execute({ sql: 'SELECT id, type, visible FROM categories' })).rows as unknown as Pick<Category, 'id' | 'type' | 'visible'>[]
  const validationError = validateTransactionInput(updated, validationAssets, categories, [old.category_id])
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  await reverseTransactionBalance(old)

  await db.execute({
    sql: `UPDATE transactions SET date=?,type=?,amount=?,category_id=?,asset_id=?,content=?,note=?,from_asset_id=?,to_asset_id=?,fee=? WHERE id=?`,
    args: [updated.date, updated.type, updated.amount, updated.category_id, updated.asset_id, updated.content, updated.note, updated.from_asset_id, updated.to_asset_id, updated.fee, id],
  })
  await applyTransactionBalance(updated)

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const existing = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: [id] })
  if (!existing.rows[0]) return NextResponse.json({ error: '해당 거래를 찾을 수 없습니다' }, { status: 404 })

  await reverseTransactionBalance(existing.rows[0] as unknown as Transaction)
  await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [id] })

  return NextResponse.json({ ok: true })
}
