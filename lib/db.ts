import { createClient } from '@libsql/client'
import type { Transaction, Asset } from './types'
import { getLoanRepaymentPrincipal } from './finance'

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
      ord  INTEGER NOT NULL DEFAULT 0,
      visible   INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0
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

  const categoryColumns = await db.execute('PRAGMA table_info(categories)')
  const columnNames = new Set(categoryColumns.rows.map(row => String((row as Record<string, unknown>).name ?? '')))
  if (!columnNames.has('visible')) {
    await db.execute('ALTER TABLE categories ADD COLUMN visible INTEGER NOT NULL DEFAULT 1')
  }
  if (!columnNames.has('is_system')) {
    await db.execute('ALTER TABLE categories ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0')
  }

  // 하드코딩 시스템 카테고리 제거 마이그레이션 (is_system=1 이면 삭제, 연결 거래는 미분류로)
  const sysResult = await db.execute("SELECT COUNT(*) as cnt FROM categories WHERE is_system = 1")
  if (Number((sysResult.rows[0] as Record<string, unknown>).cnt) > 0) {
    await db.execute("DELETE FROM categories WHERE is_system = 1")
    await db.execute("UPDATE transactions SET category_id = '' WHERE category_id != '' AND category_id NOT IN (SELECT id FROM categories)")
    await db.execute("UPDATE recurring_transactions SET category_id = '' WHERE category_id != '' AND category_id NOT IN (SELECT id FROM categories)")
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
    const principalAmount = getLoanRepaymentPrincipal(tx as Pick<Transaction, 'type' | 'amount' | 'fee'>)
    await db.execute({ sql: 'UPDATE assets SET balance = balance - ? WHERE id = ?', args: [amount, from_asset_id] })
    await db.execute({ sql: 'UPDATE assets SET balance = balance + ? WHERE id = ?', args: [principalAmount, to_asset_id] })
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
