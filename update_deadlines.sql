-- 기존 데이터의 마감일을 미래 날짜로 업데이트 (테스트용)
-- 현재 날짜: 2025-01-09 기준

-- 줍줍분양 데이터 (unsold) - 1~3개월 후로 분산
UPDATE properties SET deadline = '2025-02-15' WHERE id = 1;  -- 시흥센트럴
UPDATE properties SET deadline = '2025-02-20' WHERE id = 2;  -- 김포한강
UPDATE properties SET deadline = '2025-03-10' WHERE id = 3;  -- 인천검단
UPDATE properties SET deadline = '2025-03-15' WHERE id = 4;  -- 인천서구
UPDATE properties SET deadline = '2025-04-05' WHERE id = 5;  -- 시흥은계
UPDATE properties SET deadline = '2025-04-12' WHERE id = 6;  -- 하남교산
UPDATE properties SET deadline = '2025-02-28' WHERE id = 7;  -- 부천상동
UPDATE properties SET deadline = '2025-03-20' WHERE id = 8;  -- 안양동안
UPDATE properties SET deadline = '2025-04-18' WHERE id = 9;  -- 광명소하
UPDATE properties SET deadline = '2025-02-25' WHERE id = 10; -- 고양삼송
UPDATE properties SET deadline = '2025-03-25' WHERE id = 11; -- 성남분당
UPDATE properties SET deadline = '2025-04-20' WHERE id = 12; -- 용인수지
UPDATE properties SET deadline = '2025-02-18' WHERE id = 13; -- 화성동탄
UPDATE properties SET deadline = '2025-03-12' WHERE id = 14; -- 평택고덕
UPDATE properties SET deadline = '2025-04-08' WHERE id = 15; -- 오산세교
UPDATE properties SET deadline = '2025-03-05' WHERE id = 16; -- 수원영통
UPDATE properties SET deadline = '2025-03-28' WHERE id = 17; -- 안산단원
UPDATE properties SET deadline = '2025-04-15' WHERE id = 18; -- 의왕청계

-- 모집중 데이터 (johab) - 2주~1개월 후
UPDATE properties SET deadline = '2025-01-23' WHERE id = 19; -- 광명역
UPDATE properties SET deadline = '2025-01-30' WHERE id = 20; -- 과천지식
UPDATE properties SET deadline = '2025-02-06' WHERE id = 21; -- 하남교산

-- 분양예정 데이터 (next) - 1~2개월 후
UPDATE properties SET deadline = '2025-02-10' WHERE id = 22; -- 인천청라
UPDATE properties SET deadline = '2025-02-17' WHERE id = 23; -- 부천대장
UPDATE properties SET deadline = '2025-03-03' WHERE id = 24; -- 김포한강2
UPDATE properties SET deadline = '2025-03-08' WHERE id = 25; -- 파주운정

SELECT 'Updated ' || COUNT(*) || ' properties with future deadlines' as result FROM properties;
