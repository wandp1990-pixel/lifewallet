import { createClient } from '@libsql/client'
import type { Transaction, Asset } from './types'

const DEFAULT_CATEGORIES = [
  { id: 'cat_income_salary', type: 'income',  name: '급여',          icon: '💰', ord: 1 },
  { id: 'cat_income_bonus',  type: 'income',  name: '상여금',         icon: '🤑', ord: 2 },
  { id: 'cat_income_other',  type: 'income',  name: '기타',           icon: '📥', ord: 3 },
  { id: 'cat_food',          type: 'expense', name: '식비',           icon: '🍜', ord: 1 },
  { id: 'cat_transport',     type: 'expense', name: '교통비',         icon: '🚌', ord: 2 },
  { id: 'cat_housing',       type: 'expense', name: '주거',           icon: '🏠', ord: 3 },
  { id: 'cat_utility',       type: 'expense', name: '공과금',         icon: '💡', ord: 4 },
  { id: 'cat_telecom',       type: 'expense', name: '통신비',         icon: '📞', ord: 5 },
  { id: 'cat_supplies',      type: 'expense', name: '생필품',         icon: '🛒', ord: 6 },
  { id: 'cat_subscription',  type: 'expense', name: '구독',           icon: '🖥️', ord: 7 },
  { id: 'cat_hobby',         type: 'expense', name: '취미',           icon: '🎮', ord: 8 },
  { id: 'cat_clothing',      type: 'expense', name: '의류&잡화',      icon: '👕', ord: 9 },
  { id: 'cat_self_care',     type: 'expense', name: '자기관리&건강',  icon: '✂️', ord: 10 },
  { id: 'cat_gift',          type: 'expense', name: '경조사/선물',    icon: '🎁', ord: 11 },
  { id: 'cat_medical',       type: 'expense', name: '의료/건강',      icon: '❤️', ord: 12 },
  { id: 'cat_other',         type: 'expense', name: '기타',           icon: '📦', ord: 13 },
] as const

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export default db

export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS transactions (
      id            TEXT    PRIMARY KEY,
      date          TEXT    NOT NULL,
      type          TEXT    NOT NULL,
      category_id   TEXT    NOT NULL DEFAULT '',
      asset_id      TEXT    NOT NULL DEFAULT '',
      content       TEXT    NOT NULL DEFAULT '',
      amount        INTEGER NOT NULL DEFAULT 0,
      note          TEXT    NOT NULL DEFAULT '',
      from_asset_id TEXT    NOT NULL DEFAULT '',
      to_asset_id   TEXT    NOT NULL DEFAULT '',
      fee           INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);

    CREATE TABLE IF NOT EXISTS categories (
      id   TEXT    PRIMARY KEY,
      type TEXT    NOT NULL,
      name TEXT    NOT NULL,
      icon TEXT    NOT NULL DEFAULT '',
      ord  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS budgets (
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      category_id TEXT    NOT NULL,
      amount      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (year, month, category_id)
    );

    CREATE TABLE IF NOT EXISTS assets (
      id              TEXT    PRIMARY KEY,
      group_type      TEXT    NOT NULL,
      group_name      TEXT    NOT NULL DEFAULT '',
      name            TEXT    NOT NULL,
      balance         INTEGER NOT NULL DEFAULT 0,
      ord             INTEGER NOT NULL DEFAULT 0,
      visible         INTEGER NOT NULL DEFAULT 1,
      track_detail    INTEGER NOT NULL DEFAULT 0,
      principal       INTEGER NOT NULL DEFAULT 0,
      interest_rate   REAL    NOT NULL DEFAULT 0,
      start_date      TEXT    NOT NULL DEFAULT '',
      end_date        TEXT    NOT NULL DEFAULT '',
      payment_day     INTEGER NOT NULL DEFAULT 0,
      monthly_payment INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id             TEXT    PRIMARY KEY,
      name           TEXT    NOT NULL,
      target_amount  INTEGER NOT NULL DEFAULT 0,
      current_amount INTEGER NOT NULL DEFAULT 0,
      target_date    TEXT    NOT NULL DEFAULT '',
      asset_id       TEXT    NOT NULL DEFAULT '',
      memo           TEXT    NOT NULL DEFAULT '',
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id          TEXT    PRIMARY KEY,
      type        TEXT    NOT NULL DEFAULT 'wish',
      name        TEXT    NOT NULL,
      price       INTEGER NOT NULL DEFAULT 0,
      priority    INTEGER NOT NULL DEFAULT 2,
      target_date TEXT    NOT NULL DEFAULT '',
      is_done     INTEGER NOT NULL DEFAULT 0,
      memo        TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recurring_transactions (
      id                 TEXT    PRIMARY KEY,
      type               TEXT    NOT NULL,
      amount             INTEGER NOT NULL DEFAULT 0,
      category_id        TEXT    NOT NULL DEFAULT '',
      asset_id           TEXT    NOT NULL DEFAULT '',
      from_asset_id      TEXT    NOT NULL DEFAULT '',
      to_asset_id        TEXT    NOT NULL DEFAULT '',
      content            TEXT    NOT NULL DEFAULT '',
      note               TEXT    NOT NULL DEFAULT '',
      fee                INTEGER NOT NULL DEFAULT 0,
      day_of_month       INTEGER NOT NULL DEFAULT 1,
      enabled            INTEGER NOT NULL DEFAULT 1,
      last_applied_month TEXT    NOT NULL DEFAULT '',
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)

  for (const c of DEFAULT_CATEGORIES) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO categories (id,type,name,icon,ord) VALUES (?,?,?,?,?)',
      args: [c.id, c.type, c.name, c.icon, c.ord],
    })
  }
}

export async function applyTransactionBalance(
  tx: Pick<Transaction, 'type' | 'amount' | 'fee' | 'asset_id' | 'from_asset_id' | 'to_asset_id'>
) {
  const { type, amount, fee, asset_id, from_asset_id, to_asset_id } = tx
  if (type === 'income') {
    await db.execute({ sql: 'UPDATE assets SET balance = balance + ? WHERE id = ?', args: [amount, asset_id] })
  } else if (type === 'expense') {
    await db.execute({ sql: 'UPDATE assets SET balance = balance - ? WHERE id = ?', args: [amount, asset_id] })
  } else if (type === 'transfer') {
    await db.execute({ sql: 'UPDATE assets SET balance = balance - ? WHERE id = ?', args: [amount + (fee ?? 0), from_asset_id] })
    await db.execute({ sql: 'UPDATE assets SET balance = balance + ? WHERE id = ?', args: [amount, to_asset_id] })
  } else if (type === 'loan_repayment') {
    await db.execute({ sql: 'UPDATE assets SET balance = balance - ? WHERE id = ?', args: [amount, from_asset_id] })
    await db.execute({ sql: 'UPDATE assets SET balance = balance + ? WHERE id = ?', args: [amount, to_asset_id] })
  } else if (type === 'asset') {
    await db.execute({ sql: 'UPDATE assets SET balance = balance + ? WHERE id = ?', args: [amount, asset_id] })
  }
}

export async function reverseTransactionBalance(
  tx: Pick<Transaction, 'type' | 'amount' | 'fee' | 'asset_id' | 'from_asset_id' | 'to_asset_id'>
) {
  const reversed = { ...tx, amount: -tx.amount, fee: -(tx.fee ?? 0) }
  await applyTransactionBalance(reversed as typeof tx)
}

export function rowToAsset(row: Record<string, unknown>): Asset {
  return {
    id: row.id as string,
    group_type: row.group_type as Asset['group_type'],
    group_name: row.group_name as string,
    name: row.name as string,
    balance: row.balance as number,
    order: row.ord as number,
    visible: Boolean(row.visible),
    track_detail: Boolean(row.track_detail),
    principal: row.principal as number | undefined,
    interest_rate: row.interest_rate as number | undefined,
    start_date: row.start_date as string | undefined,
    end_date: row.end_date as string | undefined,
    payment_day: row.payment_day as number | undefined,
    monthly_payment: row.monthly_payment as number | undefined,
  }
}
