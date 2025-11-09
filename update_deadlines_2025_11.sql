-- 데이터 업데이트: 2025-11-09 기준 미래 날짜로 변경

-- 줍줍분양 데이터 (unsold) - 1~4개월 후로 분산
UPDATE properties SET deadline = '2025-12-15' WHERE id = 1;  -- 시흥센트럴
UPDATE properties SET deadline = '2025-12-20' WHERE id = 2;  -- 인천 검단신도시
UPDATE properties SET deadline = '2026-01-10' WHERE id = 3;  -- 광명 하안뉴타운
UPDATE properties SET deadline = '2026-01-15' WHERE id = 4;  -- 부천 상동 파크자이
UPDATE properties SET deadline = '2026-02-05' WHERE id = 5;  -- 안양 평촌 더샵
UPDATE properties SET deadline = '2026-02-12' WHERE id = 6;  -- (김포한강신도시로 추정)
UPDATE properties SET deadline = '2025-12-28' WHERE id = 7;  -- 
UPDATE properties SET deadline = '2026-01-20' WHERE id = 8;  -- 
UPDATE properties SET deadline = '2026-02-18' WHERE id = 9;  -- 
UPDATE properties SET deadline = '2025-12-25' WHERE id = 10; -- 
UPDATE properties SET deadline = '2026-01-25' WHERE id = 11; -- 
UPDATE properties SET deadline = '2026-02-20' WHERE id = 12; -- 
UPDATE properties SET deadline = '2025-12-18' WHERE id = 13; -- 
UPDATE properties SET deadline = '2026-01-12' WHERE id = 14; -- 
UPDATE properties SET deadline = '2026-02-08' WHERE id = 15; -- 
UPDATE properties SET deadline = '2026-01-05' WHERE id = 16; -- 
UPDATE properties SET deadline = '2026-01-28' WHERE id = 17; -- 
UPDATE properties SET deadline = '2026-02-15' WHERE id = 18; -- 

-- 모집중 데이터 (johab) - 2~4주 후
UPDATE properties SET deadline = '2025-11-23' WHERE id = 19; -- 
UPDATE properties SET deadline = '2025-11-30' WHERE id = 20; -- 
UPDATE properties SET deadline = '2025-12-06' WHERE id = 21; -- 

-- 조합원 데이터 (next) - 1~2개월 후
UPDATE properties SET deadline = '2025-12-10' WHERE id = 22; -- 
UPDATE properties SET deadline = '2025-12-17' WHERE id = 23; -- 
UPDATE properties SET deadline = '2026-01-03' WHERE id = 24; -- 
UPDATE properties SET deadline = '2026-01-08' WHERE id = 25; -- 

SELECT 'Updated ' || COUNT(*) || ' properties with future deadlines (2025-11-09 base)' as result FROM properties;
