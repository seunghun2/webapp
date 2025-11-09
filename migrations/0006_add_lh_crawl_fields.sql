-- Add LH crawling related fields
ALTER TABLE properties ADD COLUMN lh_announcement_id TEXT DEFAULT ''; -- LH 공고 ID
ALTER TABLE properties ADD COLUMN lh_announcement_url TEXT DEFAULT ''; -- LH 공고 URL
ALTER TABLE properties ADD COLUMN lh_pdf_url TEXT DEFAULT ''; -- LH PDF URL
ALTER TABLE properties ADD COLUMN announcement_type TEXT DEFAULT ''; -- 공고 유형 (공공분양, 분양주택 등)
ALTER TABLE properties ADD COLUMN announcement_status TEXT DEFAULT ''; -- 공고상태 (공고중, 접수중 등)
ALTER TABLE properties ADD COLUMN announcement_date TEXT DEFAULT ''; -- 게시일
ALTER TABLE properties ADD COLUMN view_count INTEGER DEFAULT 0; -- 조회수
ALTER TABLE properties ADD COLUMN last_crawled_at DATETIME DEFAULT NULL; -- 마지막 크롤링 시각
ALTER TABLE properties ADD COLUMN source TEXT DEFAULT 'manual'; -- 데이터 출처 (manual, lh_auto, sh_auto 등)

-- Create index for LH announcement ID
CREATE INDEX IF NOT EXISTS idx_properties_lh_id ON properties(lh_announcement_id);
CREATE INDEX IF NOT EXISTS idx_properties_source ON properties(source);
