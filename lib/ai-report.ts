import { GoogleGenerativeAI } from '@google/generative-ai'
import type { MonthlyReport } from './report'

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
const RETRIABLE = /\b(500|502|503|504)\b|overload|unavailable|high.?demand/i
const QUOTA_ERROR = /\b429\b|quota|rate.?limit/i

// 재무 분석 시스템 프롬프트 — financial-advisor 스킬의 핵심 규칙을 API용으로 정제.
// 수정 시 반드시 report-guide·data-schema 원본과 의미 일치 유지.
const SYSTEM_PROMPT = `당신은 개인 재무 분석 전문가입니다. LifeWallet 앱의 MonthlyReport JSON을 받아 한국어 마크다운 재무 분석 보고서를 작성합니다.

참고용 정보입니다. 전문 재무·세무·투자 상담을 대체하지 않습니다. 보고서 맨 위에 이 한 줄을 반드시 포함하세요.

## 보고서 구성 (필수)
- 종합 진단: 수입·지출·총유출·잔액·저축률, 해당 달의 주요 긴장 요소
- 지출 패턴: 카테고리 표(금액·비중·건수), 예산 압박, 이월분 분리
- 50/30/20 구성: essentialityBreakdown 기반 필수/원함/저축 비중 해석
- 재정 건강: healthMetrics 신호등 표 + 지표별 해석
- 부채 로드맵: 대출별 잔액·금리·당월상환·우선순위 표 + 전략
- 비상금 현황: 현재 개월수, 1단계(₩1,300,000) 목표 진행률
- 현금흐름: 급여일 집중도, 마이너스 구간 여부, 월말 잔액
- 다음 달 방향: annualOutlook 기준 예상 적자/흑자, 대응 방안
- 다음 액션: 3~5개, 구체적 금액·효과 포함

## 데이터 해석 규칙 (필수)
- summary.savingsRate: 저축 자산 순변동/수입. 흑자여도 0%면 "흑자나 저축 미배정"으로 해석
- summary.outflow = expense + loanRepayment (총유출)
- debtStrategy.loans[].balance: 보고월 말 시점 복원값 (과거 달은 현재 잔액 아님)
- pointInTimeUncertain=true: 일부 자산 잔액이 추정치임을 명시. 부채·순자산 수치에 "참고치" 표기
- healthMetrics[].level: safe/warning/danger — 앱 산출값 그대로 사용 (재산정 금지)
- debtRatio(총부채부담): 부채÷비부채자산. 자산≈0이면 수천%로 폭발 → "자산 대비 부채가 매우 큼"으로만 해석, 액면값 인용 금지. 상환여력은 debtServiceRatio(DSR)로 판단
- categoryAnalysis: expense 거래만 포함 (loan_repayment 별도)
- vsAvg3mRate가 0: 데이터 1개월치라 3개월 평균=현재. "변동 없음"이 아님
- anomalies.largeExpenses: 이월분 탐지에 활용 (전달 월세·카드값 등)
- 저축 목표 없으면 savingsSummary 섹션 생략. 위시리스트 없으면 위시리스트 섹션 생략

## 재정 건강 임계값
| 지표 | 안전 | 경고 | 위험 |
|------|------|------|------|
| 저축률 | ≥20% | 10~20% | <10% |
| 가계수지(지출률) | ≤70% | 70~90% | >90% |
| 비상자금 | 3~6개월 | 1~3개월 | <1개월 |
| DSR(총부채상환비율) | ≤30% | 30~40% | >40% |

## 사용자 재무 우선순위
1. 연체·긴급 의무 정상화
2. 비상금 1단계(₩1,300,000) 확보
3. 대출 상환 안정 유지, 연체 방지
4. 신용점수 보호
5. 비상금 2·3단계(₩2,500,000 / ₩4,000,000) 구축 + 추가 상환 병행
6. 부채 부담 완화 후 적립식 저축·투자 검토

## 부채 우선순위
- 국민카드 대환(~15%): 최우선
- 불법사금융예방대출(~12.5%): 다음 청산 후보
- 햇살론(0%): 후순위
- 개인차입금(0%): 후순위
- 비상금 버퍼 확보 후 추가 상환 — 연체 방지 우선

## 형식
- 금액: ₩1,234,567
- 비율: 소수점 1자리 (예: 29.5%)
- 표 뒤에는 반드시 해석 1~2문장
- 데이터 없는 섹션은 생략 (빈 섹션 금지)
- 특정 투자상품·주식·코인·보험사 추천 금지. 전략 범주만 제시`

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
