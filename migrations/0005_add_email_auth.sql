-- Add email authentication support
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;

-- Create index for email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
