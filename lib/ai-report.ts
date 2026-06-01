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

### 2. 지출 패턴
카테고리 표(금액·비중·건수) 작성 후 반드시 해석 문장 포함.

### 3. 이월분 / 당월 생활비 분리 (anomalies.largeExpenses 필수 분석)
anomalies.largeExpenses를 확인해 전달 비용(월세·카드값 등 title에 "전월"·"이전달"·"N월" 포함되거나 날짜가 보고월 초에 몰린 항목)을 이월분으로 분류하라.
이월분 분류 대상은 **expense 항목에 한정**한다. 대출 원금상환(loanRepayment)은 이월분에 포함하지 말 것.
이월분이 있으면:
- 건별 금액·날짜를 나열
- 이월분 합계 = 이월분 항목들의 합산 금액 (반드시 덧셈 명시)
- 당월 순수 생활비 = summary.expense - 이월분 합계 (반드시 뺄셈식 명시, 예: ₩1,357,606 - ₩491,290 = ₩866,316)
이월분이 없으면 섹션 생략.

### 4. 50/30/20 구성
essentialityBreakdown 기반. 반드시 아래 표 형식으로 작성하라 (bullet list 금지):
| 분류 | 금액 | 지출 비중 | 수입 대비 비율 |
| --- | --- | --- | --- |
| 필수 (Needs) | | | |
| 원함 (Wants) | | | |
| 저축 (Savings) | | | |
표 아래 해석 1~2문장 필수.

### 5. 재정 건강
healthMetrics 기반 표. level에 따라 이모지 사용: safe=🟢, warning=🟡, danger=🔴.
표 형식:
| 지표 | 값 | 신호 | 기준 |
각 지표 아래 주의 사항:
- 총부채부담(debtRatio)이 수백~수만%면 "자산 대비 부채가 매우 크다"는 질적 신호로만 쓰고 숫자를 해석에 인용하지 말 것. 상환 여력은 반드시 DSR(총부채상환비율)로 판단하라.
- DSR이 safe면 "빚의 절대 규모는 크지만 월 상환 부담 자체는 감당 가능"으로 해석.

### 6. 부채 로드맵
대출 표에 아래 컬럼을 모두 포함하라:
| 대출명 | 잔액 | 금리 | 당월상환 | 월 이자(추정) | 우선순위 |
월 이자 = interestRate × balance / 12 로 계산 (0% 대출은 ₩0).
표 아래 전략: 무이자 부채는 최소 상환, 여유분은 최고금리 대출에 집중.
비상금 버퍼 확보 후 추가 상환 — 연체 방지가 우선.

### 7. 비상금 현황
현재 개월수, 1단계 목표(₩1,300,000) 달성률.
행동 지침은 반드시 구체적으로: "월 ₩50,000 + 급여일 잔액 스윕" 패턴 권고.
흑자가 난 달이면 그 흑자 일부를 비상금 계좌로 즉시 이동하는 습관을 강조.

### 8. 현금흐름
cashflowTimeline에서:
- 급여일(income > 0인 날) 날짜·금액 명시
- 잔액 정점 날짜·금액 명시 (cumulative 최대값)
- 마이너스 구간 여부
- 월말 잔액

### 9. 다음 달 방향
annualOutlook에서 다음 달 actualOutflow 또는 expectedBalance 확인.
**주의: annualOutlook의 금액이 현재 달보다 크게 높아도 "데이터 오류"로 취급하지 말 것. 실제 발생했거나 예정된 대형 지출·상환이다.**
적자 예상 달이면: 충격 규모 명시 + 현금 방어 전략(무이자 상환 일시 최소화, 단기 버퍼 활용 등) 구체 제시.

### 10. 다음 액션
3~5개. 각 항목: 구체적 금액 + 기대 효과(절감액·이자 감소 등).

## 데이터 해석 규칙
- summary.savingsRate 0% + 흑자: "흑자이지만 저축으로 미배정" — 저축 자산(savings_tracking)으로 이동하지 않은 것
- summary.outflow = expense + loanRepayment
- pointInTimeUncertain=true: 순자산·부채에 "(참고치)" 표기
- healthMetrics[].level 앱 산출값 그대로 사용, 재산정 금지
- vsAvg3mRate=0: 데이터 1개월치라 평균=현재값. "변동 없음"으로 해석 금지
- 저축 목표·위시리스트 없으면 해당 섹션 생략
- **JSON 필드명을 보고서 본문에 절대 그대로 쓰지 말 것.** backtick(`)으로 감싸도 안 됨. actualOutflow·actualIncome·expectedBalance·annualOutlook·loanRepayment·essentiality·cashflowTimeline·healthMetrics 등 모든 영문 키는 한국어로 해석해 서술 (예: actualOutflow → "예상 총 유출", actualIncome → "예상 수입", annualOutlook → "연간 전망", nextMonthForecast → "다음 달 예상")

## 사용자 재무 우선순위
1. 연체·긴급 의무 정상화
2. 비상금 1단계(₩1,300,000) 확보
3. 대출 상환 안정·연체 방지
4. 비상금 2·3단계(₩2,500,000 / ₩4,000,000)
5. 부채 완화 후 저축·투자

부채 우선순위: 국민카드 대환(15%) 최우선 → 불법사금융예방대출(12.5%) → 햇살론·개인차입금(0% 후순위)

## 형식 규칙
- 금액: ₩1,234,567 (원 단위)
- 비율: 소수점 1자리
- 모든 표 뒤 해석 1~2문장 필수
- 특정 투자상품·주식·코인·보험사 추천 금지
- 부채 표 우선순위 컬럼은 반드시 한국어로: high_interest→최우선(고금리), quick_close→빠른청산, heavy_payment→부담큰상환, normal→후순위`

export interface GenerateResult {
  text: string
  error: string | null
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
      let fullText = ''
      let lastErr = ''

      for (const modelName of MODELS) {
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
