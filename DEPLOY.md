# LifeWallet 배포 지침

> **AI 도구 필독**: 이 파일은 상위 `README.md`의 배포 단일 소스다. 배포 요청 또는 코드 수정 후 배포가 필요한 작업 턴은 반드시 아래 절차를 완료해야 한다. 배포 명령만 실행하고 검증 없이 작업 종료 금지.

---

## 배포 요청 해석 — 필수

사용자가 "배포", "배포해줘", "올려줘"처럼 배포를 요청하면 별도 언급이 없어도 **항상 프로덕션 배포**로 해석한다. Preview 배포는 사용자가 명시적으로 "프리뷰"라고 말한 경우에만 한다.

배포 작업은 `vercel --prod` 실행으로 끝나지 않는다. 아래 검증까지 완료해야 배포 완료로 보고한다.

1. 배포 전 검증: `npx tsc --noEmit`
2. 프로덕션 배포: `vercel --prod`
3. 최신 배포 상태 확인: `vercel ls lifewallet`
4. alias 연결 확인: `vercel inspect https://lifewallet-eight.vercel.app`
5. 실제 프로덕션 응답 확인: `curl -L -s https://lifewallet-eight.vercel.app`

최종 답변에는 다음을 반드시 포함한다.

- 배포 URL: `https://lifewallet-eight.vercel.app`
- 최신 Production 배포가 `Ready`인지
- `lifewallet-eight.vercel.app` alias가 최신 배포를 가리키는지
- 실패가 있었다면 어떤 실패였고 어떤 대안을 수행했는지

## 배포 절차 — 코드 수정이 있을 때마다 필수

```bash
# 1. 타입 검증 (WSL2에서 npm run build 대신 사용)
npx tsc --noEmit

# 2. git commit
git add app components lib public instrumentation.ts next.config.mjs tsconfig.json package.json
git commit -m "feat|fix|refactor: 설명"

# 3. 프로덕션 배포
vercel --prod

# 4. Ready 확인 — 이 출력이 나와야 완료
# "status":"ok" 또는 Aliased: https://lifewallet-eight.vercel.app 확인

# 5. 배포 목록에서 최신 Production Ready 확인
vercel ls lifewallet

# 6. 프로덕션 alias 연결 확인
vercel inspect https://lifewallet-eight.vercel.app

# 7. 실제 프로덕션 응답 확인
curl -L -s https://lifewallet-eight.vercel.app
```

## 프로덕션 URL
`https://lifewallet-eight.vercel.app`

## 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| `npm run build` 실패 (lightningcss 에러) | WSL2 네이티브 모듈 문제, 코드 에러 아님 | `npx tsc --noEmit` 으로 타입 체크만. Vercel 서버에서는 정상 빌드됨 |
| `vercel --prod` 후 변경 안 보임 | 최신 배포가 Error 상태, alias가 이전 배포를 가리킴, 또는 브라우저/PWA 캐시 | `vercel ls lifewallet` → `vercel inspect https://lifewallet-eight.vercel.app` → `curl -L -s https://lifewallet-eight.vercel.app` 순서로 확인. 배포 Error면 원인 수정 후 재배포. alias가 이전 배포면 최신 Ready 배포를 다시 `vercel --prod`로 승격. 서버 응답은 최신인데 기기만 이전 UI면 PWA/브라우저 캐시 갱신 안내 |
| Turso 연결 에러 | 환경변수 미등록 | `vercel env ls` 로 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` 확인 |
| `vercel` 명령이 DNS/network 에러 | 로컬 샌드박스 또는 네트워크 제한 | 권한 승인을 요청해 네트워크 허용 상태로 같은 명령 재실행 |
| Production 배포가 4~5초 만에 Error | 빌드 설정 또는 환경변수 문제 가능성 높음 | `vercel inspect <배포 URL>` 또는 Vercel 로그로 실패 원인 확인 후, `next.config.*`면 [F6](../../PITFALLS.md#f6), 환경변수면 `vercel env ls` 확인 |

## 배포 연동 방식

- **GitHub 연동: 미설정** — `git push` 만으로는 배포 안 됨
- `vercel --prod` 직접 실행이 유일한 배포 방법
- Stop 훅(`~/.claude/settings.json`)이 변경사항 자동 감지 후 commit + 배포 실행
