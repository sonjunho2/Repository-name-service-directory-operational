# 운영 QA 및 버그 수정 보고서

## 교체 대상 파일

아래 파일을 기존 프로젝트 파일과 교체합니다.

- `server.js`
- `views/admin.ejs`는 정밀 분석 대상이었으나, 이번 패치에서는 위험도 높은 대규모 구조 변경을 피하고 서버/API 응답 안정화 중심으로 유지했습니다.
- `QA_FIX_REPORT.md` 신규 추가

## 실행 검증 결과

- `node --check server.js` 통과
- `app.listen()` 존재 확인
- 중복 Express 라우트 정적 검사 결과: 중복 없음
- `/healthz` 라우트 존재 확인
- `process.exit()`는 시작 시 `ensureSchema()` 실패와 SIGTERM/SIGINT 정상 종료에만 존재

## 발견한 주요 버그/위험 요소

### 서버 실행/스키마

1. `ensureSchema()`가 `users`, `vendors`, `banners`, `reviews`, `notices`, `events` 기본 테이블 생성을 보장하지 않고 `ALTER TABLE`부터 실행했습니다.
   - 신규 DB 또는 일부 테이블 누락 DB에서 Render 시작 시 `ensureSchema failed` 후 프로세스가 종료될 수 있었습니다.

2. `/robots.txt`, `/sitemap.xml` 라우트가 각각 2회 정의되어 있었습니다.
   - Express에서는 앞쪽 라우트가 먼저 응답하기 때문에 뒤쪽 개선 라우트가 실질적으로 사용되지 않는 상태였습니다.

3. `restore-routes.js`가 `/admin/restore-json` 복원 라우트를 먼저 등록하고, 뒤쪽의 “복원 차단” 라우트가 실행되지 않는 구조였습니다.
   - 운영 데이터 보호 관점에서 위험했습니다.

### 관리자 AJAX/Form 응답

4. 일부 관리자 POST 라우트는 프론트에서 AJAX로 호출될 수 있는데도 실패 시 HTML/text/redirect가 섞여 반환될 수 있었습니다.
   - 회원 삭제, 승인/반려, 업체회원 연결 등에서 화면 JS가 JSON 파싱을 기대할 때 오류가 날 수 있었습니다.

5. `/admin/banner-requests/:id/approve`, `/admin/ad-requests/:id/approve`는 실제 승인 로직 없이 redirect만 수행했습니다.
   - UI에서 잘못 호출될 경우 성공처럼 보일 수 있었습니다.

6. 삭제/반려/처리 완료 라우트가 영향 받은 행이 없어도 성공 redirect를 반환하는 경우가 있었습니다.
   - 이미 처리된 신청/신고를 다시 처리해도 운영자가 성공으로 오해할 수 있었습니다.

### 관리자 UI/스크립트

7. `views/admin.ejs`에는 `<script>` 블록이 16개 있고, Toast 함수가 여러 이름으로 반복되어 있습니다.
   - `toast`, `toastLive`, `toastQa` 등 중복 함수가 남아 있습니다.

8. 업체/회원/입점/결제/신고 페이지네이션 함수가 유사한 형태로 반복되어 있습니다.
   - 현재 동작 안정성을 우선해 서버 응답 안정화만 적용했고, 프론트 대규모 모듈 통합은 별도 리팩터링 대상으로 남겨두었습니다.

## 수정한 내용

### 1. `ensureSchema()` 보강

- 다음 기본 테이블이 없으면 생성되도록 추가했습니다.
  - `users`
  - `vendors`
  - `banners`
  - `reviews`
  - `events`
  - `notices`

효과:
- 신규 PostgreSQL DB에서도 서버 시작 시 기본 테이블 누락으로 즉시 종료될 가능성을 낮췄습니다.
- 기존 데이터는 삭제/초기화하지 않습니다.

### 2. 중복 라우트 제거

- 앞쪽의 중복 `/robots.txt`, `/sitemap.xml` 라우트를 제거하고, 뒤쪽의 정리된 라우트만 남겼습니다.

효과:
- 라우트 동작이 명확해졌습니다.
- 정적 검사상 Express 라우트 중복이 0건입니다.

### 3. 관리자 AJAX 응답 공통 보강

- `wantsJson(req)` 추가
- `sendOk(req,res,redirectTo,payload)` 추가
- `sendFail(req,res,status,message,redirectTo)` 추가
- `runAdminAction(req,res,redirectTo,fn)` 추가
- AJAX POST 요청에서 기존 `res.redirect()`가 JSON `{ ok:true, redirect }`로 반환되도록 보강하는 미들웨어 추가

효과:
- AJAX 요청은 JSON 응답을 받을 수 있습니다.
- 일반 form submit은 기존처럼 redirect를 유지합니다.

### 4. 관리자 처리 라우트 오류 메시지 보강

다음 라우트는 대상이 없거나 이미 처리된 경우 명확한 오류를 반환하도록 보강했습니다.

- `POST /admin/reports/:id/done`
- `POST /admin/inquiries/:id/reject`
- `POST /admin/banner-requests/:id/reject`
- `POST /admin/ad-requests/:id/reject`
- `POST /admin/vendor-requests/:id/reject`
- `POST /admin/delete/users/:id`
- `POST /admin/delete/:table/:id`

### 5. 승인처럼 보이는 빈 라우트 차단

다음 라우트는 실제 승인 로직 없이 redirect만 하던 상태였으므로 오류 메시지를 반환하도록 바꿨습니다.

- `POST /admin/banner-requests/:id/approve`
- `POST /admin/ad-requests/:id/approve`

현재 광고/배너 신청 승인은 기존 설계대로 `payment-confirm` 라우트에서 처리됩니다.

### 6. 복원 라우트 보호

- `restore-routes.js` 자동 등록을 제거했습니다.
- 기존 서버 내부의 `/admin/restore-json` 차단 라우트만 유지했습니다.

효과:
- 관리자 UI의 복원 시도가 실제 운영 DB를 덮어쓰지 않습니다.
- 백업 다운로드는 계속 가능합니다.

## 아직 남은 위험 요소

1. `views/admin.ejs`의 스크립트가 아직 완전히 하나의 모듈로 통합되지는 않았습니다.
   - Toast 함수, 페이지네이션 함수, 알림센터 fetch 함수가 중복되어 있습니다.
   - 대규모 통합은 UI 회귀 위험이 커서 이번 패치에서는 서버 안정화 우선으로 보류했습니다.

2. 관리자 화면의 일부 일반 form 라우트는 서버 미들웨어로 AJAX redirect는 JSON화했지만, 각 라우트 내부의 모든 실패 분기가 `sendFail()`로 완전히 통일되지는 않았습니다.

3. 실제 DB 접속 정보가 없는 로컬 정적 검사 환경에서는 DB 저장/조회까지 실행 검증하지 못했습니다.
   - Render 배포 후 아래 테스트 순서로 실제 DB 저장 확인이 필요합니다.

4. `restore-routes.js` 파일은 남아 있지만 서버에서 등록하지 않습니다.
   - 향후 복원 기능을 다시 사용할 계획이 없다면 파일 삭제도 가능합니다.

## Render 배포 후 확인 URL

배포 URL 예시: `https://서비스주소.onrender.com`

1. `/healthz`
   - 기대값: `{ ok: true, db: true }`

2. `/admin/login`
   - 관리자 로그인 가능 여부 확인

3. `/admin`
   - 관리자 대시보드 진입 확인

4. `/admin/api/live-summary`
   - 기대값: JSON `{ ok:true, counts:{...}, recent:{...}, charts:{...} }`

5. `/admin/api/users?page=1&limit=20`
   - 회원 목록 JSON 응답 확인

6. `/admin/api/vendors?page=1&limit=20`
   - 업체 목록 JSON 응답 확인

7. `/admin/api/inquiries?page=1&limit=20`
   - 입점/문의 목록 JSON 응답 확인

8. `/admin/api/payments?page=1&limit=20`
   - 결제 목록 JSON 응답 확인

9. `/admin/api/reports?page=1&limit=20`
   - 신고 목록 JSON 응답 확인

## 운영 테스트 순서

### 1. 서버 기본 확인

1. Render 로그에서 `server on 10000` 확인
2. `Application exited early`가 발생하지 않는지 확인
3. `/healthz` 접속 후 DB 응답 확인

### 2. 회원관리

1. 관리자 화면 > 회원관리 진입
2. 회원 목록 로딩 확인
3. 닉네임 수정 후 저장
4. 상태를 `차단`으로 변경 후 저장
5. 상태를 다시 `정상`으로 변경 후 저장
6. 새 비밀번호 입력 후 저장
7. 일반회원과 업체를 연결
8. 일반회원 삭제 테스트
9. 관리자 계정 삭제 차단 확인

### 3. 알림센터

1. 관리자 대시보드에서 알림센터 표시 확인
2. `/admin/api/live-summary` 직접 접속
3. 30초 자동 갱신 후 값 갱신 확인

### 4. 업체관리

1. 업체 등록
2. 업체 수정
3. 검색/필터/정렬 확인
4. 업체 삭제 버튼 클릭 시 실제 삭제가 아닌 `inactive` 비활성화 확인
5. 페이지네이션 이동 확인

### 5. 입점 승인

1. 입점 신청 등록
2. 관리자에서 이미지 보기 확인
3. 승인 시 `vendors`에 업체 생성 확인
4. 신청자가 로그인 회원이면 `users.is_vendor=true`, `vendor_id` 연결 확인
5. 반려 시 이미 처리된 신청 재처리 오류 메시지 확인

### 6. 광고/배너/결제

1. 업체회원에서 광고/배너 신청
2. 입금대기 전환
3. 관리자에서 입금확인
4. `payment_logs` 생성 확인
5. 업체 광고 상태/만기/배너 노출 여부 확인
6. 반려/취소 시 상태 변경 확인

### 7. 신고/공지/후기

1. 신고 등록
2. 관리자에서 처리완료
3. 이미 처리된 신고 재처리 시 오류 확인
4. 공지 등록/삭제/상단고정 확인
5. 후기 삭제 확인

## 교체 방법

1. Render/GitHub에 배포 중인 프로젝트 백업
2. 이 압축파일의 `server.js`로 기존 `server.js` 교체
3. `QA_FIX_REPORT.md`를 프로젝트 루트에 추가
4. Git commit/push
5. Render 재배포
6. 위 테스트 순서대로 확인
