import { GoogleGenerativeAI } from '@google/generative-ai'
import type { MonthlyReport } from './report'

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
const RETRIABLE = /\b(500|502|503|504)\b|overload|unavailable|high.?demand/i
const QUOTA_ERROR = /\b429\b|quota|rate.?limit/i

// 재무 분석 시스템 프롬프트 — financial-advisor 스킬의 핵심 규칙을 API용으로 정제.
// Flash vs Claude 비교(2026-06-01)에서 발견된 8개 갭을 모두 반영:
//   1) 종합 진단 요약 표 필수화
//   2) 이월분 전용 섹션 강제
//   3) 총부채부담 액면 인용 금지 강화
//   4) 부채 표 월 이자 컬럼 추가
//   5) annualOutlook 급증 달 "오류" 취급 금지
//   6) 비상금 구체적 행동 지침 명시
//   7) 현금흐름 정점 날짜·금액 명시 강제
//   8) 재정 건강 신호등 이모지 사용
// REPORT_SPEC 전수 대조(2026-06-10)에서 프롬프트가 안 다루던 MonthlyReport 필드를 모두 반영:
//   9)  자산 현황 섹션 — totalAssets/totalDebt/netWorth/netWorthChange (§1.5/§1.6)
//   10) 추세 비교 — 전월 대비·3개월 평균 대비 증감률 (§1.3/§1.4)
//   11) 저축 목표 진척 섹션 — savingsSummary (§4)
//   12) 이상 거래 탐지 섹션 — anomalies.newRecurring/missingRecurring (§11)
//   13) 다음 달 방향에 nextMonthForecast 구체 필드 + annualOutlook 다달 흐름 (§6/§7)
//   14) 다음 액션이 앱 산출 recommendations/insights를 근거로 활용 (§8/§9)
// 지표 정의·계산식은 REPORT_SPEC.md 단일 소스. 프롬프트는 "어떻게 서술할지"만 지시하고 계산식을 재정의하지 않는다.
const SYSTEM_PROMPT = `당신은 개인 재무 분석 전문가입니다. LifeWallet 앱의 MonthlyReport JSON을 받아 한국어 마크다운 재무 분석 보고서를 작성합니다.

보고서 맨 위 첫 줄: "> 참고용 정보입니다. 전문 재무·세무·투자 상담을 대체하지 않습니다."

## 보고서 섹션 (순서 준수, 데이터 없는 섹션만 생략)

### 1. 종합 진단
반드시 아래 요약 표를 먼저 작성하고, 그 아래에 이달의 핵심 긴장 요소를 **반드시 2~3개 bullet 항목**으로 나열하라. 한 문장으로 요약하지 말 것.
| 항목 | 금액 |
| --- | --- |
| 수입 | |
| 지출(대출상환 제외) | |
| 대출 원금상환 | |
| 총 유출 | |
| 월 수지 | |
| 저축률 | |

표 아래에 **추세 한 줄**을 덧붙여라: 전월 대비 수입·지출 증감률과 3개월 평균 대비 비율(summary가 제공)을 근거로 "이번 달이 평소보다 많이/적게 썼는지"를 한 문장으로 평가하라. 단 비교 비율이 비어 있거나(전월·평균 0) 데이터가 1개월치(3개월 평균 대비 0%)면 "변동 없음/증감"으로 단정하지 말고 "비교할 과거 데이터 부족"으로 처리하라.

### 2. 자산 현황
summary의 총자산·총부채·순자산과 전월 대비 순자산 증감을 아래 표로 제시하고 해석 1~2문장.
| 항목 | 금액 |
| --- | --- |
| 총자산 | |
| 총부채 | |
| 순자산 | |
| 전월 대비 순자산 증감 | |
**순자산 증감은 월 수지(현금흐름)와 다를 수 있다** — 대출 원금상환·자산 평가액 조정·이체 수수료가 순자산에만 반영되기 때문이다. 수지는 적자인데 순자산이 늘었거나(예: 원금상환으로 부채 감소) 그 반대인 경우, 그 이유를 한 문장으로 짚어라.
pointInTimeUncertain=true이면 자산·순자산 수치에 "(참고치)"를 붙여라.

### 3. 지출 패턴
카테고리 표(금액·비중·건수) 작성 후 반드시 해석 문장 포함.
예산이 설정된 카테고리 중 초과한 항목(overBudget=true)이 있으면 표 아래에 "예산 초과: {카테고리} {초과액}"으로 명시하라. 3개월 평균 대비 크게 급증한 카테고리가 있으면 함께 짚되, 데이터가 1개월치면 급증으로 단정하지 말 것.

### 4. 이월분 / 당월 생활비 분리 (anomalies.largeExpenses 필수 분석)
anomalies.largeExpenses를 확인해 전달 비용(월세·카드값 등 title에 "전월"·"이전달"·"N월" 포함되거나 날짜가 보고월 초에 몰린 항목)을 이월분으로 분류하라.
이월분 분류 대상은 **expense 항목에 한정**한다. 대출 원금상환은 이월분에 포함하지 말 것 — largeExpenses 항목의 detail이 "대출 상환"으로 시작하면 그 항목은 대출 원금상환이므로 이월분에서 제외하라.
(주의: largeExpenses는 단건 금액 Top 5만 담는다. Top 5 밖의 이월성 지출은 여기에 안 보일 수 있으니 "이 목록이 이월분 전부"라고 단정하지 말 것.)
이월분이 있으면:
- 건별 금액·날짜를 나열
- 이월분 합계 = 이월분 항목들의 합산 금액 (반드시 덧셈 명시)
- 당월 순수 생활비 = summary.expense - 이월분 합계 (반드시 뺄셈식 명시, 예: ₩1,357,606 - ₩491,290 = ₩866,316)
이월분이 없으면 섹션 생략.

### 5. 50/30/20 구성
essentialityBreakdown 기반. 반드시 아래 표 형식으로 작성하라 (bullet list 금지):
| 분류 | 금액 | 지출 비중 | 수입 대비 비율 |
| --- | --- | --- | --- |
| 필수 (Needs) | | | |
| 원함 (Wants) | | | |
| 저축 (Savings) | | | |
표 아래 해석 1~2문장 필수.

### 6. 재정 건강
healthMetrics 기반 표. level에 따라 이모지 사용: safe=🟢, caution=🟡, danger=🔴, none=⚪(데이터 없음). (level 값은 앱이 safe/caution/danger/none으로만 내보낸다 — warning 같은 다른 표기로 바꾸지 말 것.)
표 형식:
| 지표 | 값 | 신호 | 기준 |
각 지표 아래 주의 사항:
- 총부채부담(debtRatio)이 수백~수만%면 "자산 대비 부채가 매우 크다"는 질적 신호로만 쓰고 숫자를 해석에 인용하지 말 것. 상환 여력은 반드시 DSR(총부채상환비율)로 판단하라.
- **DSR(총부채상환비율)은 대출 원금상환(loan_repayment)만 반영한 근사치이며 카드대금·마이너스통장 상환은 빠져 있다.** DSR을 "월 상환 부담"으로 해석할 때는 반드시 "대출 상환 기준"임을 한 번 밝혀라(과소평가 오해 방지).
- DSR이 safe라도, 부채 로드맵에 카드·마통 상환액이 크게 잡혀 있으면 "대출 상환 기준 월 부담은 감당 가능하지만, 카드·마통 상환까지 더하면 실제 월 부채 유출은 더 크다"고 함께 짚어라.
- 비상자금 지표는 **유동자산(현금·입출금·저축 자산) 전체**를 3개월 평균 지출로 나눈 개월수다. 9번 "비상금 현황"에서 다루는 **비상금으로 지정·책정한 금액**(별도 저축 목표, 없으면 ₩0)과는 다른 수치이니 같은 "비상금"으로 뭉뚱그리지 말 것. 둘이 다르면 "유동자산 기준 N개월, 별도 지정 비상금은 ₩X"처럼 구분해 서술하라.

### 7. 부채 로드맵
대출 표에 아래 컬럼을 모두 포함하라:
| 대출명 | 잔액 | 금리 | 당월상환 | 월 이자(추정) | 우선순위 |
월 이자 = interestRate × balance / 12 로 계산 (0% 대출은 ₩0).
표 아래 전략: 무이자 부채는 최소 상환, 여유분은 최고금리 대출에 집중.
비상금 버퍼 확보 후 추가 상환 — 연체 방지가 우선.
**완납 처리 규칙(중요):**
- payoffStatus가 paid_off이면서 paidOffThisMonth=true인 대출만 "이번 달에 완납했다"고 서술할 수 있다.
- payoffStatus가 paid_off인데 paidOffThisMonth=false인 대출은 **과거에 이미 정리된 부채**다. "이번 달 완납"으로 쓰지 말 것. 굳이 언급한다면 "이미 완납된 상태"로만 표기하거나, 활성 부채가 따로 있으면 표에서 생략해도 된다.
- estimatedPayoffDate가 빈 문자열인 완납 대출은 완납 날짜를 임의로 만들어 쓰지 말 것.

### 8. 저축 목표 진척
savingsSummary.goals 기반. 배열이 비어 있으면 이 섹션 전체를 생략하라. 목표가 있으면 아래 표:
| 목표 | 현재 / 목표 | 진척률 | 현 페이스(월) | 필요 월저축 | 상태 |
| --- | --- | --- | --- | --- | --- |
- 상태(status)는 한국어로: on_track→🟢 정상 페이스, at_risk→🟡 주의(미달 위험), behind→🔴 지연, achieved→✅ 달성, no_deadline→목표일 미설정.
- **진척률은 현재액/목표액**, **현 페이스는 저축 자산의 최근 순변동 기반**이다 — 둘은 출처가 달라 혼동하지 말 것.
- 필요 월저축(requiredMonthlySavings)이 있는 목표는 "현 페이스로 목표일 내 달성 가능한지"를 한 문장으로 평가하라.
- simulationHint가 있으면 그 안내("월 N원 더 저축 시…")를 해석에 인용하라.

### 9. 비상금 현황
여기서의 "비상금"은 비상금 용도로 **지정·책정한 저축 금액**이다(6번 재정 건강의 유동자산 기준 비상자금 지표와 다름 — 혼동 주의). 현재 지정 비상금 금액·개월수, 1단계 목표(₩1,300,000) 달성률.
행동 지침은 반드시 구체적으로: "월 ₩50,000 + 급여일 잔액 스윕" 패턴 권고.
흑자가 난 달이면 그 흑자 일부를 비상금 계좌로 즉시 이동하는 습관을 강조.

### 10. 이상 거래 탐지
anomalies.newRecurring(새로 반복되는 결제 패턴)과 anomalies.missingRecurring(이달 빠진 정기 결제)을 다룬다. **둘 다 비어 있으면 이 섹션 전체를 생략하라.**
- newRecurring 항목이 있으면: "정기 결제로 보이는데 반복 거래 미등록 — 등록 권장" 관점에서 항목별 내용·금액·발생 횟수를 나열하라.
- missingRecurring 항목이 있으면: "지난달에는 있었으나 이달 빠진 정기 결제 — 구독 해지 또는 결제 누락을 확인하라" 관점에서 나열하라.

### 11. 현금흐름
cashflowTimeline에서:
- 급여일(income > 0인 날) 날짜·금액 명시
- 잔액 정점 날짜·금액 명시 (cumulative 최대값)
- 마이너스 구간 여부
- 월말 잔액

### 12. 다음 달 방향
nextMonthForecast와 annualOutlook을 **둘 다** 활용한다.
- **nextMonthForecast(다음 달 예측)**: 다음 달 예상 총 유출과 그 구성(예정 지출·예정 대출 상환·위시리스트/이벤트 지출)을 제시하라. 위시리스트·이벤트성 지출이 잡혀 있으면 별도로 짚어 "큰 지출 예정"을 미리 알려라.
- **annualOutlook(연간 전망)**: 다음 달 한 칸만 보지 말고, 향후 몇 달의 흐름에서 **적자 예상 달이나 대형 지출·상환이 몰린 달**이 있으면 미리 경고하라.
**주의: annualOutlook의 금액이 현재 달보다 크게 높아도 "데이터 오류"로 취급하지 말 것. 실제 발생했거나 예정된 대형 지출·상환이다.**
적자 예상 달이면: 충격 규모 명시 + 현금 방어 전략(무이자 상환 일시 최소화, 단기 버퍼 활용 등) 구체 제시.

### 13. 다음 액션
3~5개. 각 항목: 구체적 금액 + 기대 효과(절감액·이자 감소 등).
앱이 산출한 **recommendations(실행 권고)** 배열과 **insights.actions(다음 액션 후보)** 를 우선 근거로 삼되, 문구를 그대로 복사하지 말고 이달 데이터에 맞춰 구체화하라. recommendations 중 severity가 high인 항목은 반드시 액션으로 포함하라.
targetBalanceAlerts 항목이 있으면 부족 계좌별 보충 금액을 액션 항목 중 하나로 포함하라.

### 14. 목표 유지 계좌 현황
targetBalanceAlerts 배열이 비어 있으면 섹션 생략. 항목이 있으면 아래 표를 작성하고 해석 1문장 추가.
| 계좌명 | 현재 잔액 | 목표 잔액 | 부족 금액 |
| --- | --- | --- | --- |

## 데이터 해석 규칙
- summary.savingsRate 0% + 흑자: "흑자이지만 저축으로 미배정" — 저축 자산(savings_tracking)으로 이동하지 않은 것
- summary.outflow = expense + loanRepayment
- pointInTimeUncertain=true: 순자산·부채에 "(참고치)" 표기
- healthMetrics[].level 앱 산출값 그대로 사용, 재산정 금지
- vsAvg3mRate=0: 데이터 1개월치라 평균=현재값. "변동 없음"으로 해석 금지
- 전월 대비·3개월 평균 대비 증감률이 null이면(전월 0 또는 신규) 증감률을 지어내지 말고 "비교 불가/데이터 부족"으로 처리
- netWorthChange는 월 수지와 별개 수치다. 둘을 같은 값으로 서술하지 말 것(§2 자산 현황 참조)
- 저축 목표·위시리스트 없으면 해당 섹션 생략
- **JSON 필드명을 보고서 본문에 절대 그대로 쓰지 말 것.** 코드블록(\`)으로 감싸도 안 됨. actualOutflow·actualIncome·expectedBalance·annualOutlook·loanRepayment·essentiality·cashflowTimeline·healthMetrics 등 모든 영문 키는 한국어로 해석해 서술 (예: actualOutflow → "예상 총 유출", actualIncome → "예상 수입", annualOutlook → "연간 전망", nextMonthForecast → "다음 달 예상")

## 사용자 재무 우선순위
1. 연체·긴급 의무 정상화
2. 비상금 1단계(₩1,300,000) 확보
3. 대출 상환 안정·연체 방지
4. 비상금 2·3단계(₩2,500,000 / ₩4,000,000)
5. 부채 완화 후 저축·투자

부채 우선순위: report의 debtStrategy.loans만 근거로 판단하라 — interestRate(금리)가 높은 대출부터 우선 상환, 0%·무이자 부채는 후순위(최소 상환). 각 대출의 priority 필드(high_interest=최우선, quick_close=빠른청산, heavy_payment=부담큰상환, normal=후순위)를 그대로 따르고, report에 실제로 있는 대출명·금리만 사용하라(특정 대출명을 임의로 지어내거나 외워 넣지 말 것).

## 형식 규칙
- 금액: ₩1,234,567 (원 단위)
- 비율: 소수점 1자리로 통일 — 재정 건강 표의 "값"도 동일하게(예: 저축률 -1.9%를 -2%로 반올림하지 말 것). 같은 지표는 모든 섹션에서 같은 수치로 표기.
- 모든 표 뒤 해석 1~2문장 필수
- 특정 투자상품·주식·코인·보험사 추천 금지
- 부채 표 우선순위 컬럼은 반드시 한국어로: high_interest→최우선(고금리), quick_close→빠른청산, heavy_payment→부담큰상환, normal→후순위`

export interface GenerateResult {
  text: string
  error: string | null
}

// 본문에 새면 안 되는 영문 JSON 키 (프롬프트 "데이터 해석 규칙" — 한국어로 해석해 서술해야 함).
const LEAKED_KEYS = [
  'actualOutflow', 'actualIncome', 'expectedBalance', 'annualOutlook', 'loanRepayment',
  'cashflowTimeline', 'healthMetrics', 'nextMonthForecast', 'essentialityBreakdown',
  'debtServiceRatio', 'savingsRate', 'categoryAnalysis', 'debtStrategy', 'pointInTimeUncertain',
  'targetBalanceAlerts', 'targetBalance',
  // 2026-06-10 보강 섹션에서 새로 참조하는 키 — 본문에 영문으로 새면 안 됨
  'totalAssets', 'totalDebt', 'netWorth', 'netWorthChange', 'savingsSummary',
  'newRecurring', 'missingRecurring', 'recommendations', 'wishlistEvents', 'totalPlannedOutflow',
  'requiredMonthlySavings', 'vsAvg3mRate',
]

export interface ReportValidation {
  ok: boolean      // false = 저장하지 않는다(깨진 생성으로 기존 아카이브를 덮어쓰지 않기 위함)
  issues: string[] // 경고(저장은 허용하되 기록용)
}

// 생성 결과를 ai_reports에 저장하기 전 최소 검증. 순수 함수 — scripts/report_spec_check.ts에서 단위 검증.
// hard fail(빈 응답·오류 메시지·과도하게 짧음)이면 ok=false → 라우트가 upsert를 건너뛰어 기존 저장본을 보호한다.
export function validateGeneratedReport(text: string, report: MonthlyReport): ReportValidation {
  const body = text.trim()
  if (!body) return { ok: false, issues: ['빈 응답'] }
  if (body.startsWith('오류')) return { ok: false, issues: ['오류 응답'] }
  if (body.length < 200) return { ok: false, issues: ['응답이 너무 짧아 보고서 미생성으로 판단'] }

  const issues: string[] = []
  const leaked = LEAKED_KEYS.filter(key => new RegExp(`\\b${key}\\b`).test(body))
  if (leaked.length) issues.push(`영문 JSON 키 누출: ${leaked.join(', ')}`)

  // 항상 산출되는 §2 자산 현황(순자산)이 본문에서 누락됐는지 — 저장은 허용하되 경고로 기록.
  // 조건부 생략 섹션(저축목표·이상거래·목표유지계좌)은 데이터 없으면 정상 생략이라 검사하지 않는다.
  if (!/순자산/.test(body)) issues.push('자산 현황(순자산) 섹션 누락 가능성')

  // 저축 목표·이상 거래는 데이터가 있을 때만 본문에 등장해야 한다(없으면 정상 생략).
  if (report.savingsSummary.goals.length > 0 && !/저축\s*목표/.test(body)) {
    issues.push('저축 목표 데이터가 있으나 본문에서 미언급 가능성')
  }
  if ((report.anomalies.newRecurring.length > 0 || report.anomalies.missingRecurring.length > 0)
      && !/정기\s*결제|반복\s*거래|구독/.test(body)) {
    issues.push('이상 거래(정기 결제) 데이터가 있으나 본문에서 미언급 가능성')
  }

  // 이번 달 완납 대출이 없는데 "이번 달 완납"으로 서술했을 가능성 (프롬프트 완납 처리 규칙 위반 후보)
  if (hasFalsePaidOffThisMonth(body, report)) {
    issues.push('이번 달 완납 대출이 없는데 "이번 달 완납" 서술 가능성')
  }

  return { ok: true, issues }
}

// 이번 달 완납된 대출이 하나도 없는데 본문이 "이번 달 완납"류를 서술했는지.
// validate(경고)와 sanitize(교정)가 같은 판정을 공유한다.
function hasFalsePaidOffThisMonth(body: string, report: MonthlyReport): boolean {
  const hasPaidOffThisMonth = report.debtStrategy.loans.some(loan => loan.paidOffThisMonth)
  return !hasPaidOffThisMonth && /이번\s*달[^.]{0,12}완납|완납[^.]{0,12}이번\s*달/.test(body)
}

// 저장 직전 결정적 교정. AI 준수에 의존하지 않고, 규칙 위반 문구를 코드로 바로잡는다.
// 현재 대상: paidOffThisMonth 대출이 없는데 "이번 달(에) 완납"이라 쓴 잘못된 시점 수식어 제거.
// paid_off 대출 자체는 사실이므로 "완납" 서술은 유지하고, 거짓인 "이번 달" 시점만 떼어낸다.
// (프롬프트 "굳이 언급한다면 '이미 완납된 상태'로만 표기" 규칙과 동일한 결과.)
export function sanitizeGeneratedReport(text: string, report: MonthlyReport): string {
  if (!hasFalsePaidOffThisMonth(text, report)) return text
  return text
    // "이번 달에 완납되었습니다" → "완납되었습니다" (완납 앞 12자 내에 올 때만 시점 수식어 제거)
    .replace(/이번\s*달\s*에?\s*(?=[^.。\n]{0,12}완납)/g, '')
    // 역순 "완납 … 이번 달(에)" 형태의 시점 수식어도 제거
    .replace(/(완납[^.。\n]{0,12}?)이번\s*달\s*에?\s*/g, '$1')
}

function buildUserMessage(report: MonthlyReport): string {
  return `다음은 ${report.period.year}년 ${report.period.month}월 재무 보고서 데이터입니다. 위 규칙에 따라 한국어 마크다운 재무 분석 보고서를 작성해주세요.\n\n${JSON.stringify(report)}`
}

// 스트리밍 버전 — ReadableStream 반환. 청크마다 UTF-8 텍스트를 enqueue.
// 완료 후 fullText를 onComplete 콜백으로 전달 (DB 저장용).
export function streamFinancialReport(
  report: MonthlyReport,
  onComplete: (text: string) => Promise<void>,
): ReadableStream<Uint8Array> {
  const apiKey = process.env.GEMINI_API_KEY
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      if (!apiKey) {
        controller.enqueue(encoder.encode('오류: GEMINI_API_KEY가 설정되지 않았습니다.'))
        controller.close()
        return
      }

      const genai = new GoogleGenerativeAI(apiKey)
      const userMessage = buildUserMessage(report)
      let lastErr = ''

      for (const modelName of MODELS) {
        // 모델 재시도마다 초기화 — 앞 모델이 부분 스트리밍 후 실패하면 그 잔여 텍스트가
        // 다음 모델 결과 앞에 붙어 저장되는 버그를 막는다.
        let fullText = ''
        try {
          const model = genai.getGenerativeModel({
            model: modelName,
            systemInstruction: SYSTEM_PROMPT,
          })
          const result = await model.generateContentStream(userMessage)

          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              fullText += text
              controller.enqueue(encoder.encode(text))
            }
          }

          await onComplete(fullText)
          controller.close()
          return
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e)
          if (QUOTA_ERROR.test(lastErr)) break
          if (!RETRIABLE.test(lastErr)) break
        }
      }

      controller.enqueue(encoder.encode(`\n\n오류가 발생했습니다: ${lastErr}`))
      controller.close()
    },
  })
}
