-- Add brochure URL field for displaying detailed property information
-- 팸플릿 URL 필드 추가 (상세 정보 이미지 표시용)

ALTER TABLE properties ADD COLUMN brochure_url TEXT;
