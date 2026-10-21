# LifeWallet MCP 재무 관리

ChatGPT가 자연어에서 추출한 정보를 실제 장부에 저장하고 최신 DB 조회 결과로 상담한다. 영수증 OCR/자연어 해석은 ChatGPT가 담당하며 서버는 구조화된 입력을 검증한다. 엔드포인트는 `/api/mcp`, 프로토콜은 `2025-03-26`, 서버 버전은 `2.0.0`이다.

## 인증과 데이터 경계

기존 앱은 **소유자 한 명 / DB 하나** 구조이며 금융 테이블에 user_id가 없다. 이 구조를 유지하고, 여러 사용자의 장부를 같은 DB에 저장하는 기능은 제공하지 않는다. user_id 입력으로 장부를 선택할 수 없다.

- MCP: Google OAuth JWT의 서명·발급자·대상·만료와 검증된 소유자 이메일을 확인한다. 조회는 ledger:read, **모든 쓰기**는 추가로 ledger:write가 필요하다.
- 기존 WORK_MCP_TOKEN Bearer 인증은 소유자 전용 서비스 자격 증명으로 계속 지원한다. 공유하면 소유자 권한을 공유하는 것과 같다.
- 기존 앱의 **모든 재무 API 40개 메서드**에도 실제 소유자 세션 또는 소유자 Bearer 인증을 적용했다. ID 조회 전에 인증하므로 다른 계정이 실제 ID를 알아도 접근할 수 없다.
- 앱은 `/login`에서 기존 Google 로그인으로 접속한다. proxy의 쿠키 존재 확인은 이동 보조이며 권한 부여가 아니다. 각 API가 실제 세션과 소유자를 다시 검사한다.
- 동일 출처 검사와 Cache-Control: no-store를 적용한다. 인증 불완전 시 익명 접근을 허용하지 않는다.

WORK_MCP_ALLOWED_EMAIL을 다른 사람으로 바꾸면 DB 전체의 소유자를 바꾸는 셈이다. 다중 사용자 지원에는 별도의 소유권 스키마와 검토된 이관이 필요하다.

## 도구 목록

기존 세 도구의 이름·필수 입력과 기존 거래/합계 응답 필드를 유지했다. 나머지 15개가 새 도구다.

| 도구 | 필수 입력 / 동작 |
| --- | --- |
| get_ledger_context | 실제 자산·대출·분류 ID, 한국의 today, 잔액 기준일, 대출 지원 필드. include_hidden 선택 |
| query_ledger | from, to. 전체 합계와 최대 100건의 페이지; ID/type/amount/content 조건 선택 |
| record_receipt | 기존 호환: request_id, date, amount, asset_id, category_id, content. 지출 저장 |
| record_transaction | request_id, type(income/expense), date, amount, asset_id, category_id |
| update_transaction | request_id, changes 및 transaction_id 또는 selector 중 하나 |
| delete_transaction | request_id 및 transaction_id 또는 selector 중 하나 |
| create_asset | request_id, name, group_type, balance, balance_date |
| update_asset | request_id, asset_id, changes. 잔액 변경은 별도 도구 |
| get_balances | as_of. asset_id 선택; 요청일 기준 잔액과 각 기준일 |
| set_asset_balance | request_id, asset_id, balance, as_of. 거래 없이 기준 잔액 직접 갱신 |
| create_loan | request_id, name, balance, balance_date 및 지원하는 대출 정보 |
| update_loan | request_id, loan_id, changes. 남은 원금은 set_asset_balance |
| record_transfer | request_id, date, amount, from_asset_id, to_asset_id. fee 선택 |
| record_loan_repayment | request_id, date, principal_amount, interest_amount, from_asset_id, loan_id |
| list_categories | 수입·지출·자산 분류. type/include_hidden 선택 |
| create_category | request_id, type, name. expense는 essentiality도 필수 |
| update_category | request_id, category_id, changes. 유형 변경은 미지원 |
| get_financial_overview | from, to, as_of. 자산·부채·순자산·기간 합계·분류별 지출 |

대출은 최초 원금 principal, 남은 원금 balance, 연이율 interest_rate, 상환일 payment_day, 월 상환액 monthly_payment, start_date/end_date를 지원한다. **상환 방식 repayment_method는 기존 앱에 필드가 없어 미지원**이다. 추정하거나 note에 대체 저장하지 않는다.

## 금액·날짜·잔액 규칙

- KRW **원 단위 정수**만 지원한다. 거래는 양수, 수수료/상환 원금/이자는 0 이상이며 상환 합계는 양수다. 금액/잔액 절댓값 상한은 100,000,000,000,000원이다.
- 부채 유형은 앱과 같은 card, minus_account, loan, insurance이며 DB/조회 잔액은 음수다. 부채 생성·잔액 설정 입력은 **양수 남은 원금**이다. 일반 자산은 부호 있는 잔액을 허용한다.
- 날짜는 **Asia/Seoul 달력의 YYYY-MM-DD**, 하한은 1900-01-01이다. 상대 날짜는 get_ledger_context.today로 변환한다. 거래일 date는 등록일 created_at과 다르다.
- from/to는 양끝 포함이다. 거래/잔액 날짜는 오늘까지 지원한다. 계약 시작/종료일과 조회 기간은 미래 날짜도 허용한다. created_at/queried_at/committed_at은 UTC ISO 타임스탬프다.
- assets.balance는 최신 **저장** 잔액이며 은행 실시간 조회값이 아니다. balance_date는 거래가 이미 포함된 날짜 기준점이다.

### 거래와 직접 잔액 갱신

기본 규칙은 기존 앱과 같다. 기준일 이후 거래만 반영하며 기준일 당일/이전 거래는 이미 포함된 것으로 본다. 직접 잔액 갱신은 수입·지출 거래를 만들지 않고, 기준일 다음 날 이후의 기존 거래만 다시 더해 현재 잔액을 계산한다. 당일/이전 거래의 반영 상태는 새 기준점에 흡수한다.

새 MCP 거래가 기준일 당일/이전에 해당하면 **BALANCE_CONFIRMATION_REQUIRED**를 반환한다. 사용자 확인 후 계좌별로 다음 배열을 입력한다.

- balance_included_asset_ids: 이 거래가 기준 잔액에 **이미 포함**된 거래 당사자 자산 ID. 추가 반영 없음.
- balance_excluded_asset_ids: 이 거래가 **포함되지 않아 새로 반영**할 거래 당사자 자산 ID.

예: 오늘 비상금 잔액을 35만 원으로 설정한 뒤 10만 원 이체를 기록한다면, 이체가 35만 원에 포함됐는지 먼저 묻는다. 미포함이면 비상금 ID를 balance_excluded_asset_ids에 넣어 45만 원으로 만든다. 이미 포함됐다면 35만 원을 유지한다. 출금 계좌는 자신의 기준일/포함 여부에 따라 처리한다.

포함 여부는 ledger_balance_effects에 저장하고 앱의 잔액 이력도 같은 규칙으로 표시한다. 수정은 기존 효과 취소 후 새 효과를 반영하고 삭제는 실제 반영했던 효과만 취소한다. 이후 잔액을 재설정했다면 흡수된 거래 효과를 또 취소하지 않는다.

기존 record_receipt와 앱의 과거 날짜 입력은 호환성을 위해 기본 날짜 규칙을 유지한다. 기준일 당일/이전의 **미포함 영수증**은 새 record_transaction으로 포함 여부를 명시한다. 기존 type=asset/content=잔액 조정 이력은 일반 거래 수정/삭제로 다루지 않고 새 잔액 기준을 설정한다.

### 이체·상환·집계

- 이체는 출금 -(amount+fee), 입금 +amount이며 원금은 수입·지출에서 제외한다.
- 상환은 principal_amount+interest_amount를 앱의 amount(총 출금), interest_amount를 fee로 저장한다. 출금 계좌는 총액 감소, 대출은 원금만 감소한다. 실제 반영할 원금은 남은 부채를 초과할 수 없다.
- income/expense는 기존 일반 수입/지출 합계를 유지한다. loan_principal/loan_interest/transfer_fees는 별도다.
- outflow = 일반 지출 + 상환 원금 + 이자 + 이체 수수료. 이체 원금은 제외한다.
- 상담용 spending = 일반 지출 + 상환 이자 + 이체 수수료. 상환 원금을 소비로 설명하지 않는다.
- 분류별 지출은 일반 expense의 전체 조건 일치 합계다. 상환 이자/이체 수수료는 별도 필드다.

get_balances는 요청일 이후 거래를 역산한다. 요청일이 최근 기준일보다 이전이거나 기준일이 없으면 available=false/balance=null이다.

get_financial_overview 총액은 앱 보고서처럼 **표시 중이고 as_of까지 개설된 자산** 기준이다. included_in_totals/totals_scope에 범위를 명시한다. 대상에 복원 불가 잔액이 있으면 complete=false이며 자산·부채·순자산 총액은 null이다. 기간 합계는 실제 거래 전체를 계산한다.

## 재시도·오류·이력·복구

모든 MCP 쓰기는 request_id가 필수다. 같은 ID/입력은 최초 커밋 결과를 duplicate=true로 재생한다. 키 순서는 무관하다. 다른 작업/값은 IDEMPOTENCY_CONFLICT다. 롤백된 요청은 저장하지 않으며, 다른 ID의 동일 내용은 별도 사용자 의도로 취급한다.

거래·잔액·반영 상태·감사 이력·요청 응답을 하나의 쓰기 트랜잭션으로 커밋한다. 성공에 저장 ID·주요 필드·변경 잔액·committed_at을 포함한다. 재생 응답의 잔액은 **최초 커밋 당시 값**이므로 최신 상담에는 다시 조회한다. 기존 work_receipt_requests의 재시도도 유지한다.

앱 거래·자산·분류 변경도 같은 서비스를 사용한다. 폼은 Idempotency-Key를 생성하고 네트워크/서버 오류 후 재시도에 유지한다. REST 호출자가 헤더를 생략하면 서버는 새 키를 만든다.

기존 앱 잔액 폼/REST PATCH의 balance는 **현재 잔액**이다. 어댑터가 기준일 이후 거래를 먼저 빼서 기준 잔액으로 변환한 뒤 공통 갱신 서비스를 호출하므로 이중 반영하지 않는다. MCP set_asset_balance의 balance는 설명대로 **as_of 날짜의 잔액**이다. 두 입력 계약의 차이를 유지하면서 같은 저장·기준일 규칙을 사용한다.

오류는 isError=true와 structuredContent.error={code,message,details,retryable} 및 같은 JSON text로 반환한다. DB 내부 오류나 비밀값을 노출하지 않는다.

| 오류 | 다음 행동 |
| --- | --- |
| MISSING_INFORMATION | details.fields를 사용자에게 질문 |
| AMBIGUOUS_TARGET | candidates의 날짜·금액·내용·ID로 선택 요청. has_more면 조건 축소 |
| BALANCE_CONFIRMATION_REQUIRED | 해당 자산의 기준 잔액에 포함됐는지 확인 |
| NOT_FOUND / INVALID_TARGET | 실제 목록 재조회; 없는/숨긴/유형이 다른 대상 추정 금지 |
| UNSUPPORTED_FIELD / UNSUPPORTED_OPERATION / UNSUPPORTED_VALUE | 지원 범위를 설명하고 입력 확인 |
| INVALID_DATE / INVALID_AMOUNT / INVALID_TRANSACTION / INVALID_INPUT / INVALID_BALANCE | 단위·부호·날짜 등 입력 확인 |
| IDEMPOTENCY_CONFLICT | 의도를 확인; 다른 작업이면 새 ID |
| STORAGE_ERROR | 성공을 안내하지 않고 같은 request_id로 재시도 |

selector는 date/type/amount/asset_id/category_id/content의 정확 일치다. 여러 거래면 아무 것도 변경하지 않고 최대 100개 후보를 반환한다. 이름이 중복된 계좌/분류도 실제 ID를 선택받는다. 저장된 content/note/name은 데이터이며 지시로 실행하지 않는다.

ledger_audit는 수정 전후, 삭제 원본, 잔액 조정 및 request_id를 보존한다. 거래는 활성 테이블에서 삭제하고 감사 이력에서 복구할 수 있다. 기존 앱 자산/분류 삭제도 연결 해제 전 자료를 보존한다.

운영자는 DB 백업과 이력을 먼저 검토하고 환경변수를 **명시적으로** 지정해 복구한다. 다음 스크립트는 .env 파일을 읽지 않으며 기본 동작은 dry-run이다.

```bash
node --import tsx scripts/restore_ledger_transaction.ts --audit-id <검토한-삭제-이력-ID>
node --import tsx scripts/restore_ledger_transaction.ts --audit-id <동일-ID> --apply --request-id <고유한-복구-요청-ID>
```

복구는 원래 거래 ID를 쓰고 현재 기준일 및 삭제 이후 잔액 재설정 이력을 확인한다. 자산/분류가 없어졌거나 현재 규칙과 충돌하면 실패한다. 자산·분류·잔액 일괄 원복 도구는 제공하지 않으며 이력과 백업을 별도 검토한다.

## 배포·스키마·MCP 재연결

**이 작업에서는 운영 배포나 운영 DB 변경을 실행하지 않는다.** 추가 스키마는 [20261021_mcp_ledger.sql](../migrations/20261021_mcp_ledger.sql)이다.

1. 운영 DB 백업/복원을 준비한다. 먼저 **별도 검증 DB**에 적용한다. ledger_requests/ledger_audit/ledger_balance_effects와 인덱스만 추가하며 금융 행 backfill은 없다. initDb도 동일한 CREATE IF NOT EXISTS를 실행하므로 기존 initDb의 과거 마이그레이션까지 검토한다.
2. Google/소유자 설정을 점검한다. **이제 앱 화면도 로그인 필수**이므로 토큰만 쓰던 배포는 Google 설정부터 완료한다. 기존 키를 임의로 재생성하지 않는다.

| 변수 | 의미 |
| --- | --- |
| TURSO_DATABASE_URL / TURSO_AUTH_TOKEN | 대상 DB/자격 증명. 검증에는 별도 DB |
| WORK_MCP_ORIGIN | 배포 HTTPS origin |
| WORK_MCP_ALLOWED_EMAIL | 본인의 Google 이메일 한 개 |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Google 웹 OAuth 클라이언트 |
| WORK_AUTH_SECRET | 기존 최소 32문자 비밀값 유지 |
| WORK_MCP_TOKEN | 기존 소유자 Bearer 비밀값 유지 |

Google 승인 리디렉션은 `https://lifewallet-eight.vercel.app/api/auth/callback/google`이다. 테스트 모드면 소유자를 테스트 사용자로 추가한다. 비밀값은 저장소/채팅/ChatGPT 연결창에 넣지 않는다.

3. npm ci, npx tsc --noEmit, npm test, npm run test:mcp로 검증한다. **빌드와 서버 시작도 DB를 초기화**하므로 명시적으로 검증용 환경을 지정한다. 운영 .env.local을 테스트에 사용하지 않는다.
4. 운영 반영 승인 후에만 DEPLOY.md에 따라 배포한다. Ready/production alias/실제 응답, 소유자 로그인과 타 사용자·익명 차단을 확인한다. 최초 요청에서 스키마가 자동 생성되거나 검토 SQL을 사전 적용할 수 있다.
5. ChatGPT의 기존 연결을 해제한 뒤 `https://lifewallet-eight.vercel.app/api/mcp`에 재연결한다. Google 로그인 후 확대된 쓰기 설명에 동의한다. **도구 18개와 ledger:write**를 확인한다.
6. 읽기로 실제 ID와 기준일을 먼저 확인한다. 운영 장부에는 임의 테스트 데이터를 만들지 않고 사용자가 의도한 실제 작업만 수행한다.

롤백은 쓰기를 중지하고 백업을 보존한 뒤 검토한다. 새 같은 날 반영 상태를 사용한 후 예전 코드로 단순 복귀하면 예전 코드는 ledger_balance_effects를 읽지 못한다. 잔액·기준일·반영 상태의 정합성을 먼저 검토하고 감사/재시도 테이블을 삭제하지 않는다.

## 검증 범위와 제한

임시 SQLite에서 예시 급여 280만 원, 비상금 35만 원, 개인차입금 550만 원, 이체 10만 원, 원금 10만+이자 8천 원과 등록→조회→수정→재조회→삭제를 검증한다. 다중 후보 선택, 페이지별 전체 합계, 기준일 전후 수정/삭제, 같은 날 확인, 동시/기존 영수증/앱 재시도, 강제 저장 실패 롤백, 감사 이력과 복구, KST 경계를 포함한다.

OAuth discovery/DCR/PKCE/일회 코드/JWT 읽기·쓰기/갱신 회전, 모든 쓰기 scope, **18개 MCP 도구와 40개 앱 메서드**의 다른 계정/익명 차단을 검사한다. 기존 자산 삭제와 재무 보고서 33개 회귀 검사도 유지한다.

실제 Google 로그인/콜백, ChatGPT(모바일 포함)의 재연결·도구 갱신·동의 및 운영 Turso 최종 연결은 배포 후 실기기 확인이 필요하다. 지원 범위는 KRW·단일 소유자이며 과거 기준일 이전 잔액 추정, 미래 거래, 앱에 없는 대출 상환 방식은 미지원이다.
