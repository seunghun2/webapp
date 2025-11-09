-- 엘리프세종6-3 M4 신혼희망타운 추가

INSERT INTO properties (
  type, title, location, status, deadline,
  price, households, tags, badge, description,
  area_type, supply_area, exclusive_area,
  floor_info, parking, heating, entrance_type,
  builder, constructor, move_in_date,
  subscription_start, subscription_end,
  winner_announcement, contract_date,
  sale_price_min, sale_price_max,
  region, city, district, household_count,
  full_address, lat, lng,
  original_price, recent_trade_price,
  expected_margin, margin_rate,
  lh_notice_url, pdf_url,
  created_at, updated_at
) VALUES (
  'unsold',  -- 줍줍분양
  '엘리프세종 6-3 신혼희망타운',
  '세종',
  '추가입주자 모집중',
  '2025-11-12',  -- 청약 접수일
  '2억 4천만원~2억 5천만원',
  '3세대',  -- 55A 1세대, 55B 2세대
  '["신혼희망타운","공공분양","LH"]',
  'HOT',
  '802동 401호(59A), 805동 301호·1101호(59B) 총 3세대',
  '55㎡(59A, 59B)',
  '55.9600㎡(59A), 55.9500㎡(59B)',
  '55㎡',
  '지상 8층~11층',
  '세대당 1.0대',
  '지역난방',
  '계단식',
  '계룡건설',
  '계룡건설',
  '2026년 2월 (예정)',
  '2025-11-12',
  '2025-11-12',
  '2025-11-17',
  '2025-12-05',
  2.4,  -- 59B 최소
  2.5,  -- 59B 최대
  '세종',
  '세종특별자치시',
  '산울동',
  1035,  -- 전체 세대수
  '세종특별자치시 산울동 산7 (산울7로 10)',
  36.4800,  -- 세종시 좌표 (대략)
  127.2890,
  2.4,  -- 분양가
  0,    -- 실거래가 정보 없음 (신규)
  0,    -- 예상 마진 정보 없음
  0,    -- 마진률 정보 없음
  '',
  'https://page.gensparksite.com/get_upload_url/4e7666d0111d8755399e9e61de665808857562a91fda3a0ff4dd5a631e2abff4/default/d6a35788-1b62-4362-8781-10756a291737',
  datetime('now'),
  datetime('now')
);

SELECT '✅ 엘리프세종 6-3 신혼희망타운 데이터 입력 완료' as result;
