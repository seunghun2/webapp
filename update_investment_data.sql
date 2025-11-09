-- Update properties with investment and detailed information

-- 시흥센트럴 푸르지오
UPDATE properties SET 
  full_address = '경기도 시흥시 정왕동 2177-1',
  lat = 37.3456,
  lng = 126.7380,
  original_price = 3.2,
  recent_trade_price = 4.5,
  expected_margin = 1.3,
  margin_rate = 40.6,
  lh_notice_url = 'https://www.lh.or.kr/notice/12345',
  pdf_url = 'https://www.lh.or.kr/files/siheung_prugio.pdf',
  infrastructure = '{"education": ["정왕초등학교 300m", "시흥중학교 800m"], "shopping": ["이마트 500m", "정왕시장 200m"], "medical": ["시흥시청병원 1km"], "park": ["정왕공원 400m"]}',
  education = '정왕초등학교 300m, 시흥중학교 800m',
  shopping = '이마트 시흥점 500m, 정왕시장 200m',
  medical = '시흥시청병원 1km',
  park = '정왕공원 400m',
  developer_company = 'GS건설',
  registration_method = '인터넷 청약 (LH 청약센터)',
  eligibility = '무주택 세대주, 청약통장 가입 6개월 이상',
  priority_info = '생애최초 특별공급 20%, 다자녀 20%'
WHERE id = 1;

-- 하남 교산신도시
UPDATE properties SET 
  full_address = '경기도 하남시 교산동 620',
  lat = 37.5423,
  lng = 127.2156,
  original_price = 5.1,
  recent_trade_price = 7.8,
  expected_margin = 2.7,
  margin_rate = 52.9,
  lh_notice_url = 'https://www.lh.or.kr/notice/67890',
  pdf_url = 'https://www.lh.or.kr/files/hanam_kyosan.pdf',
  infrastructure = '{"education": ["교산초 500m", "교산중 1km", "하남고 1.5km"], "shopping": ["스타필드하남 2km", "교산마켓 300m"], "medical": ["하남성심병원 2km"], "park": ["교산공원 300m", "중앙공원 800m"]}',
  education = '교산초등학교 500m, 교산중학교 1km, 하남고등학교 1.5km',
  shopping = '스타필드 하남 2km, 교산마켓 300m',
  medical = '하남성심병원 2km',
  park = '교산공원 300m, 중앙공원 800m',
  developer_company = '현대건설',
  registration_method = '인터넷 청약 (LH 청약센터)',
  eligibility = '무주택 세대주, 청약통장 가입 24개월 이상, 예치금 충족',
  priority_info = '신혼부부 특별공급 20%, 생애최초 15%, 다자녀 10%'
WHERE id = 6;

-- 인천 검단신도시
UPDATE properties SET 
  full_address = '인천광역시 서구 검단동 A7블록',
  lat = 37.5989,
  lng = 126.6745,
  original_price = 2.8,
  recent_trade_price = 3.9,
  expected_margin = 1.1,
  margin_rate = 39.3,
  lh_notice_url = 'https://www.lh.or.kr/notice/11122',
  pdf_url = 'https://www.lh.or.kr/files/incheon_geomdan.pdf',
  infrastructure = '{"education": ["검단초 400m", "검단중 800m"], "shopping": ["검단프리미엄아울렛 1km"], "medical": ["검단병원 500m"], "park": ["중앙공원 200m"]}',
  education = '검단초등학교 400m, 검단중학교 800m',
  shopping = '검단 프리미엄아울렛 1km',
  medical = '검단병원 500m',
  park = '검단 중앙공원 200m',
  developer_company = '대림산업',
  registration_method = '인터넷 청약 (LH 청약센터)',
  eligibility = '무주택 세대주, 청약통장 가입 6개월 이상',
  priority_info = '생애최초 특별공급 25%, 신혼부부 20%'
WHERE id = 2;

-- 김포 한강신도시
UPDATE properties SET 
  full_address = '경기도 김포시 한강신도시 B12블록',
  lat = 37.6156,
  lng = 126.7156,
  original_price = 4.5,
  recent_trade_price = 6.2,
  expected_margin = 1.7,
  margin_rate = 37.8,
  lh_notice_url = 'https://www.lh.or.kr/notice/22334',
  pdf_url = 'https://www.lh.or.kr/files/gimpo_hangang.pdf',
  infrastructure = '{"education": ["한강초 400m", "김포중 1km"], "shopping": ["롯데마트 1km", "한강센트럴시티 500m"], "medical": ["김포한강병원 800m"], "park": ["한강중앙공원 500m"]}',
  education = '한강초등학교 400m, 김포중학교 1km',
  shopping = '롯데마트 1km, 한강센트럴시티 500m',
  medical = '김포한강병원 800m',
  park = '한강중앙공원 500m',
  developer_company = '대우건설',
  registration_method = '인터넷 청약 (SH 청약센터)',
  eligibility = '무주택 세대주, 청약통장 가입 12개월 이상',
  priority_info = '신혼부부 특별공급 30%, 생애최초 20%'
WHERE id = 9;
