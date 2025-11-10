-- Add naver_id column to users table
ALTER TABLE users ADD COLUMN naver_id TEXT;

-- Make kakao_id nullable since users can login with either Kakao or Naver
-- Note: SQLite doesn't support modifying column constraints directly
-- So we'll handle the uniqueness at application level

-- Create index for naver_id
CREATE INDEX IF NOT EXISTS idx_users_naver_id ON users(naver_id);

-- Add login_provider column to track which service the user used
ALTER TABLE users ADD COLUMN login_provider TEXT DEFAULT 'kakao';
