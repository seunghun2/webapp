-- Add email and password columns for email login
ALTER TABLE users ADD COLUMN password TEXT;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Update existing users to have email login capability
-- (existing users from kakao/naver will have NULL password until they set one)
