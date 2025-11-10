-- Add user status and deletion tracking
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'; -- 'active', 'inactive', 'deleted'
ALTER TABLE users ADD COLUMN deleted_at DATETIME;
ALTER TABLE users ADD COLUMN deletion_reason TEXT;

-- Add profile fields
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
