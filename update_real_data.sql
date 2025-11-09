-- 스크린샷의 실제 데이터로 업데이트

-- ID 1: 시흥센트럴 푸르지오 (unsold)
UPDATE properties SET 
  title = '시흥센트럴 푸르지오',
  location = '경기 시흥시',
  full_address = '경기도 시흥시 정왕동 2177-1 시흥센트럴 푸르지오',
  deadline = '2025-01-18',
  area_type = '59㎡, 84㎡',
  price = '3억 2천만원~',
  households = '25세대',
  move_in_date = '2026년 12월',
  heating = '개별난방(도시가스)',
  parking = '세대당 1.2대',
  builder = 'GS건설',
  constructor = 'GS건설',
  transportation = '시흥역 도보 5분, 4호선 정왕역 차량 5분',
  badge = 'NEW',
  tags = '["무순위","LH"]',
  description = '101호, 201호, 301호, 401호, 501호 ~ 총 25세대',
  sale_price_min = 3.2,
  sale_price_max = 4.8,
  original_price = 3.2,
  recent_trade_price = 4.5,
  expected_margin = 1.3,
  margin_rate = 40.6
WHERE id = 1;

-- ID 2: 인천 검단신도시 A7블록 (unsold) 
UPDATE properties SET 
  title = '인천 검단신도시 A7블록',
  location = '인천 서구',
  full_address = '인천광역시 서구 검단신도시 A7블록',
  deadline = '2025-01-20',
  area_type = '84㎡',
  price = '2억 8천만원~',
  households = '12세대',
  move_in_date = '2026년 8월',
  heating = '지역난방',
  builder = '대림산업',
  constructor = '대림산업',
  badge = '',
  tags = '["무순위","LH"]',
  description = '301호, 401호, 501호 ~ 총 12세대',
  sale_price_min = 2.8,
  sale_price_max = 3.5,
  original_price = 2.8,
  recent_trade_price = 3.8,
  expected_margin = 1.0,
  margin_rate = 35.7
WHERE id = 2;

SELECT 'Updated 2 properties with real data from screenshot' as result;
