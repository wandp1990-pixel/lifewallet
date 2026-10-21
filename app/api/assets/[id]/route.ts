import { ownerApi } from '@/lib/ledger-api'
import { NextRequest, NextResponse } from 'next/server'
import { rowToAsset } from '@/lib/db'
import { ledgerWrite, saveAsset, deleteAsset, setCurrentAssetBalance, requireRow, koreaToday } from '@/lib/ledger-service'
import { requestKey } from '@/lib/ledger-api'
import { isDebtAssetType } from '@/lib/finance'
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const key = requestKey(req)
  const result = await ledgerWrite('app.update_asset', key, {id,body}, async tx => {
    const old = await requireRow(tx, 'assets', id)
    const { balance, balance_date, ...info } = body
    for (const field of ['start_date','end_date']) if (info[field] === null) info[field] = ''
    await saveAsset(tx, key, info, id)
    if (balance !== undefined || (balance_date !== undefined && balance_date !== old.balance_date)) {
      const reported = balance ?? (isDebtAssetType(old.group_type) ? -Number(old.balance) : Number(old.balance))
      await setCurrentAssetBalance(tx, key, id, reported, balance_date || koreaToday())
    }
    return { asset: rowToAsset(await requireRow(tx, 'assets', id)) }
  })
  return NextResponse.json(result.asset)
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const key = requestKey(req)
  const result = await ledgerWrite('app.delete_assets', key, {id}, tx => deleteAsset(tx, key, id))
  return NextResponse.json(result)
}

export const PATCH = ownerApi(handlePATCH)
export const DELETE = ownerApi(handleDELETE)
