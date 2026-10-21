import { createHash, randomUUID } from 'node:crypto'
import type { Transaction as DbTransaction, InValue } from '@libsql/client'
import db, { initDb, rowToAsset } from './db'
import {
  assetBalanceDelta,
  isDebtAssetType,
  validateTransactionInput,
  transactionAffectsBalance,
} from './finance'
import type { Asset, Category, Transaction } from './types'
import { ASSET_GROUP_ORDER } from './assetGroups'
import { fail, ledgerDate, money, koreaToday } from './ledger-errors'

type Data = Record<string, unknown>
type Row = Record<string, any>
export type LedgerTx = DbTransaction
const transactionFields = [
  'date',
  'type',
  'amount',
  'category_id',
  'asset_id',
  'content',
  'note',
  'from_asset_id',
  'to_asset_id',
  'fee',
]
const assetFields = [
  'group_type',
  'group_name',
  'name',
  'balance',
  'balance_date',
  'order',
  'visible',
  'track_detail',
  'savings_tracking',
  'target_balance_enabled',
  'target_balance',
  'principal',
  'interest_rate',
  'start_date',
  'end_date',
  'payment_day',
  'monthly_payment',
]
const categoryFields = [
  'type',
  'name',
  'icon',
  'order',
  'visible',
  'essentiality',
  'budget_excluded',
  'default_asset_id',
]
export function onlyFields(data: Data, fields: string[]) {
  const unknown = Object.keys(data).filter((key) => !fields.includes(key))
  if (unknown.length)
    fail('UNSUPPORTED_FIELD', '지원하지 않는 필드입니다.', {
      fields: unknown,
      supported_fields: fields,
    })
}
function text(data: Data, field: string, required = false): string {
  const value = data[field]
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > 2000 || (required && !value.trim()))
    fail('MISSING_INFORMATION', field + ': 문자열을 입력해주세요.', { fields: [field] })
  return value
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
      .join(',') +
    '}'
  )
}
export async function requireRow(
  tx: LedgerTx,
  table: 'assets' | 'categories' | 'transactions',
  id: unknown,
): Promise<Row> {
  if (typeof id !== 'string' || !id)
    fail('MISSING_INFORMATION', '실제 조회한 ID가 필요합니다.', { fields: [table + '_id'] })
  const rows = await tx.execute({ sql: 'SELECT * FROM ' + table + ' WHERE id=?', args: [id] })
  if (!rows.rows[0])
    fail('NOT_FOUND', '대상을 찾을 수 없습니다. 목록을 조회하고 사용자에게 확인해주세요.', {
      entity: table,
      id,
    })
  return rows.rows[0]
}
export async function audit(
  tx: LedgerTx,
  requestId: string,
  action: string,
  entity: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  await tx.execute({
    sql: 'INSERT INTO ledger_audit (id,request_id,action,entity,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)',
    args: [
      randomUUID(),
      requestId,
      action,
      entity,
      id,
      JSON.stringify(before),
      JSON.stringify(after),
      new Date().toISOString(),
    ],
  })
}
export async function ledgerWrite(
  operation: string,
  requestId: string,
  payload: Data,
  fn: (tx: LedgerTx) => Promise<Data>,
): Promise<Data> {
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 200)
    fail('MISSING_INFORMATION', '재시도에 유지할 request_id가 필요합니다.', {
      fields: ['request_id'],
    })
  await initDb()
  const hash = createHash('sha256').update(canonical({ operation, payload })).digest('hex')
  let tx: LedgerTx | undefined
  for (let i = 0; !tx; i++) {
    try {
      tx = await db.transaction('write')
    } catch (error) {
      const code = (error as { code?: string }).code
      if (i >= 5 || !['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT'].includes(code ?? '')) throw error
      await new Promise((resolve) => setTimeout(resolve, 25 * (i + 1)))
    }
  }
  try {
    const prior = await tx.execute({
      sql: 'SELECT * FROM ledger_requests WHERE request_id=?',
      args: [requestId],
    })
    if (prior.rows[0]) {
      if (prior.rows[0].payload_hash !== hash)
        fail('IDEMPOTENCY_CONFLICT', '같은 request_id로 다른 작업을 실행할 수 없습니다.')
      await tx.rollback()
      return { ...JSON.parse(String(prior.rows[0].response_json)), duplicate: true }
    }
    // Preserve retries of receipts saved before this extension.
    const legacy = await tx.execute({
      sql: 'SELECT * FROM work_receipt_requests WHERE request_id=?',
      args: [requestId],
    })
    if (legacy.rows[0]) {
      if (
        operation !== 'record_receipt' ||
        legacy.rows[0].payload_hash !==
          createHash('sha256').update(JSON.stringify(payload)).digest('hex')
      )
        fail('IDEMPOTENCY_CONFLICT', '기존 영수증 요청 ID와 충돌합니다.')
      await tx.rollback()
      return { transaction: JSON.parse(String(legacy.rows[0].response_json)), duplicate: true }
    }
    const result = { ...(await fn(tx)), duplicate: false, committed_at: new Date().toISOString() }
    await tx.execute({
      sql: 'INSERT INTO ledger_requests (request_id,payload_hash,response_json) VALUES (?,?,?)',
      args: [requestId, hash, JSON.stringify(result)],
    })
    await tx.commit()
    return result
  } catch (error) {
    if (!tx.closed) await tx.rollback()
    throw error
  } finally {
    tx.close()
  }
}
async function applyBalance(
  tx: LedgerTx,
  transaction: Transaction,
  sign: number,
  intermediate = false,
) {
  for (const id of new Set(
    [transaction.asset_id, transaction.from_asset_id, transaction.to_asset_id].filter(Boolean),
  )) {
    const row = await requireRow(tx, 'assets', id)
    const override = await tx.execute({
      sql: 'SELECT applied FROM ledger_balance_effects WHERE transaction_id=? AND asset_id=?',
      args: [transaction.id, id],
    })
    if (
      override.rows[0]
        ? !override.rows[0].applied
        : row.balance_date && transaction.date <= row.balance_date
    )
      continue
    const balance = Number(row.balance) + sign * assetBalanceDelta(transaction, id)
    money(balance, 'resulting_balance', -100_000_000_000_000)
    if (!intermediate && isDebtAssetType(row.group_type) && balance > 0)
      fail('INVALID_BALANCE', '부채 잔액은 0보다 클 수 없습니다.', { asset_id: id })
    await tx.execute({ sql: 'UPDATE assets SET balance=? WHERE id=?', args: [balance, id] })
  }
}
async function affectedBalances(tx: LedgerTx, transactions: Transaction[]) {
  const rows = []
  for (const id of new Set(
    transactions.flatMap((t) => [t.asset_id, t.from_asset_id, t.to_asset_id]).filter(Boolean),
  )) {
    rows.push(rowToAsset(await requireRow(tx, 'assets', id)))
  }
  return rows
}
export function transactionInput(data: Data): Transaction {
  onlyFields(data, transactionFields)
  const type = text(data, 'type', true)
  if (!['income', 'expense', 'transfer', 'loan_repayment', 'asset'].includes(type))
    fail(
      'UNSUPPORTED_OPERATION',
      '지원하지 않는 거래 유형입니다. 직접 잔액 변경은 set_asset_balance를 사용하세요.',
    )
  const transaction = {
    id: '',
    created_at: '',
    date: ledgerDate(data.date, 'date'),
    type: type as Transaction['type'],
    amount: money(data.amount, 'amount', 1),
    fee: money(data.fee ?? 0, 'fee'),
    asset_id: text(data, 'asset_id'),
    category_id: text(data, 'category_id'),
    from_asset_id: text(data, 'from_asset_id'),
    to_asset_id: text(data, 'to_asset_id'),
    content: text(data, 'content'),
    note: text(data, 'note'),
  }
  if (
    ['income', 'expense'].includes(type) &&
    (transaction.from_asset_id || transaction.to_asset_id || transaction.fee)
  )
    fail('INVALID_INPUT', '수입·지출은 asset_id와 category_id만 사용하고 fee는 0이어야 합니다.')
  if (
    ['transfer', 'loan_repayment'].includes(type) &&
    (transaction.asset_id || transaction.category_id)
  )
    fail('INVALID_INPUT', '이체·상환은 from_asset_id와 to_asset_id만 사용합니다.')
  return transaction
}
async function validateTransaction(tx: LedgerTx, transaction: Transaction, old?: Transaction) {
  const assets = (await tx.execute('SELECT * FROM assets')).rows as unknown as Asset[]
  const categories = (await tx.execute('SELECT * FROM categories')).rows as unknown as Category[]
  for (const asset of assets)
    if (!transactionAffectsBalance(transaction, asset))
      asset.balance = undefined as unknown as number
  for (const id of [
    transaction.asset_id,
    transaction.from_asset_id,
    transaction.to_asset_id,
  ].filter(Boolean)) {
    const asset = assets.find((a) => a.id === id)
    if (!asset) fail('NOT_FOUND', '자산 목록에서 실제 ID를 선택해주세요.', { asset_id: id })
    if (!asset.visible && ![old?.asset_id, old?.from_asset_id, old?.to_asset_id].includes(id))
      fail('INVALID_TARGET', '숨긴 자산에는 새 거래를 등록할 수 없습니다.', { asset_id: id })
  }
  const error = validateTransactionInput(
    transaction,
    assets,
    categories,
    old ? [old.category_id] : [],
  )
  if (error) fail('INVALID_TRANSACTION', error)
}
export async function selectTransaction(tx: LedgerTx, input: Data): Promise<Transaction> {
  if (input.transaction_id !== undefined) {
    if (input.selector !== undefined)
      fail('INVALID_INPUT', 'transaction_id 또는 selector 중 하나만 입력하세요.')
    return (
      await withBalanceEffects([await requireRow(tx, 'transactions', input.transaction_id)], tx)
    )[0] as Transaction
  }
  if (!input.selector || typeof input.selector !== 'object' || Array.isArray(input.selector))
    fail('MISSING_INFORMATION', '거래 ID 또는 조회 조건이 필요합니다.', {
      fields: ['transaction_id or selector'],
    })
  const selector = input.selector as Data
  onlyFields(selector, ['date', 'type', 'amount', 'asset_id', 'category_id', 'content'])
  if (!Object.keys(selector).length) fail('MISSING_INFORMATION', '선택 조건을 입력해주세요.')
  const args: InValue[] = []
  const clauses = []
  for (const [key, value] of Object.entries(selector)) {
    if (key === 'date') ledgerDate(value, 'selector.date')
    else if (key === 'amount') money(value, 'selector.amount', 1)
    else if (typeof value !== 'string' || !value)
      fail('INVALID_INPUT', '선택 조건을 확인해주세요.', { field: key })
    clauses.push(key + '=?')
    args.push(value as InValue)
  }
  const rows = await tx.execute({
    sql:
      'SELECT * FROM transactions WHERE ' +
      clauses.join(' AND ') +
      ' ORDER BY date DESC,created_at DESC,id DESC LIMIT 101',
    args,
  })
  if (!rows.rows.length) fail('NOT_FOUND', '조건에 맞는 거래가 없습니다.', { selector })
  if (rows.rows.length !== 1)
    fail(
      'AMBIGUOUS_TARGET',
      '거래가 여러 개입니다. 후보를 사용자에게 보여주고 ID를 선택받으세요.',
      { candidates: rows.rows.slice(0, 100), has_more: rows.rows.length > 100 },
    )
  return (await withBalanceEffects(rows.rows, tx))[0] as Transaction
}
export async function saveTransaction(
  tx: LedgerTx,
  requestId: string,
  data: Data,
  old?: Transaction,
  requireConfirmation = false,
  recovery?: { id: string; created_at: string },
) {
  if (old?.type === 'asset' && old.content === '잔액 조정')
    fail(
      'UNSUPPORTED_OPERATION',
      '기존 잔액조정 거래는 일반 거래로 수정할 수 없습니다. 기준일을 명시해 잔액을 다시 설정하세요.',
    )
  const { balance_included_asset_ids = [], balance_excluded_asset_ids = [], ...fields } = data
  if (!Array.isArray(balance_included_asset_ids) || !Array.isArray(balance_excluded_asset_ids))
    fail('INVALID_INPUT', '잔액 포함 여부는 자산 ID 배열로 입력하세요.')
  const next = transactionInput(
    old
      ? {
          ...Object.fromEntries(transactionFields.map((k) => [k, old[k as keyof Transaction]])),
          ...fields,
        }
      : fields,
  )
  next.id = old?.id ?? recovery?.id ?? 'txn_' + randomUUID()
  next.created_at = old?.created_at ?? recovery?.created_at ?? new Date().toISOString()
  const affectedIds = [
    ...new Set([next.asset_id, next.from_asset_id, next.to_asset_id].filter(Boolean)),
  ]
  for (const id of [...balance_included_asset_ids, ...balance_excluded_asset_ids]) {
    if (
      !affectedIds.includes(id) ||
      (balance_included_asset_ids.includes(id) && balance_excluded_asset_ids.includes(id))
    )
      fail('INVALID_INPUT', '거래 당사자 자산의 포함/미포함 여부를 중복 없이 입력하세요.', {
        asset_id: id,
      })
  }
  const effects: Record<string, boolean> = {}
  const pending = []
  for (const id of affectedIds) {
    const asset = await requireRow(tx, 'assets', id)
    const prior =
      old &&
      old.date === next.date &&
      [old.asset_id, old.from_asset_id, old.to_asset_id].includes(id)
        ? (
            await tx.execute({
              sql: 'SELECT applied FROM ledger_balance_effects WHERE transaction_id=? AND asset_id=?',
              args: [old.id, id],
            })
          ).rows[0]
        : null
    const normallyApplied = !asset.balance_date || next.date > asset.balance_date
    if (balance_included_asset_ids.includes(id)) {
      if (normallyApplied)
        fail(
          'INVALID_INPUT',
          '기준일 이후 거래는 기준 잔액에 포함할 수 없습니다. 잔액 기준일을 확인하세요.',
          { asset_id: id },
        )
      effects[id] = false
    } else if (balance_excluded_asset_ids.includes(id)) effects[id] = true
    else if (prior) effects[id] = Boolean(prior.applied)
    else if (
      !normallyApplied &&
      requireConfirmation &&
      !(
        old &&
        old.date === next.date &&
        [old.asset_id, old.from_asset_id, old.to_asset_id].includes(id)
      )
    )
      pending.push({
        asset_id: id,
        name: asset.name,
        balance_date: asset.balance_date,
        transaction_date: next.date,
      })
    else effects[id] = normallyApplied
  }
  if (pending.length)
    fail(
      'BALANCE_CONFIRMATION_REQUIRED',
      '이 거래가 확인한 기준 잔액에 이미 포함됐는지 사용자에게 확인하세요. 포함된 자산은 balance_included_asset_ids, 포함되지 않은 자산은 balance_excluded_asset_ids에 입력하세요.',
      { assets: pending },
    )
  next.balance_effects = effects
  const beforeBalances = await affectedBalances(tx, old ? [old, next] : [next])
  if (old) await applyBalance(tx, old, -1, true)
  await validateTransaction(tx, next, old)
  if (old) {
    await tx.execute({
      sql:
        'UPDATE transactions SET ' +
        transactionFields.map((k) => k + '=?').join(',') +
        ' WHERE id=?',
      args: [...(transactionFields.map((k) => next[k as keyof Transaction]) as InValue[]), next.id],
    })
  } else {
    const fields = ['id', ...transactionFields, 'created_at']
    await tx.execute({
      sql:
        'INSERT INTO transactions (' +
        fields.join(',') +
        ') VALUES (' +
        fields.map(() => '?').join(',') +
        ')',
      args: fields.map((k) => next[k as keyof Transaction]) as InValue[],
    })
  }
  await tx.execute({
    sql: 'DELETE FROM ledger_balance_effects WHERE transaction_id=?',
    args: [next.id],
  })
  for (const [id, applied] of Object.entries(effects))
    await tx.execute({
      sql: 'INSERT INTO ledger_balance_effects VALUES (?,?,?)',
      args: [next.id, id, applied ? 1 : 0],
    })
  await applyBalance(tx, next, 1)
  const balances = await affectedBalances(tx, old ? [old, next] : [next])
  for (const asset of balances)
    if (
      isDebtAssetType(asset.group_type) &&
      Number((await requireRow(tx, 'assets', asset.id)).balance) > 0
    )
      fail('INVALID_BALANCE', '수정 후 부채가 양수가 될 수 없습니다.')
  await audit(
    tx,
    requestId,
    old ? 'update' : recovery ? 'restore' : 'create',
    'transaction',
    next.id,
    old ?? null,
    next,
  )
  return {
    transaction: next,
    balances,
    balance_effects: balances.map((asset) => ({
      asset_id: asset.id,
      before: beforeBalances.find((a) => a.id === asset.id)?.balance,
      after: asset.balance,
      checkpoint_date: asset.balance_date,
      transaction_in_checkpoint: effects[asset.id] === false,
    })),
  }
}
export async function deleteTransaction(tx: LedgerTx, requestId: string, old: Transaction) {
  if (old.type === 'asset' && old.content === '잔액 조정')
    fail(
      'UNSUPPORTED_OPERATION',
      '기존 잔액조정 거래는 삭제할 수 없습니다. 기준일을 명시해 잔액을 다시 설정하세요.',
    )
  await applyBalance(tx, old, -1)
  await tx.execute({ sql: 'DELETE FROM transactions WHERE id=?', args: [old.id] })
  await tx.execute({
    sql: 'DELETE FROM ledger_balance_effects WHERE transaction_id=?',
    args: [old.id],
  })
  await audit(tx, requestId, 'delete', 'transaction', old.id, old, null)
  return {
    deleted: true,
    transaction: old,
    balances: await affectedBalances(tx, [old]),
    recovery: 'ledger_audit.before_json',
  }
}
export async function restoreTransaction(tx: LedgerTx, requestId: string, auditId: string) {
  const row = (
    await tx.execute({
      sql: "SELECT *,rowid AS audit_sequence FROM ledger_audit WHERE id=? AND entity='transaction' AND action='delete'",
      args: [auditId],
    })
  ).rows[0]
  if (!row) fail('NOT_FOUND', '삭제 이력을 찾을 수 없습니다.')
  const old = JSON.parse(String(row.before_json)) as Transaction
  if (
    (await tx.execute({ sql: 'SELECT id FROM transactions WHERE id=?', args: [old.id] })).rows
      .length
  )
    fail('INVALID_TARGET', '이미 존재하는 거래는 복구할 수 없습니다.')
  const included: string[] = [],
    excluded: string[] = []
  for (const [id, applied] of Object.entries(old.balance_effects ?? {})) {
    const newer = (
      await tx.execute({
        sql: "SELECT id FROM ledger_audit WHERE entity='asset' AND entity_id=? AND action='set_balance' AND rowid>? LIMIT 1",
        args: [id, row.audit_sequence],
      })
    ).rows.length
    if (!newer) (applied ? excluded : included).push(id)
  }
  return saveTransaction(
    tx,
    requestId,
    {
      ...Object.fromEntries(transactionFields.map((k) => [k, old[k as keyof Transaction]])),
      balance_included_asset_ids: included,
      balance_excluded_asset_ids: excluded,
    },
    undefined,
    false,
    { id: old.id, created_at: old.created_at },
  )
}
function checkPrimitiveFields(data: Data, bools: string[], strings: string[], numbers: string[]) {
  for (const field of bools)
    if (data[field] !== undefined && typeof data[field] !== 'boolean')
      fail('INVALID_INPUT', field + ': boolean이 필요합니다.', { field })
  for (const field of strings) if (data[field] !== undefined) text(data, field)
  for (const field of numbers) if (data[field] !== undefined) money(data[field], field)
}
export async function saveAsset(tx: LedgerTx, requestId: string, data: Data, id?: string) {
  onlyFields(data, assetFields)
  const old = id ? await requireRow(tx, 'assets', id) : null
  checkPrimitiveFields(
    data,
    ['visible', 'track_detail', 'savings_tracking', 'target_balance_enabled'],
    ['name', 'group_name', 'start_date', 'end_date', 'balance_date'],
    ['order', 'target_balance', 'principal', 'monthly_payment', 'payment_day'],
  )
  const group = data.group_type ?? old?.group_type
  if (!ASSET_GROUP_ORDER.includes(group as Asset['group_type']))
    fail('INVALID_INPUT', '지원하는 자산 유형이 필요합니다.', {
      supported_types: ASSET_GROUP_ORDER,
    })
  if (old && group !== old.group_type) {
    const linked = await tx.execute({
      sql: 'SELECT id FROM transactions WHERE asset_id=? OR from_asset_id=? OR to_asset_id=? UNION ALL SELECT id FROM recurring_transactions WHERE asset_id=? OR from_asset_id=? OR to_asset_id=? LIMIT 1',
      args: [id!, id!, id!, id!, id!, id!],
    })
    if (linked.rows.length)
      fail('INVALID_TARGET', '연결된 거래가 있는 자산은 유형을 변경할 수 없습니다.')
  }
  const name = text({ name: data.name ?? old?.name }, 'name', true)
  const balanceChanged = data.balance !== undefined || data.balance_date !== undefined
  if (old && balanceChanged)
    fail(
      'UNSUPPORTED_OPERATION',
      '정보 수정과 잔액 변경을 분리하세요. set_asset_balance를 사용해주세요.',
    )
  const balance = old
    ? Number(old.balance)
    : money(
        data.balance,
        'balance',
        isDebtAssetType(group as Asset['group_type']) ? 0 : -100_000_000_000_000,
      )
  const balanceDate = old?.balance_date ?? ledgerDate(data.balance_date, 'balance_date')
  if (!old && isDebtAssetType(group as Asset['group_type']) && balance < 0)
    fail('INVALID_AMOUNT', '신규 부채 잔액은 양의 원금으로 입력하세요.')
  if (
    old &&
    group !== old.group_type &&
    isDebtAssetType(group as Asset['group_type']) !== isDebtAssetType(old.group_type)
  )
    fail('UNSUPPORTED_OPERATION', '자산/부채 사이의 유형 변경은 지원하지 않습니다.')
  const next: Row = {
    ...(old ?? {
      id: 'ast_' + randomUUID(),
      group_name: '',
      ord: 0,
      visible: 1,
      track_detail: 0,
      savings_tracking: 0,
      target_balance_enabled: 0,
      target_balance: 0,
      principal: 0,
      interest_rate: 0,
      start_date: '',
      end_date: '',
      payment_day: 0,
      monthly_payment: 0,
    }),
    ...data,
    group_type: group,
    name,
    balance: !old && isDebtAssetType(group as Asset['group_type']) ? -balance : balance,
    balance_date: balanceDate,
  }
  if (data.order !== undefined) next.ord = data.order
  delete next.order
  for (const field of ['visible', 'track_detail', 'savings_tracking', 'target_balance_enabled'])
    next[field] = next[field] ? 1 : 0
  if (group === 'loan' || group === 'savings') next.track_detail = 1
  if (group === 'savings') next.savings_tracking = 1
  if (!next.target_balance_enabled) next.target_balance = 0
  for (const field of ['start_date', 'end_date'])
    if (next[field]) ledgerDate(next[field], field, true)
  if (next.start_date && next.end_date && next.start_date > next.end_date)
    fail('INVALID_DATE', '종료일이 시작일보다 빠릅니다.')
  if (
    typeof next.interest_rate !== 'number' ||
    !Number.isFinite(next.interest_rate) ||
    next.interest_rate < 0 ||
    next.interest_rate > 100
  )
    fail('INVALID_INPUT', '연이율은 0~100 사이의 백분율입니다.')
  if (next.payment_day > 31) fail('INVALID_INPUT', '상환일은 0(미설정) 또는 1~31입니다.')
  const fields = Object.keys(next)
  if (old)
    await tx.execute({
      sql:
        'UPDATE assets SET ' +
        fields
          .filter((k) => k !== 'id')
          .map((k) => k + '=?')
          .join(',') +
        ' WHERE id=?',
      args: [...fields.filter((k) => k !== 'id').map((k) => next[k]), id!],
    })
  else
    await tx.execute({
      sql:
        'INSERT INTO assets (' +
        fields.join(',') +
        ') VALUES (' +
        fields.map(() => '?').join(',') +
        ')',
      args: fields.map((k) => next[k]),
    })
  await audit(tx, requestId, old ? 'update' : 'create', 'asset', next.id, old, next)
  return { asset: rowToAsset(next) }
}
export async function setBalance(
  tx: LedgerTx,
  requestId: string,
  id: string,
  value: unknown,
  date: unknown,
) {
  const old = await requireRow(tx, 'assets', id)
  const asOf = ledgerDate(date, 'as_of')
  const debt = isDebtAssetType(old.group_type)
  const reported = money(value, 'balance', debt ? 0 : -100_000_000_000_000)
  const checkpoint = debt ? -reported : reported
  const later = await tx.execute({
    sql: 'SELECT * FROM transactions WHERE date>? AND (asset_id=? OR from_asset_id=? OR to_asset_id=?)',
    args: [asOf, id, id, id],
  })
  const balance = later.rows.reduce(
    (sum, row) => sum + assetBalanceDelta(row as unknown as Transaction, id),
    checkpoint,
  )
  money(balance, 'resulting_balance', -100_000_000_000_000)
  if (debt && balance > 0)
    fail('INVALID_BALANCE', '기준일 이후 상환 원금이 설정한 부채를 초과합니다.')
  await tx.execute({
    sql: 'UPDATE assets SET balance=?,balance_date=? WHERE id=?',
    args: [balance, asOf, id],
  })
  await tx.execute({ sql: 'DELETE FROM ledger_balance_effects WHERE asset_id=?', args: [id] })
  await tx.execute({
    sql: 'INSERT INTO ledger_balance_effects (transaction_id,asset_id,applied) SELECT id,?,CASE WHEN date>? THEN 1 ELSE 0 END FROM transactions WHERE asset_id=? OR from_asset_id=? OR to_asset_id=?',
    args: [id, asOf, id, id, id],
  })
  const next = { ...old, balance, balance_date: asOf }
  await audit(tx, requestId, 'set_balance', 'asset', id, old, next)
  return {
    asset: rowToAsset(next),
    as_of: asOf,
    checkpoint_balance: checkpoint,
    subsequent_transaction_delta: balance - checkpoint,
    change: balance - Number(old.balance),
    income_expense_effect: 0,
  }
}
// The existing app form sends the CURRENT balance alongside its anchor date.
// Convert that contract into the same checkpoint operation used by MCP, which
// explicitly accepts a balance AS OF the requested date.
export async function setCurrentAssetBalance(
  tx: LedgerTx,
  requestId: string,
  id: string,
  value: unknown,
  date: unknown,
) {
  const old = await requireRow(tx, 'assets', id)
  const asOf = ledgerDate(date, 'balance_date')
  const debt = isDebtAssetType(old.group_type)
  const input = money(value, 'balance', debt ? 0 : -100_000_000_000_000)
  const current = debt ? -input : input
  const later = await tx.execute({
    sql: 'SELECT * FROM transactions WHERE date>? AND (asset_id=? OR from_asset_id=? OR to_asset_id=?)',
    args: [asOf, id, id, id],
  })
  const checkpoint = later.rows.reduce(
    (sum, row) => sum - assetBalanceDelta(row as unknown as Transaction, id),
    current,
  )
  if (debt && checkpoint > 0)
    fail('INVALID_BALANCE', '현재 잔액과 기준일 이후 거래가 부채 규칙에 맞지 않습니다.')
  return setBalance(tx, requestId, id, debt ? -checkpoint : checkpoint, asOf)
}
export function categoryRow(row: Row) {
  return {
    ...row,
    order: row.ord,
    visible: Boolean(row.visible),
    is_system: Boolean(row.is_system),
    budget_excluded: Boolean(row.budget_excluded),
  }
}
export async function saveCategory(tx: LedgerTx, requestId: string, data: Data, id?: string) {
  onlyFields(data, categoryFields)
  const old = id ? await requireRow(tx, 'categories', id) : null
  checkPrimitiveFields(
    data,
    ['visible', 'budget_excluded'],
    ['name', 'icon', 'default_asset_id'],
    ['order'],
  )
  if (old && data.type !== undefined && data.type !== old.type)
    fail('UNSUPPORTED_OPERATION', '분류 유형 변경은 지원하지 않습니다.')
  const next: Row = {
    ...(old ?? {
      id: 'cat_' + randomUUID(),
      icon: '',
      ord: 0,
      visible: 1,
      is_system: 0,
      essentiality: 'wants',
      budget_excluded: 0,
      default_asset_id: '',
    }),
    ...data,
  }
  next.name = text(next, 'name', true)
  if (!['income', 'expense', 'asset'].includes(next.type))
    fail('INVALID_INPUT', '분류 유형은 income/expense/asset입니다.')
  if (!old && next.type === 'expense' && data.essentiality === undefined)
    fail('MISSING_INFORMATION', '지출 성격을 선택해주세요.', {
      fields: ['essentiality'],
      options: ['needs', 'wants', 'savings', 'unexpected'],
    })
  if (!['needs', 'wants', 'savings', 'unexpected'].includes(next.essentiality))
    fail('INVALID_INPUT', '유효한 essentiality가 필요합니다.')
  if (next.default_asset_id) await requireRow(tx, 'assets', next.default_asset_id)
  if (data.order !== undefined) next.ord = data.order
  delete next.order
  next.visible = next.visible ? 1 : 0
  next.budget_excluded = next.type === 'expense' && next.budget_excluded ? 1 : 0
  const fields = Object.keys(next)
  if (old)
    await tx.execute({
      sql:
        'UPDATE categories SET ' +
        fields
          .filter((k) => k !== 'id')
          .map((k) => k + '=?')
          .join(',') +
        ' WHERE id=?',
      args: [...fields.filter((k) => k !== 'id').map((k) => next[k]), id!],
    })
  else
    await tx.execute({
      sql:
        'INSERT INTO categories (' +
        fields.join(',') +
        ') VALUES (' +
        fields.map(() => '?').join(',') +
        ')',
      args: fields.map((k) => next[k]),
    })
  await audit(tx, requestId, old ? 'update' : 'create', 'category', next.id, old, next)
  return { category: categoryRow(next) }
}
export async function deleteAsset(tx: LedgerTx, requestId: string, id: string) {
  const asset = await requireRow(tx, 'assets', id)
  const linked = 'asset_id=? OR from_asset_id=? OR to_asset_id=?'
  const transactions = (
    await tx.execute({ sql: 'SELECT * FROM transactions WHERE ' + linked, args: [id, id, id] })
  ).rows
  const recurring = (
    await tx.execute({
      sql: 'SELECT * FROM recurring_transactions WHERE ' + linked,
      args: [id, id, id],
    })
  ).rows
  const categories = (
    await tx.execute({ sql: 'SELECT * FROM categories WHERE default_asset_id=?', args: [id] })
  ).rows
  const goals = (
    await tx.execute({ sql: 'SELECT * FROM savings_goals WHERE asset_id=?', args: [id] })
  ).rows
  const effects = (
    await tx.execute({ sql: 'SELECT * FROM ledger_balance_effects WHERE asset_id=?', args: [id] })
  ).rows
  for (const table of ['transactions', 'recurring_transactions']) {
    await tx.execute({
      sql:
        'UPDATE ' +
        table +
        " SET asset_id=CASE WHEN asset_id=? THEN '' ELSE asset_id END,from_asset_id=CASE WHEN from_asset_id=? THEN '' ELSE from_asset_id END,to_asset_id=CASE WHEN to_asset_id=? THEN '' ELSE to_asset_id END" +
        (table === 'recurring_transactions' ? ',enabled=0' : '') +
        ' WHERE ' +
        linked,
      args: [id, id, id, id, id, id],
    })
  }
  await tx.execute({
    sql: "UPDATE categories SET default_asset_id='' WHERE default_asset_id=?",
    args: [id],
  })
  await tx.execute({ sql: "UPDATE savings_goals SET asset_id='' WHERE asset_id=?", args: [id] })
  await tx.execute({ sql: 'DELETE FROM ledger_balance_effects WHERE asset_id=?', args: [id] })
  await tx.execute({ sql: 'DELETE FROM assets WHERE id=?', args: [id] })
  await audit(
    tx,
    requestId,
    'delete',
    'asset',
    id,
    { asset, transactions, recurring, categories, goals, effects },
    null,
  )
  return { ok: true, deleted_id: id }
}
export async function deleteCategory(tx: LedgerTx, requestId: string, id: string) {
  const category = await requireRow(tx, 'categories', id)
  const transactions = (
    await tx.execute({ sql: 'SELECT * FROM transactions WHERE category_id=?', args: [id] })
  ).rows
  const recurring = (
    await tx.execute({
      sql: 'SELECT * FROM recurring_transactions WHERE category_id=?',
      args: [id],
    })
  ).rows
  await tx.execute({
    sql: "UPDATE transactions SET category_id='' WHERE category_id=?",
    args: [id],
  })
  await tx.execute({
    sql: "UPDATE recurring_transactions SET category_id='' WHERE category_id=?",
    args: [id],
  })
  await tx.execute({ sql: 'DELETE FROM categories WHERE id=?', args: [id] })
  await audit(tx, requestId, 'delete', 'category', id, { category, transactions, recurring }, null)
  return { ok: true, deleted_id: id }
}
export async function balancesAt(tx: LedgerTx, asOf: string, id?: string) {
  ledgerDate(asOf, 'as_of')
  if (id) await requireRow(tx, 'assets', id)
  const assets = await tx.execute(
    id
      ? { sql: 'SELECT * FROM assets WHERE id=? ORDER BY ord,id', args: [id] }
      : 'SELECT * FROM assets ORDER BY ord,id',
  )
  const transactions = await tx.execute({
    sql: 'SELECT * FROM transactions WHERE date>?',
    args: [asOf],
  })
  return assets.rows.map((row) => {
    const asset = rowToAsset(row)
    const available = Boolean(asset.balance_date && asOf >= asset.balance_date)
    const balance = available
      ? transactions.rows.reduce(
          (sum, t) => sum - assetBalanceDelta(t as unknown as Transaction, asset.id),
          asset.balance,
        )
      : null
    return {
      ...asset,
      balance,
      stored_balance: asset.balance,
      checkpoint_date: asset.balance_date || null,
      as_of: asOf,
      available,
      unavailable_reason: available
        ? null
        : '기준일 미설정 또는 요청일이 최근 잔액 기준일보다 이전입니다.',
      currency: 'KRW',
    }
  })
}
export async function withLedgerRead<T>(fn: (tx: LedgerTx) => Promise<T>): Promise<T> {
  await initDb()
  const tx = await db.transaction('read')
  try {
    const result = await fn(tx)
    await tx.commit()
    return result
  } catch (error) {
    await tx.rollback()
    throw error
  } finally {
    tx.close()
  }
}
export async function withBalanceEffects(rows: Row[], executor: Pick<LedgerTx, 'execute'> = db) {
  const results: Row[] = rows.map((row) => ({
    ...row,
    balance_effects: {} as Record<string, boolean>,
  }))
  const map = new Map(results.map((row) => [String(row.id), row]))
  for (let offset = 0; offset < rows.length; offset += 500) {
    const ids = rows.slice(offset, offset + 500).map((row) => String(row.id))
    const effects = await executor.execute({
      sql:
        'SELECT * FROM ledger_balance_effects WHERE transaction_id IN (' +
        ids.map(() => '?').join(',') +
        ')',
      args: ids,
    })
    for (const row of effects.rows)
      map.get(String(row.transaction_id))!.balance_effects[String(row.asset_id)] = Boolean(
        row.applied,
      )
  }
  return results
}
export { koreaToday }
