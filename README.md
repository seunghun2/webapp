# 줍줍분양 - 토스 스타일

## 프로젝트 개요
- **이름**: 줍줍분양 (Toss Style Redesign)
- **목표**: 부동산 분양 정보를 토스의 깔끔하고 현대적인 디자인으로 제공
- **주요 기능**: 
  - 무순위 분양 정보 제공
  - 청약 일정 관리
  - 분양 예정 물건 조회
  - 관심 물건 등록

## 현재 완성된 기능
- ✅ 토스 스타일 UI/UX 디자인 적용
- ✅ 반응형 레이아웃 (모바일/데스크톱 지원)
- ✅ 4가지 카테고리 필터링 (줍줍분양, 오늘청약, 모집중, 분양예정)
- ✅ 실시간 통계 카드
- ✅ 분양 물건 목록 표시
- ✅ 관심등록 버튼 UI
- ✅ 이벤트 배너
- ✅ 부드러운 애니메이션 효과

## 기능 진입점 (URI)
- **메인 페이지**: `/` - 전체 분양 정보 및 필터링
- **통계 API**: `/api/stats` - 카테고리별 분양 건수
- **분양 목록 API**: `/api/properties/:type` - 타입별 분양 정보
  - 파라미터: `type` (unsold, today, johab, next)

## 아직 구현되지 않은 기능
- ⏳ 실제 데이터베이스 연동 (현재는 Mock 데이터 사용)
- ⏳ 사용자 인증 및 로그인
- ⏳ 관심등록 기능 (API 연동)
- ⏳ 상세 페이지
- ⏳ 검색 기능
- ⏳ 알림 기능
- ⏳ 공유 기능

## 권장 다음 개발 단계
1. **Cloudflare D1 데이터베이스 연동** - 분양 정보 영구 저장
2. **관심등록 기능 구현** - KV 스토리지 활용
3. **상세 페이지 추가** - 분양 물건 상세 정보
4. **검색 및 필터 고도화** - 지역별, 가격별 검색
5. **관리자 페이지** - 분양 정보 관리

## URL
- **개발 서버**: https://3000-iwhqnkbi44emm3qlpcntd-583b4d74.sandbox.novita.ai
- **GitHub**: (아직 연동되지 않음)

## 데이터 아키텍처
- **데이터 모델**: 
  - Properties (분양 물건): id, type, title, location, status, deadline, price, households, tags, badge
  - Stats (통계): unsold, today, johab, next
- **스토리지 서비스**: 현재 메모리 기반 (Mock 데이터), 향후 Cloudflare D1 예정
- **데이터 흐름**: 
  1. 프론트엔드에서 API 호출 (axios)
  2. Hono 백엔드 API 라우트 처리
  3. 데이터 반환 (JSON)
  4. 프론트엔드 렌더링

## 사용자 가이드
1. **메인 페이지 접속**: 위 개발 서버 URL로 접속
2. **카테고리 선택**: 상단 통계 카드 또는 탭을 클릭하여 필터링
3. **분양 정보 확인**: 각 카드에서 위치, 가격, 마감일 확인
4. **관심등록**: 원하는 물건의 "관심등록" 버튼 클릭 (현재는 UI만 구현)

## 기술 스택
- **프레임워크**: Hono (Cloudflare Workers)
- **프론트엔드**: HTML5, TailwindCSS, Vanilla JavaScript
- **폰트**: Pretendard (토스 스타일)
- **아이콘**: Font Awesome
- **HTTP 클라이언트**: Axios
- **배포 플랫폼**: Cloudflare Pages

## 디자인 특징
- **토스 스타일 요소**:
  - 볼드한 타이포그래피
  - 파란색 그라데이션 (#3182F6 → #1B64DA)
  - 부드러운 애니메이션 (cubic-bezier)
  - 카드형 레이아웃
  - 넉넉한 여백과 라운드 처리
  - 직관적인 아이콘 사용

## 배포 상태
- **플랫폼**: Cloudflare Pages (준비 완료)
- **상태**: ✅ 개발 서버 실행 중
- **마지막 업데이트**: 2025-01-09

## 로컬 개발 가이드
```bash
# 의존성 설치
npm install

# 빌드
npm run build

# 개발 서버 시작 (PM2)
pm2 start ecosystem.config.cjs

# 서비스 확인
curl http://localhost:3000

# 로그 확인
pm2 logs webapp --nostream
```

## 프로덕션 배포 가이드
```bash
# Cloudflare API 키 설정 (최초 1회)
# setup_cloudflare_api_key 도구 사용

# 프로젝트 빌드 및 배포
npm run deploy:prod
```
