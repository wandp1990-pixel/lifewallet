// 실행: node --env-file=.env.local scripts/migrate-finflow.mjs
// 역할: finflow CSV의 수입·지출 내역을 LifeWallet Turso DB에 삽입
//       category_id·asset_id는 비워둠 (사용자가 직접 분류)

import { createClient } from '@libsql/client/http'
import { readFileSync } from 'fs'

const CSV_PATH = "/mnt/c/Users/wandp/OneDrive/바탕 화면/지헌/재무관리 앱/finflow/재무관리 - 거래내역.csv"

// ── CSV 파서 ─────────────────────────────────────────────
function parseCsvLine(line) {
  const fields = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

function parseAmount(raw) {
  // "₩4,900" → 4900 / "-₩4,780,000" → -4780000
  const cleaned = raw.replace(/[₩,\s]/g, '')
  return parseInt(cleaned, 10) || 0
}

// ── 연결 ─────────────────────────────────────────────────
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

// ── 읽기 ─────────────────────────────────────────────────
const lines = readFileSync(CSV_PATH, 'utf-8').split('\n').filter(l => l.trim())
const [header, ...rows] = lines

console.log(`총 ${rows.length}건 파싱 시작 (헤더 제외)`)

let inserted = 0
let skipped = 0

for (let i = 0; i < rows.length; i++) {
  const fields = parseCsvLine(rows[i])
  // ID,날짜,구분,카테고리,내용,금액,비고
  const [, date, 구분, , content, amountRaw, note = ''] = fields

  const typeMap = { '수입': 'income', '지출': 'expense' }
  const type = typeMap[구분]

  if (!type) {
    console.log(`  [SKIP] ${date} "${content}" — 구분: ${구분}`)
    skipped++
    continue
  }

  const amount = parseAmount(amountRaw)
  if (amount <= 0) {
    console.log(`  [SKIP] ${date} "${content}" — 금액 이상 (${amountRaw})`)
    skipped++
    continue
  }

  const id = `txn_import_${Date.now()}_${i}`

  await db.execute({
    sql: `INSERT OR IGNORE INTO transactions
          (id, date, type, category_id, asset_id, content, amount, note, from_asset_id, to_asset_id, fee)
          VALUES (?, ?, ?, '', '', ?, ?, ?, '', '', 0)`,
    args: [id, date, type, content.trim(), amount, note.trim()],
  })

  console.log(`  [OK]   ${date} ${type === 'income' ? '수입' : '지출'} ${content} ${amount.toLocaleString()}원`)
  inserted++
}

console.log(`\n완료: 삽입 ${inserted}건 / 스킵 ${skipped}건`)
db.close()
