# Phase 8-2A Dependency Security Audit

## 1. 조사 기준

- 조사 시각: 2026-07-23 11:45 KST. Registry와 audit 결과는 조회 시점에 따라 달라질 수 있다.
- 기준 커밋: `0cf0fe5 security: Multer 2.2.0으로 업그레이드` (`main`). 시작 working tree는 clean이었다.
- 범위: `package.json`의 dependencies/devDependencies, 설치된 전체 트리, production/full audit, outdated, deprecated, lockfile 공급망, install script, 코드 사용 위치, Node 20 호환성.
- 원칙: 조사만 수행했다. `npm install`, `npm update`, `npm audit fix`, `npm dedupe`, dependency 변경은 수행하지 않았다.
- 판정은 npm registry의 실제 메타데이터, npm 10 출력, lockfile 및 저장소 코드 검색 결과만 사용한다. 확인하지 못한 내용은 추측하지 않는다.

## 2. 실행 환경

| 항목 | 값 |
|---|---|
| 기본 환경 | Node v24.18.0 / npm 11.16.0 |
| 조사 및 테스트 환경 | Node v20.20.2 / npm 10.9.8 |
| npm registry | `https://registry.npmjs.org/` |
| registry ping | 성공, PONG 213ms |
| 시작 시 `node_modules` | 없음 |
| `npm ci --no-audit --no-fund` | 성공, 135 packages, deprecated/peer/lifecycle 경고 없음 |
| package.json SHA-256 | `E7491817A311EFB0FB15E5988BC303E66FC03555C36A1DDADFC8760A6D2709D7` |
| package-lock.json SHA-256 | `AEA4DB4F451035EF4AA466080F739D8FE4E74EBACC6C628B7B5D6196D937E15C` |

## 3. 핵심 요약

- production audit와 dev를 포함한 full audit 모두 취약점 0건이다. 즉시 보안 조치(A)는 없다.
- 직접 의존성은 production 8개, development 1개이며 설치된 package node는 135개다. 따라서 직접 9개, 실제 설치 간접 126개다. lockfile에는 현재 플랫폼에서 설치되지 않는 optional 항목까지 136개 package entry가 있다.
- 직접 패키지는 모두 선언 범위의 wanted 버전이다. 5개(`bcryptjs`, `connect-pg-simple`, `dotenv`, `ejs`, `express`)는 registry latest와 major 차이가 있다. 현재 범위 안에서 적용 가능한 patch/minor 갱신은 없다.
- `express-session`, `multer`, `pg`, `nodemon`은 latest다. Express 4 계열도 `latest-4`인 4.22.2다.
- 직접 패키지의 installed/latest 중 Node 20 비호환은 없다. `bcryptjs`는 engines 미기재이며, 그 외 latest의 명시 범위는 Node 20을 포함한다.
- deprecated package는 lockfile과 설치 로그 모두 0개다.
- 공급망은 npm HTTPS tarball과 integrity로 고정되어 있다. git/file/plain HTTP/link dependency와 integrity/resolved 누락은 없다.
- 유일한 `hasInstallScript` 항목은 nodemon → chokidar의 macOS 전용 optional `fsevents@2.3.3`이다. Windows 설치 트리에는 없었고 production 경로에도 포함되지 않는다.
- 권장 방향은 무의미한 일괄 최신화가 아니라, 직접 major별로 작은 Phase를 만들고 해당 기능 테스트를 강화하는 것이다.

## 4. 직접 의존성 현황

`current`와 `wanted`는 `npm outdated --long --json`, `latest`는 npm registry `latest` dist-tag 기준이다.

| 종류 | 패키지 | 선언 범위 | current / wanted | latest | 차이 | Node engines (installed → latest) | 판정 |
|---|---|---:|---:|---:|---|---|---|
| prod | bcryptjs | `^2.4.3` | 2.4.3 / 2.4.3 | 3.0.3 | major | 미기재 → 미기재 | C |
| prod | connect-pg-simple | `^9.0.1` | 9.0.1 / 9.0.1 | 10.0.0 | major | `>=16` → `^18.18 || ^20.9 || >=22` | C |
| prod | dotenv | `^16.4.7` | 16.6.1 / 16.6.1 | 17.4.2 | major | `>=12` → `>=12` | C |
| prod | ejs | `^3.1.10` | 3.1.10 / 3.1.10 | 6.0.1 | major | `>=0.10` → `>=0.12.18` | C |
| prod | express | `^4.21.2` | 4.22.2 / 4.22.2 | 5.2.1 | major | `>=0.10` → `>=18` | C; 4.22.2는 `latest-4` |
| prod | express-session | `^1.18.1` | 1.19.0 / 1.19.0 | 1.19.0 | 없음 | `>=0.8` → 동일 | D |
| prod | multer | `^2.2.0` | 2.2.0 / 2.2.0 | 2.2.0 | 없음 | `>=10.16` → 동일 | D |
| prod | pg | `^8.13.1` | 8.22.0 / 8.22.0 | 8.22.0 | 없음 | `>=16` → 동일 | D |
| dev | nodemon | `^3.1.9` | 3.1.14 / 3.1.14 | 3.1.14 | 없음 | `>=10` → 동일 | E |

모든 installed/latest 메타데이터에서 deprecated 값은 없었다. `npm outdated`는 위 major 5개 때문에 정상적으로 exit code 1을 반환했다. 이는 audit 실패가 아니다.

### Registry provenance

| 패키지 | installed publish / latest publish (UTC) | license installed → latest | repository | integrity installed / latest |
|---|---|---|---|---|
| bcryptjs | 2017-02-07 / 2025-11-02 | MIT → BSD-3-Clause | `github.com/dcodeIO/bcrypt.js` | `sha512-V/Hy/...LZDqNQ==` / `sha512-GlF5...bphV5g==` |
| connect-pg-simple | 2023-11-01 / 2024-09-13 | MIT → MIT | `github.com/voxpelli/node-connect-pg-simple` | `sha512-BuwW...TsrVg==` / `sha512-pBGV...Una8A==` |
| dotenv | 2025-06-27 / 2026-04-12 | BSD-2-Clause → 동일 | `github.com/motdotla/dotenv` | `sha512-uBq4...8bow==` / `sha512-nI4U...cdYZw==` |
| ejs | 2024-04-12 / 2026-05-26 | Apache-2.0 → 동일 | `github.com/mde/ejs` | `sha512-UeJm...izQBA==` / `sha512-UaaM...O4vZA==` |
| express | 2026-05-11 / 2025-12-01 | MIT → MIT | `github.com/expressjs/express` | `sha512-IuL+...3X1Q==` / `sha512-hIS4...0yXw==` |
| express-session | 2026-01-22 / 동일 | MIT | `github.com/expressjs/session` | `sha512-0csa...7BHMA==` / 동일 |
| multer | 2026-06-15 / 동일 | MIT | `github.com/expressjs/multer` | `sha512-6rdy...P79xrQ==` / 동일 |
| pg | 2026-06-19 / 동일 | MIT | `github.com/brianc/node-postgres` | `sha512-8wih...OuzAA==` / 동일 |
| nodemon | 2026-02-20 / 동일 | MIT | `github.com/remy/nodemon` | `sha512-jakj...vq6Jw==` / 동일 |

Integrity는 식별에 충분한 축약 표시다. 전체 값은 lockfile(설치 버전)과 해당 시각의 registry 응답으로 검증했다. Express 4.22.2의 publish 시각이 Express 5.2.1보다 늦은 것은 두 major 라인이 병행 유지되기 때문이다.

## 5. 운영 npm audit

명령: `npm audit --omit=dev --json`

| total | info | low | moderate | high | critical |
|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 | 0 | 0 |

- 취약 패키지, advisory/CVE, vulnerable range, fixAvailable 경로가 없다.
- 실제 production tree에서 exploit 가능한 audit 항목도 없다.
- audit 메타데이터: prod 107, dev 29, optional 2, total 136. 이 값은 lock 메타데이터 분류이며 실제 설치 package 수와 정의가 다르다.

## 6. 전체 npm audit

명령: `npm audit --json`

| total | info | low | moderate | high | critical |
|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 | 0 | 0 |

- devDependency 전용 취약점과 production 영향 취약점 모두 0건이다.
- fixAvailable 및 semver-major fix 요구가 없다.
- `npm audit fix`는 실행하지 않았으며 현재 필요하지 않다.

## 7. deprecated 패키지

- `npm ci` deprecated 경고: 0개.
- `package-lock.json.packages[*].deprecated`: 0개.
- 직접/간접 dependency 모두 현재 확인 가능한 deprecated 표시는 없다.

## 8. 간접 의존성 및 위험

- `npm outdated --all --json`: 고유 이름 53개(major 44, minor 5, patch 2, 현재 플랫폼 미설치 optional 2). exit code 1은 outdated 존재를 뜻하는 정상 결과다.
- 직접 outdated 5개를 제외하면 48개는 상위 직접 dependency가 제어하는 간접 항목이다. 간접 package를 개별 pin하거나 일괄 변경하지 않는다.
- minor 차이: `cookie-signature`, `iconv-lite`, `mime-db`, `ms`, `range-parser`.
- patch 차이: `pgpass`, `typedarray`.
- current가 없는 항목: macOS optional `fsevents`, optional peer `pg-native`.
- 주요 major 밀집 영역:
  - Express 4 트리: `body-parser`, `send`, `serve-static`, `path-to-regexp`, `debug`, `mime` 등. Express 5 전환에서 함께 재편되므로 개별 갱신 금지.
  - nodemon 트리: `chokidar`, `readdirp`, `supports-color`, `picomatch` 등. 개발 도구 전용이며 production runtime 영향 없음.
  - pg 트리: `pg-types`, `postgres-array/bytea/date/interval`. `pg@8.22.0` 자체가 latest이므로 상위 패키지 정책을 따른다.
  - ejs 트리: `jake`, `filelist`, `minimatch`. EJS major 검토에서 함께 평가한다.
- 복수 버전 설치: `balanced-match` 1.0.2/4.0.4, `brace-expansion` 2.1.2/5.0.7, `debug` 2.6.9/4.4.3, `minimatch` 5.1.9/10.2.5, `ms` 2.0.0/2.1.3. 모두 상위 dependency의 서로 다른 범위에 의해 정상 설치되며 `npm ls` 오류는 없다.
- 취약·deprecated 간접 항목은 0개다. 유지보수 중단 여부는 registry 결과만으로 확정하지 않았으며, audit 0이라는 사실이 장기 유지보수를 보장하지는 않는다.

## 9. lockfile 및 공급망 검사

| 검사 | 결과 |
|---|---|
| lockfileVersion | 3 |
| root dependencies | package.json과 일치 |
| package entry | 136 (현재 플랫폼 실제 설치는 135) |
| version 누락 | 0 |
| resolved 누락 | 0 |
| integrity 누락 | 0 |
| npm HTTPS registry 외 resolved | 0 |
| plain HTTP | 0 |
| git/GitHub tarball dependency | 0 |
| file dependency | 0 |
| link package | 0 |
| deprecated entry | 0 |

모든 registry artifact는 `https://registry.npmjs.org/` resolved URL과 integrity를 가진다. package/lock hash는 조사 전후 비교 대상이며 변경하지 않는다.

## 10. install script 보유 패키지

| 패키지 | 경로 | script | 동작 | production 실행 | 위험 |
|---|---|---|---|---|---|
| fsevents@2.3.3 | nodemon(dev) → chokidar → fsevents(optional) | `install: node-gyp rebuild` | macOS 파일 이벤트 native addon 빌드 | 아니오; `os: darwin`, Windows에서 미설치, nodemon은 devDependency | 낮음. macOS 개발 환경에서는 native build toolchain과 package provenance를 신뢰해야 함 |

다른 `hasInstallScript` lock entry는 없다. script를 별도로 재실행하지 않았다.

## 11. 실제 코드 사용 위치

| 패키지 | 사용 위치/API | 성격 | 테스트 보호와 공백 |
|---|---|---|---|
| bcryptjs | `server.js`, `scripts/init-db.js`; hash/compare | 운영 인증 및 초기화 | 실제 bcrypt 로그인 HTTP 테스트 있음. DB 초기화 script 자체는 통합 테스트 없음 |
| connect-pg-simple | `server.js`; PostgreSQL session store factory | 운영 세션 | 테스트에서는 fake로 대체하고 test 환경에서 생성되지 않음을 검증. 실제 PostgreSQL session store 통합은 미검증 |
| dotenv | `server.js`, `scripts/init-db.js`; `config()` | 운영 설정 로드 | lifecycle 테스트에서 fake. 실제 `.env` 파싱/override 동작은 직접 검증하지 않음 |
| ejs | `server.js`의 `app.set('view engine','ejs')`, views 렌더링 | 운영 UI | 일부 route render 계약은 간접 보호되나 실제 전체 template 렌더 회귀 범위는 제한적 |
| express | `server.js`, `tests/image-upload.test.js`; app/router/middleware/HTTP | 운영 핵심 및 테스트 | 실제 loopback HTTP 11개와 multipart 18개가 보호. 전체 라우트/Express 5 breaking surface는 별도 필요 |
| express-session | `server.js`; cookie/session middleware | 운영 인증/세션 | 실제 MemoryStore cookie/login/logout 테스트 있음. production PgSession 경로는 미검증 |
| multer | `lib/image-upload.js`; memoryStorage, single/fields/none | 운영 multipart | 실제 multipart 18개로 MIME, signature, field, 5MB 경계 보호 |
| pg | `server.js`, `scripts/init-db.js`; Pool/query | 운영 DB | route tests는 fake pool. 실제 PostgreSQL 연결, TLS, type parsing, pool 종료는 운영 DB 통합 미검증 |
| nodemon | package.json `dev` script | 개발 도구 전용 | production bundle/runtime 미포함. 자동 재시작 자체 테스트는 없음 |

## 12. Node 20 호환성

- 설치된 직접 패키지는 현재 Node v20.20.2에서 `npm ci`, 전체 테스트 및 dependency tree 검사를 통과했다.
- latest 직접 패키지도 명시된 engines가 모두 Node 20을 포함한다. `connect-pg-simple@10`은 Node `^20.9.0` 이상이므로 현재 20.20.2와 호환된다.
- `bcryptjs` installed/latest는 engines를 기재하지 않았다. Node 20 비호환 증거는 없지만 registry 메타데이터만으로 명시 지원을 주장할 수 없다.
- EJS의 매우 넓은 engines 범위는 Node 20 호환을 포함하지만, 최신 major의 API/CLI 호환성을 보장하지는 않는다.
- Node 20 때문에 최신 안정 버전을 무조건 배제해야 하는 직접 패키지는 없다.

## 13. 패키지별 위험도 분류

- A — 즉시 보안 조치 필요: 없음. high/critical/production 취약점과 심각한 deprecated 항목이 없다.
- B — 낮은 위험의 patch/minor 갱신 후보: 없음. 모든 직접 패키지가 현재 선언 범위의 wanted 버전이다.
- C — 별도 Phase가 필요한 major 갱신:
  - `bcryptjs@3`: 인증 hash/compare 및 기존 hash 호환 확인 필요. license도 MIT에서 BSD-3-Clause로 바뀐다.
  - `connect-pg-simple@10`: production PostgreSQL session store와 schema/lifecycle 검증 필요.
  - `dotenv@17`: startup/config loading 동작과 초기화 script 검증 필요.
  - `ejs@6`: 전체 views 렌더링과 escaping/compile 동작 검증 필요.
  - `express@5`: 라우팅, async error, request/response 및 session 연동의 breaking change 검토 필요.
- D — 현재 유지 권장: `express-session@1.19.0`, `multer@2.2.0`, `pg@8.22.0`. 모두 latest이고 핵심 테스트가 통과한다. Express 4도 현재 `latest-4`이므로 Express 5 Phase 전까지 4.22.2 유지가 합리적이다.
- E — 개발 도구 전용: `nodemon@3.1.14`. latest이며 production runtime에 포함되지 않는다.

## 14. 권장 업그레이드 순서

각 Phase는 dependency/lockfile 변경과 필요한 테스트만 포함하고, 실패 시 해당 두 파일과 테스트 변경을 한 커밋 단위로 되돌릴 수 있어야 한다.

1. **Phase 8-2B — bcryptjs 3**
   - 목표: `bcryptjs@^3.0.3`.
   - 예상 파일: package.json, package-lock.json, 인증 관련 테스트(필요 시).
   - 테스트: 기존 hash 로그인, 신규 hash 생성/compare, 잘못된 비밀번호, 기존 2.x 생성 hash 호환, DB init syntax.
   - 위험/롤백: 인증 실패 및 hash 동작 차이. dependency/lock/test 변경을 함께 revert.
2. **Phase 8-2C — dotenv 17**
   - 목표: `dotenv@^17.4.2`.
   - 예상 파일: package/lock, startup 및 init-db 테스트(필요 시).
   - 테스트: 환경변수 우선순위, 누락값, test 환경 side effect, init-db 로드.
   - 위험/롤백: startup configuration 변화. 해당 Phase 커밋 revert.
3. **Phase 8-2D — connect-pg-simple 10**
   - 목표: `connect-pg-simple@^10.0.0`.
   - 예상 파일: package/lock, session lifecycle/integration tests.
   - 테스트: Node 20, session create/read/destroy, cookie, pool 종료, 실제 PostgreSQL 격리 환경.
   - 위험/롤백: 세션 유실·schema/API 변화. 배포 전 session migration 판단 후 revert 가능해야 함.
4. **Phase 8-2E — EJS 6**
   - 목표: `ejs@^6.0.1`.
   - 예상 파일: package/lock, view rendering tests; template 변경은 실제 호환 문제가 확인될 때만.
   - 테스트: 모든 주요 view render, escaping, include, 오류 화면, 한글 출력.
   - 위험/롤백: template compile/escaping 차이. dependency와 필요한 template 변경을 단일 Phase로 revert.
5. **Phase 8-2F — Express 5**
   - 목표: `express@^5.2.1`; express-session 1.19.0은 우선 유지.
   - 예상 파일: package/lock, server 및 route tests, 호환 문제 시 최소 server 변경.
   - 테스트: 전체 99+, 모든 HTTP route, async error propagation, body parsing, redirects, sessions, EJS, Multer 18개.
   - 위험/롤백: 가장 넓은 runtime 영향. 별도 migration review와 canary가 필요하며 Phase 전체 revert를 롤백 기준으로 삼는다.
6. **Phase 8-2G — 개발 도구 재감사**
   - 대상: nodemon 및 chokidar/fsevents 트리. 현재 목표 버전 변경 없음.
   - 테스트: `npm run dev`의 파일 감지/재시작을 개발 환경에서 확인.
   - 위험/롤백: production 영향은 없지만 macOS native optional script와 개발 환경 차이가 있다.

현재 `pg`, `multer`, `express-session`은 별도 업그레이드 Phase가 필요하지 않다. `pg`와 connect-pg-simple은 DB/session 검증 관점에서 함께 재감사하되, latest인 pg를 의미 없이 변경하지 않는다.

## 15. 테스트 기준선

Node v20.20.2 / npm 10.9.8 결과:

| 명령 | 결과 |
|---|---|
| `npm run test:image-upload` | 18 passed, failed/cancelled/skipped 0 |
| `npm test` | 99 passed, failed/cancelled/skipped 0, open handle 없음 |
| `npm run test:comments` | 27 passed |
| `npm run test:lifecycle` | 5 passed |
| `npm run test:api-routes` | 23 passed |
| `npm run test:comment-routes` | 15 passed |
| `npm run test:http-integration` | 11 passed |

## 16. 변경하지 않은 항목

- package.json, package-lock.json, server.js, lib, tests, helpers, workflows, scripts, views, public.
- dependency/devDependency, npm scripts, registry 설정, 환경 파일, Git 설정.
- `npm install/update/uninstall/dedupe/audit fix`, `--force`, `--legacy-peer-deps`를 사용하지 않았다.
- 실제 PostgreSQL이나 운영 secret에 연결하지 않았다.

## 17. 남아 있는 위험

- audit 0은 알려진 npm advisory 기준이며 미공개 취약점·논리 결함·공급망 계정 탈취를 배제하지 않는다.
- 실제 PostgreSQL session store, DB TLS/type parsing, 전체 EJS views는 현재 테스트에서 완전 통합되지 않는다.
- 5개 direct major가 뒤처져 있으나 즉시 취약점 증거는 없다. 검증 없이 한 번에 올리는 것이 더 큰 운영 위험이다.
- lockfile에는 macOS 개발 환경에서 native build를 수행하는 optional fsevents가 있다.
- 동일 간접 패키지의 복수 버전은 정상이나 공격 표면과 검토 비용을 늘린다. 상위 major 전환 후 자연스럽게 재평가한다.
- registry metadata와 audit은 2026-07-23 조회 시점의 스냅샷이다.

## 18. 실행한 명령과 종료 코드

| 명령군 | 종료 코드/해석 |
|---|---|
| `npm ci --no-audit --no-fund` | 0 |
| `npm config get registry`, `npm ping` | 0 |
| 직접 `npm outdated --long --json` | 1; 5개 outdated JSON 정상 반환 |
| `npm outdated --all --json` | 1; 53개 고유 이름 JSON 정상 반환 |
| `npm audit --omit=dev --json` | 0; 취약점 0 |
| `npm audit --json` | 0; 취약점 0 |
| `npm ls --depth=0`, `npm ls --all`, production tree | 0 |
| 직접 패키지별 `npm view` | 모두 0 |
| `npm explain fsevents` | 1; 현재 Windows 설치 트리에 optional fsevents가 없어 일치 항목 없음 |
| 기준선 테스트 7개 명령 | 모두 0 |

## 19. 조사 시각과 재감사 권장 시점

- 기준 시각: 2026-07-23 11:45 KST.
- 다음 재감사: 각 major Phase 시작 직전, package/lock 변경 직후, 배포 전, 또는 새로운 high/critical advisory 공지 시 즉시.
- 정기 기준: 최소 월 1회 production/full audit과 registry outdated를 다시 조회한다. 결과가 달라지면 이 문서를 최신 조사 일자와 함께 갱신한다.
