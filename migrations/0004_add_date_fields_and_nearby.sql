-- Migration: Add date fields and nearby apartment info
-- Created: 2025-11-09

-- Add date fields for sale price and recent trade
ALTER TABLE properties ADD COLUMN sale_price_date DATE DEFAULT NULL;
ALTER TABLE properties ADD COLUMN recent_trade_date DATE DEFAULT NULL;

-- Add price increase calculation fields
ALTER TABLE properties ADD COLUMN price_increase_amount REAL DEFAULT 0;
ALTER TABLE properties ADD COLUMN price_increase_rate REAL DEFAULT 0;

-- Add nearby apartment information (JSON format)
-- Structure: [{"name": "아파트명", "distance": "500m", "recent_price": 5.2, "date": "2025-10-15"}]
ALTER TABLE properties ADD COLUMN nearby_apartments TEXT DEFAULT '[]';

-- Add last updated timestamp for auto-update tracking
ALTER TABLE properties ADD COLUMN last_price_update DATETIME DEFAULT NULL;

-- Add region code for API queries (시군구 코드)
ALTER TABLE properties ADD COLUMN sigungu_code TEXT DEFAULT '';

-- Add apartment name for API matching
ALTER TABLE properties ADD COLUMN apartment_name TEXT DEFAULT '';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_last_price_update ON properties(last_price_update);
CREATE INDEX IF NOT EXISTS idx_sigungu_code ON properties(sigungu_code);
