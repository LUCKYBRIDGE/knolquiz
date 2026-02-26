# 레포지토리 분리 실행계획 (점프맵 에디터 vs 게임 런타임/퀴즈코어)

작성일: 2026-02-22  
상태: 실행계획 초안 (확정 전)  
범위: 현재 `math-net-master-quiz`를 기준으로, `맵 에디터`와 `게임 런타임 + 퀴즈코어`를 분리하는 실제 작업 계획

---

## 1) 결론 (권장 방향)

현재 프로젝트는 **2개 레포지토리 구조**로 분리하는 것이 맞다.

1. `runtime` 레포 (사용자 서비스용)
- 퀴즈 선택/게임 선택/플레이 시작 UI
- 점프맵 플레이 런타임
- 퀴즈코어
- 플레이 기록/오답 기록/통계 (로컬 저장)
- 배포용 맵/이미지 에셋(`public` 기준)

2. `editor` 레포 (제작 도구용)
- 점프맵 에디터
- 정밀 작업판/히트박스 편집/테스트모드
- 맵 제작 저장/불러오기/슬롯/배포용 export
- 에셋 프리셋/자동 추출/편집 프로파일

이 구조는 다음 요구와 일치한다.
- 퀴즈코어는 점프맵 외 다른 게임에도 재사용
- 사용자는 에디터가 아니라 서비스 UI에서 게임을 시작
- 로컬 저장은 많이 쓰되, 운영/배포 자산은 GitHub 기준 경로 사용

---

## 2) 현재 상태 점검 결과 (요약)

### 2.1 물리적 상태 (Git 기준)
- 아직 단일 레포:
  - `origin = git@github.com:LUCKYBRIDGE/math-net-master-quiz.git`

### 2.2 논리적 분리 상태 (이미 진행된 좋은 변화)
- `public/index.html`: 사용자 런처(인원/퀴즈/게임 선택)
- `public/play/`: 서비스 플레이 라우터/기록 조회
- `public/jumpmap-play/`: 점프맵 플레이 진입 경계
- `public/shared/`: 공용 런타임/기록 일부
- `public/jumpmap-editor/`: 에디터 + 테스트 런타임

즉, **코드 경계는 1차 형성됨**.  
이제 해야 할 일은 **실제 레포 분리 실행**과 **자산/계약 고정**이다.

---

## 3) 분리의 핵심 원칙 (실패 방지 규칙)

### 3.1 먼저 고정할 것
레포를 먼저 쪼개기 전에 아래 계약을 먼저 고정한다.

- 맵 JSON 스키마 (`version`, 필드 의미, 좌표계 규칙)
- 퀴즈 브리지 이벤트 계약 (`quiz:open-request`, `quiz:resolved` 등)
- 플레이어/기록 데이터 스키마 (이름/학생번호/정답률/오답 기록)
- 배포 자산 경로 규칙 (`public/...` 기준 상대경로)

### 3.2 로컬 원본 vs 배포 자산 분리
- 로컬 제작 원본:
  - `save_map/*.json`
  - 에디터 드래프트/로컬 슬롯
- 배포용 자산:
  - `public/shared/maps/*.json`
  - `public/quiz_plate/*`, `public/quiz_background/*`, `public/quiz_sejong/*`, `public/quiz_poster/*`

### 3.3 에디터 테스트모드와 운영 런타임 차이 허용, 규칙 차이는 최소화
- UI는 달라져도 됨
- 하지만 아래는 최대한 공유/동일화:
  - 맵 파서
  - 충돌/물리 핵심 규칙
  - 퀴즈 브리지 계약
  - 기록 포맷

---

## 4) 목표 레포 구성 (권장안)

## 4.1 Runtime 레포 (가칭: `quiz-game-suite`)

사용자/학생/교사 운영용 레포.

### 포함 범위 (초기)
- `public/index.html` (런처)
- `public/play/` (플레이 라우터, 기록 조회)
- `public/jumpmap-play/` (점프맵 플레이 진입점)
- `public/quiz/` (퀴즈코어 UI/코어)
- `public/shared/` (공용 런타임/기록 유틸)
- `public/shared/maps/` (배포용 점프맵 JSON)
- `public/quiz_plate/`, `public/quiz_background/`, `public/quiz_sejong/`, `public/quiz_poster/`
- 필요 시 `public/shared/assets-manifest.json` (후속)

### 제외 범위
- `public/jumpmap-editor/` 전체
- 에디터 전용 스크립트(`scripts/jumpmap-local-serve.mjs`, plate sync 등) 중 런타임에 불필요한 것
- `save_map/` (제작 원본)

## 4.2 Editor 레포 (가칭: `jumpmap-editor`)

제작자/개발자용 도구 레포.

### 포함 범위 (초기)
- `public/jumpmap-editor/` 전체
- 에디터 전용 스크립트:
  - `scripts/jumpmap-local-serve.mjs`
  - `scripts/jumpmap-sync-plates.mjs`
  - `scripts/jumpmap-publish-runtime-map.mjs` (개조 필요)
- 문서:
  - `docs/jumpmap-editor-*`
  - `docs/jumpmap-local-workflow.md`
- 제작 원본:
  - `save_map/` (로컬)
  - 원본 에셋 폴더(필요 시)

### 제외/축소 후보
- 런처/기록 페이지 (`public/index.html`, `public/play/`)는 편집용 레포에서는 제거 가능
- 다만 초기 분리 단계에서는 회귀 검증 편의를 위해 임시 유지 가능

---

## 5) 실제 파일 이동 매트릭스 (현재 기준)

## 5.1 Runtime 레포로 이동 (또는 복제 시작 후 정리)
- `public/index.html`
- `public/play/`
- `public/jumpmap-play/`
- `public/quiz/`
- `public/shared/`
- `public/quiz_background/`
- `public/quiz_plate/`
- `public/quiz_sejong/`
- `public/quiz_poster/`
- `public/.nojekyll`

## 5.2 Editor 레포로 이동
- `public/jumpmap-editor/`
- `scripts/jumpmap-local-serve.mjs`
- `scripts/jumpmap-sync-plates.mjs`
- `scripts/jumpmap-publish-runtime-map.mjs` (runtime repo 대상으로 수정)
- `save_map/`
- 에디터 관련 문서/체크리스트

## 5.3 공용 계약 문서로 유지/복제 (양쪽 필요)
- `docs/jumpmap-runtime-quiz-plan.md` (runtime 중심으로 이동 권장)
- `docs/jumpmap-runtime-quiz-checklist.md` (runtime 중심)
- 브리지 계약/맵 스키마 명세 문서 (신규 분리 권장)

권장:
- 장기적으로는 `contracts/` 또는 `docs/contracts/` 디렉터리로 정리

---

## 6) 코드/구조 수정이 필요한 지점 (중요)

레포 분리 시 단순 복사만으로 끝나지 않는다. 아래 변경이 필요하다.

## 6.1 점프맵 플레이가 에디터 구현에 의존하는 경로 제거
현재 상태:
- `public/jumpmap-play/app.js`가 최종적으로 `../jumpmap-editor/?launchMode=play...`로 이동

분리 후 문제:
- runtime 레포에 editor가 없으면 경로가 깨짐

대응 계획:
1. runtime 레포에 `public/jumpmap-runtime/` (신규) 도입
2. `jumpmap-play`는 `jumpmap-runtime`으로 연결
3. 에디터 테스트모드는 별도(개발용)로 유지
4. 전환 완료 전까지는 runtime 스캐폴드에 `public/jumpmap-editor/`를 임시 포함해
   레거시 플레이 경로를 깨지 않게 유지한다(호환 브리지 단계).

즉, **분리 전에 먼저 운영용 점프맵 런타임 구현체를 독립 경로로 만들기**가 필요하다.

## 6.2 맵 로딩 경로 표준화
현재 개선 사항:
- 플레이모드에서 `public/shared/maps/jumpmap-01.json` 우선 로드, 로컬 fallback 가능

분리 후 목표:
- runtime 레포는 `public/shared/maps/*.json`만 사용
- editor 레포는 `save_map/*.json` 제작 원본 + export/publish로 runtime용 맵 생성

## 6.3 에셋 경로/상대경로 점검
레포 분리 후 `../quiz_plate/`, `../quiz_background/` 같은 상대경로가 레포 구조에 따라 달라질 수 있음.

대응:
- 공용 path resolver (base path aware) 도입 권장
- 최소한 다음 상수는 한 곳에서 관리:
  - `plateBase`
  - `sejongBase`
  - `quiz background base`
  - `shared maps base`

## 6.4 기록 저장(localStorage / IndexedDB) 키 네임스페이스
분리 후에도 로컬 기록 연속성을 유지해야 함.

대응:
- 기존 키 유지 (호환)
- 신규 키는 prefix 통일:
  - 예: `mnet.runtime.*`, `mnet.editor.*`
- 마이그레이션 함수 1회 실행(선택)

---

## 7) 이미지/에셋 운영 전략 (질문한 핵심에 대한 답)

질문한 방향이 맞다.

### 7.1 운영/사용자 기준
- 사용자에게 제공되는 이미지/맵/퀴즈 리소스는 **GitHub에 올라간 `public` 경로 기준**이 맞다.
- 이유:
  - 다른 컴퓨터/다른 브라우저에서도 동일 동작
  - 경로 재현성 높음
  - 배포 테스트와 운영 동작 일치

### 7.2 제작자 기준
- 편집 원본(`save_map`, 원본 이미지, 백업 폴더)은 editor 레포 로컬에서 관리
- 운영 반영은 export/publish 단계로 별도 수행

### 7.3 권장 워크플로우 (초기)
1. editor 레포에서 맵 제작
2. `save_map/jumpmap-01.json` 갱신
3. publish 스크립트로 `runtime` 레포의 `public/shared/maps/jumpmap-01.json` 갱신
4. runtime 레포에서 플레이 검증
5. 커밋/배포

---

## 8) 실행 단계 계획 (실제 순서)

## Phase R0) 계약 고정 (분리 전 필수)
- 맵 JSON 스키마 버전/필수필드 확정
- 브리지 이벤트 계약 문서화
- 기록 스키마 문서화
- 경로 규칙 문서화

산출물:
- `docs/contracts/map-schema.md` (신규)
- `docs/contracts/bridge-events.md` (신규)
- `docs/contracts/local-records.md` (신규)

## Phase R1) Runtime 구현체 독립 준비 (가장 중요)
- `jumpmap-play -> jumpmap-editor` 직접 연결 제거 준비
- `public/jumpmap-runtime/` 신규 구현체 뼈대 생성
- 기존 `test-runtime`의 공유 가능한 부분을 `public/shared/jumpmap-runtime-core.js` 기준으로 점진 이관

성공 기준:
- 에디터 없이도 점프맵 플레이 진입 가능 (런타임 단독 실행)

## Phase R2) 자산/맵 배포 경로 고정
- runtime 레포 기준 `public/shared/maps/jumpmap-01.json` 사용 고정
- editor publish 스크립트가 runtime 레포 대상 경로로 내보내기 가능
- 이미지 경로 공용 규칙 확정

## Phase R3) 레포 생성 및 1차 분리 (복제 방식)
권장 방식:
- 처음에는 “이동”보다 “복제 + 경로 수정 + 검증”

1. 새 runtime 레포 생성
2. 필요한 `public/*`와 `shared` 복제
3. 새 editor 레포 생성
4. `public/jumpmap-editor`, `scripts`, `save_map`, 문서 복제

## Phase R4) 경로/빌드/배포 정리
- GitHub Pages base path 점검
- `.nojekyll` 유지
- 상대경로 오류 수정
- 로컬 서버 스크립트 정리

## Phase R5) 호환성 검증 / 컷오버
- 기존 저장 맵 로드 검증
- 점프맵-퀴즈 루프 검증
- 기록 저장/조회 검증
- 멀티플레이 2~6인 검증

그 뒤에 현재 monorepo(기존 레포)를 archive 또는 역할 축소

---

## 9) 리스크와 대응 (분리 시 꼭 발생하는 문제)

## 9.1 에디터 테스트모드와 운영 런타임 동작 차이 확대
- 리스크: "에디터에선 되는데 서비스에선 안 됨"
- 대응:
  - 공용 코어 재사용 확대
  - 대표 맵 회귀 테스트 고정 (`jumpmap-01`, 기존 저장맵 2종 이상)

## 9.2 자산 경로 깨짐
- 리스크: 상대경로 `../...`가 레포 구조 바뀌며 깨짐
- 대응:
  - path resolver 도입
  - 배포/로컬 모두 경로 smoke test

## 9.3 로컬 기록 키 충돌/분산
- 리스크: 기존 사용자 기록이 사라진 것처럼 보임
- 대응:
  - 키 네임스페이스 정책
  - 마이그레이션/호환 읽기

## 9.4 publish 누락으로 운영맵 미반영
- 리스크: editor 원본은 수정됐는데 runtime 맵은 구버전
- 대응:
  - publish 스크립트 표준화
  - runtime 화면에 맵 버전/수정시각 표시(선택)

---

## 10) 검증 체크리스트 (분리 직후 필수)

### 10.1 Runtime 레포
- 런처에서 인원/퀴즈/게임 선택 가능
- 점프맵 선택 시 정상 시작
- 퀴즈 버튼 -> 퀴즈 팝업 -> 정답/오답 -> 게이지 반영
- 기록 저장/조회 가능
- `public/shared/maps/jumpmap-01.json` 수정 반영 확인

### 10.2 Editor 레포
- 에디터 열림
- 발판 팔레트 로딩
- 정밀 작업판/히트박스 편집
- 저장/불러오기/로컬 슬롯
- 테스트모드 동작
- 맵 publish/export 동작

### 10.3 호환성
- 기존 저장 맵(`save_map/*.json`) 불러오기 성공
- 히트박스/크롭/배경/스타트포인트 보존
- 플레이어 프로필/히트박스 저장값 재사용 가능

---

## 11) 지금 확정하면 좋은 항목 (사용자 확인 필요)

아래는 분리 시작 전에 확정하면 작업이 빨라진다.

1. 새 레포 이름
- 추천:
  - runtime: `math-net-games-runtime` 또는 `math-net-quiz-games`
  - editor: `jumpmap-editor-studio` 또는 `math-net-jumpmap-editor`

2. 운영용 점프맵 파일명 규칙
- 기본: `public/shared/maps/jumpmap-01.json`
- 추후 확장: `jumpmap-stage-001.json`, `jumpmap-school-a-001.json`

3. publish 방식
- 추천 기본값:
  - editor 레포에서 runtime 레포 경로를 지정해 export/publish
  - 또는 zip/json export 후 runtime 레포에 수동 반영

4. 이미지 운영 원칙
- 추천 기본값:
  - 운영에 쓰는 이미지는 runtime 레포 `public/`에 존재
  - editor 전용 원본/백업 이미지는 editor 레포에 존재

5. 계약 문서 위치
- 추천 기본값:
  - runtime 레포에 `docs/contracts/*`
  - editor 레포는 해당 문서를 참조하거나 복제본 유지

---

## 12) 추천 시작점 (바로 다음 작업)

가장 먼저 시작할 작업은 이것이다.

1. `Phase R0`: 계약 문서 3종 생성 (맵/브리지/기록)
2. `Phase R1`: `jumpmap-play`가 `jumpmap-editor` 없이도 동작하는 독립 `jumpmap-runtime` 경로 뼈대 생성

이 2개가 끝나면 레포 분리는 실제로 안전하게 진행할 수 있다.  
반대로 이 2개 없이 레포를 먼저 쪼개면 경로/의존성/동작 차이로 다시 합쳐야 할 가능성이 높다.
