-- =====================================================
-- LH 7개 단지 실거래가 정보 업데이트
-- 2024년 기준 최근 실거래가 및 시세 정보
-- =====================================================

-- 1. 세종 엘리프세종6-3M4 신혼희망타운
-- 실거래가: 분양권 2.8억~4.2억 (2024년 11-12월 기준)
UPDATE properties SET
  recent_trade_price = 3.5,
  recent_trade_date = '2024-12',
  description = '신혼희망타운 공공분양 추가입주자 모집. 총 1035세대 중 신혼희망타운 316세대. 금회 무순위로 3세대 공급(55A형 1세대, 55B형 2세대). LH와 계룡건설 컨소시엄 공동 시행. 2024년 12월 기준 55㎡ 분양권 실거래가 약 2.8억~3.2억원대, 74㎡는 4.2억원대에 거래되고 있음.',
  updated_at = datetime('now')
WHERE id = 13 AND source = 'lh_auto';

-- 2. 인천영종 A33·37·60블록 공공분양 잔여세대
-- 84㎡ 기준 3억원대 분양가, 전용 59㎡~84㎡
UPDATE properties SET
  recent_trade_price = 3.5,
  recent_trade_date = '2024-08',
  price = '3.0억~3.8억',
  sale_price_min = 3.0,
  sale_price_max = 3.8,
  sale_price_date = '2024-08',
  description = '공공분양 잔여세대 선착순 동·호 지정. 방문 접수만 가능. 1인 최대 2주택 계약 가능. 청약저축, 주택소유, 소득 무관. 전용 84㎡ 기준 3억원대 분양가로 공급. 분양가 상한제 적용으로 시세 대비 가격 경쟁력 우수. 계약금 1,000만원. 공항철도 영종역 생활권.',
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
-- 59㎡ 분양가 약 2.8억원 (프리미엄 1천만원 포함)
UPDATE properties SET
  recent_trade_price = 2.8,
  recent_trade_date = '2024-10',
  price = '2.7억~2.9억',
  sale_price_min = 2.7,
  sale_price_max = 2.9,
  sale_price_date = '2024-10',
  area_type = '59㎡',
  supply_area = '59㎡',
  exclusive_area = '59㎡',
  description = '공공분양 잔여세대 무순위 청약. 부산 범천동 생활권, 부산진구 위치. 59B 기준 분양권 프리미엄 약 1,000만원. 현재 금액대 약 2억 8,000만원 수준. LH센트럴힐 브랜드. 범천동 생활 인프라 양호.',
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
-- 2010년 준공, 246세대, 실거래가 4.2억~4.5억 (34평 기준, 2024년)
UPDATE properties SET
  recent_trade_price = 4.4,
  recent_trade_date = '2024-05',
  price = '4.2억~4.5억',
  sale_price_min = 4.2,
  sale_price_max = 4.5,
  sale_price_date = '2024-05',
  area_type = '34평',
  supply_area = '112㎡',
  exclusive_area = '84.85㎡',
  description = '공공임대 분양전환 잔여세대. 2010년 준공 단지로 입주 완료. 246세대 규모, 12층 높이. 제주시 애월읍 하귀리 위치. 34평형 실거래가 약 4.2억~4.5억원대 (2024년 기준). 제주 지역 특성상 높은 가격대 형성. 하귀일초, 귀일중 학군.',
  updated_at = datetime('now')
WHERE id = 19 AND source = 'lh_auto';
