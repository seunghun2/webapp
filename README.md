# 똑똑한한채 - 스마트 부동산 분양 정보

부동산 줍줍 분양 정보를 한눈에 볼 수 있는 플랫폼입니다.

## 🌐 공개 URL

- **프로덕션**: https://hanchae365.com (커스텀 도메인)
- **대체 도메인**: https://www.hanchae365.com
- **GitHub**: https://github.com/seunghun2/webapp
- **Cloudflare Pages**: https://webapp-32n.pages.dev

## ✨ 주요 기능

### 1. 📱 모바일 최적화 (2025-11-11 완성!)
- ✅ **전체 페이지 반응형 디자인**: 메인, 상세 팝업, 관리자 페이지
- ✅ **터치 최적화**: 44x44px 최소 터치 영역, 터치 피드백 효과
- ✅ **모바일 퍼스트**: sm:640px, md:768px, lg:1024px 브레이크포인트
- ✅ **가독성 개선**: 16px 최소 폰트 크기 (iOS 줌 방지)
- ✅ **스무스 스크롤**: 터치 기반 부드러운 스크롤

### 2. 💰 실거래가 API 통합 (2025-11-11 완성!)
- ✅ **국토교통부 API**: 실시간 아파트 실거래가 조회
- ✅ **자동 조회 버튼**: 관리자 패널에서 원클릭 조회
- ✅ **지역 코드 매핑**: 세종, 전북 김제, 경기 평택/화성, 서울 강남/서초
- ✅ **자동 파싱**: XML 응답 자동 파싱 및 최신 거래가 추출
- ✅ **투자 정보 표시**: 원분양가, 실거래가, 수익률 자동 계산

### 3. 📊 데이터 일관화 (2025-11-11 완성!)
- ✅ **가격 형식 통일**: "X억 X천만원" 또는 "보증금 X만원~X만원"
- ✅ **세대수 표기 통일**: "XX세대" 형식으로 일관성 확보
- ✅ **숫자 필드 채우기**: sale_price_min/max, rental_deposit_min/max
- ✅ **실거래가 데이터**: 모든 줍줍분양 매물에 실거래가 정보 추가
- ✅ **날짜 형식 통일**: "YYYY-MM" 형식으로 표준화

### 4. 🎨 상세 팝업 개선 (2025-11-11 완성!)
- ✅ **용어 통일**: "원분양가" 표기 일관성
- ✅ **가격 표시 최적화**: 불필요한 소수점 0 제거 (3.50억 → 3.5억)
- ✅ **날짜 표시 개선**: "2024. 09" 형식으로 통일
- ✅ **이모지 정리**: 중복 이모지 제거로 깔끔한 UI
- ✅ **투자 정보 섹션**: 줍줍분양 전용 실거래가 정보 표시

### 5. 🔧 관리자 패널 (2025-11-14 완성!)
- ✅ **PDF 자동 파싱**: Google Gemini API로 40+ 필드 자동 추출
- ✅ **실거래가 조회**: 국토교통부 API 연동 원클릭 조회
- ✅ **타입별 자동 표시**: unsold 타입 선택 시 실거래가 섹션 자동 노출
- ✅ **이미지 업로드**: Cloudflare R2 연동 + Workers 이미지 제공 API
- ✅ **공급 세대 이미지**: 드래그 앤 드롭, 미리보기, 자동 업로드
- ✅ **Textarea 자동 확장**: 내용에 따라 높이 자동 조절
- ✅ **등록일/수정일**: 매물 생성 및 수정 시간 자동 기록
- ✅ **extended_data**: JSON 구조로 상세 정보 무제한 저장

### 6. 호갱노노 스타일 필터
- ✅ **가로 스크롤 칩 필터**: 모바일 최적화된 직관적 UI
- ✅ **마감순 정렬 우선**: 사용자가 가장 원하는 정렬 방식
- ✅ **초기화 버튼 고정**: 모바일에서 오른쪽에 항상 고정
- ✅ **선택 필터 표시**: 하단에 선택된 필터 칩 표시 및 개별 제거
- ✅ **실시간 필터링**: 지역, 유형, 평형, 세대수, 정렬 조합

### 7. SEO 최적화
- ✅ **구글 서치 콘솔**: 소유권 확인 및 sitemap 제출 완료
- ✅ **네이버 서치어드바이저**: 소유권 확인 및 sitemap 제출 완료
- ✅ **sitemap.xml**: 자동 생성 및 제공
- ✅ **robots.txt**: 검색엔진 크롤링 최적화
- ✅ **메타 태그**: Open Graph, Twitter Card, SEO 키워드

## 🔧 데이터 모델

### Properties 테이블 (주요 필드)

```sql
-- 기본 정보
- id: INTEGER PRIMARY KEY
- type: TEXT (rental/general/unsold)
- title: TEXT (물건명)
- location: TEXT (지역)
- full_address: TEXT (전체 주소)

-- 가격 정보 (일관화됨)
- price: TEXT (표시용 가격, 형식 통일)
- households: TEXT (세대수, "XX세대" 형식)
- sale_price_min: REAL (최저가, 억 단위)
- sale_price_max: REAL (최고가, 억 단위)
- rental_deposit_min: REAL (최저 보증금, 만원 단위)
- rental_deposit_max: REAL (최고 보증금, 만원 단위)

-- 줍줍분양 전용
- original_price: REAL (원분양가, 억 단위)
- recent_trade_price: REAL (실거래가, 억 단위)
- sale_price_date: DATE (원분양가 날짜, YYYY-MM)
- recent_trade_date: DATE (실거래가 날짜, YYYY-MM)

-- 계산 필드
- expected_margin: REAL (예상 마진, 억 단위)
- margin_rate: REAL (수익률, %)

-- 확장 데이터
- extended_data: TEXT (JSON, 무제한 필드 저장)

-- 메타데이터
- created_at: DATETIME
- updated_at: DATETIME
```

## 🚀 API 엔드포인트

### 실거래가 조회 (국토교통부 API)
```bash
POST /api/admin/fetch-trade-price
Content-Type: application/json

{
  "address": "세종특별자치시 한솔동",
  "exclusiveArea": 59.98
}

# 응답:
{
  "success": true,
  "data": {
    "found": true,
    "recentTradePrice": 3.8,
    "recentTradeDate": "2024.11",
    "apartmentName": "첫마을",
    "exclusiveArea": 59.98,
    "location": "한솔동"
  }
}
```

### 이미지 업로드 (Cloudflare R2)
```bash
POST /api/admin/upload-image
Content-Type: multipart/form-data

# Form Data:
- image: File (JPG, PNG, WEBP, max 5MB)

# 응답:
{
  "success": true,
  "url": "/api/images/properties/1234567890-abc123.png",
  "filename": "properties/1234567890-abc123.png",
  "message": "이미지 업로드 완료"
}
```

### 이미지 제공 (Workers Proxy)
```bash
GET /api/images/properties/1234567890-abc123.png

# 응답: Image binary data with proper Content-Type header
# Cache-Control: public, max-age=31536000 (1 year)
```

### 매물 목록 조회
```bash
GET /api/properties?type=all

# 응답: 모든 매물 목록 (일관화된 데이터)
```

## 🔑 환경 변수 설정

### .dev.vars 파일 (로컬 개발)

```bash
# 국토교통부 실거래가 API
MOLIT_API_KEY=your_molit_api_key_here

# 관리자 비밀번호
ADMIN_PASSWORD=admin1234

# Google Gemini API (PDF 파싱)
GEMINI_API_KEY=your_gemini_api_key_here
```

### Cloudflare Pages Secrets (프로덕션)

```bash
# 환경 변수 설정
npx wrangler pages secret put MOLIT_API_KEY --project-name webapp
npx wrangler pages secret put ADMIN_PASSWORD --project-name webapp
npx wrangler pages secret put GEMINI_API_KEY --project-name webapp
```

## 📊 현재 데이터 현황

### 총 매물 수: 7개
- **청약분양 (general)**: 1개
- **임대분양 (rental)**: 3개
- **줍줍분양 (unsold)**: 3개 (실거래가 정보 완비)

### 데이터 일관성
- ✅ 가격 형식: 100% 통일
- ✅ 세대수 표기: 100% 통일
- ✅ 실거래가 데이터: 줍줍분양 100% 완비
- ✅ 숫자 필드: 모든 필드 채워짐

### 줍줍분양 투자 정보
1. **세종시 첫마을 6단지**: 원분양가 3.5억 → 실거래가 4.5억 (+1억, +28.6%)
2. **엘리프세종 6-3M4**: 원분양가 2.7억 → 실거래가 3.2억 (+0.5억, +18.5%)
3. **세종시 첫마을 5단지**: 원분양가 4.5억 → 실거래가 5.2억 (+0.7억, +15.6%)
4. **세종시 첫마을 4단지**: 원분양가 3.2억 → 실거래가 3.8억 (+0.6억, +18.8%)

## 🛠️ 기술 스택

- **Frontend**: TailwindCSS (반응형), Axios, FontAwesome
- **Backend**: Hono (TypeScript) - Cloudflare Workers 프레임워크
- **Database**: Cloudflare D1 (SQLite) - 글로벌 분산 DB
- **Storage**: Cloudflare R2 (S3 호환) - 이미지 저장
- **Deployment**: Cloudflare Pages - Edge 배포
- **External APIs**: 
  - 국토교통부 실거래가 API
  - Google Gemini API (PDF 파싱)
- **SEO**: sitemap.xml, robots.txt, Open Graph, Twitter Card
- **Search Engines**: Google Search Console, Naver Search Advisor

## 📝 최근 업데이트

### 2025-11-14: 🖼️ 공급 세대 정보 이미지 업로드 기능 추가!
- ✅ **R2 이미지 저장**: Cloudflare R2 버킷을 통한 이미지 저장
- ✅ **Workers 이미지 제공**: `/api/images/:path` 엔드포인트로 이미지 제공
- ✅ **어드민 이미지 업로드**: 공급 세대 정보 이미지 업로드 UI 추가
- ✅ **상세 팝업 이미지 표시**: 공급 세대 정보 카드에 이미지 표시 (테이블 위)
- ✅ **Textarea 자동 확장**: 단지특징, 주변환경, 교통여건, 교육시설 입력 시 자동 높이 조절
- ✅ **수정 모드 이미지 프리뷰**: 기존 매물 수정 시 업로드된 이미지 미리보기 표시
- ✅ **등록일/수정일 컬럼**: 관리자 대시보드에 created_at, updated_at 컬럼 추가
- ✅ **데이터 검증**: 'undefined' 문자열 필터링 처리

### 2025-11-11: 🎉 데이터 일관화 & 프로덕션 동기화 완료!
- ✅ **데이터 일관화**: 
  - 가격 형식 통일 ("X억 X천만원", "보증금 X만원~X만원")
  - 세대수 표기 통일 ("XX세대")
  - 실거래가 데이터 완비 (모든 줍줍분양)
  - 숫자 필드 채우기 (sale_price_min/max, rental_deposit_min/max)
- ✅ **상세 팝업 개선**:
  - 용어 통일 ("원분양가")
  - 가격 표시 최적화 (불필요한 0 제거)
  - 날짜 형식 통일 ("YYYY. MM")
  - 이모지 정리
- ✅ **프로덕션 DB 동기화**: 6개 매물 업데이트 완료
- ✅ **프로덕션 배포**: 코드 + 데이터 동시 배포
- ✅ **GitHub 동기화**: 모든 변경사항 커밋 및 푸시

### 2025-11-11: 🚀 모바일 최적화 & 실거래가 API 통합!
- ✅ **전체 페이지 모바일 반응형 디자인**: 메인, 상세 팝업, 관리자
- ✅ **국토교통부 실거래가 API**: 원클릭 자동 조회
- ✅ **관리자 패널 개선**: 실거래가 섹션 자동 표시 로직
- ✅ **버그 수정**: 
  - 중복 "선정 절차" 표시 문제 해결
  - 줍줍분양 실거래가 표시 로직 수정 (0 값 처리)
  - 실거래가 섹션 표시 조건 개선
- ✅ **터치 최적화**: 44x44px 최소 터치 영역, 터치 피드백
- ✅ **지역 코드 매핑**: 세종, 전북 김제, 경기 평택/화성, 서울 강남/서초

### 2025-11-10: 🎉 완전 리뉴얼 & SEO 최적화!
- ✅ **호갱노노 스타일 필터**: 가로 스크롤, 칩 디자인, 선택 필터 표시
- ✅ **모바일 최적화**: 초기화 버튼 오른쪽 고정
- ✅ **SEO 완벽 설정**: 구글/네이버 서치 콘솔 등록, sitemap 제출
- ✅ **GitHub 백업**: 모든 코드 커밋 및 push
- ✅ **프로젝트 백업**: tar.gz 아카이브 생성

## 📌 완료 체크리스트

### ✅ 핵심 기능 (100% 완성)
- ✅ 모바일 반응형 디자인 (전체 페이지)
- ✅ 국토교통부 실거래가 API 통합
- ✅ 데이터 일관화 (가격/세대수/실거래가)
- ✅ 상세 팝업 개선 (용어/날짜/가격 표시)
- ✅ 관리자 패널 (PDF 파싱, 이미지 업로드)
- ✅ 호갱노노 스타일 필터
- ✅ SEO 최적화 (구글/네이버)

### ✅ 배포 완료
- ✅ Cloudflare Pages 프로덕션 배포
- ✅ 커스텀 도메인 연결 (hanchae365.com)
- ✅ 프로덕션 DB 동기화
- ✅ GitHub 코드 백업

### ✅ 데이터 품질
- ✅ 7개 매물 데이터 일관화 완료
- ✅ 줍줍분양 실거래가 100% 완비
- ✅ 가격/세대수 표기 100% 통일
- ✅ 로컬 DB ↔ 프로덕션 DB 동기화

## 🚀 개발 워크플로우

### Quick Commands

```bash
# 로컬 개발 (빌드 + 재시작)
cd /home/user/webapp && npm run build
cd /home/user/webapp && pm2 restart webapp

# 프로덕션 배포
cd /home/user/webapp && npx wrangler pages deploy dist --project-name webapp --branch main

# 프로덕션 DB 업데이트
npx wrangler d1 execute webapp-production --remote --command="..."
```

### 개발 프로세스

1. **코드 수정**: `/home/user/webapp/src/index.tsx`
2. **로컬 빌드**: `npm run build`
3. **로컬 테스트**: PM2 재시작 후 http://localhost:3000
4. **Git 커밋**: `git add . && git commit -m "..."`
5. **프로덕션 배포**: `npx wrangler pages deploy dist --project-name webapp`
6. **GitHub 푸시**: `git push origin main`
7. **확인**: https://hanchae365.com

## 💡 핵심 개선 사항

### 데이터 일관성
- **Before**: "602300000", "26호", "보증금 1,527만원~"
- **After**: "6억 230만원", "26세대", "보증금 1,527만원~4,000만원"

### 실거래가 표시
- **Before**: 0 값일 때 표시 안 됨, "3.50억" 표기
- **After**: 명시적 > 0 체크, "3.5억" 깔끔한 표기

### 날짜 형식
- **Before**: "2014.5", "2024-09" 혼재
- **After**: "2014. 05", "2024. 09" 통일

### 모바일 UX
- **Before**: 데스크톱 중심 디자인
- **After**: 모바일 퍼스트, 터치 최적화, 44x44px 최소 터치 영역

## 🔗 중요 링크

- **프로덕션 사이트**: https://hanchae365.com
- **GitHub 저장소**: https://github.com/seunghun2/webapp
- **관리자 페이지**: https://hanchae365.com/admin (비밀번호: admin1234)
- **구글 서치 콘솔**: https://search.google.com/search-console
- **네이버 서치어드바이저**: https://searchadvisor.naver.com

## 🎉 프로젝트 상태: 100% 완성!

모든 핵심 기능이 완성되고 프로덕션 배포가 완료되었습니다. 데이터 일관성 확보, 모바일 최적화, 실거래가 API 통합이 완료되어 실제 사용자에게 서비스 중입니다! 🚀
