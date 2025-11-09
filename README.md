# 똑똑한한채 - 스마트 부동산 분양 정보

부동산 줍줍 분양 정보를 한눈에 볼 수 있는 플랫폼입니다.

## 🌐 공개 URL

- **프로덕션**: https://hanchae365.com (커스텀 도메인)
- **샌드박스**: https://3000-iwhqnkbi44emm3qlpcntd-583b4d74.sandbox.novita.ai
- **GitHub**: https://github.com/seunghun2/webapp

## ✨ 주요 기능

### 1. 날짜 및 가격 변동 추적
- ✅ 분양가 날짜 입력/표시
- ✅ 실거래가 날짜 입력/표시  
- ✅ 가격 변동량 자동 계산 (억원)
- ✅ 상승률 자동 계산 (%)
- ✅ 변동 기간 표시 (개월)
- ✅ 마지막 업데이트 시간 표시

### 2. 주변 아파트 정보 관리
- ✅ 일반 분양 물건의 주변 아파트 시세 입력
- ✅ 여러 개의 주변 아파트 정보 저장
- ✅ 아파트명, 거리, 실거래가, 거래일 관리
- ✅ 카드에 주변 아파트 시세 자동 표시

### 3. 국토교통부 실거래가 자동 수집
- ✅ 주소에서 시군구 코드 자동 추출
- ✅ 아파트명 자동 추출 및 정리
- ✅ 국토교통부 API로 실거래가 자동 조회
- ✅ `/api/auto-update-all-prices` - 모든 물건 일괄 업데이트
- ✅ 수동 조회 UI (KB시세 모달 내)

### 4. 투자 정보 표시
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

### 2. 주변 아파트 정보 업데이트
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

### 3. 국토교통부 실거래가 조회
```bash
POST /api/fetch-molit-price
Content-Type: application/json

{
  "sigungu_code": "41390",
  "year_month": "202510",
  "apartment_name": "센트럴푸르지오"
}
```

### 4. ⭐ 자동 일괄 업데이트 (핵심!)
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
          curl -X POST https://your-domain.pages.dev/api/auto-update-all-prices \
            -H "Content-Type: application/json"
```

### 방법 2: 외부 Cron 서비스

- [cron-job.org](https://cron-job.org/)
- [EasyCron](https://www.easycron.com/)
- URL: `https://your-domain.pages.dev/api/auto-update-all-prices`
- Method: POST
- Schedule: 매일 오전 2시

### 방법 3: Cloudflare Workers Cron

별도의 Worker를 생성하여 Cron Trigger 설정 (Cloudflare Pages는 Cron 미지원)

## 📊 현재 완성된 물건 데이터

- 총 26건의 물건 등록
- 실거래가 데이터 설정: 3건
- 주변 아파트 정보 설정: 가능

## 🎯 사용 방법

### 1. 투자 정보 자동 표시
- 메인 카드에서 투자 정보가 **자동으로 표시**됩니다
- 분양가, 실거래가, 수익률이 자동 계산되어 표시
- GitHub Actions가 매일 자동으로 데이터를 업데이트

### 2. 주변 아파트 정보 입력
1. 일반 분양 물건 카드에서 **"주변"** 버튼 클릭
2. 주변 아파트 정보 추가:
   - 아파트명
   - 거리
   - 실거래가
   - 거래일
3. 여러 개 추가 가능
4. 저장하면 카드에 자동 표시

### 3. 자동 일괄 업데이트 (관리자)
```bash
curl -X POST https://your-domain/api/auto-update-all-prices
```

## 🛠️ 기술 스택

- **Frontend**: TailwindCSS, Axios
- **Backend**: Hono (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Cloudflare Pages
- **External API**: 국토교통부 실거래가 API

## 📝 최근 업데이트

- 2025-11-09: **Cloudflare Pages 프로덕션 배포 완료** ✅
- 2025-11-09: **커스텀 도메인 연결** (hanchae365.com) ✅
- 2025-11-09: **실시간 개발 워크플로우 구축** ✅
- 2025-11-09: 날짜 및 상승률 계산 기능 추가
- 2025-11-09: 주변 아파트 정보 관리 기능 추가
- 2025-11-09: 국토교통부 실거래가 자동 수집 기능 추가
- 2025-11-09: 자동 일괄 업데이트 API 구현
- 2025-11-09: **KB시세 수동 입력 모달 제거** - 완전 자동화
- 2025-11-09: **GitHub Actions 자동 업데이트 설정 완료**

## 📌 다음 단계

1. ✅ 날짜 및 상승률 표시
2. ✅ 주변 아파트 정보 관리
3. ✅ 국토교통부 API 연동
4. ✅ GitHub Actions로 자동 업데이트 설정
5. ✅ KB시세 수동 입력 제거 (완전 자동화)
6. ✅ Cloudflare Pages 프로덕션 배포
7. ✅ 커스텀 도메인 연결 (hanchae365.com)
8. 🔄 국토교통부 API 키 발급 및 설정
9. 🔄 자동 업데이트 GitHub Actions 테스트

## 🚀 실시간 개발 워크플로우

### Quick Commands (샌드박스 개발)

```bash
# 빌드 + 재시작 + 테스트
npm run restart

# 빌드 + 재시작 (빠른 개발)
npm run quick

# 전체 배포 (커밋 + 푸시 + 프로덕션)
./dev-deploy.sh "커밋 메시지"
```

### 개발 프로세스

1. **코드 수정**: `/home/user/webapp/src/index.tsx` 또는 다른 파일
2. **로컬 테스트**: `npm run quick` (3-5초 내 재시작)
3. **샌드박스 확인**: 즉시 변경사항 확인 가능
4. **프로덕션 배포**: `./dev-deploy.sh "변경 내용"`
5. **2분 후 라이브**: https://hanchae365.com 에서 확인

## 💡 팁

- API 키는 `.dev.vars`에만 저장하고 절대 git에 커밋하지 마세요
- `.gitignore`에 `.dev.vars`가 포함되어 있는지 확인하세요
- 실거래가는 최근 6개월 데이터를 조회합니다
- 자동 업데이트는 매일 한 번씩 실행하는 것을 권장합니다
- `npm run quick`으로 빠른 로컬 개발, 확정되면 `./dev-deploy.sh`로 프로덕션 배포
