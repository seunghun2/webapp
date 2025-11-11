-- Add extended_data column to store comprehensive property information
ALTER TABLE properties ADD COLUMN extended_data TEXT DEFAULT '{}';

-- Update existing properties to have valid JSON in extended_data
UPDATE properties SET extended_data = '{}' WHERE extended_data IS NULL OR extended_data = '';
