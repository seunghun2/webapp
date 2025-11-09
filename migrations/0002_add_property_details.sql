-- Add more detailed columns to properties table
ALTER TABLE properties ADD COLUMN area_type TEXT DEFAULT ''; -- 전용면적 타입 (예: 59㎡, 84㎡)
ALTER TABLE properties ADD COLUMN supply_area TEXT DEFAULT ''; -- 공급면적
ALTER TABLE properties ADD COLUMN exclusive_area TEXT DEFAULT ''; -- 전용면적
ALTER TABLE properties ADD COLUMN floor_info TEXT DEFAULT ''; -- 층수 정보
ALTER TABLE properties ADD COLUMN parking TEXT DEFAULT ''; -- 주차대수
ALTER TABLE properties ADD COLUMN heating TEXT DEFAULT ''; -- 난방방식
ALTER TABLE properties ADD COLUMN entrance_type TEXT DEFAULT ''; -- 현관구조
ALTER TABLE properties ADD COLUMN builder TEXT DEFAULT ''; -- 시공사
ALTER TABLE properties ADD COLUMN constructor TEXT DEFAULT ''; -- 건설사
ALTER TABLE properties ADD COLUMN move_in_date TEXT DEFAULT ''; -- 입주예정일
ALTER TABLE properties ADD COLUMN subscription_start TEXT DEFAULT ''; -- 청약시작일
ALTER TABLE properties ADD COLUMN subscription_end TEXT DEFAULT ''; -- 청약마감일
ALTER TABLE properties ADD COLUMN special_supply_date TEXT DEFAULT ''; -- 특별공급일
ALTER TABLE properties ADD COLUMN general_supply_date TEXT DEFAULT ''; -- 일반공급일
ALTER TABLE properties ADD COLUMN winner_announcement TEXT DEFAULT ''; -- 당첨자발표일
ALTER TABLE properties ADD COLUMN contract_date TEXT DEFAULT ''; -- 계약일
ALTER TABLE properties ADD COLUMN sale_price_min REAL DEFAULT 0; -- 최소분양가 (숫자)
ALTER TABLE properties ADD COLUMN sale_price_max REAL DEFAULT 0; -- 최대분양가 (숫자)
ALTER TABLE properties ADD COLUMN region TEXT DEFAULT ''; -- 지역 (서울, 경기, 인천 등)
ALTER TABLE properties ADD COLUMN city TEXT DEFAULT ''; -- 시/군 (하남시, 김포시 등)
ALTER TABLE properties ADD COLUMN district TEXT DEFAULT ''; -- 구/동
ALTER TABLE properties ADD COLUMN household_count INTEGER DEFAULT 0; -- 세대수 (숫자)
ALTER TABLE properties ADD COLUMN transportation TEXT DEFAULT ''; -- 교통정보
ALTER TABLE properties ADD COLUMN nearby_facilities TEXT DEFAULT ''; -- 주변시설
ALTER TABLE properties ADD COLUMN homepage_url TEXT DEFAULT ''; -- 홈페이지 URL
ALTER TABLE properties ADD COLUMN contact_number TEXT DEFAULT ''; -- 문의전화
