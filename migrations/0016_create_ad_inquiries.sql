-- 광고 문의 테이블 생성
CREATE TABLE IF NOT EXISTS ad_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  replied_at DATETIME,
  admin_note TEXT
);

CREATE INDEX idx_ad_inquiries_status ON ad_inquiries(status);
CREATE INDEX idx_ad_inquiries_created_at ON ad_inquiries(created_at DESC);
