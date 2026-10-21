-- Additive metadata only. Review against a backup/staging DB first.
-- Also created idempotently by initDb(); does not backfill financial rows.
CREATE TABLE IF NOT EXISTS ledger_requests (
  request_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  response_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_entity ON ledger_audit(entity,entity_id,created_at);
CREATE TABLE IF NOT EXISTS ledger_balance_effects (
  transaction_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  applied INTEGER NOT NULL,
  PRIMARY KEY (transaction_id,asset_id)
);
