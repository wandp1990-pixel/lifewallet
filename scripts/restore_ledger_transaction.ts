// Operator-only recovery. Does not load .env files. Dry-run is the default.
// Explicitly bind a reviewed DB environment before using --apply.
import { ledgerWrite, restoreTransaction, withLedgerRead } from '../lib/ledger-service'
import db from '../lib/db'
async function main() {
  const args = process.argv.slice(2)
  const auditId = args[args.indexOf('--audit-id') + 1]
  const requestId = args[args.indexOf('--request-id') + 1]
  if (!process.env.TURSO_DATABASE_URL || !args.includes('--audit-id') || !auditId)
    throw new Error(
      'Explicit TURSO_DATABASE_URL and --audit-id are required. No .env files are loaded.',
    )
  if (!args.includes('--apply')) {
    const row = await withLedgerRead(
      async (tx) =>
        (
          await tx.execute({
            sql: "SELECT id,entity_id,created_at FROM ledger_audit WHERE id=? AND action='delete' AND entity='transaction'",
            args: [auditId],
          })
        ).rows[0],
    )
    if (!row) throw new Error('Deletion audit not found')
    console.log(
      JSON.stringify({
        dry_run: true,
        audit: row,
        next: 'Review a backup and current balances. Re-run with --apply --request-id <new-stable-id>.',
      }),
    )
  } else {
    if (!args.includes('--request-id') || !requestId)
      throw new Error('--apply requires a stable --request-id')
    const result = await ledgerWrite(
      'operator.restore_transaction',
      requestId,
      { audit_id: auditId },
      (tx) => restoreTransaction(tx, requestId, auditId),
    )
    console.log(JSON.stringify(result))
  }
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Recovery failed')
    process.exitCode = 1
  })
  .finally(() => db.close())
