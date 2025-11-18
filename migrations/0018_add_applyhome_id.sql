-- Add applyhome_id column for unique identification from 청약홈
-- This will be used for duplicate checking and tracking

ALTER TABLE properties ADD COLUMN applyhome_id TEXT;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_properties_applyhome_id ON properties(applyhome_id);

-- Add comment explaining the field
-- applyhome_id: 청약홈 공고번호 (data-pbno), 예: "2025000565"
