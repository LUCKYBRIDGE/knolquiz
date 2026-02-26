# nolquiz-runtime Repo Operations (R7)

Date: 2026-02-26

## 목적

- `nolquiz-runtime` 운영 레포의 배포/검증 기준과 editor publish 반영 절차를 고정한다.
- remote/배포 설정값을 추후 실제 운영 환경에 맞게 채울 수 있도록 체크 항목을 남긴다.

## Remote / Deploy Memo

- [ ] `origin` remote 설정
- [ ] 기본 브랜치 확인 (`main`)
- [ ] GitHub Pages(또는 운영 호스팅) 설정 확인
- [ ] 배포 루트 확인 (`public/`)
- [ ] 초기 푸시 (`main`) 완료

기록용:
- `origin`: (TBD)
- 배포 채널: (TBD)
- 기본 맵 경로: `public/shared/maps/jumpmap-01.json`

### Remote / First Push Command Template

원격 URL 확정 후 아래 템플릿 사용:

```bash
cd /Users/baekjiyun/Desktop/WAN/nolquiz-runtime

# 최초 설정
git remote add origin <RUNTIME_REMOTE_URL>

# 이미 origin이 있으면 URL 교체
# git remote set-url origin <RUNTIME_REMOTE_URL>

git branch --show-current
git push -u origin main
```

확인용:

```bash
git remote -v
git status --short --branch
git log --oneline -3
```

## 핵심 역할

- 서비스 런처: `public/index.html`
- 플레이 라우터: `public/play/`
- 운영 점프맵 런타임: `public/jumpmap-runtime/`
- 퀴즈 코어/공용 자산: `public/quiz/`, `public/shared/`

## Editor Publish 반영 절차 (받는 쪽 기준)

editor 레포에서 publish 실행 후 확인할 항목:

1. `public/shared/maps/jumpmap-01.json` 수정 여부 확인
2. 로컬 서버로 런처/플레이 라우터 기동 확인
3. 필요 시 monorepo `verify-split` 기준 검증 수행

### 로컬 실행

```bash
cd /Users/baekjiyun/Desktop/WAN/nolquiz-runtime
node scripts/jumpmap-local-serve.mjs
```

확인 URL:
- launcher: `http://127.0.0.1:5173/`
- play router: `http://127.0.0.1:5173/play/`

## 검증 메모 (권장)

monorepo 기준 자동검증(권장):

```bash
cd /Users/baekjiyun/Desktop/WAN/math-net-master-quiz
node scripts/jumpmap-verify-split.mjs --skip-smoke
node scripts/jumpmap-verify-split.mjs --skip-smoke --with-browser-e2e --browser-e2e-timeout-ms 30000
```

## 운영 점검 (선택)

- 런처 -> 점프맵 -> legacy/compat 진입 spot-check 1회
- publish 반영 후 `jumpmap-01.json` 버전/내용 변경이 실제 플레이에 반영되는지 확인

## Handoff 최소 기록 항목

- publish 반영 여부 (`public/shared/maps/jumpmap-01.json`)
- 검증 명령 + `pass/fail`
- 푸시 커밋 해시(`main` 최신 1~2개)
- 배포 채널/URL (설정 시)
