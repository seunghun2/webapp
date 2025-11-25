-- Add soft delete column to properties table
ALTER TABLE properties ADD COLUMN deleted_at DATETIME;
