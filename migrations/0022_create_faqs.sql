-- Create FAQ table
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL, -- 카테고리 (예: 청약정보, 당첨확률, 특별공급 등)
  question TEXT NOT NULL, -- 질문
  answer TEXT NOT NULL, -- 답변
  display_order INTEGER DEFAULT 0, -- 표시 순서 (낮을수록 먼저 표시)
  is_published BOOLEAN DEFAULT 1, -- 공개 여부 (1=공개, 0=비공개)
  view_count INTEGER DEFAULT 0, -- 조회수
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for category and display order
CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category);
CREATE INDEX IF NOT EXISTS idx_faqs_display_order ON faqs(display_order);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON faqs(is_published);
