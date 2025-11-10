-- Add brochure images field for storing multiple image URLs
-- 팸플릿 이미지 배열 필드 추가 (JSON 형식으로 여러 이미지 URL 저장)

ALTER TABLE properties ADD COLUMN brochure_images TEXT;
