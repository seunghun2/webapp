-- Add price_label column for customizable price display label
ALTER TABLE properties ADD COLUMN price_label TEXT DEFAULT '분양가격';
