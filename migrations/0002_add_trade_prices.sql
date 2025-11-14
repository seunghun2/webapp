-- Trade prices table for storing apartment real estate transaction data
CREATE TABLE IF NOT EXISTS trade_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sigungu_code TEXT NOT NULL,
  sigungu_name TEXT NOT NULL,
  apt_name TEXT NOT NULL,
  deal_amount INTEGER NOT NULL,
  deal_year INTEGER NOT NULL,
  deal_month INTEGER NOT NULL,
  deal_day INTEGER NOT NULL,
  area REAL NOT NULL,
  floor INTEGER,
  build_year INTEGER,
  dong TEXT,
  jibun TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_trade_prices_sigungu ON trade_prices(sigungu_code);
CREATE INDEX IF NOT EXISTS idx_trade_prices_apt_name ON trade_prices(apt_name);
CREATE INDEX IF NOT EXISTS idx_trade_prices_deal_date ON trade_prices(deal_year, deal_month);
CREATE INDEX IF NOT EXISTS idx_trade_prices_area ON trade_prices(area);
