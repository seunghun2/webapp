# R2 이미지 업로드 설정 가이드

## 1. Cloudflare R2 활성화

### 단계 1: R2 서비스 활성화
1. **Cloudflare Dashboard** 접속: https://dash.cloudflare.com
2. 왼쪽 메뉴에서 **"R2"** 클릭
3. **"Purchase R2"** 또는 **"Enable R2"** 버튼 클릭
4. 결제 수단 등록 (필요시)

### R2 무료 한도:
- ✅ 저장: **10GB/월 무료**
- ✅ Class A 작업: **100만 건/월 무료** (PUT, LIST)
- ✅ Class B 작업: **1000만 건/월 무료** (GET, HEAD)
- ✅ 송신: **10GB/월 무료**

---

## 2. R2 버킷 생성

R2 활성화 후 터미널에서 실행:

```bash
cd /home/user/webapp

# 개발용 버킷 생성
npx wrangler r2 bucket create webapp-images-dev

# 프로덕션용 버킷 생성
npx wrangler r2 bucket create webapp-images
```

---

## 3. R2 Public Access 설정 (선택)

### 옵션 A: Custom Domain 연결 (권장)
```bash
# Custom domain을 R2 버킷에 연결
npx wrangler r2 bucket domain add webapp-images yourdomain.com
```

### 옵션 B: R2.dev 서브도메인 활성화
1. Cloudflare Dashboard → R2 → 버킷 선택
2. "Settings" 탭
3. "Public Access" → "Allow Access" 활성화
4. `https://pub-xxxxx.r2.dev` 형식의 URL 획득

---

## 4. 코드 수정 (Public URL)

R2.dev URL을 획득한 후, `src/index.tsx` 파일 수정:

### 현재 코드 (2752번 라인 근처):
```typescript
const imageUrl = `https://webapp-images.YOUR_ACCOUNT_ID.r2.cloudflarestorage.com/${filename}`
```

### 수정 후:
```typescript
// 옵션 A: R2.dev 서브도메인 사용
const imageUrl = `https://pub-xxxxx.r2.dev/${filename}`

// 또는 옵션 B: Custom domain 사용
const imageUrl = `https://yourdomain.com/${filename}`
```

---

## 5. 로컬 개발 테스트

### wrangler.jsonc 설정 확인:
```jsonc
{
  "r2_buckets": [
    {
      "binding": "IMAGES",
      "bucket_name": "webapp-images",
      "preview_bucket_name": "webapp-images-dev"
    }
  ]
}
```

### 로컬 서버 재시작:
```bash
cd /home/user/webapp
npm run build
pm2 restart webapp
```

### 테스트:
1. 관리자 페이지 접속
2. "신규 등록" 클릭
3. "대표이미지" 섹션에서 이미지 파일 선택
4. 자동 업로드 확인

---

## 6. 프로덕션 배포

### R2 버킷이 프로덕션에 자동 연결됩니다:
```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name webapp
```

---

## 7. 문제 해결

### R2가 활성화되지 않은 경우:
```
Error: Please enable R2 through the Cloudflare Dashboard. [code: 10042]
```
→ Cloudflare Dashboard에서 R2 활성화 필요

### 이미지 URL이 작동하지 않는 경우:
1. R2 버킷의 Public Access 설정 확인
2. CORS 설정 필요 시:
   ```bash
   npx wrangler r2 bucket cors put webapp-images --config cors.json
   ```
   
   **cors.json:**
   ```json
   {
     "CORSRules": [
       {
         "AllowedOrigins": ["*"],
         "AllowedMethods": ["GET", "HEAD"],
         "AllowedHeaders": ["*"],
         "MaxAgeSeconds": 3000
       }
     ]
   }
   ```

### 버킷 목록 확인:
```bash
npx wrangler r2 bucket list
```

### 버킷 내용 확인:
```bash
npx wrangler r2 object list webapp-images-dev
```

---

## 8. 비용 관련

### 무료 한도 초과 시:
- 저장: $0.015/GB/월
- Class A: $4.50/백만 건
- Class B: $0.36/백만 건

### 일반적인 사용량 예상:
- 이미지 100개 (평균 500KB) = 50MB ≈ **무료**
- 월 1만 페이지뷰 = **무료 한도 내**

---

## 현재 상태

✅ **코드 구현 완료**
- 이미지 업로드 API (`/api/admin/upload-image`)
- 이미지 삭제 API (`/api/admin/delete-image/:filename`)
- 관리자 폼 UI (파일 선택 + 미리보기 + 자동 업로드)

⏳ **R2 활성화 대기 중**
- Cloudflare Dashboard에서 R2 활성화 필요
- 버킷 생성 필요
- Public URL 설정 필요

---

## 다음 단계

1. ✅ R2 활성화
2. ✅ 버킷 생성 (`webapp-images-dev`, `webapp-images`)
3. ✅ Public Access 설정 (R2.dev 또는 Custom Domain)
4. ✅ 코드에서 Public URL 수정
5. ✅ 빌드 및 테스트
6. ✅ 프로덕션 배포
