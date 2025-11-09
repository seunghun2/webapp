-- LH 실제 공고 데이터 기반 seed data
-- 공고일: 2025년 10월~11월

-- Clear existing data
DELETE FROM properties;
DELETE FROM sqlite_sequence WHERE name='properties';

-- 1. 세종시 첫마을 4단지 - 공가 일반매각
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, builder, move_in_date, area_type, pdf_url, 
  original_price, recent_trade_price, created_at, updated_at
) VALUES (
  '세종시 첫마을 4단지',
  '세종특별자치시',
  '세종특별자치시 누리로 119 (한솔동 1226)',
  '세종/충청',
  'unsold',
  '모집중',
  '2025-11-14',
  '2.96억~3.49억',
  '20호',
  20,
  2.96,
  3.49,
  '["공개매각", "청약통장 불필요", "무주택요건無"]',
  '59㎡ 20호 일반매각. 1년 이상 세종시 거주자만 신청 가능. 순번추첨 후 동호지정.',
  'GS건설',
  '2013년 12월',
  '59㎡',
  'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do',
  3.2,
  3.8,
  datetime('now'),
  datetime('now')
);

-- 2. 세종시 첫마을 5단지 - 공가 일반매각
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, builder, move_in_date, area_type, pdf_url,
  original_price, recent_trade_price, created_at, updated_at
) VALUES (
  '세종시 첫마을 5단지',
  '세종특별자치시',
  '세종특별자치시 누리로 59 (한솔동 1045)',
  '세종/충청',
  'unsold',
  '모집중',
  '2025-11-14',
  '2.96억~5.09억',
  '22호',
  22,
  2.96,
  5.09,
  '["공개매각", "청약통장 불필요", "무주택요건無"]',
  '59㎡/84㎡ 22호 일반매각. 1년 이상 세종시 거주자만 신청 가능.',
  '대우건설',
  '2014년 03월',
  '59㎡, 84㎡',
  'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do',
  4.5,
  5.2,
  datetime('now'),
  datetime('now')
);

-- 3. 세종시 첫마을 6단지 - 공가 일반매각
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, builder, move_in_date, area_type, pdf_url,
  original_price, recent_trade_price, created_at, updated_at
) VALUES (
  '세종시 첫마을 6단지',
  '세종특별자치시',
  '세종특별자치시 누리로 28 (한솔동 974)',
  '세종/충청',
  'unsold',
  '모집중',
  '2025-11-14',
  '2.96억~5.09억',
  '26호',
  26,
  2.96,
  5.09,
  '["공개매각", "청약통장 불필요", "무주택요건無"]',
  '59㎡/84㎡ 26호 일반매각. 1년 이상 세종시 거주자만 신청 가능.',
  '현대건설',
  '2014년 05월',
  '59㎡, 84㎡',
  'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do',
  4.8,
  5.5,
  datetime('now'),
  datetime('now')
);

-- 4. 엘리프세종6-3 M4 신혼희망타운
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, created_at, updated_at
) VALUES (
  '엘리프세종 6-3 M4 신혼희망타운',
  '세종특별자치시',
  '세종특별자치시 엘리프세종6-3생활권 M4블록',
  '세종/충청',
  'johab',
  '모집중',
  '2025-11-20',
  '추후공지',
  '추가모집',
  0,
  0,
  0,
  '["신혼희망타운", "추가모집", "무주택"]',
  '신혼희망타운 추가 입주자 모집. 공고일: 2025.11.07',
  datetime('now'),
  datetime('now')
);

-- 5. 익산 제3일반산단 행복주택
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, created_at, updated_at
) VALUES (
  '익산 제3일반산단 행복주택',
  '전북특별자치도 익산시',
  '전북특별자치도 익산시 낭산면 삼기북길 178',
  '전북',
  'johab',
  '모집중',
  '2025-11-12',
  '보증금 1,314만원~',
  '200호',
  200,
  0.013,
  0.044,
  '["행복주택", "임대", "소득요건완화"]',
  '25㎡~44㎡ 총 200호. 임대보증금 1,314만원~4,348만원. 월세 7만~24만원대.',
  datetime('now'),
  datetime('now')
);

-- 6. 김제지평선 행복주택
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, created_at, updated_at
) VALUES (
  '김제지평선 행복주택',
  '전북특별자치도 김제시',
  '전북특별자치도 김제시 지평선산단2길 319',
  '전북',
  'johab',
  '모집중',
  '2025-11-12',
  '보증금 1,527만원~',
  '120호',
  120,
  0.015,
  0.040,
  '["행복주택", "임대", "소득요건완화"]',
  '26㎡~51㎡ 총 120호. 임대보증금 1,527만원~4,000만원. 월세 8만~21만원대.',
  datetime('now'),
  datetime('now')
);

-- 7. 평택 고덕 A-6블록 행복주택
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, builder, move_in_date, area_type, pdf_url, created_at, updated_at
) VALUES (
  '평택 고덕 A-6블록 행복주택',
  '경기도 평택시',
  '경기도 평택시 고덕국제대로 232 (고덕동)',
  '경기',
  'next',
  '모집중',
  '2025-11-19',
  '보증금 1,692만원~',
  '400호',
  400,
  0.017,
  0.041,
  '["행복주택", "예비입주자", "선계약후검증"]',
  '16㎡~36㎡ 평택고덕LH2단지. 임대보증금 1,692만원~4,086만원. 소득요건 완화.',
  'LH',
  '2025년 12월 예정',
  '16㎡~36㎡',
  'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do',
  datetime('now'),
  datetime('now')
);

-- 8. 평택 소사벌 A-6블록 행복주택
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, builder, move_in_date, area_type, pdf_url, created_at, updated_at
) VALUES (
  '평택 소사벌 A-6블록 행복주택',
  '경기도 평택시',
  '경기도 평택시 죽백4로 60 (죽백동 815)',
  '경기',
  'next',
  '모집중',
  '2025-11-19',
  '보증금 1,692만원~',
  '428호',
  428,
  0.017,
  0.041,
  '["행복주택", "예비입주자", "선계약후검증"]',
  '16㎡~36㎡ 428호. 임대보증금 1,692만원~4,086만원. 소득요건 완화.',
  'LH',
  '2025년 12월 예정',
  '16㎡~36㎡',
  'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do',
  datetime('now'),
  datetime('now')
);

-- 9. 남양주 가운2 국민임대
INSERT INTO properties (
  title, location, full_address, region, type, status, deadline,
  price, households, household_count, sale_price_min, sale_price_max,
  tags, description, builder, area_type, pdf_url, created_at, updated_at
) VALUES (
  '남양주 가운2 국민임대',
  '경기도 남양주시',
  '경기도 남양주시 가운로길 28 (다산동)',
  '경기',
  'next',
  '모집중',
  '2025-11-20',
  '보증금 1,862만원~',
  '예비 80명',
  80,
  0.019,
  0.037,
  '["국민임대", "예비입주자", "무주택"]',
  '36㎡~46㎡ 예비입주자 80명 모집. 임대보증금 1,862만원~3,697만원. 월세 21만~30만원대.',
  'LH',
  '36㎡, 46㎡',
  'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do',
  datetime('now'),
  datetime('now')
);
