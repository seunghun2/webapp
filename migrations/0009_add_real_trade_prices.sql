-- =====================================================
-- LH 7개 단지 실거래가 정보 업데이트
-- 2024년 기준 최근 실거래가 및 시세 정보
-- =====================================================

-- 1. 세종 엘리프세종6-3M4 신혼희망타운
-- 최신 실거래가: 55㎡ 기준 2024년 11월 최고가 3억 4,367만원
UPDATE properties SET
  recent_trade_price = 3.44,
  recent_trade_date = '2024-11',
  description = '신혼희망타운 공공분양 추가입주자 모집. 총 1035세대 중 신혼희망타운 316세대. 2025년 1월 입주. 금회 무순위로 3세대 공급(55A형 1세대, 55B형 2세대). LH와 계룡건설 컨소시엄 공동 시행. 55㎡ 기준 2024년 11월 실거래가 최고 3.44억원, 최저 2.82억원 거래.',
  updated_at = datetime('now')
WHERE id = 13 AND source = 'lh_auto';

-- 2. 인천영종 A33·37·60블록 공공분양 잔여세대
-- 2025년 11월 기준 계속 공급 중 (2025.10.30 공고, 2025.11.07 잔여동호 공개)
UPDATE properties SET
  recent_trade_price = 3.8,
  recent_trade_date = '2025-07',
  price = '3.0억~3.8억',
  sale_price_min = 3.0,
  sale_price_max = 3.8,
  sale_price_date = '2025-07',
  description = '공공분양 잔여세대 선착순 동·호 지정. 방문 접수만 가능. 1인 최대 2주택 계약 가능. 청약저축, 주택소유, 소득 무관. 전용 84㎡ 기준 3억원대 분양가로 공급. 분양가 상한제 적용으로 시세 대비 가격 경쟁력 우수. 계약금 1,000만원. 공항철도 영종역 생활권. 2025년 10월 재공고로 계속 공급 중.',
  updated_at = datetime('now')
WHERE id = 14 AND source = 'lh_auto';

-- 3. 삼척도계2단지 분양전환 잔여세대
-- 2016년 준공, 280세대, 실거래가 1.5억~4.5억 (평형별 차이)
UPDATE properties SET
  recent_trade_price = 2.5,
  recent_trade_date = '2024-03',
  price = '1.5억~4.5억',
  sale_price_min = 1.5,
  sale_price_max = 4.5,
  sale_price_date = '2024-03',
  area_type = '32평, 36평',
  supply_area = '106㎡, 119㎡',
  exclusive_area = '85㎡, 95㎡',
  description = '공공임대 분양전환 잔여세대. 2016년 준공 단지로 입주 완료. 280세대 규모, 15층 높이. 32평형 약 1.5억~2.5억, 36평형 약 3.5억~4.5억대 실거래가 형성. 강원 산간 지역 특성상 저렴한 가격대.',
  updated_at = datetime('now')
WHERE id = 15 AND source = 'lh_auto';

-- 4. 영천해피포유 미분양 잔여세대
-- 2007년 준공, 183세대, 실거래가 1.5억~1.8억 (45평 기준)
UPDATE properties SET
  recent_trade_price = 1.6,
  recent_trade_date = '2024-09',
  price = '0.8억~1.8억',
  sale_price_min = 0.8,
  sale_price_max = 1.8,
  sale_price_date = '2024-09',
  area_type = '25평, 33평, 45평',
  supply_area = '83㎡, 109㎡, 149㎡',
  exclusive_area = '66㎡, 87㎡, 119㎡',
  description = '공공분양 미분양 잔여세대. 2007년 준공 단지로 입주 완료. 183세대 규모, 14층 높이. 25평형 약 0.8억~1.0억, 33평형 약 1.2억~1.4억, 45평형 약 1.5억~1.8억대 실거래가 형성. 경북 영천시 고경면 위치로 저렴한 가격대.',
  updated_at = datetime('now')
WHERE id = 16 AND source = 'lh_auto';

-- 5. 부산범천2 1BL 공공분양 잔여세대
-- 2025년 10월 기준 범천경남 아파트 실거래가 2.35억 (78㎡)
UPDATE properties SET
  recent_trade_price = 2.35,
  recent_trade_date = '2025-10',
  price = '2.7억~3.0억',
  sale_price_min = 2.7,
  sale_price_max = 3.0,
  sale_price_date = '2024-10',
  area_type = '59㎡, 74㎡',
  supply_area = '59㎡, 74㎡',
  exclusive_area = '59㎡, 74㎡',
  description = '공공분양 잔여세대 무순위 청약. 부산 범천동 생활권, 부산진구 위치. 59A 2.66억원, 59B 2.61억원, 74A 3.0억원대 분양가. LH센트럴힐 브랜드. 범천동 생활 인프라 양호. 주변 범천경남 아파트 2025년 10월 2.35억 실거래.',
  badge = 'NEW',
  updated_at = datetime('now')
WHERE id = 17 AND source = 'lh_auto';

-- 6. 익산평화 공공분양주택 추가 입주자
-- 해약세대 추가공급, 실거래가 정보 부족 (공공분양 특성상)
UPDATE properties SET
  price = '2.0억~2.5억 (추정)',
  sale_price_min = 2.0,
  sale_price_max = 2.5,
  sale_price_date = '2024-11',
  description = '공공분양주택 해약세대 추가공급. 익산 평화지구 위치. 2024년 완공 예정. 공공분양 특성상 분양가 상한제 적용. 주거환경 개선사업 지구 내 위치. 전북 익산시 평화동 생활권.',
  updated_at = datetime('now')
WHERE id = 18 AND source = 'lh_auto';

-- 7. 제주하귀휴먼시아2단지 잔여세대
-- 2025년 7월 실거래가 4.2억원 (84.85㎡, 10층)
UPDATE properties SET
  recent_trade_price = 4.2,
  recent_trade_date = '2025-07',
  price = '4.2억~4.4억',
  sale_price_min = 4.2,
  sale_price_max = 4.4,
  sale_price_date = '2025-07',
  area_type = '34평',
  supply_area = '112㎡',
  exclusive_area = '84.85㎡',
  description = '공공임대 분양전환 잔여세대. 2010년 준공 단지로 입주 완료. 246세대 규모, 12층 높이. 제주시 애월읍 하귀리 위치. 34평형 실거래가 2025년 7월 4.2억원 (10층), 2025년 4월 4.19억원 (5층) 거래. 제주 지역 특성상 높은 가격대 유지. 하귀일초, 귀일중 학군.',
  updated_at = datetime('now')
WHERE id = 19 AND source = 'lh_auto';
