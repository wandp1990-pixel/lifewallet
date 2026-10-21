import { NextRequest, NextResponse } from 'next/server'
import { ownerApi, requestKey } from '@/lib/ledger-api'
import { ledgerWrite, saveTransaction } from '@/lib/ledger-service'
import { fail } from '@/lib/ledger-errors'
import { getDateInDisplayMonth } from '@/lib/monthStart'
export const dynamic = 'force-dynamic'

export const POST = ownerApi(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const body = await req.json()
  const month = body.month
  const day = Number(body.month_start_day ?? body.monthStartDay ?? 1)
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(day) || day<1 || day>31) fail('INVALID_DATE','유효한 회계월과 시작일이 필요합니다.')
  const key = req.headers.get('idempotency-key') ?? 'recurring:' + id + ':' + month
  const result = await ledgerWrite('app.apply_recurring', key, {id,month,day}, async tx => {
    const row = (await tx.execute({sql:'SELECT * FROM recurring_transactions WHERE id=?',args:[id]})).rows[0]
    if (!row) fail('NOT_FOUND','반복 거래를 찾을 수 없습니다.')
    if (!row.enabled || row.last_applied_month === month) fail('INVALID_TARGET','비활성 또는 이미 적용된 반복 거래입니다.')
    const [year,m] = month.split('-').map(Number)
    const date = getDateInDisplayMonth(year,m,Number(row.day_of_month),day)
    const transaction = await saveTransaction(tx,key,{date,type:row.type,amount:row.amount,category_id:row.category_id,asset_id:row.asset_id,content:row.content,note:row.note,from_asset_id:row.from_asset_id,to_asset_id:row.to_asset_id,fee:row.fee})
    await tx.execute({sql:'UPDATE recurring_transactions SET last_applied_month=? WHERE id=?',args:[month,id]})
    return {...transaction,applied_month:month}
  })
  return NextResponse.json(result,{status:201})
})
