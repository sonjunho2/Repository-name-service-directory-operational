# 오픈 준비 체크리스트

## 배포 후 확인 주소

- `/healthz`
- `/robots.txt`
- `/sitemap.xml`
- `/favicon.svg`
- `/site.webmanifest`
- `/open-check` 관리자 로그인 필요

## Render 환경변수 권장

- `NODE_ENV=production`
- `SITE_URL=https://실제도메인`
- `SESSION_SECRET=긴_랜덤_문자열`
- `DATABASE_URL=PostgreSQL 연결값`

## Google Search Console

1. 실제 도메인 등록
2. sitemap 제출: `https://실제도메인/sitemap.xml`
3. 메인 페이지 색인 요청
