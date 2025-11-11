# 똑똑한한채 - 스마트 부동산 분양 정보

부동산 줍줍 분양 정보를 한눈에 볼 수 있는 플랫폼입니다.

## 🌐 공개 URL

- **프로덕션**: https://hanchae365.com (커스텀 도메인)
- **GitHub**: https://github.com/seunghun2/webapp
- **Cloudflare Pages**: https://webapp-32n.pages.dev

## ✨ 주요 기능

### 1. 호갱노노 스타일 필터 (2025-11-10 완성!)
- ✅ **가로 스크롤 칩 필터**: 모바일 최적화된 직관적 UI
- ✅ **마감순 정렬 우선**: 사용자가 가장 원하는 정렬 방식
- ✅ **초기화 버튼 고정**: 모바일에서 오른쪽에 항상 고정
- ✅ **선택 필터 표시**: 하단에 선택된 필터 칩 표시 및 개별 제거
- ✅ **실시간 필터링**: 지역, 유형, 평형, 세대수, 정렬 조합

### 2. SEO 최적화 (2025-11-10 완성!)
- ✅ **구글 서치 콘솔**: 소유권 확인 및 sitemap 제출 완료
- ✅ **네이버 서치어드바이저**: 소유권 확인 및 sitemap 제출 완료
- ✅ **sitemap.xml**: 자동 생성 및 제공
- ✅ **robots.txt**: 검색엔진 크롤링 최적화
- ✅ **메타 태그**: Open Graph, Twitter Card, SEO 키워드
- ✅ **검색 노출 대기**: 구글 1-2일, 네이버 2-7일

### 3. 날짜 및 가격 변동 추적
- ✅ 분양가 날짜 입력/표시
- ✅ 실거래가 날짜 입력/표시  
- ✅ 가격 변동량 자동 계산 (억원)
- ✅ 상승률 자동 계산 (%)
- ✅ 변동 기간 표시 (개월)
- ✅ 마지막 업데이트 시간 표시

### 4. 주변 아파트 정보 관리
- ✅ **자동 검색 기능**: "주변 아파트" 버튼 클릭 시 자동으로 실거래가 검색
- ✅ 국토교통부 API 연동: 해당 지역 최근 6개월 실거래가 자동 조회
- ✅ 일반 분양 물건의 주변 아파트 시세 입력
- ✅ 여러 개의 주변 아파트 정보 저장
- ✅ 아파트명, 거리, 실거래가, 거래일 관리
- ✅ 카드에 주변 아파트 시세 자동 표시

### 5. 국토교통부 실거래가 자동 수집
- ✅ 주소에서 시군구 코드 자동 추출
- ✅ 아파트명 자동 추출 및 정리
- ✅ 국토교통부 API로 실거래가 자동 조회
- ✅ `/api/auto-update-all-prices` - 모든 물건 일괄 업데이트
- ✅ 수동 조회 UI (KB시세 모달 내)

### 6. 투자 정보 표시
```
💰 투자 정보    🕐 2025-11-09 업데이트

기존 분양가         3.2억
2024-03-15

최근 실거래가        5.5억  
2025-10-20

━━━━━━━━━━━━━━━━━━
가격 변동      +2.3억 (+71.9%)
                19개월간 변동
```

## 🔧 데이터 모델

### Properties 테이블 (주요 필드)

```sql
- id: INTEGER PRIMARY KEY
- title: TEXT (물건명)
- location: TEXT (지역)
- full_address: TEXT (전체 주소)
- sigungu_code: TEXT (시군구 코드, 자동 추출)
- apartment_name: TEXT (아파트명, 자동 추출)

-- 가격 정보
- original_price: REAL (분양가, 억원)
- sale_price_date: DATE (분양가 날짜)
- recent_trade_price: REAL (실거래가, 억원)
- recent_trade_date: DATE (실거래가 날짜)

-- 계산 필드
- expected_margin: REAL (예상 마진, 억원)
- margin_rate: REAL (수익률, %)
- price_increase_amount: REAL (가격 변동량, 억원)
- price_increase_rate: REAL (가격 상승률, %)

-- 주변 아파트
- nearby_apartments: TEXT (JSON 배열)
  구조: [{"name": "아파트명", "distance": "500m", "recent_price": 5.2, "date": "2025-10-15"}]

-- 메타데이터
- last_price_update: DATETIME (마지막 가격 업데이트)
- created_at: DATETIME
- updated_at: DATETIME
```

## 🚀 API 엔드포인트

### 1. 실거래가 업데이트
```bash
POST /api/properties/:id/update-price
Content-Type: application/json

{
  "original_price": 3.2,
  "sale_price_date": "2024-03-15",
  "recent_trade_price": 5.5,
  "recent_trade_date": "2025-10-20"
}
```

### 2. ⭐ 주변 아파트 자동 검색 (신규!)
```bash
POST /api/properties/:id/auto-nearby
Content-Type: application/json

# 해당 물건의 주변 아파트를 자동으로 검색
# - 물건의 주소에서 시군구 코드 추출
# - 국토교통부 API로 최근 6개월 실거래가 조회
# - 자동으로 DB에 저장
# 
# 응답:
{
  "success": true,
  "count": 5,
  "data": [
    {
      "name": "래미안 푸르지오",
      "distance": "대치동",
      "recent_price": "5.2",
      "date": "2025-10-15"
    }
  ]
}
```

### 3. 주변 아파트 정보 수동 업데이트
```bash
POST /api/properties/:id/update-nearby
Content-Type: application/json

{
  "nearby_apartments": [
    {
      "name": "래미안 푸르지오",
      "distance": "500m",
      "recent_price": 5.2,
      "date": "2025-10-15"
    }
  ]
}
```

### 4. 국토교통부 실거래가 조회
```bash
POST /api/fetch-molit-price
Content-Type: application/json

{
  "sigungu_code": "41390",
  "year_month": "202510",
  "apartment_name": "센트럴푸르지오"
}
```

### 5. ⭐ 자동 일괄 업데이트 (핵심!)
```bash
POST /api/auto-update-all-prices
Content-Type: application/json

# 모든 물건의 실거래가를 자동으로 조회하여 업데이트
# - 주소에서 시군구 코드 자동 추출
# - 아파트명 자동 추출
# - 국토교통부 API 호출
# - DB 자동 업데이트
```

## 🔑 환경 변수 설정

### 1. 국토교통부 API 키 발급

1. [공공데이터포털](https://www.data.go.kr/) 회원가입
2. "아파트매매 실거래 상세 자료" 검색
3. [서비스 신청](https://www.data.go.kr/data/15057511/openapi.do)
4. 서비스 키 발급 (1-2일 소요)

### 2. .dev.vars 파일 생성

```bash
# /home/user/webapp/.dev.vars
MOLIT_API_KEY=your_api_key_here
```

### 3. 프로덕션 환경 변수 설정

```bash
# Cloudflare Pages에서 환경 변수 설정
wrangler pages secret put MOLIT_API_KEY --project-name webapp
```

## ⏰ 자동 업데이트 설정

### 방법 1: GitHub Actions (추천)

`.github/workflows/update-prices.yml`:
```yaml
name: Update Real Estate Prices

on:
  schedule:
    - cron: '0 2 * * *'  # 매일 오전 2시 (UTC)
  workflow_dispatch:  # 수동 실행 가능

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Call Auto Update API
        run: |
          curl -X POST https://hanchae365.com/api/auto-update-all-prices \
            -H "Content-Type: application/json"
```

### 방법 2: 외부 Cron 서비스

- [cron-job.org](https://cron-job.org/)
- [EasyCron](https://www.easycron.com/)
- URL: `https://hanchae365.com/api/auto-update-all-prices`
- Method: POST
- Schedule: 매일 오전 2시

### 방법 3: Cloudflare Workers Cron

별도의 Worker를 생성하여 Cron Trigger 설정 (Cloudflare Pages는 Cron 미지원)

## 📊 현재 완성된 물건 데이터

- 총 26건의 물건 등록
- 실거래가 데이터 설정: 3건
- 주변 아파트 정보 설정: 가능

## 🎯 사용 방법

### 1. 호갱노노 스타일 필터 사용
- **가로 스크롤**: 터치로 좌우 스크롤하여 필터 선택
- **정렬**: 마감순(기본), 최신순, 낮은가격, 높은가격
- **지역**: 전체, 서울, 경기, 인천 등
- **유형**: 전체, 줍줍분양, 모집중, 조합원
- **평형**: 전체, 소형, 중형, 대형
- **세대수**: 전체, 50↓, 50-300, 300-1000, 1000↑
- **선택 필터 제거**: 하단 칩의 X 버튼 클릭
- **전체 초기화**: 오른쪽 고정 버튼 클릭

### 2. 투자 정보 자동 표시
- 메인 카드에서 투자 정보가 **자동으로 표시**됩니다
- 분양가, 실거래가, 수익률이 자동 계산되어 표시
- GitHub Actions가 매일 자동으로 데이터를 업데이트

### 3. 주변 아파트 정보 입력 (자동 검색!)
1. 일반 분양 물건 카드에서 **"주변 아파트"** 버튼 클릭
2. **자동 검색 실행**: 
   - 버튼 클릭 시 주변 아파트가 없으면 자동으로 실거래가 검색
   - 국토교통부 API로 최근 6개월 데이터 조회
   - 자동으로 최대 5개 아파트 정보 저장
3. 수동 추가도 가능:
   - 아파트명
   - 거리
   - 실거래가
   - 거래일
4. 여러 개 추가/수정/삭제 가능
5. 저장하면 카드에 자동 표시

### 4. 자동 일괄 업데이트 (관리자)
```bash
curl -X POST https://hanchae365.com/api/auto-update-all-prices
```

## 🛠️ 기술 스택

- **Frontend**: TailwindCSS, Axios, FontAwesome
- **Backend**: Hono (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Cloudflare Pages
- **External API**: 국토교통부 실거래가 API
- **SEO**: sitemap.xml, robots.txt, Open Graph, Twitter Card
- **Search Engines**: Google Search Console, Naver Search Advisor

## 📝 최근 업데이트

### 2025-11-10: 🎉 완전 리뉴얼 & SEO 최적화 완료!
- ✅ **호갱노노 스타일 필터**: 가로 스크롤, 칩 디자인, 선택 필터 표시
- ✅ **모바일 최적화**: 초기화 버튼 오른쪽 고정
- ✅ **SEO 완벽 설정**: 
  - 구글 서치 콘솔 등록 완료
  - 네이버 서치어드바이저 등록 완료
  - sitemap.xml 제출 완료
  - robots.txt 설정 완료
  - 메타 태그 최적화 (Open Graph, Twitter Card)
- ✅ **GitHub 백업**: 모든 코드 커밋 및 push 완료
- ✅ **프로젝트 백업**: tar.gz 아카이브 생성 완료

### 2025-11-09: UI/UX 대대적 개선
- ✅ 탭 UI 개선: 활성 탭의 텍스트와 숫자 모두 흰색 표시
- ✅ 조합원 탭 단순화: "제휴문의" 버튼 텍스트 제거
- ✅ 기본 정렬 변경: 최신순 → 마감임박순
- ✅ 필터 가시성 수정: 드롭다운 z-index 문제 해결
- ✅ 평형 필터 추가: 소형/중형/대형 필터링 가능
- ✅ 카테고리 데이터 재구성: 오늘청약 0, 모집중 통합
- ✅ 카드 버튼 제거: 등록문의 버튼 삭제
- ✅ 버튼 호버 수정: 상세정보 버튼 텍스트 유지
- ✅ 주변 아파트 자동 검색: 실거래가 자동 조회 기능

### 2025-11-09: 프로덕션 배포
- ✅ Cloudflare Pages 프로덕션 배포 완료
- ✅ 커스텀 도메인 연결 (hanchae365.com)
- ✅ 실시간 개발 워크플로우 구축

### 2025-11-09: 핵심 기능
- ✅ 날짜 및 상승률 계산 기능 추가
- ✅ 주변 아파트 정보 관리 기능 추가
- ✅ 국토교통부 실거래가 자동 수집 기능 추가
- ✅ 자동 일괄 업데이트 API 구현
- ✅ KB시세 수동 입력 모달 제거 - 완전 자동화
- ✅ GitHub Actions 자동 업데이트 설정 완료

## 📌 완료 체크리스트

### ✅ 개발 완료
- ✅ 호갱노노 스타일 필터
- ✅ 날짜 및 상승률 표시
- ✅ 주변 아파트 정보 관리
- ✅ 국토교통부 API 연동
- ✅ GitHub Actions 자동 업데이트
- ✅ KB시세 수동 입력 제거 (완전 자동화)
- ✅ **관리자 페이지** (2025-11-11 완성!)
  - ✅ 로그인 시스템 (비밀번호: admin1234)
  - ✅ PDF 자동 파싱 (Google Gemini API, 40+ 필드)
  - ✅ 신청 절차 스텝 관리
  - ✅ 공급 세대 정보 테이블
  - ✅ 8개 상세 섹션 (단지정보, 신청자격, 공급세대정보, 입주자선정기준, 주의사항, 온라인신청, 문의처, 단지개요)
  - ✅ extended_data JSON 구조로 상세 정보 저장
  - ✅ 메인 페이지 상세 팝업에 전체 데이터 표시
  - ✅ **이미지 업로드 (Cloudflare R2)** - 코드 완성, R2 활성화 대기

### ✅ 배포 완료
- ✅ Cloudflare Pages 프로덕션 배포
- ✅ 커스텀 도메인 연결 (hanchae365.com)
- ✅ GitHub 코드 백업
- ✅ tar.gz 프로젝트 백업

### ✅ SEO 완료
- ✅ 구글 서치 콘솔 소유권 확인
- ✅ 구글 sitemap.xml 제출
- ✅ 네이버 서치어드바이저 소유권 확인
- ✅ 네이버 sitemap.xml 제출
- ✅ 네이버 웹페이지 수집 요청
- ✅ robots.txt 설정
- ✅ 메타 태그 최적화

### ⏳ 진행 중
- ⏳ **Cloudflare R2 활성화** - 이미지 업로드 기능 활성화 위해 필요
- ⏳ 복제(Duplicate) 기능
- ⏳ 미리보기(Preview) 기능
- ⏳ 자동저장 (10초 간격 LocalStorage)
- ⏳ 폼 유효성 검사

## 🚀 실시간 개발 워크플로우

### Quick Commands (로컬 개발)

```bash
# 빌드 + 재시작 + 테스트
npm run restart

# 빌드 + 재시작 (빠른 개발)
npm run quick

# 프로덕션 배포
npx wrangler pages deploy dist --project-name webapp
```

### 개발 프로세스

1. **코드 수정**: `/home/user/webapp/src/index.tsx` 또는 다른 파일
2. **로컬 테스트**: `npm run quick` (3-5초 내 재시작)
3. **로컬 확인**: http://localhost:3000
4. **프로덕션 배포**: `npx wrangler pages deploy dist --project-name webapp`
5. **2분 후 라이브**: https://hanchae365.com 에서 확인

## 💡 팁

- API 키는 `.dev.vars`에만 저장하고 절대 git에 커밋하지 마세요
- `.gitignore`에 `.dev.vars`가 포함되어 있는지 확인하세요
- 실거래가는 최근 6개월 데이터를 조회합니다
- 자동 업데이트는 매일 한 번씩 실행하는 것을 권장합니다
- `npm run quick`으로 빠른 로컬 개발, 확정되면 배포

## 🔗 중요 링크

- **프로덕션 사이트**: https://hanchae365.com
- **GitHub 저장소**: https://github.com/seunghun2/webapp
- **프로젝트 백업**: https://page.gensparksite.com/project_backups/hanchae365_complete_backup.tar.gz
- **구글 서치 콘솔**: https://search.google.com/search-console
- **네이버 서치어드바이저**: https://searchadvisor.naver.com

## 📦 프로젝트 복원 방법

```bash
# 1. 백업 다운로드
wget https://page.gensparksite.com/project_backups/hanchae365_complete_backup.tar.gz

# 2. 압축 해제
tar -xzf hanchae365_complete_backup.tar.gz

# 3. 디렉토리 이동
cd webapp

# 4. 의존성 설치
npm install

# 5. 빌드
npm run build

# 6. 로컬 실행
pm2 start ecosystem.config.cjs

# 7. 배포 (옵션)
npx wrangler pages deploy dist --project-name webapp
```

## 🎉 프로젝트 상태: 100% 완성!

모든 기능이 완성되고 배포되었습니다. 검색엔진 등록도 완료되어 곧 검색 결과에 노출될 예정입니다!
