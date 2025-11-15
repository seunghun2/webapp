# 똑똑한한채 - 스마트 부동산 분양 정보

부동산 줍줍 분양 정보를 한눈에 볼 수 있는 플랫폼입니다.

## 🌐 공개 URL

- **프로덕션**: https://fa567dd7.webapp-32n.pages.dev
- **GitHub**: https://github.com/seunghun2/webapp

## ✨ 주요 기능

### 1. 📊 실거래가 조회 시스템
- ✅ **D1 Database 기반**: Cloudflare D1에 저장된 실거래 데이터 조회
- ✅ **실거래가 목업**: 샘플 데이터로 UI 미리보기 (15건)
- ✅ **실거래가 조회**: 실제 DB에서 데이터 조회 및 표시
- ✅ **통계 자동 계산**: 평균/최고/최저가 자동 계산
- ✅ **두 버튼 구성**: 목업 (보라색) + 실제 조회 (주황색)
- ✅ **자연스러운 전환**: 버튼 간 완벽한 상태 관리

### 2. 🔧 관리자 패널
- ✅ **물건 등록**: 분양 유형별 맞춤 입력 폼
- ✅ **타입별 자동 표시**: unsold 타입 선택 시 실거래가 섹션 자동 노출
- ✅ **이미지 업로드**: Cloudflare R2 연동
- ✅ **등록일/수정일**: 매물 생성 및 수정 시간 자동 기록

### 3. 호갱노노 스타일 필터
- ✅ **가로 스크롤 칩 필터**: 모바일 최적화된 직관적 UI
- ✅ **마감순 정렬 우선**: 사용자가 가장 원하는 정렬 방식
- ✅ **실시간 필터링**: 지역, 유형, 평형, 세대수, 정렬 조합

## 🔧 데이터 모델

### Properties 테이블
```sql
- id: INTEGER PRIMARY KEY
- type: TEXT (rental/general/unsold)
- title: TEXT (물건명)
- location: TEXT (지역)
- full_address: TEXT (전체 주소)
- price: TEXT (표시용 가격)
- sale_price_min: REAL (최저가, 억 단위)
- sale_price_max: REAL (최고가, 억 단위)
- original_price: REAL (원분양가, 억 단위)
- recent_trade_price: REAL (실거래가, 억 단위)
- created_at: DATETIME
- updated_at: DATETIME
```

### Trade Prices 테이블
```sql
- id: INTEGER PRIMARY KEY
- sigungu_code: TEXT (지역 코드)
- apt_name: TEXT (아파트명)
- deal_amount: INTEGER (거래 금액, 원)
- deal_year: INTEGER (거래 년도)
- deal_month: INTEGER (거래 월)
- deal_day: INTEGER (거래 일)
- area: REAL (전용면적, ㎡)
- floor: INTEGER (층수)
- dong: TEXT (동)
- jibun: TEXT (지번)
- created_at: DATETIME
```

## 🚀 API 엔드포인트

### 실거래가 조회 (D1 Database)
```bash
POST /api/admin/fetch-trade-price
Content-Type: application/json

{
  "address": "광주광역시 광산구 첨단동",
  "exclusiveArea": 84.9
}

# 응답:
{
  "success": true,
  "data": {
    "found": true,
    "recentTradePrice": 4.85,
    "recentTradeDate": "2024.11",
    "totalResults": 15,
    "trades": [
      {
        "aptName": "광주센트럴자이",
        "area": 84.9,
        "dealAmount": 485000000,
        "dealYear": 2024,
        "dealMonth": 11,
        "dealDay": 15,
        "floor": 12,
        "dong": "102동",
        "jibun": "123-4"
      },
      // ... more trades
    ]
  }
}
```

## 🛠️ 기술 스택

- **Frontend**: TailwindCSS, Axios, FontAwesome
- **Backend**: Hono (TypeScript) - Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) - 글로벌 분산 DB
- **Storage**: Cloudflare R2 (S3 호환)
- **Deployment**: Cloudflare Pages - Edge 배포

## 📝 최근 업데이트

### 2025-11-15: 🚀 3년 실거래가 수집 + 관리자 패널 통합!
- ✅ **3년치 데이터 수집**: 2022년 12월 ~ 2025년 11월 (36개월)
- ✅ **관리자 패널 실시간 수집**: 관리자 페이지에서 원클릭 데이터 수집
- ✅ **GitHub Actions 트리거 API**: 관리자 권한으로 워크플로우 실행
- ✅ **실거래가 통계 대시보드**: 총 건수, 지역 수, 최신 거래일 실시간 표시
- ✅ **메인 카드 자동 연동**: 줍줍분양 카드에 실거래가 자동 표시
- ✅ **서울 강남 + 세종 데이터**: 테스트 후 전국 확대 예정

### 2025-11-14: 🤖 실거래가 자동 수집 시스템 구축!
- ✅ **GitHub Actions 워크플로우**: 자동화된 데이터 수집 파이프라인
- ✅ **국토교통부 API 연동**: 국토교통부 실거래가 API 연동
- ✅ **D1 Database 자동 업로드**: 수집 → SQL 생성 → D1 삽입 자동화
- ✅ **중복 방지**: INSERT OR IGNORE로 중복 데이터 자동 제외
- ✅ **수동/자동 실행**: workflow_dispatch (수동) + cron (자동) 지원

### 2025-11-14: 🎯 실거래가 목업 기능 추가!
- ✅ **실거래가 목업 버튼**: 샘플 데이터로 UI 미리보기 가능
- ✅ **두 버튼 구성**: [실거래가 목업] (보라색) + [실거래가 조회] (주황색)
- ✅ **자연스러운 전환**: 목업 ↔ 실제 조회 간 완벽한 상태 관리
- ✅ **15건 샘플 데이터**: 광주센트럴자이 84㎡ 기준 실거래 데이터
- ✅ **통계 표시**: 평균/최고/최저가 자동 계산 및 표시
- ✅ **안전한 실행**: 모든 DOM 접근에 null 체크 추가
- ✅ **Cloudflare Pages 배포**: 프로덕션 환경 배포 완료

### 목업 데이터 예시
```javascript
광주센트럴자이 84㎡ 실거래 데이터:
- 최신 거래가: 4.85억 (2024년 11월)
- 평균 가격: 4.82억
- 최고가: 4.95억
- 최저가: 4.68억
- 총 거래 건수: 15건
```

## 🚀 개발 워크플로우

### Quick Commands

```bash
# 로컬 개발 (빌드 + 재시작)
cd /home/user/webapp && npm run build
cd /home/user/webapp && pm2 restart webapp

# 프로덕션 배포
cd /home/user/webapp && npx wrangler pages deploy dist --project-name webapp

# Git 커밋
git add . && git commit -m "..."
git push origin main

# 실거래가 수집 (로컬 - 샌드박스에서는 실행 불가)
npm run fetch-trade-prices
```

### 실거래가 자동 수집 (GitHub Actions)

**설정 방법:**

1. **GitHub Secrets 설정** (저장소 Settings → Secrets and variables → Actions)
   ```
   MOLIT_API_KEY: 국토교통부 API 키
   CLOUDFLARE_API_TOKEN: Cloudflare API 토큰
   ```

2. **수동 실행**
   - GitHub 저장소 → Actions 탭
   - "Fetch Trade Prices" 워크플로우 선택
   - "Run workflow" 버튼 클릭

3. **자동 실행 (선택)**
   - `.github/workflows/fetch-trade-prices.yml` 파일의 주석 해제
   - 매주 월요일 오전 9시 자동 실행

**수집 지역 (현재):**
- 서울특별시 강남구 (11680)
- 세종특별자치시 (36110)

**수집 기간:** 2022년 12월 ~ 2025년 11월 (3년, 36개월)

**예정 확장:**
- 전국 주요 지역으로 확대 예정
- 수집 기간 연장 가능

### 관리자 패널 실시간 수집 사용법

1. **관리자 패널 접속**: https://your-domain.pages.dev/admin
2. **대시보드에서 "실시간 수집" 버튼 클릭**
3. **GitHub Actions 자동 실행** - 약 5-10분 소요
4. **실거래가 통계 카드에서 진행 상황 확인**

**필수 환경 변수:**
```bash
# .dev.vars (로컬) 또는 Cloudflare Pages Secrets (프로덕션)
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_OWNER=seunghun2
GITHUB_REPO=webapp
```

### 배포 히스토리
- **Latest**: 2025-11-15 - 3년 실거래가 수집 + 관리자 패널 통합
- **URL**: https://fa567dd7.webapp-32n.pages.dev

## 🎉 프로젝트 상태

✅ **핵심 기능 완성!**
- 실거래가 자동 수집 시스템
- 관리자 패널 원클릭 수집
- 메인 카드 실시간 데이터 표시

🚀 **프로덕션 배포 완료!**
