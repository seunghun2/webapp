-- ✅ PRODUCTION DATA - FINAL SYNC
-- Date: 2025-11-10 11:46:26
-- Total properties: 19

DELETE FROM properties;

-- 1. [줍줍] 세종시 첫마을 4단지
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, pdf_url, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '세종시 첫마을 4단지', '세종특별자치시', '모집중', '2025-11-14', '2.96억~3.49억', '20호', '["공개매각", "청약통장 불필요", "무주택요건無"]', '59㎡ 20호 일반매각. 1년 이상 세종시 거주자만 신청 가능. 순번추첨 후 동호지정.', '59㎡', 'GS건설', '2013년 12월', 2.96, 3.49, '세종/충청', 20, '세종특별자치시 누리로 119 (한솔동 1226)', 0, 0, 3.2, 3.8, 0, 0, 'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do', 2013.12, 2024.1, 0, 0);

-- 2. [줍줍] 세종시 첫마을 5단지
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, pdf_url, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '세종시 첫마을 5단지', '세종특별자치시', '모집중', '2025-11-14', '2.96억~5.09억', '22호', '["공개매각", "청약통장 불필요", "무주택요건無"]', '59㎡/84㎡ 22호 일반매각. 1년 이상 세종시 거주자만 신청 가능.', '59㎡, 84㎡', '대우건설', '2014년 03월', 2.96, 5.09, '세종/충청', 22, '세종특별자치시 누리로 59 (한솔동 1045)', 0, 0, 4.5, 5.2, 0, 0, 'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do', 2014.03, 2024.09, 0, 0);

-- 3. [줍줍] 세종시 첫마을 6단지
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, pdf_url, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '세종시 첫마을 6단지', '세종특별자치시', '모집중', '2025-11-14', '2.96억~5.09억', '26호', '["공개매각", "청약통장 불필요", "무주택요건無"]', '59㎡/84㎡ 26호 일반매각. 1년 이상 세종시 거주자만 신청 가능.', '59㎡, 84㎡', '현대건설', '2014년 05월', 2.96, 5.09, '세종/충청', 26, '세종특별자치시 누리로 28 (한솔동 974)', 0, 0, 4.8, 5.5, 0, 0, 'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do', 2014.05, 2024.1, 0, 0);

-- 4. [조합] 엘리프세종 6-3 M4 신혼희망타운
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, sale_price_min, sale_price_max, region, household_count, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, price_increase_amount, price_increase_rate)
VALUES ('johab', '엘리프세종 6-3 M4 신혼희망타운', '세종특별자치시', '모집중', '2025-11-20', '추후공지', '추가모집', '["신혼희망타운", "추가모집", "무주택"]', '신혼희망타운 추가 입주자 모집. 공고일: 2025.11.07', 0, 0, '세종/충청', 0, '세종특별자치시 엘리프세종6-3생활권 M4블록', 0, 0, 0, 0, 0, 0, 0, 0);

-- 6. [임대] 김제지평선 행복주택
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, brochure_images, application_start_date, application_end_date, document_submission_date, price_increase_amount, price_increase_rate)
VALUES ('rental', '김제지평선 행복주택', '전북특별자치도 김제시', '모집중', '2025-11-21', '보증금 1,527만원~', '120호', '["행복주택", "임대", "소득요건완화"]', '🏢 단지 개요
전북특별자치도 김제시 지평선산단2길 319에 위치한 행복주택입니다.
26㎡~51㎡ 다양한 평형으로 총 120호가 공급됩니다.
지평선산업단지 인근으로 출퇴근이 편리하며, 깨끗하고 쾌적한 주거환경을 제공합니다.

💰 임대 조건
• 임대보증금: 1,527만원 ~ 4,000만원
• 월 임대료: 8만원 ~ 21만원대
• 임대기간: 최장 6년 (2년 단위 재계약)
• 임대료 인상률: 5% 이내
• 저렴한 임대료로 주거비 부담 완화
• 계약금 10%, 잔금 90% 납부

🎯 신청자격
• 무주택 세대구성원
• 소득요건: 도시근로자 월평균소득 100% 이하
• 청년: 만 19세~39세 미만
• 신혼부부: 혼인기간 7년 이내
• 고령자: 만 65세 이상
• 산업단지 근로자 우대

📐 공급 세대수 및 면적
• 26㎡ (소형): 60세대
• 51㎡ (중형): 60세대
• 총 120세대 공급
• 전용면적 기준, 공급면적 별도
• 발코니 확장 불가 (행복주택 특성)

🏡 입주자 선정 기준
• 1순위: 해당 지역 거주자 및 산단 근로자
• 2순위: 인근 지역 거주자
• 3순위: 기타 지역 거주자
• 동일순위 경쟁 시 추첨으로 결정
• 예비입주자 순번 부여

⚠️ 주의사항
• 무주택 세대구성원만 신청 가능
• 중복신청 시 전체 무효 처리
• 허위서류 제출 시 계약 취소
• 입주 후 5년간 전대 금지
• 소득초과 시 임대료 할증 또는 퇴거
• 입주 전 주민등록 전입 필수

💻 온라인 신청
• LH 청약센터: apply.lh.or.kr
• 신청기간: 2025년 11월 18일 ~ 21일
• 인터넷/모바일 24시간 접수
• 현장접수: 평일 09:00~18:00
• 공동인증서 또는 간편인증 필요
• 신청 후 서류제출 대상자 발표

📞 문의처
• LH 전북지역본부: 063-210-7114
• 김제 행복주택 관리사무소: 063-540-XXXX
• 상담시간: 평일 09:00~18:00
• 주말 및 공휴일 휴무

👍 추천 대상
• 김제 지평선산단 근무 예정 청년
• 저렴한 주거비로 안정적 생활 희망
• 장기 임대 혜택 필요한 무주택자
• 신혼부부 및 사회초년생
• 깨끗한 신축 주거환경 원하는 분', '2026-01-06', 0.015, 0.04, '전북', 120, '전북특별자치도 김제시 지평선산단2길 319', 0, 0, 0, 0, 0, 0, '[
    "/brochures/gimje/page_01.png",
    "/brochures/gimje/page_02.png",
    "/brochures/gimje/page_03.png",
    "/brochures/gimje/page_04.png",
    "/brochures/gimje/page_05.png",
    "/brochures/gimje/page_06.png",
    "/brochures/gimje/page_07.png",
    "/brochures/gimje/page_08.png",
    "/brochures/gimje/page_09.png",
    "/brochures/gimje/page_10.png"
  ]', '2025-11-18', '2025-11-21', '2025-11-28', 0, 0);

-- 9. [임대] 남양주 가운2 국민임대
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, pdf_url, application_start_date, application_end_date, document_submission_date, price_increase_amount, price_increase_rate)
VALUES ('rental', '남양주 가운2 국민임대', '경기도 남양주시', '모집중', '2025-11-21', '보증금 1,862만원~', '예비 80명', '["국민임대", "예비입주자", "무주택"]', '🏢 단지 개요
경기도 남양주시 가운로길 28 (다산동)에 위치한 국민임대주택입니다.
36㎡~46㎡ 평형으로 예비입주자 80명을 모집합니다.
다산신도시 내 편리한 생활 인프라를 갖춘 단지입니다.
대중교통 접근성 우수, 주변 편의시설 완비되어 있습니다.

💰 임대 조건
• 임대보증금: 1,862만원 ~ 3,697만원
• 월 임대료: 21만원 ~ 30만원대
• 임대기간: 최장 30년 (장기 거주 가능)
• 국민임대 특별 혜택 적용
• 임대료 인상률: 5% 이내
• 안정적인 주거 환경 제공
• 계약금 10%, 잔금 90% 납부

🎯 신청자격
• 무주택 세대구성원
• 소득요건: 도시근로자 월평균소득 70% 이하
• 자산요건: 총자산 2억 8,800만원 이하
• 자동차 2,499만원 이하
• 예비입주자 선정 대상
• 1순위 탈락자 우선 고려

📐 공급 세대수 및 면적
• 36㎡ (소형): 40명
• 46㎡ (중형): 40명
• 총 80명 예비입주자 모집
• 전용면적 기준, 공급면적 별도
• 실입주 시기는 추후 개별 통보

🏡 입주자 선정 기준
• 본 모집 1순위 탈락자
• 예비순번 부여 후 결원 발생 시 순차 입주
• 동일순위 경쟁 시 추첨
• 예비입주자 유효기간: 2년
• 입주 포기 시 차순위자에게 기회 제공

⚠️ 주의사항
• 예비입주자이므로 즉시 입주 불가
• 본 입주자 결원 발생 시 순차 연락
• 무주택 요건 상시 유지 필수
• 중복신청 시 전체 무효 처리
• 허위서류 제출 시 계약 취소
• 입주 후 전대 및 매매 금지
• 소득초과 시 임대료 할증

💻 온라인 신청
• LH 청약센터: apply.lh.or.kr
• 신청기간: 2025년 11월 18일 ~ 21일
• 인터넷/모바일 24시간 접수
• 현장접수: 평일 09:00~18:00
• 공동인증서 또는 간편인증 필요
• 서류제출 일정 별도 공지

📞 문의처
• LH 경기지역본부: 031-8027-9114
• 남양주 가운2단지 관리사무소: 031-590-XXXX
• 상담시간: 평일 09:00~18:00
• 주말 및 공휴일 휴무
• 방문 상담 시 사전 예약 권장

👍 추천 대상
• 다산신도시 직장인 및 신혼부부
• 장기 거주 계획이 있는 무주택자
• 안정적 주거비로 자산 형성 희망
• 본 청약 탈락 후 예비 기회 원하는 분
• 저소득 무주택 세대주', '36㎡, 46㎡', 'LH', '2026-01-06', 0.019, 0.037, '경기', 80, '경기도 남양주시 가운로길 28 (다산동)', 0, 0, 0, 0, 0, 0, 'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do', '2025-11-18', '2025-11-21', '2025-11-28', 0, 0);

-- 10. [줍줍] 부산범천21BL 서면서한이다음 (59A형)
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, badge, description, area_type, supply_area, exclusive_area, builder, move_in_date, subscription_start, subscription_end, special_supply_date, sale_price_min, sale_price_max, region, city, district, household_count, contact_number, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '부산범천21BL 서면서한이다음 (59A형)', '부산시', '모집중', '2025-12-31', '23.9억~26.6억', '24세대', '["계약금 1,000만원","선착순","발코니확장","공공분양"]', 'HOT', '계약금 1,000만원 정액제 / 선착순 동호지정 계약', '59㎡', '79.75㎡', '59.96㎡', '서면서한이다음', '계약체결일로부터 90일이내', '2025-06-12', '2025-12-31', '2025-06-12', 2.39, 2.66, '부산시', '부산광역시', '부산진구', 24, '051-460-5482', '부산광역시 부산진구 범천동 1123-124', 0, 0, 0, 2.75, 0, 0, '2024-06', '2025-02', 0, 0);

-- 11. [줍줍] 부산범천21BL 서면서한이다음 (59B형)
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, badge, description, area_type, supply_area, exclusive_area, builder, move_in_date, subscription_start, subscription_end, special_supply_date, sale_price_min, sale_price_max, region, city, district, household_count, contact_number, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '부산범천21BL 서면서한이다음 (59B형)', '부산시', '모집중', '2025-12-31', '23.5억~26.1억', '27세대', '["계약금 1,000만원","선착순","발코니확장","공공분양"]', 'HOT', '계약금 1,000만원 정액제 / 선착순 동호지정 계약', '59㎡', '79.72㎡', '59.94㎡', '서면서한이다음', '계약체결일로부터 90일이내', '2025-06-12', '2025-12-31', '2025-06-12', 2.35, 2.61, '부산시', '부산광역시', '부산진구', 27, '051-460-5482', '부산광역시 부산진구 범천동 1123-124', 0, 0, 0, 2.75, 0, 0, '2024-06', '2025-02', 0, 0);

-- 12. [줍줍] 부산범천21BL 서면서한이다음 (74A형)
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, badge, description, area_type, supply_area, exclusive_area, builder, move_in_date, subscription_start, subscription_end, special_supply_date, sale_price_min, sale_price_max, region, city, district, household_count, contact_number, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '부산범천21BL 서면서한이다음 (74A형)', '부산시', '모집중', '2025-12-31', '29.3억~32.6억', '32세대', '["계약금 1,000만원","선착순","발코니확장","공공분양"]', 'HOT', '계약금 1,000만원 정액제 / 선착순 동호지정 계약', '74㎡', '99.67㎡', '74.94㎡', '서면서한이다음', '계약체결일로부터 90일이내', '2025-06-12', '2025-12-31', '2025-06-12', 2.93, 3.26, '부산시', '부산광역시', '부산진구', 32, '051-460-5482', '부산광역시 부산진구 범천동 1123-124', 0, 0, 0, 3.45, 0, 0, '2024-06', '2025-02', 0, 0);

-- 13. [줍줍] 세종 엘리프세종6-3M4 신혼희망타운
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, badge, description, area_type, supply_area, exclusive_area, floor_info, parking, heating, entrance_type, builder, constructor, move_in_date, subscription_start, subscription_end, special_supply_date, general_supply_date, winner_announcement, contract_date, sale_price_min, sale_price_max, region, city, district, household_count, homepage_url, contact_number, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, announcement_date, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '세종 엘리프세종6-3M4 신혼희망타운', '세종특별자치시 산울동', '무순위청약', '2025.11.11', '2.44억~2.45억', '3세대', '["LH청약","신혼희망타운","무순위","추가모집","공공분양"]', 'HOT', '신혼희망타운 공공분양 추가입주자 모집. 총 1035세대 중 신혼희망타운 316세대. 2025년 1월 입주. 금회 무순위로 3세대 공급(55A형 1세대, 55B형 2세대). LH와 계룡건설 컨소시엄 공동 시행. 55㎡ 기준 2024년 11월 실거래가 최고 3.44억원, 최저 2.82억원 거래.', '55㎡', '55.95㎡~55.96㎡', '55.95㎡~55.96㎡', '지하2층~지상29층, 16개동', '미정', '지역난방', '미정', 'LH + 계룡건설 컨소시엄', '계룡건설', '2025년 1월', '2025-11-12', '2025-11-12', '없음', '2025-11-12', '2025-11-17', '2025-12-05', 2.44, 2.45, '세종', '세종특별자치시', '산울동', 3, 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=0000061005', '070-4470-7141, 070-4470-7142', 0, 0, 0, 3.44, 0, 0, '2025-11-07', '2025-11', '2024-11', 0, 0);

-- 14. [줍줍] 인천영종 A33·37·60블록 공공분양 잔여세대
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, badge, description, area_type, supply_area, exclusive_area, floor_info, heating, move_in_date, subscription_start, subscription_end, general_supply_date, sale_price_min, sale_price_max, region, city, district, household_count, homepage_url, contact_number, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, announcement_date, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '인천영종 A33·37·60블록 공공분양 잔여세대', '인천광역시 중구 중산동', '선착순', '2025.12.31', '3.0억~3.8억', '잔여세대', '["LH청약","잔여세대","선착순","줍줍분양","무자격제한"]', 'HOT', '공공분양 잔여세대 선착순 동·호 지정. 방문 접수만 가능. 1인 최대 2주택 계약 가능. 청약저축, 주택소유, 소득 무관. 전용 84㎡ 기준 3억원대 분양가로 공급. 분양가 상한제 적용으로 시세 대비 가격 경쟁력 우수. 계약금 1,000만원. 공항철도 영종역 생활권. 2025년 10월 재공고로 계속 공급 중.', '59㎡, 74㎡, 84㎡', '59㎡~84㎡', '59㎡~84㎡', '미정', '지역난방', '즉시입주', '2025-11-05', '2025-12-31', '2025-11-05 선착순', 3, 3.8, '인천', '인천광역시', '중구 중산동', 50, 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=0000061006', '032-565-0016', 0, 0, 0, 3.8, 0, 0, '2025-10-30', '2025-07', '2025-07', 0, 0);

-- 15. [줍줍] 삼척도계2단지 분양전환 잔여세대
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, supply_area, exclusive_area, sale_price_min, sale_price_max, region, city, district, household_count, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, announcement_date, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '삼척도계2단지 분양전환 잔여세대', '강원특별자치도 삼척시 도계읍', '일반매각', '2025.11.14', '1.5억~4.5억', '잔여세대', '["LH청약","잔여세대","일반매각","분양전환"]', '공공임대 분양전환 잔여세대. 2016년 준공 단지로 입주 완료. 280세대 규모, 15층 높이. 32평형 약 1.5억~2.5억, 36평형 약 3.5억~4.5억대 실거래가 형성. 강원 산간 지역 특성상 저렴한 가격대.', '32평, 36평', '106㎡, 119㎡', '85㎡, 95㎡', 1.5, 4.5, '강원', '삼척시', '도계읍', 10, 0, 0, 0, 2.5, 0, 0, '2025-10-27', '2024-03', '2024-03', 0, 0);

-- 16. [줍줍] 영천해피포유 미분양 잔여세대
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, supply_area, exclusive_area, sale_price_min, sale_price_max, region, city, household_count, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, announcement_date, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '영천해피포유 미분양 잔여세대', '경상북도 영천시', '선착순', '2026.04.22', '0.8억~1.8억', '잔여세대', '["LH청약","미분양","선착순","장기공급"]', '공공분양 미분양 잔여세대. 2007년 준공 단지로 입주 완료. 183세대 규모, 14층 높이. 25평형 약 0.8억~1.0억, 33평형 약 1.2억~1.4억, 45평형 약 1.5억~1.8억대 실거래가 형성. 경북 영천시 고경면 위치로 저렴한 가격대.', '25평, 33평, 45평', '83㎡, 109㎡, 149㎡', '66㎡, 87㎡, 119㎡', 0.8, 1.8, '경북', '영천시', 20, 0, 0, 0, 1.6, 0, 0, '2025-09-23', '2024-09', '2024-09', 0, 0);

-- 17. [줍줍] 부산범천2 1BL 공공분양 잔여세대
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, badge, description, area_type, supply_area, exclusive_area, sale_price_min, sale_price_max, region, city, district, household_count, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, announcement_date, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '부산범천2 1BL 공공분양 잔여세대', '부산광역시 부산진구 범천동', '선착순', '2025.12.31', '2.7억~3.0억', '잔여세대', '["LH청약","잔여세대","선착순","정정공고"]', 'NEW', '공공분양 잔여세대 무순위 청약. 부산 범천동 생활권, 부산진구 위치. 59A 2.66억원, 59B 2.61억원, 74A 3.0억원대 분양가. LH센트럴힐 브랜드. 범천동 생활 인프라 양호. 주변 범천경남 아파트 2025년 10월 2.35억 실거래.', '59㎡, 74㎡', '59㎡, 74㎡', '59㎡, 74㎡', 2.7, 3, '부산', '부산광역시', '부산진구 범천동', 30, 0, 0, 0, 2.35, 0, 0, '2025-09-22', '2024-10', '2025-10', 0, 0);

-- 18. [줍줍] 익산평화 공공분양주택 추가 입주자
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, sale_price_min, sale_price_max, region, city, household_count, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, announcement_date, sale_price_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '익산평화 공공분양주택 추가 입주자', '전북특별자치도 익산시', '추가모집', '2026.04.30', '2.0억~2.5억 (추정)', '추가 입주자', '["LH청약","추가모집","무이자할부","장기공급"]', '공공분양주택 해약세대 추가공급. 익산 평화지구 위치. 2024년 완공 예정. 공공분양 특성상 분양가 상한제 적용. 주거환경 개선사업 지구 내 위치. 전북 익산시 평화동 생활권.', 2, 2.5, '전북', '익산시', 15, 0, 0, 0, 0, 0, 0, '2025-09-22', '2024-11', 0, 0);

-- 19. [줍줍] 제주하귀휴먼시아2단지 잔여세대
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, supply_area, exclusive_area, sale_price_min, sale_price_max, region, city, household_count, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, announcement_date, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '제주하귀휴먼시아2단지 잔여세대', '제주특별자치도 제주시', '상시선착순', '2025.12.31', '4.2억~4.4억', '잔여세대', '["LH청약","잔여세대","상시","유주택가능","선착순"]', '공공임대 분양전환 잔여세대. 2010년 준공 단지로 입주 완료. 246세대 규모, 12층 높이. 제주시 애월읍 하귀리 위치. 34평형 실거래가 2025년 7월 4.2억원 (10층), 2025년 4월 4.19억원 (5층) 거래. 제주 지역 특성상 높은 가격대 유지. 하귀일초, 귀일중 학군.', '34평', '112㎡', '84.85㎡', 4.2, 4.4, '제주', '제주시', 25, 0, 0, 0, 4.2, 0, 0, '2025-09-16', '2025-07', '2025-07', 0, 0);

-- 20. [임대] 익산 제3일반산단 행복주택
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, area_type, builder, move_in_date, sale_price_min, sale_price_max, region, household_count, full_address, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, pdf_url, brochure_images, application_start_date, application_end_date, document_submission_date, price_increase_amount, price_increase_rate)
VALUES ('rental', '익산 제3일반산단 행복주택', '전북특별자치도 익산시', '모집중', '2025-11-12', '보증금 1,314만원~', '200호', '["행복주택", "일자리연계형", "소득요건완화"]', '🏢 단지 개요
전북특별자치도 익산시 낭산면 삼기북길 178에 위치한 일자리연계형 행복주택입니다.
25㎡~44㎡ 다양한 평형으로 총 200호가 공급됩니다.
익산 제3일반산단 인근으로 출퇴근이 편리하며, KTX·SRT 익산역 생활권입니다.
직주근접 실현으로 시간과 비용을 절약할 수 있습니다.

💰 임대 조건
• 임대보증금: 1,314만원 ~ 4,348만원
• 월 임대료: 7만원 ~ 24만원대
• 임대기간: 최장 6년 (2년 단위 재계약)
• 임대료 인상률: 5% 이내
• 일자리연계형 특별 혜택
• 계약금 10%, 잔금 90% 납부

🎯 신청자격
• 무주택 세대구성원
• 소득요건: 기간요건 완화 적용
• 청년: 만 19세~39세 미만 (혼인 중 아닌 자)
• 신혼부부: 혼인기간 7년 이내
• 일자리연계형 대상자:
  - 창업인
  - 지역전략산업 종사자
  - 산업단지 근로자
  - 중소기업 근로자

📐 공급 세대수 및 면적
• 25㎡ (초소형): 약 70세대
• 36㎡ (소형): 약 65세대
• 44㎡ (중형): 약 65세대
• 총 200세대 공급
• 전용면적 기준
• 발코니 확장 불가

🏡 입주자 선정 기준
• 1순위: 해당 지역 산업단지 근로자
• 2순위: 인근 지역 근로자
• 3순위: 기타 자격 충족자
• 동일순위 경쟁 시 추첨
• 예비입주자 순번 부여
• 소득요건 완화 적용

⚠️ 주의사항
• 무주택 세대구성원만 신청 가능
• 일자리연계형 자격 증빙 필수
• 중복신청 시 전체 무효 처리
• 허위서류 제출 시 계약 취소
• 입주 후 5년간 전대 금지
• 근무지 변경 시 입주자격 상실 가능
• 입주 전 주민등록 전입 필수

💻 온라인 신청
• LH 청약센터: apply.lh.or.kr
• 신청기간: 2025년 11월 4일 ~ 12일
• 인터넷/모바일 24시간 접수
• 현장접수: 평일 09:00~18:00
• MyMy서비스 적용 (간편 서류제출)
• 공동인증서 또는 간편인증 필요

📞 문의처
• LH 전북지역본부: 063-210-7114
• 익산 제3일반산단 행복주택: 063-850-XXXX
• 상담시간: 평일 09:00~18:00
• 주말 및 공휴일 휴무
• MyMy서비스 문의: 1600-1004

👍 추천 대상
• 익산 제3일반산단 근무 예정자
• 저렴한 주거비로 직장 근처 거주 희망
• 청년 근로자 및 신혼부부
• 일자리연계형 혜택 대상자
• KTX역 생활권 선호하는 분', '25㎡, 36㎡, 44㎡', 'LH', '2025-12-30', 0.013, 0.044, '전북', 200, '전북특별자치도 익산시 낭산면 삼기북길 178', 0, 0, 0, 0, 0, 0, 'https://www.lh.or.kr/ptl/comm/getBbsArticleDetail.do', '[
  "/brochures/iksan/page_01.png",
  "/brochures/iksan/page_02.png",
  "/brochures/iksan/page_03.png",
  "/brochures/iksan/page_04.png",
  "/brochures/iksan/page_05.png",
  "/brochures/iksan/page_06.png",
  "/brochures/iksan/page_07.png",
  "/brochures/iksan/page_08.png",
  "/brochures/iksan/page_09.png",
  "/brochures/iksan/page_10.png"
]', '2025-11-04', '2025-11-12', '2025-11-19', 0, 0);

-- 21. [임대] 평택소사벌 A-6블록 행복주택
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, sale_price_min, sale_price_max, household_count, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, brochure_images, application_start_date, application_end_date, document_submission_date, price_increase_amount, price_increase_rate)
VALUES ('rental', '평택소사벌 A-6블록 행복주택', '경기도 평택시', '모집중', '2025-11-19', '보증금 1,100만원~', '840호', '["행복주택", "입주자격완화", "대학생·청년"]', '🏢 단지 개요
경기도 평택시 죽백4로 60(죽백동 815)에 위치한 행복주택입니다.
20㎡~36㎡ 다양한 평형으로 총 840세대가 공급됩니다.
평택역(1호선) 인근으로 대중교통 이용이 편리합니다.
대학생, 청년, 신혼부부를 위한 맞춤형 주거공간입니다.

💰 임대 조건
• 임대보증금: 1,100만원 ~ 4,000만원
• 월 임대료: 6만원 ~ 22만원대
• 임대기간: 최장 6년 (대학생 최장 3년, 청년·신혼부부 최장 6년)
• 임대료 인상률: 5% 이내
• 입주자격완화 특별모집 (선계약 후검증)
• 20형/22형은 빌트인 가구·가전 제공

🎯 신청자격
• 무주택 세대구성원
• 소득요건: 완화 적용 (소득요건 배제)
• 자산요건: 완화 적용 (자동차가액 4,563만원 이하만 확인)
• 대학생: 대학 재학생 또는 취업준비생
• 청년: 만 19세~39세, 사회초년생 (소득업무 종사기간 7년 이내)
• 신혼부부: 혼인기간 10년 이내 또는 만 9세 이하 자녀
• 한부모가족: 만 9세 이하 자녀
• 고령자: 만 65세 이상
• 주거급여수급자

📐 공급 세대수 및 면적
• 20㎡: 약 280세대
• 22㎡: 약 200세대
• 26㎡: 약 180세대
• 36㎡: 약 180세대
• 총 840세대 공급
• 전용면적 기준
• 20형/22형 빌트인 가구 설치

🏡 입주자 선정 기준
• 경쟁 시 추첨으로 선정
• 예비입주자 순번 부여
• 선계약 후검증 방식 적용
• 계약 후 입주자격 조사 진행
• 소득·자산 요건 완화 적용
• 동일 유형 중복선정 불가

⚠️ 주의사항
• 무주택 세대구성원만 신청 가능
• 선계약 후검증 방식 (계약 후 자격조사)
• 부적격 시 계약 취소 (위약금 면제, 이자 없음)
• 중복신청 시 전체 무효 처리
• 1세대 1주택 신청 원칙
• 재계약 시 소득·자산 초과해도 1회는 할증 없음
• 최대 거주기간 제한 있음 (분양전환 불가)

💻 온라인 신청
• LH 청약플러스: apply.lh.or.kr
• 신청기간: 2025년 11월 18일 ~ 19일
• 인터넷/모바일 24시간 접수
• 현장접수: 고령자·장애인 등 정보취약계층만 가능
• 서류제출: 2025년 11월 26일 ~ 12월 2일
• 공동인증서 또는 간편인증 필요

📞 문의처
• LH 콜센터: 1600-1004
• 상담시간: 평일 09:00~18:00
• LH 청약플러스: apply.lh.or.kr
• 평택소사벌 A-6블록 행복주택 홍보관
• 주소: 경기도 평택시 죽백동 799

👍 추천 대상
• 평택역 인근 거주 희망하는 대학생·청년
• 저렴한 주거비로 독립 생활 시작하려는 사회초년생
• 평택 지역 직장인 및 신혼부부
• 입주자격 완화 혜택 받고 싶은 분
• 빌트인 가구·가전 제공되는 소형평수 선호', 0, 0, 0, 0, 0, 0, 0, 0, 0, '["/brochures/pyeongtaek/page_01.png","/brochures/pyeongtaek/page_02.png","/brochures/pyeongtaek/page_03.png","/brochures/pyeongtaek/page_04.png","/brochures/pyeongtaek/page_05.png","/brochures/pyeongtaek/page_06.png","/brochures/pyeongtaek/page_07.png","/brochures/pyeongtaek/page_08.png","/brochures/pyeongtaek/page_09.png","/brochures/pyeongtaek/page_10.png","/brochures/pyeongtaek/page_11.png","/brochures/pyeongtaek/page_12.png","/brochures/pyeongtaek/page_13.png"]', '2025-11-18', '2025-11-19', '2025-11-26 ~ 2025-12-02', 0, 0);

-- 22. [줍줍] 엘리프세종6-3 신혼희망타운
INSERT INTO properties (type, title, location, status, deadline, price, households, tags, description, winner_announcement, contract_date, sale_price_min, sale_price_max, household_count, lat, lng, original_price, recent_trade_price, expected_margin, margin_rate, application_start_date, application_end_date, document_submission_date, sale_price_date, recent_trade_date, price_increase_amount, price_increase_rate)
VALUES ('unsold', '엘리프세종6-3 신혼희망타운', '세종특별자치시', '모집중', '2025-11-12', '2.4억~2.8억', '3세대', '["신혼희망타운", "공공분양", "추가모집"]', '🏢 단지 개요
세종특별자치시 산울동 산7 (세종특별자치시 산울7로 10)에 위치한 신혼희망타운입니다.
전용면적 55㎡ 타입으로 총 3세대가 추가 공급됩니다.
총 1,035세대 규모의 대단지 엘리프세종6-3 단지입니다.
신혼부부를 위한 맞춤형 공공분양 주택입니다.

💰 분양 가격
• 분양가격: 2억 4,440만원 ~ 2억 8,000만원
• 계약금: 10% (계약시)
• 잔금: 90% (계약일+45일, 주택도시기금 융자 가능)
• 발코니 확장: 1,550만원 (필수 포함)
• 추가선택품목: 시공 완료 (변경 불가)
• 계약 후 정해진 기간 내 계약금·잔금 납부

🎯 신청자격
• 무주택 세대구성원 (성년자)
• 세종특별자치시 거주자 (주민등록표등본 기준)
• 청약통장 가입여부 무관 (청약신청금 없음)
• 소득·자산 요건 없음
• 재당첨제한 기간 내에도 신청 가능
• 과거 특별공급 당첨여부 무관
• 1세대 1주택 청약 원칙
• 외국인 청약 불가

📐 공급 세대수 및 면적
• 55A㎡: 1세대 (802동 401호)
• 55B㎡: 2세대
• 총 3세대 추가 공급
• 전용면적 기준
• 발코니 확장 시공 완료
• 추가선택품목 시공 완료

🏡 입주자 선정 기준
• 무작위 전산추첨으로 동·호수 배정
• 무주택세대구성원 중 성년자
• 세종시 거주자 우선
• 장기해외체류자(90일 초과) 신청 불가
• 최초 공고(2022.02.22) 당첨자 신청 불가
• 출입국사실증명서 제출 필수

⚠️ 주의사항
• 발코니 확장 필수 (선택 불가)
• 추가선택품목 변경·취소 불가
• 최초 계약 당시 옵션 그대로 공급
• 마이너스 옵션 선택 불가
• 전매제한: 1년 (2022.04.04 기산, 현재 도과)
• 계약금 미납 시 계약 미체결 처리
• 부적격 당첨 시 계약 취소

💻 온라인 신청
• 청약접수: 2025년 11월 12일 (수) 09:00~17:00
• LH 청약플러스: apply.lh.or.kr
• 엘리프세종6-3 홈페이지: www.엘리프세종6-3.com
• 당첨자 발표: 2025년 11월 17일 (월) 17:00
• 서류제출: 2025년 11월 18~19일 (10:00~17:00)
• 계약 체결: 2025년 12월 5일 (금) 10:00~16:00

📞 문의처
• 엘리프세종6-3 콜센터: 070-4470-7141, 7142
• 상담시간: 평일 09:00~17:00
• LH 청약플러스: apply.lh.or.kr
• 홈페이지: www.엘리프세종6-3.com

👍 추천 대상
• 세종시 거주 무주택 신혼부부
• 청약통장 없어도 신청 가능한 분
• 소득·자산 제한 없는 공공분양 희망자
• 대단지 브랜드 아파트 선호하는 분
• 발코니 확장·추가옵션 시공 완료된 매물 선호', '2025-11-17', '2025-12-05', 2.44, 2.8, 0, 0, 0, 2.44, 2.65, 0, 0, '2025-11-12', '2025-11-12', '2025-11-18 ~ 2025-11-19', '2022-02-22', '2024-01-01', 0.21, 8.6);

-- ✅ Production sync complete
