# 놀 시리즈 방문자 집계

세 사이트의 **브라우저 기준 고유 방문자**를 별도 집계합니다.
- 놀퀴즈: quiz (knolquiz.com)
- 놀프린트: print (print.knolquiz.com)
- 놀아트: art (art.knolquiz.com)

방문자 수는 사람 수가 아닌 브라우저 식별자 기준입니다. 서로 다른 기기/브라우저나 데이터 삭제 시 별도로 계산됩니다. 같은 브라우저에서 동일 사이트 재방문은 하루 1회만 일별 집계되고, 누적 수에도 최초 1회만 계산됩니다. 한국 시간 자정에 오늘 수치가 초기화됩니다. 데이터베이스 적용 이후부터 집계가 시작됩니다. 날짜별 고유 수를 합산한 숫자가 아니라 **사이트별 전체 기간 고유 브라우저 수**가 누적 수입니다.

## Cloudflare 설정 (운영자 1회 작업)

Cloudflare에 로그인해 이 저장소의 `visitor-counter/`를 별도 Worker로 배포합니다.

1. `cd visitor-counter && npx wrangler d1 create knol-visitors` 실행. 반환된 실제 database_id 복사.
2. `cp wrangler.toml.example wrangler.toml` 후 `database_id` 교체. 해당 파일은 실제 계정 설정이므로 커밋하지 않아도 됩니다.
3. `npx wrangler d1 execute knol-visitors --remote --file=schema.sql` 실행.
4. `npx wrangler secret put VISITOR_SALT` 실행해 **충분히 긴 임의의 비밀 문자열**을 등록. 변경 시 기존 누적 방문자는 다시 집계될 수 있으므로 유지할 것.
5. `npx wrangler deploy` 실행.
6. Cloudflare Workers의 Domains & Routes에서 **Custom Domain** `stats.knolquiz.com`을 연결합니다. Cloudflare가 해당 도메인을 관리해야 하며 기존 DNS/다른 Worker와 충돌 여부를 확인하세요.
7. 세 사이트의 메인 페이지에서 정상 숫자가 표시되는지 확인합니다.

**주의:** GitHub에 프런트엔드 파일을 반영하는 것만으로는 실시간 집계가 작동하지 않습니다. 실제 Worker/D1 및 도메인 연결이 완료되어야 숫자가 나옵니다. API 실패 시 미완성 숫자 또는 0을 표시하지 않고 집계 UI를 숨깁니다.

## 데이터 및 보안

- 접속자의 IP, 이름, 학생 정보 및 접속한 작품/파일은 데이터베이스에 저장하지 않습니다.
- 브라우저에서 생성한 UUID를 사이트별로 서버 비밀값과 함께 SHA-256 해싱하여 저장합니다. 원문 UUID는 서버 DB에 남지 않습니다.
- 방문자 수는 통계적 추정이며 악의적인 반복 요청을 완전히 막는 보안 장치는 아닙니다. 운영 트래픽/비용 급증 시 Cloudflare Rate Limiting 또는 Turnstile 도입을 검토하세요.
- 클라이언트 localStorage는 사이트 오리진별로 분리됩니다.
- 일별 식별자 테이블은 기간 경과 후 정리 정책을 별도로 도입할 수 있습니다.
- `stats.knolquiz.com` 도메인 연결 및 Worker 배포 전에는 기존 사이트 기능에 영향을 주지 않습니다.

## 기본 동작 점검

- 방문 1회: 오늘 1 / 누적 1
- 동일 브라우저 새로고침: 변함없음
- 다음 KST 날짜에 동일 브라우저 재방문: 오늘 1 / 누적 변함없음
- 다른 브라우저 첫 방문: 오늘 +1 / 누적 +1
- 서로 다른 서비스: 각각 별도 집계
