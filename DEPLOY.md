# LifeWallet 배포 지침

> **AI 도구 필독**: 이 파일은 `CLAUDE.md`를 통해 자동 주입됨. 코드 수정이 있는 작업 턴은 반드시 아래 절차를 완료해야 함. 배포 없이 작업 종료 금지.

---

## 배포 절차 — 코드 수정이 있을 때마다 필수

```bash
# 1. 타입 검증 (WSL2에서 npm run build 대신 사용)
npx tsc --noEmit

# 2. git commit
git add app components lib public instrumentation.ts next.config.ts tsconfig.json package.json
git commit -m "feat|fix|refactor: 설명"

# 3. 프로덕션 배포
vercel --prod

# 4. Ready 확인 — 이 출력이 나와야 완료
# "status":"ok" 또는 Aliased: https://lifewallet-eight.vercel.app 확인
```

## 프로덕션 URL
`https://lifewallet-eight.vercel.app`

## 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| `npm run build` 실패 (lightningcss 에러) | WSL2 네이티브 모듈 문제, 코드 에러 아님 | `npx tsc --noEmit` 으로 타입 체크만. Vercel 서버에서는 정상 빌드됨 |
| 배포했는데 변경 안 보임 | 직전 배포가 Error 상태 | `vercel ls` 로 최신 배포 상태 확인 |
| Turso 연결 에러 | 환경변수 미등록 | `vercel env ls` 로 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` 확인 |

## 배포 연동 방식

- **GitHub 연동: 미설정** — `git push` 만으로는 배포 안 됨
- `vercel --prod` 직접 실행이 유일한 배포 방법
- Stop 훅(`~/.claude/settings.json`)이 변경사항 자동 감지 후 commit + 배포 실행
