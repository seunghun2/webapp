-- Update properties with specific unit information

UPDATE properties SET 
  full_address = '경기도 시흥시 정왕동 2177-1 시흥센트럴 푸르지오',
  area_type = '84㎡',
  households = '4호',
  description = '1022호, 1053호, 1104호, 1205호 총 4호'
WHERE id = 1;

UPDATE properties SET 
  full_address = '경기도 하남시 교산동 620 하남 교산신도시 A1블록',
  area_type = '59㎡, 84㎡',
  households = '12호',
  description = '501호, 502호, 603호, 702호, 801호, 802호, 903호, 1001호, 1002호, 1101호, 1201호, 1202호 총 12호'
WHERE id = 6;

UPDATE properties SET 
  full_address = '인천광역시 서구 검단동 1234 검단신도시 A7블록',
  area_type = '84㎡',
  households = '6호',
  description = '901호, 902호, 1001호, 1002호, 1101호, 1102호 총 6호'
WHERE id = 2;

UPDATE properties SET 
  full_address = '경기도 김포시 한강신도시 B12블록 김포한강 푸르지오',
  area_type = '84㎡, 114㎡',
  households = '8호',
  description = '701호, 702호, 801호, 901호, 1001호, 1101호, 1201호, 1301호 총 8호'
WHERE id = 9;
