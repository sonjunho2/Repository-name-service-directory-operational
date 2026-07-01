# 운영 QA 및 버그 수정 보고서 (2차 점검)

이번 점검은 이전 `QA_FIX_REPORT.md`(1차)에서 "위험도가 높아 보류"로 남겨둔
관리자 화면(`views/admin.ejs`) 프론트엔드 중복 코드를 실제로 분석·정리하고,
전체 라우트/DB 스키마/실행 안정성을 다시 한 번 교차 검증한 결과입니다.

## 교체 대상 파일

- `views/admin.ejs` — 중복 함수 통합(아래 상세 참조)
- `QA_FIX_REPORT.md` — 이 보고서로 갱신
- **삭제**: `restore-routes.js` — 아래 "삭제 사유" 참조 (서버 코드/동작에는 영향 없음)

`server.js`, `public/`, `scripts/`, 그 외 `views/*.ejs`는 이번 점검에서 로직 변경이
발견되지 않아 그대로 유지했습니다(즉, 기존 파일을 교체하지 않아도 됩니다).

## 실행 검증 결과

- `node --check server.js` 통과
- `views/admin.ejs`를 `ejs.compile()` / `ejs.render()`로 실제 컴파일·렌더링 테스트 → 통과
  (빈 데이터셋으로 렌더링해 템플릿 문법 오류·정의되지 않은 변수 참조가 없는지 확인)
- 정적 검사 기준 Express 라우트(`app.get/app.post`) 중복 0건
- `app.listen()`은 `ensureSchema()` 성공 이후 1회 정상 호출됨
- `process.exit()`는 `SIGTERM`/`SIGINT` 정상 종료, `ensureSchema()` 실패 시에만 실행됨
  (요청 처리 중 예외는 `unhandledRejection`/`uncaughtException` 핸들러와 각 라우트의
  `try/catch`로 흡수되어 프로세스가 임의로 종료되지 않음 → Render `Application exited early` 방지)
- `/healthz`, `/admin/api/live-summary`, `/admin/api/performance-check`, `/admin/api/qa-admin-core`
  라우트 존재 및 쿼리 실패에 대한 방어 로직(safeScalar/safeRows) 확인
- `ensureSchema()`에서 `users, vendors, banners, reviews, events, notices, inquiries, flags,
  vendor_update_requests, vendor_banner_requests, vendor_ad_requests, favorites, admin_logs,
  payment_logs, vendor_view_logs, app_settings` 테이블 및 관련 인덱스 생성 확인. 코드에서
  SELECT/INSERT/UPDATE 하는 컬럼과 `ensureSchema()`의 컬럼 정의를 대조한 결과 누락된 컬럼 없음

## 이번에 수정한 내용

### 1. 관리자 Toast(알림 배지) 함수 3중 중복 → 1개로 통합

`views/admin.ejs`에는 기능이 사실상 동일한 알림 표시 함수가 3개(`toast` 2개 +
`toastLive`, `toastQa`) 서로 다른 이름으로 흩어져 있었습니다. 각 함수는 자체 IIFE
(`(function(){...})()`) 안에 갇혀 있어 **런타임 충돌은 없었지만**, 동일 기능이 4곳에
복붙되어 있어 유지보수 시 한쪽만 고치고 다른 쪽을 놓치기 쉬운 상태였습니다.

- 조치: 관리자 화면 최상단(공용 스크립트 블록)에 `function toast(message, type, detail)`
  1개만 전역으로 정의하고, 나머지 3개의 로컬 정의를 제거했습니다.
- `toastLive(...)`, `toastQa(...)` 호출부는 모두 `toast(...)` 호출로 치환했습니다
  (인자 순서·의미는 동일하게 유지하여 화면에 보이는 문구/동작은 변경되지 않습니다).

### 2. 중복 유틸 함수(`esc`, `num`, `money`, `makeButton`) 통합

- `esc(v)`(HTML 이스케이프): 5곳에 완전히 동일한 코드로 중복 정의 → 1개로 통합
- `num(n)`, `money(n)`(숫자/원화 포맷): 각 2곳 완전 동일 중복 → 1개로 통합
- `makeButton(...)`(페이지네이션 버튼 생성): 2곳 완전 동일 중복 → 1개로 통합
- 위 함수들은 관리자 화면 상단의 공용 스크립트 블록으로 옮기고, 각 패널(회원/업체/입점/
  결제·신고) 모듈에서는 로컬 정의를 제거해 전역 함수를 그대로 사용하도록 했습니다.
- 통합 전/후로 `esc/toast/num/money/makeButton` 각각 정확히 1회만 정의되는지 재검증했습니다.

### 3. 삭제 사유: `restore-routes.js`

- `restore-routes.js`는 `/admin/restore`, `/admin/restore-json` 라우트를 등록하는
  독립 모듈이지만, 현재 `server.js`의 어디에서도 `require()`되지 않는 **고아 파일**임을
  확인했습니다. 실제로 서비스되는 `/admin/restore-json`은 `server.js` 안에 정의된
  "복원 차단" 스텁(`복원 기능 임시 비활성화` 후 즉시 redirect)입니다.
- 즉, 이 파일이 있어도 없어도 서버 동작에는 차이가 없으며(죽은 코드), 1차 점검 보고서에
  기록된 대로 "운영 데이터 보호를 위해 복원 기능을 의도적으로 비활성화"한 상태가
  그대로 유지됩니다. 혼동을 줄이기 위해 사용되지 않는 파일만 정리했고, **복원 기능
  자체를 다시 활성화하지는 않았습니다.**

## 코드 정밀 분석 결과 — 중복처럼 보였으나 실제로는 정상인 부분 (이번에 확인, 미변경)

아래 함수들은 이름이 같아 처음에는 전역 충돌 버그로 의심되었으나, 실제로는 각 패널이
`(function(){...})()` IIFE로 독립 스코프화되어 있어 **런타임 충돌이 발생하지 않음**을
소스 추적으로 확인했습니다. 또한 함수 본문을 비교한 결과 이름만 같을 뿐 처리 대상
패널(회원/업체/입점/결제/신고)에 따라 로직이 실제로 다릅니다.

- `maybeLoad()`, `activePanelId()` — 회원/업체/입점/결제·신고 패널별로 각각 다른 서버
  페이지 재조회 로직을 수행. 4개 모두 IIFE 스코프 내부 지역 함수라 서로 값을 덮어쓰지 않음.
- `statusText()`, `rowHtml()`, `renderPager()`, `fmtDate()` — 같은 이름이지만 패널마다
  실제 반환값/HTML 구조가 다름(예: 업체 상태 라벨 vs 신청 상태 라벨).
- `ensurePager()`, `addPageNumbers()` — 패널별 페이지네이션 DOM 위치·클래스명이 달라
  완전한 공통화 대신 매개변수화가 필요한 구조. 지금 당장 병합하면 클래스명/DOM 셀렉터가
  꼬여 특정 패널의 페이지네이션이 깨질 위험이 있어 **이번 점검에서는 통합하지 않았습니다.**

이 부분은 "이름 중복"일 뿐 "기능 중복 버그"는 아니므로, 무리하게 통합할 경우 오히려
동작하던 기능을 깨뜨릴 위험이 커서 이번 패치 범위에서 제외했습니다. 안전하게 진행하려면
패널별 로더 함수를 매개변수(패널 id, DOM 셀렉터, API 경로)로 받는 공통 팩토리 함수로
리팩터링하는 별도 작업이 필요합니다(아래 "남은 위험 요소" 참고).

## 라우트 ↔ 프론트 fetch/action 1:1 대조 결과

`views/admin.ejs`의 모든 `fetch(...)` 호출과 `<form action="...">`를 추출해
`server.js`의 실제 라우트와 대조했습니다. 불일치, 메서드 오류, 404 위험 라우트는
발견되지 않았습니다. (예: `/admin/users/:id/update`, `/admin/delete/users/:id`,
`/admin/link-user-vendor`, `/admin/api/vendors|users|inquiries|payments|reports`,
`/admin/banner-requests/:id/{reject,payment-confirm,cancel}`,
`/admin/ad-requests/:id/{reject,payment-confirm,cancel}`,
`/admin/vendor-requests/:id/{approve,reject}`, `/admin/inquiries/:id/{approve,reject,banner}` 등)

## 발견한 버그 목록 (이번 점검)

이번 정밀 재점검에서는 **동작을 실제로 깨뜨리는 새로운 버그는 발견되지 않았습니다.**
1차 점검 이후 서버 측 안정성(AJAX/JSON 응답, 실패 메시지, 스키마 보강, 중복 라우트 제거)은
이미 견고하게 처리되어 있었습니다. 이번에 발견한 것은 전부 "동작에는 문제가 없지만
유지보수성을 떨어뜨리는 코드 중복"이었습니다(위 1~2번 항목).

## 수정한 버그 목록

- 없음(신규 기능 오작동 없음). 대신 아래 유지보수성 개선을 수행:
  - Toast 알림 함수 3중 중복 → 1개 통합
  - `esc/num/money/makeButton` 중복 정의 제거 → 각 1개로 통합
  - 사용되지 않는 고아 파일(`restore-routes.js`) 정리

## 아직 남은 위험 요소 (다음 작업 후보, 이번엔 손대지 않음)

1. **패널별 로더/렌더링 함수의 구조적 중복** — `ensurePager`, `addPageNumbers`,
   `rowHtml`, `renderPager`, `statusText` 등은 회원/업체/입점/결제·신고 패널마다
   거의 동일한 패턴이 반복됩니다. 완전한 공통화(팩토리 함수화)는 가능하지만,
   각 패널의 DOM 클래스명(`.server-vendor-pager` vs `.server-user-pager` 등)이
   달라 실제 리팩터링 시 다수의 회귀 테스트(각 패널의 검색/필터/정렬/페이지 이동)가
   필요합니다. 운영 중인 사이트에서 한 번에 처리하기보다 별도 스프린트로 분리하는
   것을 권장합니다.
2. **`scripts/init-db.js` 재실행 시 관리자 비밀번호 초기화 주의** — 이 스크립트는
   `ON CONFLICT(username) DO UPDATE ... password_hash=EXCLUDED.password_hash`로
   동작하므로, 운영 환경에서 관리자가 이미 비밀번호를 변경한 뒤 실수로
   `npm run db:init`을 다시 실행하면 관리자 비밀번호가 `ADMIN_PASSWORD` 환경변수
   (기본값 `1234`) 값으로 되돌아갑니다. 코드 동작 자체는 초기 시딩 스크립트로서는
   정상이므로 이번에 변경하지 않았지만, **운영 서버에서는 이 명령을 재실행하지 않도록
   운영 문서에 명시**해 두는 것을 권장합니다.
3. **`views/partials.ejs`** — 내용이 비어 있고 어디에서도 `include`되지 않는 미사용
   파일입니다. 삭제해도 동작에는 영향이 없지만, 향후 공통 헤더/푸터 분리 등에 쓰일
   자리로 보여 이번에는 그대로 남겨두었습니다.
4. **`/admin/api/performance-check`, `/admin/api/qa-admin-core`** — 서버에는
   정상적으로 구현되어 있으나 현재 관리자 화면 어디에서도 호출하지 않는 "진단용"
   API입니다. 운영자가 curl 등으로 수동 점검할 때 쓰는 용도로 보이며, 그대로 유지했습니다.

## Render 배포 후 확인 절차

1. **서버 기동 확인**
   - Render 로그에서 `server on <port>` 출력 확인, 재시작 루프(Application exited early) 없는지 확인
   - `GET /healthz` → `{ "ok": true, "db": true }` 확인
2. **일반 사용자 플로우**
   - `/` 접속 → 업체 목록/배너/후기/공지 정상 노출 확인
   - `/join` 회원가입 → `/login` 로그인 → `/mypage` 진입 확인
   - 업체 상세 모달 열기(찜하기, 신고, 후기 작성) 확인
   - `/apply`(입점신청), `/advertise`(광고문의) 폼 제출 확인
3. **관리자 로그인 및 알림센터**
   - `/admin/login` → 관리자 로그인 → `/admin` 대시보드 진입
   - 알림센터 패널에서 `/admin/api/live-summary` 자동 갱신 및 새 알림 Toast(문구 동일,
     내부적으로는 통합된 `toast()` 사용) 정상 표시 확인
4. **회원관리**
   - 회원 목록 검색/필터/페이지네이션 → 회원 수정 저장 → 비밀번호 변경 →
     권한/상태 변경 → 업체회원 연결 → 회원 삭제(관리자 계정은 삭제 차단되는지 확인)
5. **업체관리**
   - 업체 등록/수정/검색/필터/정렬/페이지네이션 → 삭제(비활성화 처리로 전환되는지 확인,
     실제 DELETE가 아님)
6. **입점 승인 / 광고센터 / 배너관리**
   - 입점신청 승인/반려, 이미지 보기, 배너 등록 처리
   - 광고 신청 입금확인(승인)/반려/취소
   - 배너 신청 입금확인(승인)/반려/취소, 배너 등록/수정/삭제/노출 토글/정렬순서
7. **신고관리 / 공지관리 / 후기관리**
   - 신고 처리완료 처리 및 페이지네이션
   - 공지 등록/삭제/상단고정
   - 후기 삭제 및 신고 연동 확인
8. **환경설정**
   - 가격/카테고리/지역 옵션 저장
   - 관리자 계정(아이디/닉네임/비밀번호) 저장
   - 백업 다운로드(`/admin/backup.json`)
   - 초기화(`/admin/settings/reset-data`)는 **운영 데이터 전체 삭제**이므로 반드시
     스테이징 환경에서만 테스트하고, 운영 환경에서는 백업을 먼저 받아둔 뒤 신중히 사용

이번 점검에서는 기존 데이터를 삭제/초기화하는 로직을 추가하거나 변경하지 않았습니다.
