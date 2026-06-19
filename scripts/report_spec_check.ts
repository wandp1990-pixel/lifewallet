// REPORT_SPEC 정합성 회귀 테스트 (tsx 순수함수 단위). dev 서버 차단 환경 대체 검증.
// 실행: node_modules/.bin/tsx scripts/report_spec_check.ts
import { buildMonthlyReport, type MonthlyReportInput } from '../lib/report'
import { validateGeneratedReport } from '../lib/ai-report'
import type { Asset, Category, Transaction } from '../lib/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}  (got: ${JSON.stringify(got)})`) }
}

// ── 빌더 헬퍼 ──
let n = 0
function asset(p: Partial<Asset>): Asset {
  return {
    id: p.id ?? `a${n++}`, group_type: p.group_type ?? 'bank', group_name: '', name: p.name ?? 'asset',
    balance: p.balance ?? 0, balance_date: p.balance_date ?? '', order: 0, visible: p.visible ?? true,
    track_detail: false, savings_tracking: p.savings_tracking ?? false,
    target_balance_enabled: false, target_balance: 0,
    principal: p.principal, interest_rate: p.interest_rate, start_date: p.start_date, end_date: p.end_date,
    payment_day: p.payment_day, monthly_payment: p.monthly_payment,
  }
}
function tx(p: Partial<Transaction>): Transaction {
  return {
    id: p.id ?? `t${n++}`, date: p.date ?? '2026-03-15', type: p.type ?? 'expense', amount: p.amount ?? 0,
    category_id: p.category_id ?? '', asset_id: p.asset_id ?? '', content: p.content ?? '', note: '',
    from_asset_id: p.from_asset_id ?? '', to_asset_id: p.to_asset_id ?? '', fee: p.fee ?? 0, created_at: '',
  }
}
const cat = (id: string, type: Category['type'], budgetExcluded = false): Category =>
  ({ id, type, name: id, icon: '📦', order: 0, visible: true, is_system: false, essentiality: 'wants', budget_excluded: budgetExcluded, default_asset_id: '' })

function baseInput(over: Partial<MonthlyReportInput>): MonthlyReportInput {
  return {
    year: 2026, month: 3, monthStartDay: 1,
    transactions: [], previousTransactions: [], previousPreviousTransactions: [],
    annualTransactions: [], laterTransactions: [],
    categories: [], budgets: [], assets: [], savingsGoals: [], wishlist: [], recurringTransactions: [],
    ...over,
  }
}

// ════ 항목 ① §0.1b: asset(잔액 조정) 거래는 저축률(savingsNetChange)에서 제외 ════
console.log('§0.1b asset 거래 저축률 제외')
{
  const cash = asset({ id: 'cash', group_type: 'cash', balance: 0 })
  const sav = asset({ id: 'sav', group_type: 'savings', savings_tracking: true, balance: 0 })
  const cats = [cat('inc', 'income')]

  // (1) income 100만 + 저축자산에 asset 잔액조정 +50만 → asset 제외이므로 저축률 0%
  const r1 = buildMonthlyReport(baseInput({
    assets: [cash, sav], categories: cats,
    transactions: [
      tx({ type: 'income', amount: 1_000_000, asset_id: 'cash', category_id: 'inc' }),
      tx({ type: 'asset', amount: 500_000, asset_id: 'sav', content: '잔액 조정' }),
    ],
  }))
  check('asset 잔액조정은 저축률에 미반영 → 0%', r1.summary.savingsRate === 0, r1.summary.savingsRate)

  // (2) income 100만 + cash→sav 이체 20만 → transfer 적립은 여전히 반영 → 20%
  const r2 = buildMonthlyReport(baseInput({
    assets: [cash, sav], categories: cats,
    transactions: [
      tx({ type: 'income', amount: 1_000_000, asset_id: 'cash', category_id: 'inc' }),
      tx({ type: 'transfer', amount: 200_000, from_asset_id: 'cash', to_asset_id: 'sav' }),
    ],
  }))
  check('transfer 적립은 저축률 반영 유지 → 20%', r2.summary.savingsRate === 20, r2.summary.savingsRate)
}

// ════ 항목 ② §5a: 비상자금 분자 = 유동자산(현금+은행+저축)만 ════
console.log('§5a 비상자금 유동자산 분자')
{
  const cash = asset({ id: 'cash', group_type: 'cash', balance: 6_000_000 })
  const inv = asset({ id: 'inv', group_type: 'investment', balance: 6_000_000 }) // 비유동
  const r = buildMonthlyReport(baseInput({
    assets: [cash, inv], categories: [cat('exp', 'expense')],
    transactions: [tx({ type: 'expense', amount: 1_000_000, asset_id: 'cash', category_id: 'exp' })],
  }))
  // 유동 600만 / 3개월평균지출 100만 = 6.0개월 (구버전이면 전체 1200만/100만 = 12)
  const ef = r.healthMetrics.find(m => m.key === 'emergencyFund')
  check('비상자금 = 유동자산만(600만)/지출100만 = 6개월', ef?.value === 6, ef?.value)
}

// ════ 항목 ③ §1.6: 순자산 증감 = 시점차(이달말−전월말), 수지 근사와 다름 ════
console.log('§1.6 순자산 증감 시점차')
{
  // 현재 상태(이번 달 거래 반영 후): bank 90만, loan -50만.
  const bank = asset({ id: 'bank', group_type: 'bank', balance: 900_000 })
  const loan = asset({ id: 'loan', group_type: 'loan', balance: -500_000 })
  // 이번 달: 대출상환 12만(원금10만+이자2만), bank→loan
  const r = buildMonthlyReport(baseInput({
    assets: [bank, loan],
    transactions: [tx({ type: 'loan_repayment', amount: 120_000, fee: 20_000, from_asset_id: 'bank', to_asset_id: 'loan' })],
  }))
  // 이달말 순자산 = 90만 − 50만 = 40만
  check('netWorth(이달말) = 40만', r.summary.netWorth === 400_000, r.summary.netWorth)
  // 수지 = 0 − 유출12만 = -12만 (원금상환 전액 유출 포함, §0.1a)
  check('balance(수지) = -12만', r.summary.balance === -120_000, r.summary.balance)
  // 순자산 증감 = 시점차 = -2만 (이자분만 실제 감소, 원금은 부채감소로 보존) ≠ 수지(-12만)
  check('netWorthChange(시점차) = -2만 (이자만)', r.summary.netWorthChange === -20_000, r.summary.netWorthChange)
}

// ════ 항목 ④ §3: 부채 전략에 card·마통 포함, 상환=부채자산 이체 ════
console.log('§3 부채 전략 card·마통 확장')
{
  const bank = asset({ id: 'bank', group_type: 'bank', balance: 1_000_000 })
  const card = asset({ id: 'card', group_type: 'card', balance: -300_000 })       // 카드 부채 30만
  const mtong = asset({ id: 'mtong', group_type: 'minus_account', balance: -50_000 }) // 마통 5만
  const r = buildMonthlyReport(baseInput({
    assets: [bank, card, mtong],
    // 카드로 10만 상환(이체)
    transactions: [tx({ type: 'transfer', amount: 100_000, from_asset_id: 'bank', to_asset_id: 'card' })],
  }))
  const cardRow = r.debtStrategy.loans.find(l => l.assetId === 'card')
  const mtongRow = r.debtStrategy.loans.find(l => l.assetId === 'mtong')
  check('card가 부채 전략에 포함', !!cardRow, r.debtStrategy.loans.map(l => l.assetId))
  check('마통이 부채 전략에 포함', !!mtongRow, r.debtStrategy.loans.map(l => l.assetId))
  check('card balance = 30만(절댓값)', cardRow?.balance === 300_000, cardRow?.balance)
  check('card paidThisMonth = 이체 10만', cardRow?.paidThisMonth === 100_000, cardRow?.paidThisMonth)
  check('card interestThisMonth = 0(이자모델 없음)', cardRow?.interestThisMonth === 0, cardRow?.interestThisMonth)
  check('payoffStatus = not_configured(월상환 없음)', cardRow?.payoffStatus === 'not_configured', cardRow?.payoffStatus)
}

// ════ 항목 ⑤ §4: 목표별 페이스 = 연결 자산 순변동 잔여액 비중 안분 ════
console.log('§4 저축 목표 목표별 페이스')
{
  const cash = asset({ id: 'cash', group_type: 'cash', balance: 0 })
  const sav = asset({ id: 'sav', group_type: 'savings', balance: 0 })
  const r = buildMonthlyReport(baseInput({
    assets: [cash, sav],
    transactions: [tx({ type: 'transfer', amount: 300_000, from_asset_id: 'cash', to_asset_id: 'sav' })],
    savingsGoals: [
      { id: 'A', name: 'A', target_amount: 1_000_000, current_amount: 0, target_date: '2026-05-31', asset_id: 'sav', memo: '', created_at: '' },
      { id: 'B', name: 'B', target_amount: 1_000_000, current_amount: 600_000, target_date: '2026-05-31', asset_id: 'sav', memo: '', created_at: '' },
    ],
  }))
  const A = r.savingsSummary.goals.find(g => g.id === 'A')!
  const B = r.savingsSummary.goals.find(g => g.id === 'B')!
  // 자산 페이스 30만을 잔여액 100만:40만 = 1,400,000 분모로 안분 → A 214,286 / B 85,714 (합 30만)
  const paceA = Math.round((A.paceRatio ?? 0) * (A.requiredMonthlySavings ?? 0))
  const paceB = Math.round((B.paceRatio ?? 0) * (B.requiredMonthlySavings ?? 0))
  check('목표A 페이스 ≈ 214,286 (잔여 100만 비중)', Math.abs(paceA - 214_286) <= 1, paceA)
  check('목표B 페이스 ≈ 85,714 (잔여 40만 비중)', Math.abs(paceB - 85_714) <= 1, paceB)
  check('두 목표 페이스 합 = 자산 페이스 30만', Math.abs(paceA + paceB - 300_000) <= 1, paceA + paceB)
}

// ════ 항목 ⑥ §7: 연간 전망 과거=실제 / 미래=완납추정 투영 ════
console.log('§7 연간 전망 대출상환')
{
  // 보고월 6월. 대출 잔액 10만, 월상환 6만, 무이자 → 완납 2개월(7·8월), 9월부터 0.
  const loan = asset({ id: 'loan', group_type: 'loan', balance: -100_000, monthly_payment: 60_000, interest_rate: 0 })
  const r = buildMonthlyReport(baseInput({
    year: 2026, month: 6,
    assets: [loan],
    annualTransactions: [tx({ type: 'loan_repayment', date: '2026-03-15', amount: 50_000, from_asset_id: 'bank', to_asset_id: 'loan' })],
  }))
  const m = (mon: number) => r.annualOutlook[mon - 1].loanPayments
  check('3월(과거)=실제 상환 5만', m(3) === 50_000, m(3))
  check('7월(미래 offset1)=투영 6만', m(7) === 60_000, m(7))
  check('8월(미래 offset2)=투영 6만', m(8) === 60_000, m(8))
  check('9월(완납 후)=0', m(9) === 0, m(9))
  check('4월(과거·무거래)=실제 0', m(4) === 0, m(4))
}

// ════ AI 생성 결과 저장 전 검증 (lib/ai-report.ts validateGeneratedReport) ════
console.log('AI 생성 결과 검증 게이트')
{
  const longBody = '## 종합 진단\n'.padEnd(300, '내용 ')
  // 완납 대출 없는 보고서 (loans 비어 있음)
  const noPayoff = buildMonthlyReport(baseInput({ year: 2026, month: 6 }))
  check('완납 대출 없음(테스트 전제)', noPayoff.debtStrategy.loans.every(l => !l.paidOffThisMonth), noPayoff.debtStrategy.loans.length)

  check('빈 응답 → ok=false', validateGeneratedReport('', noPayoff).ok === false)
  check('오류 메시지 → ok=false', validateGeneratedReport('오류가 발생했습니다: 503', noPayoff).ok === false)
  check('너무 짧음 → ok=false', validateGeneratedReport('짧은 응답', noPayoff).ok === false)
  check('정상 본문 → ok=true', validateGeneratedReport(longBody, noPayoff).ok === true)

  const leaked = validateGeneratedReport(longBody + '\nactualOutflow는 큽니다 debtServiceRatio 참고', noPayoff)
  check('영문 키 누출 → ok=true + issue 기록', leaked.ok === true && leaked.issues.some(i => i.includes('영문 JSON 키')), leaked.issues)

  const falseClaim = validateGeneratedReport(longBody + '\n국민카드 대출을 이번 달에 완납했습니다.', noPayoff)
  check('완납 대출 없는데 "이번 달 완납" → issue 기록', falseClaim.issues.some(i => i.includes('완납')), falseClaim.issues)
}

// ════ 항목 ⑦ §5d: 예산 비대상 카테고리는 budgetUsageRate 분자·분모에서 제외 ════
console.log('§5d 예산 비대상 budgetUsageRate 제외')
{
  // food(일반) 예산 50만·지출 40만, gyeong(예산 비대상) 지출 30만.
  // 분자=trackedExpense=40만(food만), 분모=totalBudget=50만 → 80%. (비대상 제외 안 하면 70만/50만=140%)
  const r = buildMonthlyReport(baseInput({
    categories: [cat('food', 'expense'), cat('gyeong', 'expense', true)],
    budgets: [{ year: 2026, month: 3, category_id: 'food', amount: 500_000 }],
    transactions: [
      tx({ type: 'expense', amount: 400_000, asset_id: 'cash', category_id: 'food' }),
      tx({ type: 'expense', amount: 300_000, asset_id: 'cash', category_id: 'gyeong' }),
    ],
  }))
  const bur = r.healthMetrics.find(m => m.key === 'budgetUsageRate')
  check('비대상 제외 후 소진율 = 40만/50만 = 80%', bur?.value === 80, bur?.value)
  const gyeongRow = r.categoryAnalysis.find(row => row.categoryId === 'gyeong')
  check('비대상 카테고리도 categoryAnalysis 행에는 등장', gyeongRow?.amount === 300_000, gyeongRow?.amount)
  check('비대상 카테고리 budget=0·budgetRate=null', gyeongRow?.budget === 0 && gyeongRow?.budgetRate === null, gyeongRow)
}

console.log(`\n결과: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
