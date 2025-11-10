-- Fix kakao_id to be nullable for multi-provider support
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Step 1: Create new table with correct schema
CREATE TABLE IF NOT EXISTS users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kakao_id TEXT UNIQUE,
  naver_id TEXT UNIQUE,
  nickname TEXT,
  profile_image TEXT,
  email TEXT,
  phone_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  login_provider TEXT DEFAULT 'kakao'
);

-- Step 2: Copy existing data
INSERT INTO users_new (id, kakao_id, nickname, profile_image, email, phone_number, created_at, updated_at, last_login, login_provider)
SELECT id, kakao_id, nickname, profile_image, email, phone_number, created_at, updated_at, last_login, COALESCE(login_provider, 'kakao')
FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table to users
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_kakao_id ON users(kakao_id);
CREATE INDEX IF NOT EXISTS idx_users_naver_id ON users(naver_id);
