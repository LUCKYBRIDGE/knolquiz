# KnolQuiz Local Storage Split

## 목표
- 로컬 우선(오프라인 우선) 운영을 유지한다.
- 브라우저 저장소를 역할별로 분리해 안정성과 유지보수성을 높인다.

## 저장소 역할
1. `localStorage`
- 즉시 읽어야 하는 런처 설정 저장
- 경량 설정값(인원, 모드, 종료 조건, 현재 활성 CSV 텍스트/이름, 플레이어 이름/태그)
- 라우팅 직후 동기 접근이 필요한 값

2. `IndexedDB`
- 대용량/목록형 데이터 저장
- CSV 업로드 라이브러리(여러 개 저장, 이름 변경, 삭제)
- 플레이 기록/통계(`sessions`, `players`, `wrongAnswers`)

## 현재 정책
- 런처 설정 키: `jumpmap.launcher.setup.v1`
- CSV 라이브러리 DB: `knolquiz-launcher-storage`
- CSV 라이브러리 스토어: `savedCsvItems`
- 퀴즈 로컬 DB: `knolquiz-quiz-storage`
- 퀴즈 로컬 스토어: `kv`
  - `customPresets`
  - `savedWrongs`
  - `studentNames`
  - `groupNames`
- 게임 기록/학급관리 DB: `math-net-master-local-records`
  - 기존 스토어: `sessions`, `players`, `wrongAnswers`
  - 신규(학급관리): `classroomStudents`, `classroomAttendance`, `classroomSeasons`, `classroomSeasonResults`

## 마이그레이션 규칙
- 기존 `localStorage`의 `savedCsvItems`가 있으면 초기 1회 `IndexedDB`로 이전한다.
- 이전 후 `localStorage`에는 CSV 라이브러리 목록을 저장하지 않는다.
- `IndexedDB`를 사용할 수 없는 환경에서는 호환을 위해 `savedCsvItems`를 `localStorage` fallback으로 유지한다.
- 퀴즈 앱도 기존 로컬 키(`quiz_custom_presets_v1`, `mathNetMasterWrongSets`, `mathNetMasterStudentNames`, `mathNetMasterGroupNames`)를 초기 1회 `IndexedDB`로 이전한다.
- 이전 후에는 `IndexedDB`를 우선 사용하고, 실패 시에만 localStorage fallback을 사용한다.
- 학급관리 데이터는 `localStorage`에 저장하지 않고 `IndexedDB` 전용으로 유지한다.

## 개발 규칙
- 새 기능 추가 시:
  - 동기 즉시참조 설정값이면 `localStorage`
  - 목록/기록/대용량 데이터면 `IndexedDB`
- 기능 구현 시 백업/복원(export/import)은 추후 확장 포인트로 유지한다.
