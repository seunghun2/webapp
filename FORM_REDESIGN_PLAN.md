# 폼 개편 작업 계획서

## ✅ 완료
- 힐스테이트 광명 데이터 수정 (11/17)
- 청약 상태 계산 함수 추가 (`calculateSubscriptionStatus`)
- extended_data 파싱 로직 추가

## 🔄 진행 중

### 1. 청약 상태 자동 계산 (진행예정/진행중/마감)
**로직:**
- `오늘 < 청약시작일` → "진행예정" (회색)
- `청약시작일 ≤ 오늘 ≤ 청약마감일` → "진행중" (파란색)
- `오늘 > 청약마감일` → "마감" (회색)

**저장 위치:** `extended_data.subscriptionStartDate`, `extended_data.subscriptionEndDate`

**표시 위치:**
- 메인 카드 우측 상단 badge
- 상세 팝업 헤더

---

### 2. 분양가격 표기 규칙 통일

**규칙:**
- 금액만 표기 → `3271만원` (숫자 + "만원")
- 금액 구간 → `1460~3271만원` (물결 ~)
- '보증금' 등 단어 제거

**예시:**
```
AS-IS: 보증금 1,527만원~
TO-BE: 1527~3271만원

AS-IS: 602300000
TO-BE: 60230만원
```

**처리 함수:**
```javascript
function formatPrice(price) {
  // 숫자로 변환
  let num = parseFloat(price.replace(/[^0-9.~-]/g, ''));
  
  // 구간 처리
  if (price.includes('~')) {
    const [min, max] = price.split('~');
    return `${formatSinglePrice(min)}~${formatSinglePrice(max)}`;
  }
  
  return formatSinglePrice(price);
}

function formatSinglePrice(price) {
  let num = parseFloat(price.replace(/[^0-9.]/g, ''));
  if (num >= 10000) {
    return Math.round(num / 10000) + '만원';
  }
  return num + '만원';
}
```

---

### 3. 시공사 필드 추가

**표시 위치:**
- 메인 카드 Key Info Grid (신규 행)
- 상세 팝업 단지 정보 섹션

**저장:**
- 기존 `constructor` 컬럼 사용
- 또는 `extended_data.constructor`

**예시:**
```
시공사: 현대건설
시공사: 계룡건설산업㈜
```

---

### 4. 추천대상 3줄 구조

**구조:**
```
1줄: 거주지 + 주체 (예: 세종시 거주 무주택 신혼부부)
2줄: 신청 자격 (예: 청약통장 없어도 신청 가능)
3줄: 추가 조건/혜택 (예: 소득·자산 제한 없는 공공분야 희망자)
```

**저장:** `extended_data.targetAudienceLines = ["line1", "line2", "line3"]`

**표시:**
- 메인 카드: 3줄 모두 표시
- 상세 팝업: 3줄 모두 표시

---

### 5. 상세 팝업 '자세히 보기' 토글

**구조:**
```
[단지 정보] ← 항상 표시
[신청 절차] ← 항상 표시
[공급 세대 정보] ← 항상 표시

[자세히 보기 ▼] 버튼

--- 클릭 시 펼쳐짐 ---
[신청자격]
[입주자 선정 기준]
[주의사항]
[온라인 신청]
[문의처]
[단지 개요]
```

**JavaScript:**
```javascript
let detailsExpanded = false;

function toggleDetails() {
  detailsExpanded = !detailsExpanded;
  document.getElementById('expandedDetails').style.display = 
    detailsExpanded ? 'block' : 'none';
  document.getElementById('toggleBtn').innerHTML = 
    detailsExpanded ? '접기 ▲' : '자세히 보기 ▼';
}
```

---

### 6. 신규등록 폼 필드 개편

**추가 필드:**

| 필드명 | 형태 | 비고 |
|--------|------|------|
| 청약시작일 | date | 상태 자동 계산용 |
| 청약마감일 | date | 상태 자동 계산용 |
| 추천대상 1줄 | text | 거주지 + 주체 |
| 추천대상 2줄 | text | 신청 자격 |
| 추천대상 3줄 | text | 추가 조건/혜택 |
| 시공사 | text | 기존 constructor 활용 |

**저장 시:**
```javascript
const extendedData = {
  subscriptionStartDate: document.getElementById('subscriptionStartDate').value,
  subscriptionEndDate: document.getElementById('subscriptionEndDate').value,
  targetAudienceLines: [
    document.getElementById('targetLine1').value,
    document.getElementById('targetLine2').value,
    document.getElementById('targetLine3').value
  ],
  ...
};
```

---

## 📋 구현 우선순위

1. **High Priority (즉시 구현)**
   - ✅ 힐스테이트 광명 데이터 수정
   - 🔄 청약 상태 자동 계산 로직 (함수 완료, 적용 필요)
   - ⏳ 분양가격 표기 통일
   - ⏳ 시공사 표시

2. **Medium Priority (중요)**
   - ⏳ 추천대상 3줄 구조
   - ⏳ 신규등록 폼 개편

3. **Low Priority (개선)**
   - ⏳ 자세히 보기 토글

---

## 🚀 다음 단계

1. 분양가격 포맷 함수 추가
2. 메인 카드에 시공사 표시
3. 메인 카드에 청약 상태 badge 표시
4. 신규등록 폼에 필드 추가
5. 테스트 및 빌드
6. 배포

---

**현재 진행 상황: 30% 완료**
