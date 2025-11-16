# 똑똑한한채 - 스마트 부동산 분양 정보

부동산 줍줍 분양 정보를 한눈에 볼 수 있는 플랫폼입니다.

## 🌐 공개 URL

- **프로덕션**: https://8922b077.webapp-32n.pages.dev
- **GitHub**: https://github.com/seunghun2/webapp

## ✨ 완성된 주요 기능

### 1. 🏠 메인 페이지
- ✅ **매물 카드 표시**: 전국 부동산 분양 정보 카드 뷰
- ✅ **토스 스타일 검색**: 타이핑하면 자동 검색 (500ms debounce)
- ✅ **호갱노노 스타일 필터**: 정렬/지역/유형/평형/세대수 필터
- ✅ **신청마감 배지**: D-Day 표시 (마감/오늘마감/N일남음)
- ✅ **자동 만료 처리**: deadline + 1일 지난 카드 자동 숨김

### 2. 🎯 신청마감 로직 (자동화)
- ✅ **스마트 deadline 계산**: extended_data.steps에서 청약접수 마감일 자동 추출
- ✅ **키워드 기반 추출**: "청약접수", "접수", "신청" 포함된 step 찾기
- ✅ **범위 날짜 처리**: "2025-11-14~2025-11-17" → 끝 날짜(17일) 자동 선택
- ✅ **DB 자동 업데이트**: 어드민에서 매물 생성/수정 시 자동 계산

### 3. 🔧 관리자 패널
- ✅ **매물 관리**: 생성/수정/삭제 (soft delete)
- ✅ **삭제된 매물**: 별도 탭에서 확인 및 복원 가능
- ✅ **서버 사이드 검색**: 제목/지역/태그 검색 (SQL LIKE)
- ✅ **광고 문의 관리**: 사용자 문의 확인/답변/상태 관리

### 4. 📢 광고 문의 시스템 (토스 스타일)
- ✅ **푸터 버튼**: 눈에 띄는 파란색 버튼
- ✅ **아래→위 시트 애니메이션**: 부드러운 토스 스타일 팝업
- ✅ **3개 필드**: 이름/연락처/문의내용
- ✅ **DB 저장**: ad_inquiries 테이블에 저장 (이메일 발송 ❌)
- ✅ **어드민 탭**: 광고 문의 전용 관리 탭
- ✅ **상태 관리**: 대기중/답변완료 상태 변경
- ✅ **필터링**: 전체/대기중/답변완료 필터
- ✅ **관리자 메모**: 답변 내용 기록 가능

### 5. 🗂️ 소프트 딜리트
- ✅ **deleted_at 컬럼**: 실제 삭제 대신 타임스탬프 기록
- ✅ **삭제된 매물 탭**: 관리자 패널에서 확인 가능
- ✅ **복원 기능**: 삭제된 매물 원클릭 복원

## 🗄️ 데이터베이스 구조

### properties 테이블
```sql
- id: INTEGER PRIMARY KEY
- type: TEXT (rental/general/unsold/johab)
- title: TEXT (매물명)
- location: TEXT (지역)
- full_address: TEXT (전체 주소)
- deadline: TEXT (신청 마감일, 자동 계산)
- price: TEXT (표시용 가격)
- extended_data: TEXT (JSON, steps 포함)
- deleted_at: DATETIME (소프트 삭제)
- created_at: DATETIME
- updated_at: DATETIME
```

### ad_inquiries 테이블 (NEW!)
```sql
- id: INTEGER PRIMARY KEY
- name: TEXT (문의자 이름)
- contact: TEXT (연락처)
- message: TEXT (문의 내용)
- status: TEXT (pending/replied)
- admin_note: TEXT (관리자 메모)
- created_at: DATETIME (접수일)
- updated_at: DATETIME
- replied_at: DATETIME (답변일)
```

## 🎯 최근 완료된 작업 (2025-11-16)

### ✅ 신청마감 로직 완전 자동화
**문제**: 신청마감 날짜가 수동 입력되어 오류 발생
**해결**: 
- extended_data.steps 배열에서 청약접수 관련 step 자동 찾기
- 해당 step의 끝 날짜를 deadline으로 자동 설정
- 예: "청약접수 시작일 2025-11-14~2025-11-17" → deadline: 2025-11-17

### ✅ 메인 페이지 검색 기능
**구현**: 
- 심플한 검색창 (아이콘만 있는 깔끔한 디자인)
- 타이핑 시 자동 검색 (500ms debounce)
- Enter 키로 즉시 검색
- 서버 사이드 검색 (title/location/tags)

### ✅ 광고 문의 시스템 (토스 스타일)
**구현**:
- 푸터에 광고 문의 버튼
- 토스 스타일 bottom sheet 모달
- DB 저장 (이메일 발송 ❌)
- 어드민 패널 전용 탭
- 상태 관리 및 관리자 메모

### ✅ 삭제된 매물 관리
**구현**:
- Soft delete (deleted_at 컬럼)
- 삭제된 매물 전용 탭
- 검색 기능 지원
- 복원 기능

### ✅ 서울 실거래가 섹션 제거
**완료**: 메인 대시보드에서 제거 (번들 크기 8.4kB 감소)

## 🛠️ 기술 스택

- **Frontend**: TailwindCSS, Axios, FontAwesome
- **Backend**: Hono (TypeScript) - Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) - 글로벌 분산 DB
- **Deployment**: Cloudflare Pages - Edge 배포
- **Process Manager**: PM2 (개발 환경)

## 📦 프로젝트 구조

```
webapp/
├── src/
│   └── index.tsx          # 메인 애플리케이션 (Hono)
├── public/
│   └── static/            # 정적 파일
├── migrations/
│   ├── 0015_add_deleted_at.sql
│   └── 0016_create_ad_inquiries.sql
├── dist/                  # 빌드 결과물
├── wrangler.jsonc         # Cloudflare 설정
├── ecosystem.config.cjs   # PM2 설정
└── package.json
```

## 🚀 개발 워크플로우

### 로컬 개발
```bash
# 빌드
cd /home/user/webapp && npm run build

# PM2 재시작
cd /home/user/webapp && pm2 restart webapp

# 로그 확인
pm2 logs webapp --nostream

# DB 마이그레이션 (로컬)
npx wrangler d1 migrations apply webapp-production --local
```

### 프로덕션 배포
```bash
# 빌드
npm run build

# Cloudflare Pages 배포
npx wrangler pages deploy dist --project-name webapp

# DB 마이그레이션 (운영)
npx wrangler d1 migrations apply webapp-production --remote
```

### Git 작업
```bash
# 커밋
git add . && git commit -m "..."
git push origin main
```

## 🎨 UI/UX 특징

### 토스 스타일 적용
- ✅ **심플한 문구**: 불필요한 설명 최소화
- ✅ **부드러운 애니메이션**: 시트가 아래에서 위로
- ✅ **신뢰감 있는 톤**: "~돼요", "~드릴게요"
- ✅ **여백 넉넉**: 깔끔하고 가독성 높은 레이아웃

### 호갱노노 스타일 필터
- ✅ **가로 스크롤 칩**: 모바일 최적화
- ✅ **직관적 선택**: 터치 친화적 인터페이스
- ✅ **실시간 반영**: 선택 즉시 결과 갱신

## 📝 API 엔드포인트

### 매물 관리
- `GET /api/properties` - 매물 목록 (search, type, sort 파라미터)
- `GET /api/properties/deleted` - 삭제된 매물 목록
- `POST /api/properties/create` - 매물 생성
- `POST /api/properties/:id/update-parsed` - 매물 수정
- `DELETE /api/properties/:id` - 매물 삭제 (soft delete)
- `POST /api/properties/:id/restore` - 매물 복원

### 광고 문의
- `POST /api/contact/inquiry` - 문의 저장
- `GET /api/ad-inquiries` - 문의 목록 (status 파라미터)
- `POST /api/ad-inquiries/:id/status` - 상태 업데이트

## 🎯 다음 작업 계획

### 🚧 남은 작업
1. **실제 이메일 발송** (선택사항)
   - SendGrid/AWS SES/Resend 연동
   - 광고 문의 접수 시 자동 이메일 발송
   - 어드민이 답변 완료 시 문의자에게 알림

2. **통계 대시보드**
   - 매물 타입별 통계
   - 지역별 분포도
   - 마감 임박 매물 현황

3. **사용자 인증** (선택사항)
   - 어드민 로그인 기능
   - 권한 관리

4. **알림 기능** (선택사항)
   - 신규 매물 알림
   - 마감 임박 알림

### ✨ 개선 아이디어
- 매물 즐겨찾기 기능
- 매물 상세 페이지 강화
- PDF 자동 파싱 개선
- 모바일 앱 고려

## 🎉 프로젝트 상태

### ✅ 완성도: 90%

**완성된 핵심 기능:**
- ✅ 매물 관리 시스템
- ✅ 신청마감 자동화
- ✅ 검색 및 필터
- ✅ 광고 문의 시스템
- ✅ 소프트 딜리트
- ✅ 어드민 패널

**운영 준비 완료:**
- ✅ Cloudflare Pages 배포
- ✅ D1 Database 운영
- ✅ GitHub 버전 관리
- ✅ README 문서화

**선택적 추가 기능:**
- 🔲 이메일 발송
- 🔲 통계 대시보드
- 🔲 사용자 인증

## 📊 프로젝트 히스토리

- **2025-11-16**: 광고 문의 시스템 (토스 스타일, DB 저장, 어드민 관리)
- **2025-11-16**: 메인 페이지 검색 기능 (심플 디자인)
- **2025-11-16**: 신청마감 로직 자동화 (extended_data 기반)
- **2025-11-16**: 삭제된 매물 관리 (soft delete + 복원)
- **2025-11-16**: 서버 사이드 검색 (어드민 + 메인)
- **2025-11-15**: 운영 데이터 로컬 동기화
- **이전**: 매물 관리 시스템 구축

## 📞 문의

프로젝트 관련 문의는 푸터의 "광고 문의하기" 버튼을 이용해주세요!

---

© 2025 똑똑한한채. All rights reserved.
