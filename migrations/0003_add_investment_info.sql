-- Add investment and detailed information fields
ALTER TABLE properties ADD COLUMN full_address TEXT DEFAULT ''; -- 상세 주소
ALTER TABLE properties ADD COLUMN lat REAL DEFAULT 0; -- 위도
ALTER TABLE properties ADD COLUMN lng REAL DEFAULT 0; -- 경도
ALTER TABLE properties ADD COLUMN original_price REAL DEFAULT 0; -- 분양 당시 가격 (억)
ALTER TABLE properties ADD COLUMN recent_trade_price REAL DEFAULT 0; -- 최근 실거래가 (억)
ALTER TABLE properties ADD COLUMN expected_margin REAL DEFAULT 0; -- 예상 마진 (억)
ALTER TABLE properties ADD COLUMN margin_rate REAL DEFAULT 0; -- 마진률 (%)
ALTER TABLE properties ADD COLUMN lh_notice_url TEXT DEFAULT ''; -- LH 공고 URL
ALTER TABLE properties ADD COLUMN pdf_url TEXT DEFAULT ''; -- PDF 다운로드 URL
ALTER TABLE properties ADD COLUMN infrastructure TEXT DEFAULT ''; -- 주변 인프라 (JSON)
ALTER TABLE properties ADD COLUMN education TEXT DEFAULT ''; -- 교육 시설
ALTER TABLE properties ADD COLUMN shopping TEXT DEFAULT ''; -- 쇼핑 시설
ALTER TABLE properties ADD COLUMN medical TEXT DEFAULT ''; -- 병원
ALTER TABLE properties ADD COLUMN park TEXT DEFAULT ''; -- 공원/녹지
ALTER TABLE properties ADD COLUMN developer_company TEXT DEFAULT ''; -- 시행사
ALTER TABLE properties ADD COLUMN registration_method TEXT DEFAULT ''; -- 등록 방법
ALTER TABLE properties ADD COLUMN eligibility TEXT DEFAULT ''; -- 자격 요건
ALTER TABLE properties ADD COLUMN priority_info TEXT DEFAULT ''; -- 우선순위 정보
