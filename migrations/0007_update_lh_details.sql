-- LH 크롤링된 공고 상세 정보 업데이트

-- 1. 세종 엘리프세종6-3M4 신혼희망타운
UPDATE properties SET
  price = '2.1억~4.7억',
  households = '1세대',
  household_count = 1,
  area_type = '46㎡, 55㎡, 59㎡, 74㎡, 84㎡',
  supply_area = '46㎡~84㎡',
  move_in_date = '2025년 1월',
  sale_price_min = 2.1,
  sale_price_max = 4.7,
  description = '신혼희망타운 추가 입주자 모집. 총 1035세대 중 신혼희망타운 316세대',
  tags = '["LH청약","신혼희망타운","추가모집"]'
WHERE title LIKE '%엘리프세종6-3M4%' AND source = 'lh_auto';

-- 2. 인천영종 A33·37·60블록
UPDATE properties SET
  price = '미정',
  households = '잔여세대',
  household_count = 0,
  description = '공공분양 잔여세대 선착순 동호지정',
  tags = '["LH청약","잔여세대","선착순"]'
WHERE title LIKE '%인천영종%A33%' AND source = 'lh_auto';

-- 3. 삼척도계2단지
UPDATE properties SET
  price = '미정',
  households = '잔여세대',
  household_count = 0,
  description = '분양전환 후 잔여세대 일반매각',
  tags = '["LH청약","잔여세대","일반매각"]'
WHERE title LIKE '%삼척도계2단지%' AND source = 'lh_auto';

-- 4. 영천해피포유
UPDATE properties SET
  price = '미정',
  households = '잔여세대',
  household_count = 0,
  description = '미분양매입 잔여세대 선착순 수의계약',
  tags = '["LH청약","미분양","선착순"]',
  deadline = '2026-04-22'
WHERE title LIKE '%영천해피포유%' AND source = 'lh_auto';

-- 5. 부산범천2 1BL (기존 수동 데이터 유지, LH 자동 크롤링 데이터만 업데이트)
UPDATE properties SET
  description = '공공분양 잔여세대 선착순 동호지정. 정정공고 3회',
  tags = '["LH청약","잔여세대","선착순","정정공고"]'
WHERE title LIKE '%부산범천2%1BL%' AND source = 'lh_auto';

-- 6. 익산평화
UPDATE properties SET
  price = '미정',
  households = '추가 입주자',
  household_count = 0,
  description = '공공분양주택 추가 입주자모집. 5년 무이자할부',
  tags = '["LH청약","추가모집","무이자할부"]',
  deadline = '2026-04-30'
WHERE title LIKE '%익산평화%' AND source = 'lh_auto';

-- 7. 제주하귀휴먼시아2단지
UPDATE properties SET
  price = '미정',
  households = '잔여세대',
  household_count = 0,
  description = '잔여세대 매각. 상시 선착순 유주택자 가능',
  tags = '["LH청약","잔여세대","상시","유주택가능"]',
  deadline = '2025-12-31'
WHERE title LIKE '%제주하귀%' AND source = 'lh_auto';

-- 8. 행정중심복합도시 첫마을 4,5,6단지 (누락됐던 공고)
UPDATE properties SET
  price = '미정',
  households = '공가주택',
  household_count = 0,
  description = '공가주택 일반매각. 순번추첨 동호지정',
  tags = '["LH청약","공가주택","일반매각"]'
WHERE title LIKE '%첫마을%4,5,6단지%' AND source = 'lh_auto';
