-- Properties table for storing bunyang (분양) information
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'unsold', 'today', 'johab', 'next'
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL,
  deadline DATE NOT NULL,
  price TEXT NOT NULL,
  households TEXT NOT NULL,
  tags TEXT NOT NULL, -- JSON string array
  badge TEXT DEFAULT '', -- 'NEW', 'HOT', or empty
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(type);
CREATE INDEX IF NOT EXISTS idx_properties_deadline ON properties(deadline);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at);

-- User interests table for tracking user property interests
CREATE TABLE IF NOT EXISTS user_interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  property_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

CREATE INDEX IF NOT EXISTS idx_user_interests_user_id ON user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_property_id ON user_interests(property_id);
