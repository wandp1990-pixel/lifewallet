---
name: deploy
description: >-
  LifeWallet을 Vercel 프로덕션에 배포. "배포/배포해줘/올려줘/ship" 요청은
  (별도 언급 없으면) 항상 프로덕션 배포로 해석한다. VERCEL_TOKEN 환경변수로
  vercel CLI를 통해 직접 배포하며, GitHub → Vercel 자동 배포에 의존하지 않는다
  (이 프로젝트는 GitHub 연동 미설정 — git push만으로는 배포되지 않음).
---

# Deploy to Vercel (lifewallet)

배포 요청 시 **직접 배포**한다. "Vercel 접근 없음"으로 단정하지 말 것 —
`VERCEL_TOKEN`이 환경에 있으면 배포 가능하다.

> **단일 소스: 루트 `DEPLOY.md`.** 절차·검증·트러블슈팅의 최종 기준은
> `DEPLOY.md`다. 이 스킬은 그 요약이며, 충돌 시 `DEPLOY.md`를 따른다.

## 프로젝트 정보

- Vercel org(team): `wandp1990-8450s-projects`
- Vercel 프로젝트명: `lifewallet`
- 프로덕션 URL: `https://lifewallet-eight.vercel.app`
- 스택: Next.js (App Router), 패키지 매니저 npm. DB(Turso) 등 환경변수는
  Vercel 프로젝트 설정에 이미 등록됨 — 직접 넣을 필요 없음.
- **GitHub 자동 배포 미설정** — `vercel --prod` 직접 실행이 유일한 배포 방법.

## 절차

토큰이 있는지 먼저 확인(`env | grep -q '^VERCEL_TOKEN='`). CLI는
`npx --yes vercel@latest`로 설치 없이 사용. 원격 세션에서는 각 명령에
`--token "$VERCEL_TOKEN"`을 붙인다.

```bash
# 1. 배포 전 타입 검증 (npm run build 대신 — WSL2 lightningcss 이슈 회피)
npx tsc --noEmit

# 2. 프로젝트 연결 (idempotent)
npx --yes vercel@latest link --project lifewallet --yes --token "$VERCEL_TOKEN"

# 3. 프로덕션 배포
npx --yes vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN"

# 4. 최신 Production Ready 확인
npx --yes vercel@latest ls lifewallet --token "$VERCEL_TOKEN"

# 5. alias가 최신 배포를 가리키는지 확인
npx --yes vercel@latest inspect https://lifewallet-eight.vercel.app --token "$VERCEL_TOKEN"

# 6. 실제 프로덕션 응답 확인
curl -L -s -o /dev/null -w "%{http_code}\n" https://lifewallet-eight.vercel.app
```

배포 결과는 `"readyState": "READY"` / `"target": "production"`이고
`https://lifewallet-eight.vercel.app`에 aliased 되어야 한다. 최종 답변에
배포 URL·Ready 여부·alias 연결·(실패가 있었다면) 대응을 포함해 보고한다.

## 정리 (중요)

`vercel link`/`deploy`는 로컬 전용 파일을 만들고 `.gitignore`를 건드린다.

- `.env.local`(fresh `VERCEL_OIDC_TOKEN` 포함)과 `.vercel/` 디렉터리는
  **절대 커밋 금지**(비밀 포함). 이미 `.gitignore`로 무시됨.
- `vercel link`가 `.gitignore`에 `.vercel`/`.env*` 중복을 추가하면
  `git checkout .gitignore`로 되돌린다.

배포 후 `git status`는 깨끗해야 한다(배포로 커밋할 것은 없음).

## 이 스킬이 있는 이유

과거 세션이 GitHub Actions/PR만 확인하고 "Vercel 접근 불가"로 단정해 배포를
못 한 적이 있다. `VERCEL_TOKEN`은 그동안 환경에 있었다. 환경변수와 CLI를
먼저 확인하라.
