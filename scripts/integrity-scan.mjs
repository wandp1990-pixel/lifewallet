// 자산 잔액 정합성 스캔 — 잔액 조정 거래가 직전 거래의 잔액 반영을 되돌린 흔적(LF7 시그니처)을 찾는다.
// 사용: node scripts/integrity-scan.mjs [BASE_URL]  (기본: 프로덕션)
// 읽기 전용. 발견 항목은 보고만 하고 수정하지 않는다.

const BASE = process.argv[2] || 'https://lifewallet-eight.vercel.app'

// lib/finance.ts assetBalanceDelta와 동일 규칙 (mjs 단독 실행을 위해 복제 — 규칙 변경 시 함께 갱신)
function assetBalanceDelta(tx, assetId) {
  const fee = tx.fee ?? 0
  switch (tx.type) {
    case 'income': return tx.asset_id === assetId ? tx.amount : 0
    case 'expense': return tx.asset_id === assetId ? -tx.amount : 0
    case 'asset': return tx.asset_id === assetId ? tx.amount : 0
    case 'transfer':
      if (tx.from_asset_id === assetId) return -(tx.amount + fee)
      if (tx.to_asset_id === assetId) return tx.amount
      return 0
    case 'loan_repayment':
      if (tx.from_asset_id === assetId) return -tx.amount
      if (tx.to_asset_id === assetId) return tx.amount - fee
      return 0
    default: return 0
  }
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

const assets = await fetchJson(`${BASE}/api/assets`)
let findings = 0

for (const asset of assets) {
  const txs = await fetchJson(`${BASE}/api/transactions?asset_id=${asset.id}`)
  const mine = txs
    .filter(t => [t.asset_id, t.from_asset_id, t.to_asset_id].includes(asset.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  for (let i = 0; i < mine.length; i++) {
    const adj = mine[i]
    if (adj.type !== 'asset' || adj.content !== '잔액 조정') continue
    // 이 조정이 1시간 내 직전 거래의 델타를 정확히 상쇄하면 LF7 시그니처
    for (let j = i - 1; j >= 0; j--) {
      const prev = mine[j]
      const gapMs = new Date(adj.created_at) - new Date(prev.created_at)
      if (gapMs > 60 * 60 * 1000) break
      if (prev.type === 'asset') continue
      const delta = assetBalanceDelta(prev, asset.id)
      if (delta !== 0 && adj.amount === -delta) {
        findings++
        console.log(`[의심] ${asset.name} (${asset.id})`)
        console.log(`  ${prev.date} ${prev.type} ${prev.amount}원 (델타 ${delta}) → ${Math.round(gapMs / 1000)}초 뒤 잔액 조정 ${adj.amount}원 (${adj.id})`)
        console.log(`  → 조정이 직전 거래의 잔액 반영을 정확히 되돌림. 의도한 수정인지 확인 필요`)
      }
    }
  }

  // 보조 점검: 대출 잔액이 0보다 크거나(부채가 자산이 됨) 조정 없이 원금 초과면 표시
  if (asset.group_type === 'loan' && asset.visible) {
    if (asset.balance > 0) {
      findings++
      console.log(`[의심] ${asset.name}: 대출 잔액이 양수 (${asset.balance})`)
    }
    const hasAdjust = mine.some(t => t.type === 'asset')
    if (!hasAdjust && asset.principal > 0 && Math.abs(asset.balance) > asset.principal) {
      findings++
      console.log(`[의심] ${asset.name}: 잔액 조정 이력 없이 부채(${Math.abs(asset.balance)})가 원금(${asset.principal}) 초과`)
    }
  }
}

console.log(findings === 0 ? `정합성 스캔 통과 — 자산 ${assets.length}개, 이상 없음` : `\n총 ${findings}건 의심 항목`)
