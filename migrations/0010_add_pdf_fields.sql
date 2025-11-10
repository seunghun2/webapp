-- =====================================================
-- PDF 파싱을 위한 추가 필드
-- 전용면적 범위, 임대보증금, 청약일정 등
-- 
-- 이미 존재하는 컬럼:
-- - pdf_url (cid: 48)
-- - builder (cid: 21)
-- - exclusive_area (cid: 16)
-- =====================================================

-- 1. 전용면적 범위 (예: "25㎡~44㎡")
ALTER TABLE properties ADD COLUMN exclusive_area_range TEXT;

-- 2. 임대보증금 범위 (예: "1,314만원~4,348만원")
ALTER TABLE properties ADD COLUMN rental_deposit_range TEXT;
ALTER TABLE properties ADD COLUMN rental_deposit_min REAL;
ALTER TABLE properties ADD COLUMN rental_deposit_max REAL;

-- 3. 청약일정 상세 (JSON 형태로 저장)
ALTER TABLE properties ADD COLUMN subscription_schedule_detail TEXT;

-- 4. 무순위 청약일
ALTER TABLE properties ADD COLUMN no_rank_date TEXT;

-- 5. 1순위 청약일
ALTER TABLE properties ADD COLUMN first_rank_date TEXT;

-- 6. PDF 파싱 완료 여부
ALTER TABLE properties ADD COLUMN pdf_parsed BOOLEAN DEFAULT 0;

-- 7. PDF 파싱 일시
ALTER TABLE properties ADD COLUMN pdf_parsed_at TEXT;

-- 8. PDF 원본 텍스트 (디버깅용, 최대 10KB로 제한)
ALTER TABLE properties ADD COLUMN pdf_raw_text TEXT;
