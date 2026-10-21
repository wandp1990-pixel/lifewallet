import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'lifewallet-ledger-'))
  // Set these BEFORE importing db or any route. Never load .env.local.
  process.env.TURSO_DATABASE_URL = 'file:' + join(directory, 'test.db')
  delete process.env.TURSO_AUTH_TOKEN
  delete process.env.GOOGLE_CLIENT_SECRET
  process.env.WORK_MCP_TOKEN = 'local-fixture-only-owner-token-with-32-chars'
  const { default: db, initDb } = await import('../lib/db')
  const { koreaToday, LedgerError } = await import('../lib/ledger-errors')
  const { callWorkTool, workTools } = await import('../lib/work-tools')
  const { transactionAffectsBalance } = await import('../lib/finance')
  const { NextRequest } = await import('next/server')
  const { POST } = await import('../app/api/mcp/route')
  let sequence = 0
  const today = koreaToday()
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10)
  const period = { from: yesterday, to: today }
  const headers = {
    'Content-Type': 'application/json',
    authorization: 'Bearer ' + process.env.WORK_MCP_TOKEN,
  }
  const rpc = async (name: string, args: Record<string, unknown>, authorized = true) => {
    const response = await POST(
      new NextRequest('https://test.example/api/mcp', {
        method: 'POST',
        headers: authorized ? headers : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++sequence,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      }),
    )
    if (!authorized) return { status: response.status }
    assert.equal(response.status, 200)
    const body = await response.json()
    return body.result.structuredContent as Record<string, any>
  }
  const write = (name: string, args: Record<string, unknown>) =>
    rpc(name, { request_id: 'fixture-' + ++sequence, ...args })
  const success = (result: Record<string, any>) => {
    assert.ok(!result.error, JSON.stringify(result))
    return result
  }
  const balance = async (id: string) =>
    Number(
      (await db.execute({ sql: 'SELECT balance FROM assets WHERE id=?', args: [id] })).rows[0]
        .balance,
    )
  const count = async () =>
    Number((await db.execute('SELECT COUNT(*) AS n FROM transactions')).rows[0].n)
  try {
    await initDb()
    await db.execute('PRAGMA journal_mode=WAL')
    assert.equal(koreaToday(new Date('2026-10-20T15:00:00Z')), '2026-10-21')
    assert.equal(koreaToday(new Date('2026-10-20T14:59:59Z')), '2026-10-20')
    const salary = success(await write('create_category', { type: 'income', name: '급여' }))
      .category.id
    const food = success(
      await write('create_category', { type: 'expense', name: '식비', essentiality: 'needs' }),
    ).category.id
    const bank = success(
      await write('create_asset', {
        name: '자동이체',
        group_type: 'bank',
        balance: 1_000_000,
        balance_date: yesterday,
      }),
    ).asset.id
    const emergency = success(
      await write('create_asset', {
        name: '비상금',
        group_type: 'savings',
        balance: 0,
        balance_date: yesterday,
      }),
    ).asset.id
    const loan = success(
      await write('create_loan', {
        name: '햇살론',
        balance: 6_000_000,
        balance_date: yesterday,
        principal: 7_000_000,
        interest_rate: 5.5,
        payment_day: 25,
        monthly_payment: 108_000,
      }),
    ).asset.id
    const personal = success(
      await write('create_loan', {
        name: '개인차입금',
        balance: 6_000_000,
        balance_date: yesterday,
      }),
    ).asset.id
    const context = success(await rpc('get_ledger_context', {}))
    assert.equal(context.today, today)
    assert.ok(context.assets.some((row: any) => row.id === bank))
    assert.ok(context.loan_supported_fields.includes('interest_rate'))
    assert.ok(context.loan_unsupported_fields.includes('repayment_method'))

    // "오늘 급여 280만 원이 자동이체 계좌로 들어왔어."
    const incomeInput = {
      request_id: 'salary-retry',
      type: 'income',
      date: today,
      amount: 2_800_000,
      asset_id: bank,
      category_id: salary,
      content: '급여',
    }
    const income = success(await rpc('record_transaction', incomeInput))
    assert.equal(await balance(bank), 3_800_000)
    assert.equal(
      success(await rpc('record_transaction', incomeInput)).transaction.id,
      income.transaction.id,
    )
    assert.equal(await balance(bank), 3_800_000)
    assert.equal(
      (await rpc('record_transaction', { ...incomeInput, amount: 2_900_000 })).error.code,
      'IDEMPOTENCY_CONFLICT',
    )

    // Direct balances are checkpoints, never income/expense transactions.
    const beforeAdjustment = await count()
    success(
      await write('set_asset_balance', { asset_id: emergency, balance: 350_000, as_of: today }),
    )
    success(
      await write('set_asset_balance', { asset_id: personal, balance: 5_500_000, as_of: today }),
    )
    assert.equal(await count(), beforeAdjustment)
    assert.equal(await balance(emergency), 350_000)
    assert.equal(await balance(personal), -5_500_000)

    // A same-day transaction needs per-account confirmation, then can apply once.
    const transferInput = {
      request_id: 'transfer-retry',
      date: today,
      amount: 100_000,
      from_asset_id: bank,
      to_asset_id: emergency,
      content: '비상금 이체',
    }
    const ambiguousBalance = await rpc('record_transfer', transferInput)
    assert.equal(ambiguousBalance.error.code, 'BALANCE_CONFIRMATION_REQUIRED')
    assert.equal(await count(), beforeAdjustment)
    const transfer = success(
      await rpc('record_transfer', { ...transferInput, balance_excluded_asset_ids: [emergency] }),
    )
    assert.equal(await balance(bank), 3_700_000)
    assert.equal(await balance(emergency), 450_000)
    assert.equal(
      transactionAffectsBalance(transfer.transaction, { id: emergency, balance_date: today }),
      true,
    )
    assert.equal(
      (await rpc('record_transfer', { ...transferInput, balance_excluded_asset_ids: [emergency] }))
        .duplicate,
      true,
    )
    assert.equal(await balance(emergency), 450_000)

    // "햇살론 원금 10만 원, 이자 8천 원을 자동이체 계좌에서 갚았어."
    const repayment = success(
      await write('record_loan_repayment', {
        date: today,
        principal_amount: 100_000,
        interest_amount: 8_000,
        from_asset_id: bank,
        loan_id: loan,
      }),
    )
    assert.equal(repayment.transaction.amount, 108_000)
    assert.equal(repayment.transaction.fee, 8_000)
    assert.equal(await balance(bank), 3_592_000)
    assert.equal(await balance(loan), -5_900_000)
    const f1 = success(
      await write('record_transaction', {
        type: 'expense',
        date: today,
        amount: 15_000,
        asset_id: bank,
        category_id: food,
        content: '점심 A',
      }),
    )
    const f2 = success(
      await write('record_transaction', {
        type: 'expense',
        date: today,
        amount: 15_000,
        asset_id: bank,
        category_id: food,
        content: '점심 B',
      }),
    )
    const ambiguous = await write('update_transaction', {
      selector: { date: today, type: 'expense', amount: 15_000, category_id: food },
      changes: { amount: 12_000 },
    })
    assert.equal(ambiguous.error.code, 'AMBIGUOUS_TARGET')
    assert.equal(ambiguous.error.details.candidates.length, 2)
    assert.equal(await balance(bank), 3_562_000)
    const edit = {
      request_id: 'edit-retry',
      transaction_id: f1.transaction.id,
      changes: { amount: 12_000 },
    }
    success(await rpc('update_transaction', edit))
    success(await rpc('update_transaction', edit))
    assert.equal(await balance(bank), 3_565_000)
    const query = success(await rpc('query_ledger', { ...period, limit: 1 }))
    assert.equal(query.transactions.length, 1)
    assert.notEqual(query.next_offset, null)
    assert.equal(query.totals.income, 2_800_000)
    assert.equal(query.totals.expense, 27_000)
    assert.equal(query.totals.loan_principal, 100_000)
    assert.equal(query.totals.loan_interest, 8_000)
    assert.equal(query.totals.outflow, 135_000)
    const page2 = success(await rpc('query_ledger', { ...period, limit: 1, offset: 1 }))
    assert.deepEqual(page2.totals, query.totals)
    assert.equal(query.by_category[0].expense, 27_000)
    const overview = success(await rpc('get_financial_overview', { ...period, as_of: today }))
    assert.equal(overview.assets, 4_015_000)
    assert.equal(overview.liabilities, 11_400_000)
    assert.equal(overview.net_worth, -7_385_000)
    assert.equal(overview.spending, 35_000)
    assert.ok(overview.balances.every((row: any) => row.as_of === today && row.checkpoint_date))

    // Moving a transaction across the checkpoint reverses its OLD effect first.
    success(
      await write('update_transaction', {
        transaction_id: f2.transaction.id,
        changes: { date: yesterday, balance_included_asset_ids: [bank] },
      }),
    )
    assert.equal(await balance(bank), 3_580_000)
    success(
      await write('update_transaction', {
        transaction_id: f2.transaction.id,
        changes: { date: today },
      }),
    )
    assert.equal(await balance(bank), 3_565_000)
    // Direct refresh absorbs same-day postings; later deletion must not undo twice.
    success(
      await write('set_asset_balance', { asset_id: emergency, balance: 450_000, as_of: today }),
    )
    success(await write('delete_transaction', { transaction_id: transfer.transaction.id }))
    assert.equal(await balance(bank), 3_665_000)
    assert.equal(await balance(emergency), 450_000)
    success(
      await write('delete_transaction', {
        transaction_id: f1.transaction.id,
        request_id: 'delete-retry',
      }),
    )
    assert.equal(await balance(bank), 3_677_000)
    assert.equal(
      (
        await rpc('delete_transaction', {
          transaction_id: f1.transaction.id,
          request_id: 'delete-retry',
        })
      ).duplicate,
      true,
    )
    assert.equal(
      (await rpc('query_ledger', { ...period, transaction_id: f1.transaction.id })).error.code,
      'NOT_FOUND',
    )
    assert.equal(success(await rpc('query_ledger', period)).totals.expense, 15_000)
    success(await write('delete_transaction', { transaction_id: f2.transaction.id }))
    success(await write('delete_transaction', { transaction_id: repayment.transaction.id }))
    success(await write('delete_transaction', { transaction_id: income.transaction.id }))
    assert.equal(await balance(bank), 1_000_000)
    assert.equal(await balance(loan), -6_000_000)
    assert.equal(success(await rpc('query_ledger', period)).totals.count, 0)
    assert.ok(
      Number(
        (await db.execute("SELECT COUNT(*) AS n FROM ledger_audit WHERE action='delete'")).rows[0]
          .n,
      ) >= 5,
    )

    // Historical uncertainty is explicit instead of returning invented balances.
    const historical = success(await rpc('get_balances', { as_of: yesterday, asset_id: emergency }))
    assert.equal(historical.balances[0].available, false)
    assert.equal(historical.balances[0].balance, null)
    assert.equal(
      success(await rpc('get_financial_overview', { ...period, as_of: yesterday })).net_worth,
      null,
    )
    success(
      await write('update_asset', {
        asset_id: emergency,
        changes: { name: '비상금 통장', target_balance_enabled: true, target_balance: 1_000_000 },
      }),
    )
    success(
      await write('update_loan', {
        loan_id: loan,
        changes: { interest_rate: 4.5, payment_day: 20 },
      }),
    )
    success(
      await write('update_category', {
        category_id: food,
        changes: { name: '식사비', default_asset_id: bank },
      }),
    )
    assert.equal((await rpc('list_categories', { type: 'expense' })).categories[0].name, '식사비')
    assert.equal(
      (
        await write('update_loan', {
          loan_id: loan,
          changes: { repayment_method: 'equal_principal' },
        })
      ).error.code,
      'UNSUPPORTED_FIELD',
    )
    for (const bad of [
      { amount: 1.5 },
      { amount: -1 },
      { currency: 'USD' },
      { date: '2026-02-30' },
      { asset_id: 'someone-elses-id' },
    ])
      assert.ok(
        (
          await write('record_transaction', {
            type: 'income',
            date: today,
            amount: 100,
            asset_id: bank,
            category_id: salary,
            ...bad,
          })
        ).error,
      )
    assert.equal(
      (await write('record_transaction', { type: 'income' })).error.code,
      'MISSING_INFORMATION',
    )
    assert.equal(
      (await rpc('query_ledger', { ...period, asset_id: 'someone-elses-id' })).error.code,
      'NOT_FOUND',
    )
    for (const name of ['update_transaction', 'delete_transaction']) {
      assert.equal(
        (
          await write(name, {
            transaction_id: 'someone-elses-id',
            ...(name === 'update_transaction' ? { changes: { amount: 100 } } : {}),
          })
        ).error.code,
        'NOT_FOUND',
      )
      assert.equal((await rpc(name, {}, false)).status, 401)
    }
    assert.equal((await rpc('query_ledger', period, false)).status, 401)
    assert.equal(
      (await rpc('get_ledger_context', { user_id: 'other' })).error.code,
      'UNSUPPORTED_FIELD',
    )

    // Roll back transaction, effects, audit and request together on storage failure.
    const auditBefore = Number(
      (await db.execute('SELECT COUNT(*) AS n FROM ledger_audit')).rows[0].n,
    )
    await db.execute(
      "CREATE TRIGGER reject_audit BEFORE INSERT ON ledger_audit BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
    )
    const failed = await write('record_transaction', {
      type: 'income',
      date: today,
      amount: 100,
      asset_id: bank,
      category_id: salary,
    })
    assert.equal(failed.error.code, 'STORAGE_ERROR')
    assert.equal(await count(), 0)
    assert.equal(await balance(bank), 1_000_000)
    assert.equal(
      Number((await db.execute('SELECT COUNT(*) AS n FROM ledger_audit')).rows[0].n),
      auditBefore,
    )
    await db.execute('DROP TRIGGER reject_audit')
    const concurrentInput = {
      request_id: 'concurrent',
      type: 'income',
      date: today,
      amount: 100,
      asset_id: bank,
      category_id: salary,
    }
    const concurrent = await Promise.all([
      rpc('record_transaction', concurrentInput),
      rpc('record_transaction', concurrentInput),
    ])
    assert.equal(concurrent.filter((row) => row.duplicate).length, 1)
    assert.equal(await count(), 1)
    assert.equal(await balance(bank), 1_000_100)
    // Recovery restores the original ID and respects the latest checkpoints.
    const recoveryInput = {
      type: 'income',
      date: today,
      amount: 100,
      asset_id: emergency,
      category_id: salary,
      balance_excluded_asset_ids: [emergency],
    }
    const recoverable = success(await write('record_transaction', recoveryInput)).transaction
    success(await write('delete_transaction', { transaction_id: recoverable.id }))
    const auditRow = (
      await db.execute({
        sql: "SELECT id FROM ledger_audit WHERE entity_id=? AND action='delete' ORDER BY rowid DESC LIMIT 1",
        args: [recoverable.id],
      })
    ).rows[0]
    const { ledgerWrite, restoreTransaction } = await import('../lib/ledger-service')
    const restored = await ledgerWrite(
      'operator.restore_transaction',
      'restore-fixture',
      { audit_id: auditRow.id },
      (tx) => restoreTransaction(tx, 'restore-fixture', String(auditRow.id)),
    )
    assert.equal((restored.transaction as any).id, recoverable.id)
    assert.equal(await balance(emergency), 450_100)
    success(await write('delete_transaction', { transaction_id: recoverable.id }))
    const nextAudit = (
      await db.execute({
        sql: "SELECT id FROM ledger_audit WHERE entity_id=? AND action='delete' ORDER BY rowid DESC LIMIT 1",
        args: [recoverable.id],
      })
    ).rows[0]
    success(
      await write('set_asset_balance', { asset_id: emergency, balance: 450_100, as_of: today }),
    )
    await ledgerWrite(
      'operator.restore_transaction',
      'restore-after-checkpoint',
      { audit_id: nextAudit.id },
      (tx) => restoreTransaction(tx, 'restore-after-checkpoint', String(nextAudit.id)),
    )
    assert.equal(
      await balance(emergency),
      450_100,
      'A newer checkpoint absorbs restored same-day transactions',
    )
    success(await write('delete_transaction', { transaction_id: recoverable.id }))

    // Prior receipt request rows remain replayable with exactly the legacy shape.
    const legacy = {
      date: today,
      type: 'expense',
      amount: 100,
      asset_id: bank,
      category_id: food,
      content: 'legacy',
      note: '',
      from_asset_id: '',
      to_asset_id: '',
      fee: 0,
    }
    await db.execute({
      sql: 'INSERT INTO work_receipt_requests VALUES (?,?,?)',
      args: [
        'legacy',
        createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
        JSON.stringify({ id: 'legacy-id', ...legacy }),
      ],
    })
    const legacyReplay = success(
      await rpc('record_receipt', {
        request_id: 'legacy',
        date: today,
        amount: 100,
        asset_id: bank,
        category_id: food,
        content: 'legacy',
      }),
    )
    assert.equal(legacyReplay.duplicate, true)
    assert.equal(legacyReplay.transaction.id, 'legacy-id')
    assert.equal(await count(), 1)

    // App and MCP use the same storage, rules, audit and idempotency handling.
    const { POST: createApp } = await import('../app/api/transactions/route')
    const appInput = {
      type: 'income',
      date: today,
      amount: 300,
      asset_id: bank,
      category_id: salary,
    }
    const appRequest = () =>
      new NextRequest('https://test.example/api/transactions', {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': 'app-retry' },
        body: JSON.stringify(appInput),
      })
    const appResult = await createApp(appRequest())
    assert.equal(appResult.status, 201)
    const appTransaction = await appResult.json()
    assert.equal((await (await createApp(appRequest())).json()).id, appTransaction.id)
    assert.equal(await balance(bank), 1_000_400)
    assert.equal(
      (await rpc('query_ledger', { ...period, transaction_id: appTransaction.id })).transactions[0]
        .amount,
      300,
    )
    const { PATCH: editApp, DELETE: deleteApp } = await import('../app/api/transactions/[id]/route')
    const params = { params: Promise.resolve({ id: appTransaction.id }) }
    assert.equal(
      (
        await editApp(
          new NextRequest('https://test.example/api/transactions/' + appTransaction.id, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ amount: 200 }),
          }),
          params,
        )
      ).status,
      200,
    )
    assert.equal(await balance(bank), 1_000_300)
    assert.equal(
      (
        await deleteApp(
          new NextRequest('https://test.example/api/transactions/' + appTransaction.id, {
            method: 'DELETE',
            headers,
          }),
          params,
        )
      ).status,
      200,
    )
    assert.equal(await balance(bank), 1_000_100)
    const { PATCH: patchAsset } = await import('../app/api/assets/[id]/route')
    const assetPatch = (body: Record<string, unknown>) =>
      patchAsset(
        new NextRequest('https://test.example/api/assets/' + bank, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: bank }) },
      )
    assert.equal((await assetPatch({ balance: 2_000_000, balance_date: yesterday })).status, 200)
    assert.equal(
      await balance(bank),
      2_000_000,
      'Existing app balance input is the CURRENT balance',
    )
    assert.equal(
      (await rpc('get_balances', { asset_id: bank, as_of: yesterday })).balances[0].balance,
      1_999_900,
    )
    assert.equal((await assetPatch({ name: '자동이체 수정', balance_date: yesterday })).status, 200)
    assert.equal(await balance(bank), 2_000_000)
    success(
      await write('set_asset_balance', { asset_id: bank, balance: 1_500_000, as_of: yesterday }),
    )
    assert.equal(await balance(bank), 1_500_100, 'MCP balance input is the AS-OF balance')
    const yesterdayFood = {
      type: 'expense',
      date: yesterday,
      amount: 15_000,
      asset_id: bank,
      category_id: food,
      balance_excluded_asset_ids: [bank],
    }
    const yesterdayA = success(await write('record_transaction', yesterdayFood)).transaction.id
    const yesterdayB = success(await write('record_transaction', yesterdayFood)).transaction.id
    const yesterdaySelection = await write('update_transaction', {
      selector: { date: yesterday, type: 'expense', amount: 15_000, category_id: food },
      changes: { amount: 12_000 },
    })
    assert.equal(yesterdaySelection.error.code, 'AMBIGUOUS_TARGET')
    assert.equal(yesterdaySelection.error.details.candidates.length, 2)
    success(
      await write('update_transaction', {
        transaction_id: yesterdayA,
        changes: { amount: 12_000 },
      }),
    )
    assert.equal(
      (await rpc('query_ledger', { from: yesterday, to: yesterday })).totals.expense,
      27_000,
    )
    success(await write('delete_transaction', { transaction_id: yesterdayA }))
    success(await write('delete_transaction', { transaction_id: yesterdayB }))
    assert.equal(await balance(bank), 1_500_100)
    assert.equal(workTools.length, 18)
    console.log(
      'Ledger MCP PASS: supplied examples; checkpoint confirmation; create/query/update/requery/delete; totals across pages; principal/interest; same-day double-count prevention; concurrent/legacy/app retries; atomic rollback; invalid IDs/inputs; auth denial; audit; KST; shared app persistence.',
    )
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
