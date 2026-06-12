# 운영형 서비스 디렉터리

Node.js + Express + PostgreSQL 기반 학습/운영형 구조입니다.

## 주요 기능
- 회원가입/로그인/로그아웃
- 관리자 로그인
- 회원 관리
- 업체 등록/삭제/추천/프리미엄 구분
- 이미지 업로드: DB에 data URL 형태로 저장
- 프리미엄 슬라이드 배너
- 후기 작성/관리
- 공지 등록/관리
- 검색/지역/업종 필터

## 로컬 실행
1. Node.js 설치
2. Supabase 또는 PostgreSQL DATABASE_URL 준비
3. `.env.example`을 `.env`로 복사
4. 값 입력
5. 명령어 실행

```bash
npm install
npm run db:init
npm start
```

접속: http://localhost:3000
관리자: /admin/login
기본 관리자: admin / 1234

## Render 배포용 설정
Build Command:
```bash
npm install && npm run db:init
```
Start Command:
```bash
npm start
```
Environment Variables:
- DATABASE_URL
- SESSION_SECRET
- ADMIN_ID
- ADMIN_PASSWORD
