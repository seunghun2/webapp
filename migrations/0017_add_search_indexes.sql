-- Add indexes for search performance optimization
CREATE INDEX IF NOT EXISTS idx_properties_title ON properties(title);
CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(location);
CREATE INDEX IF NOT EXISTS idx_properties_deadline ON properties(deadline);
CREATE INDEX IF NOT EXISTS idx_properties_deleted_at ON properties(deleted_at);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
