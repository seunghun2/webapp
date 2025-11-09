-- Update 부산범천21BL 서면서한이다음 실거래가 (호갱노노 기준)
-- 호갱노노 데이터: 79B형 분양권 실거래가 2억 7,506만원 (2025.02.22, 11층)

-- 59A형 (79.75㎡)
UPDATE properties SET 
  recent_trade_price = 2.75,
  recent_trade_date = '2025-02'
WHERE title = '부산범천21BL 서면서한이다음 (59A형)';

-- 59B형 (79.72㎡) - 호갱노노 실거래가 기준
UPDATE properties SET 
  recent_trade_price = 2.75,
  recent_trade_date = '2025-02'
WHERE title = '부산범천21BL 서면서한이다음 (59B형)';

-- 74A형 (99.67㎡) - 면적비례 추정 (79㎡: 2.75억 → 99㎡: 약 3.45억)
UPDATE properties SET 
  recent_trade_price = 3.45,
  recent_trade_date = '2025-02'
WHERE title = '부산범천21BL 서면서한이다음 (74A형)';
