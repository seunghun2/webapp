-- ✅ LOCAL TEST DATA - Simple seed for testing
-- Date: 2025-11-15
-- Total properties: 6 (2 rental + 2 subscription + 2 unsold)

DELETE FROM properties;

-- ====================
-- 1-2. RENTAL (임대) - 2 properties
-- ====================

-- 1. [임대] 서울 강남 행복주택
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, price_label)
VALUES ('rental', '서울 강남 행복주택', '서울특별시 강남구', '모집중', '2025-12-31', '보증금 3,000만원 / 월 30만원', '100세대', '["행복주택","역세권","신혼부부","청년"]', 
'강남역 도보 5분 거리 행복주택입니다. 신혼부부, 청년, 사회초년생을 위한 임대주택으로 저렴한 임대료가 특징입니다. 지하철 2호선, 신분당선 환승 가능하며 주변 편의시설이 우수합니다.', 
'26㎡, 36㎡, 46㎡', 'LH 한국토지주택공사', '2026-03-01', 0.03, 0.05, '서울', 100, '서울특별시 강남구 테헤란로 123', '임대보증금');

-- 2. [임대] 부산 해운대 국민임대
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, price_label)
VALUES ('rental', '부산 해운대 국민임대', '부산광역시 해운대구', '모집중', '2025-11-30', '보증금 2,000만원 / 월 20만원', '80세대', '["국민임대","해변근처","저렴한임대료"]', 
'해운대 해수욕장 인근 국민임대주택입니다. 바다 조망이 가능하며 관광지와 가까워 생활 편의성이 우수합니다. 저소득층 및 신혼부부 우선 공급됩니다.', 
'36㎡, 46㎡', 'LH 한국토지주택공사', '2026-02-01', 0.02, 0.04, '부산', 80, '부산광역시 해운대구 해운대로 456', '임대보증금');

-- ====================
-- 3-4. GENERAL (청약/일반분양) - 2 properties
-- ====================

-- 3. [청약] 인천 송도 센트럴파크 자이
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, price_label)
VALUES ('general', '인천 송도 센트럴파크 자이', '인천광역시 연수구', '청약접수중', '2025-12-15', '5억~8억', '800세대', '["브랜드아파트","역세권","센트럴파크","프리미엄"]', 
'송도 센트럴파크 프리미엄 입지의 자이 브랜드 아파트입니다. 지하철역 도보 3분, 국제도시 송도의 핵심 상권과 공원이 인접해 있습니다. 대단지 프리미엄 커뮤니티 시설 완비.', 
'84㎡, 101㎡', 'GS건설', '2027-06-01', 5, 8, '인천', 800, '인천광역시 연수구 센트럴로 100', '분양가격');

-- 4. [청약] 경기 광교 호반써밋
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, price_label)
VALUES ('general', '경기 광교 호반써밋', '경기도 수원시 영통구', '청약접수중', '2025-12-20', '6억~10억', '600세대', '["광교신도시","학군우수","프리미엄","브랜드"]', 
'광교신도시 프리미엄 단지 호반써밋입니다. 우수한 학군과 편리한 교통, 최고급 커뮤니티 시설을 갖추었습니다. 신분당선 광교중앙역 역세권 입지입니다.', 
'84㎡, 101㎡, 114㎡', '호반건설', '2027-08-01', 6, 10, '경기', 600, '경기도 수원시 영통구 광교중앙로 200', '분양가격');

-- ====================
-- 5-6. UNSOLD (줍줍/미분양) - 2 properties
-- ====================

-- 5. [줍줍] 대전 도안 e편한세상
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, price_label, original_price, recent_trade_price, expected_margin, margin_rate, badge)
VALUES ('unsold', '🔥 대전 도안 e편한세상 줍줍', '대전광역시 서구', 'active', '2025-11-25', '3억~4.5억', '50세대', '["줍줍분양","미분양","즉시입주","가격할인"]', 
'대전 도안신도시 미분양 특가! 즉시 입주 가능한 e편한세상 브랜드 아파트입니다. 분양가 대비 최대 15% 할인가로 공급되며 잔여 물량이 많지 않아 조기 마감 예상됩니다. 도안신도시 인프라 완비, 학군 우수.', 
'84㎡', '대림산업', '즉시입주', 3, 4.5, '대전', 50, '대전광역시 서구 도안대로 300', '분양가격', 3.5, 4.0, 0.5, '14.3%', 'HOT');

-- 6. [줍줍] 세종 어진동 푸르지오
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, price_label, original_price, recent_trade_price, expected_margin, margin_rate, badge)
VALUES ('unsold', '🔥 세종 어진동 푸르지오 줍줍', '세종특별자치시', 'active', '2025-12-10', '2.5억~3.8억', '30세대', '["줍줍분양","미분양","신축","특가"]', 
'세종시 신축 미분양 매물! 푸르지오 브랜드의 준공 임박 물량입니다. 가격 경쟁력이 뛰어나며 세종시 특별공급 조건으로 빠른 입주가 가능합니다. 행정중심복합도시의 미래가치를 누리세요.', 
'74㎡, 84㎡', '대우건설', '즉시입주', 2.5, 3.8, '세종', 30, '세종특별자치시 어진동 100', '분양가격', 2.8, 3.2, 0.4, '14.3%', 'HOT');

-- ✅ Test seed complete
