# NOLQUIZ Runtime

놀퀴즈 서비스 런타임 레포 스캐폴드입니다.

## Local Run

```bash
cd /Users/baekjiyun/Desktop/WAN/knolquiz-runtime
node scripts/jumpmap-local-serve.mjs
```

- launcher: `http://127.0.0.1:5173/`
- play router: `http://127.0.0.1:5173/play/`

## Main Scope

- `public/index.html` 런처
- `public/play/` 플레이 라우터
- `public/jumpmap-play/` 점프맵 플레이 경계
- `public/jumpmap-runtime/` 운영 런타임 구현체
- `public/quiz/` 퀴즈 코어
- `public/shared/` 공용 코어/기록/맵

## Notes

- 운영 맵 기본 경로: `public/shared/maps/jumpmap-01.json`
- 런타임 맵 publish는 editor 레포의 `jumpmap-publish-runtime-map.mjs`를 사용합니다.

## Operations Notes

- Repo/remote/deploy 운영 메모: `docs/repo-operations.md`
