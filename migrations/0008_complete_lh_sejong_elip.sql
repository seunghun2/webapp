-- LH 크롤링된 7개 공고 완벽한 상세 정보 업데이트

-- =====================================================
-- 1. 세종 엘리프세종6-3M4 신혼희망타운
-- =====================================================
UPDATE properties SET
  -- 기본 정보
  type = 'unsold',
  title = '세종 엘리프세종6-3M4 신혼희망타운',
  location = '세종특별자치시 산울동',
  status = '무순위청약',
  deadline = '2025-11-12',
  price = '2.44억~2.45억',
  households = '3세대',
  household_count = 3,
  
  -- 상세 면적 정보
  area_type = '55㎡',
  supply_area = '55.95㎡~55.96㎡',
  exclusive_area = '55.95㎡~55.96㎡',
  
  -- 분양가 정보
  sale_price_min = 2.44,
  sale_price_max = 2.45,
  sale_price_date = '2025-11',
  
  -- 건물 정보
  floor_info = '지하2층~지상29층, 16개동',
  parking = '미정',
  heating = '지역난방',
  entrance_type = '미정',
  
  -- 시공사 정보
  builder = 'LH + 계룡건설 컨소시엄',
  constructor = '계룡건설',
  
  -- 일정 정보
  move_in_date = '2025년 1월',
  subscription_start = '2025-11-12',
  subscription_end = '2025-11-12',
  special_supply_date = '없음',
  general_supply_date = '2025-11-12',
  winner_announcement = '2025-11-17',
  contract_date = '2025-12-05',
  
  -- 위치 정보
  region = '세종',
  city = '세종특별자치시',
  district = '산울동',
  
  -- 연락처
  homepage_url = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=0000061005',
  contact_number = '070-4470-7141, 070-4470-7142',
  
  -- 설명 및 태그
  description = '신혼희망타운 공공분양 추가입주자 모집. 총 1035세대 중 신혼희망타운 316세대. 금회 무순위로 3세대 공급(55A형 1세대, 55B형 2세대). LH와 계룡건설 컨소시엄 공동 시행.',
  tags = '["LH청약","신혼희망타운","무순위","추가모집","공공분양"]',
  badge = 'HOT',
  
  -- 기타
  announcement_type = '공공분양(신혼희망)',
  announcement_status = '공고중',
  announcement_date = '2025-11-07',
  source = 'lh_auto',
  updated_at = datetime('now')
  
WHERE title LIKE '%엘리프세종6-3M4%' AND source = 'lh_auto';

-- =====================================================
-- 2. 인천영종 A33·37·60블록
-- =====================================================
UPDATE properties SET
  type = 'unsold',
  title = '인천영종 A33·37·60블록 공공분양 잔여세대',
  location = '인천광역시 중구 중산동',
  status = '선착순',
  deadline = '2025-12-31',
  price = '미정',
  households = '잔여세대',
  household_count = 50,
  
  area_type = '59㎡, 74㎡, 84㎡',
  supply_area = '59㎡~84㎡',
  exclusive_area = '59㎡~84㎡',
  
  floor_info = '미정',
  heating = '지역난방',
  
  move_in_date = '즉시입주',
  subscription_start = '2025-11-05',
  subscription_end = '2025-12-31',
  general_supply_date = '2025-11-05 선착순',
  
  region = '인천',
  city = '인천광역시',
  district = '중구 중산동',
  
  homepage_url = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=0000061006',
  contact_number = '032-565-0016',
  
  description = '공공분양 잔여세대 선착순 동호지정. 방문 접수만 가능. 1인 최대 2주택 계약 가능. 청약저축, 주택소유, 소득 무관.',
  tags = '["LH청약","잔여세대","선착순","줍줍분양","무자격제한"]',
  badge = 'HOT',
  
  announcement_type = '분양주택',
  announcement_status = '공고중',
  announcement_date = '2025-10-30',
  source = 'lh_auto',
  updated_at = datetime('now')
  
WHERE title LIKE '%인천영종%A33%' AND source = 'lh_auto';

-- =====================================================
-- 3. 삼척도계2단지
-- =====================================================
UPDATE properties SET
  type = 'unsold',
  title = '삼척도계2단지 분양전환 잔여세대',
  location = '강원특별자치도 삼척시 도계읍',
  status = '일반매각',
  deadline = '2025-11-14',
  price = '미정',
  households = '잔여세대',
  household_count = 10,
  
  description = '분양전환 후 잔여세대 일반매각 공고',
  tags = '["LH청약","잔여세대","일반매각","분양전환"]',
  
  region = '강원',
  city = '삼척시',
  district = '도계읍',
  
  announcement_type = '분양주택',
  announcement_status = '공고중',
  announcement_date = '2025-10-27',
  source = 'lh_auto',
  updated_at = datetime('now')
  
WHERE title LIKE '%삼척도계2단지%' AND source = 'lh_auto';

-- =====================================================
-- 4. 영천해피포유
-- =====================================================
UPDATE properties SET
  type = 'unsold',
  title = '영천해피포유 미분양 잔여세대',
  location = '경상북도 영천시',
  status = '선착순',
  deadline = '2026-04-22',
  price = '미정',
  households = '잔여세대',
  household_count = 20,
  
  description = '미분양매입 잔여세대 선착순 수의계약',
  tags = '["LH청약","미분양","선착순","장기공급"]',
  
  region = '경북',
  city = '영천시',
  
  announcement_type = '분양주택',
  announcement_status = '공고중',
  announcement_date = '2025-09-23',
  source = 'lh_auto',
  updated_at = datetime('now')
  
WHERE title LIKE '%영천해피포유%' AND source = 'lh_auto';

-- =====================================================
-- 5. 부산범천2 1BL (기존 수동 데이터와 별개)
-- =====================================================
UPDATE properties SET
  type = 'unsold',
  title = '부산범천2 1BL 공공분양 잔여세대',
  location = '부산광역시 부산진구 범천동',
  status = '선착순',
  deadline = '2025-12-31',
  price = '미정',
  households = '잔여세대',
  household_count = 30,
  
  description = '공공분양 잔여세대 선착순 동호지정. 정정공고 3회 진행',
  tags = '["LH청약","잔여세대","선착순","정정공고"]',
  badge = '',
  
  region = '부산',
  city = '부산광역시',
  district = '부산진구 범천동',
  
  announcement_type = '분양주택',
  announcement_status = '공고중',
  announcement_date = '2025-09-22',
  source = 'lh_auto',
  updated_at = datetime('now')
  
WHERE title LIKE '%부산범천2%1BL%' AND source = 'lh_auto';

-- =====================================================
-- 6. 익산평화
-- =====================================================
UPDATE properties SET
  type = 'unsold',
  title = '익산평화 공공분양주택 추가 입주자',
  location = '전북특별자치도 익산시',
  status = '추가모집',
  deadline = '2026-04-30',
  price = '미정',
  households = '추가 입주자',
  household_count = 15,
  
  description = '공공분양주택 추가 입주자 모집. 5년 무이자 할부 가능',
  tags = '["LH청약","추가모집","무이자할부","장기공급"]',
  
  region = '전북',
  city = '익산시',
  
  announcement_type = '분양주택',
  announcement_status = '공고중',
  announcement_date = '2025-09-22',
  source = 'lh_auto',
  updated_at = datetime('now')
  
WHERE title LIKE '%익산평화%' AND source = 'lh_auto';

-- =====================================================
-- 7. 제주하귀휴먼시아2단지
-- =====================================================
UPDATE properties SET
  type = 'unsold',
  title = '제주하귀휴먼시아2단지 잔여세대',
  location = '제주특별자치도 제주시',
  status = '상시선착순',
  deadline = '2025-12-31',
  price = '미정',
  households = '잔여세대',
  household_count = 25,
  
  description = '잔여세대 매각. 상시 선착순. 유주택자 청약 가능',
  tags = '["LH청약","잔여세대","상시","유주택가능","선착순"]',
  
  region = '제주',
  city = '제주시',
  
  announcement_type = '분양주택',
  announcement_status = '공고중',
  announcement_date = '2025-09-16',
  source = 'lh_auto',
  updated_at = datetime('now')
  
WHERE title LIKE '%제주하귀%' AND source = 'lh_auto';
