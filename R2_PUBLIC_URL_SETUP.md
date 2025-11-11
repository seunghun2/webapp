# R2 Public URL 설정 가이드

## ✅ 완료된 작업
- ✅ R2 활성화
- ✅ 버킷 생성: `webapp-images`, `webapp-images-dev`
- ✅ 코드 구현 완료

## ⏳ Public URL 설정 (필수!)

현재 R2 버킷은 **Private** 상태입니다. 
이미지를 웹에서 볼 수 있으려면 Public Access 설정이 필요합니다.

---

## 방법 1: R2.dev 서브도메인 (가장 간단!)

### 1단계: Cloudflare Dashboard
1. https://dash.cloudflare.com 접속
2. 왼쪽 메뉴 → **R2**
3. 버킷 선택: **`webapp-images-dev`** 클릭

### 2단계: Settings 탭
1. **Settings** 탭 클릭
2. **Public Access** 섹션 찾기
3. **"Allow Access"** 또는 **"Connect Domain"** 버튼 클릭

### 3단계: R2.dev 도메인 활성화
1. **"R2.dev subdomain"** 옵션 선택
2. 자동으로 생성된 URL 확인: `https://pub-xxxxx.r2.dev`
3. **URL 복사!** 📋

### 4단계: 프로덕션 버킷도 동일하게
1. 버킷 선택: **`webapp-images`** 클릭
2. Settings → Public Access → Allow Access
3. R2.dev URL 복사

---

## 방법 2: Custom Domain (권장, 좀 더 복잡)

### 요구사항:
- Cloudflare에 등록된 도메인 필요
- 예: `images.hanchae365.com`

### 설정:
1. R2 Dashboard → 버킷 선택
2. Settings → Public Access
3. **"Connect Domain"** 클릭
4. Custom domain 입력: `images.hanchae365.com`
5. DNS 자동 설정됨

---

## URL 획득 후 코드 수정

### 현재 코드 (2758번 라인):
```typescript
const imageUrl = `https://webapp-images.YOUR_ACCOUNT_ID.r2.cloudflarestorage.com/${filename}`
```

### 수정 후:

**옵션 A: R2.dev 사용 (개발용)**
```typescript
const imageUrl = `https://pub-xxxxx.r2.dev/${filename}`
```

**옵션 B: Custom Domain 사용 (프로덕션)**
```typescript
const imageUrl = `https://images.hanchae365.com/${filename}`
```

**옵션 C: 환경별 분리 (권장!)**
```typescript
// 개발/프로덕션 자동 구분
const R2_PUBLIC_URL = c.env.R2_PUBLIC_URL || 'https://pub-xxxxx.r2.dev'
const imageUrl = `${R2_PUBLIC_URL}/${filename}`
```

---

## 환경변수 설정 (.dev.vars)

```bash
# .dev.vars 파일에 추가
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

프로덕션:
```bash
wrangler pages secret put R2_PUBLIC_URL --project-name webapp
# 입력: https://images.hanchae365.com (또는 프로덕션 R2.dev URL)
```

---

## 빠른 테스트 (Public URL 없이)

Public URL 설정 전에도 관리자 페이지에서:
1. ✅ 이미지 업로드 가능
2. ✅ R2에 저장됨
3. ✅ 파일명 DB에 저장됨
4. ❌ 이미지 표시는 안 됨 (Public URL 필요)

---

## 다음 단계

1. ⏳ Dashboard에서 R2.dev URL 활성화
2. ⏳ URL 복사
3. ⏳ 코드에 URL 적용
4. ⏳ 빌드 및 재시작
5. ⏳ 테스트!

---

## 스크린샷 예시

R2.dev URL 활성화 후 보이는 화면:
```
Public Access
✅ Enabled

R2.dev subdomain:
https://pub-a1b2c3d4e5f6.r2.dev

Allow access: [Disable]
```

이 URL을 복사해서 알려주세요!
