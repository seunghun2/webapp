-- Update extended_data for ID 6
UPDATE properties SET extended_data = '{
  "targetAudienceLines": [
    "전북 김제시 거주 또는 근무하는 청년·신혼부부",
    "도시근로자 소득 100% 이하 무주택 세대원",
    "지평선산단 근로자 우대, 저렴한 임대료"
  ],
  "details": {
    "targetTypes": "청년(만19~39세), 신혼부부(혼인7년이내), 고령자(만65세이상), 산단근로자",
    "incomeLimit": "도시근로자 월평균소득 100% 이하 (청년 120%, 신혼부부 120%)",
    "assetLimit": "총자산 2억 9,200만원 이하, 자동차 3,557만원 이하",
    "homelessPeriod": "무주택 세대구성원",
    "savingsAccount": "청약통장 불필요",
    "selectionMethod": "소득순위제 (소득 낮은 순)",
    "scoringCriteria": "소득기준, 해당지역 거주·근무기간, 부양가족수",
    "notices": "• 임대차계약 2년 단위 (최장 6년)\n• 임대료 인상률 5% 이내\n• 전대 및 임대권 양도 불가\n• 입주 시 계약금 10% 납부\n• 지평선산단 근로자 우대",
    "applicationMethod": "LH 청약센터 온라인 신청 (PC·모바일)",
    "applicationUrl": "https://apply.lh.or.kr",
    "requiredDocs": "신분증, 주민등록등본, 가족관계증명서, 소득증빙서류, 자산증빙서류",
    "contactDept": "한국토지주택공사 전북지역본부",
    "contactPhone": "063-230-7114",
    "features": "행복주택 120세대, 26㎡·51㎡ 구성",
    "surroundings": "지평선산업단지 도보 5분, 편의점·마트 인근",
    "transportation": "시내버스 이용 편리, 산단 출퇴근 최적",
    "education": "김제초등학교, 김제중학교 인근"
  },
  "supplyInfo": [
    {"type": "26㎡", "area": "26㎡", "households": "60세대", "price": "보증금 1,527만원 / 월 8만원"},
    {"type": "51㎡", "area": "51㎡", "households": "60세대", "price": "보증금 4,000만원 / 월 21만원"}
  ]
}' WHERE id = 6;

-- Update extended_data for ID 21
UPDATE properties SET extended_data = '{
  "targetAudienceLines": [
    "평택시 거주 또는 근무하는 청년·신혼부부·고령자",
    "도시근로자 소득 100% 이하 무주택 세대원",
    "평택항·산단 근로자 우대, 교통 편리"
  ],
  "details": {
    "targetTypes": "청년(만19~39세), 신혼부부(혼인7년이내), 고령자(만65세이상), 산단근로자",
    "incomeLimit": "도시근로자 월평균소득 100% 이하 (청년 120%, 신혼부부 120%)",
    "assetLimit": "총자산 2억 9,200만원 이하, 자동차 3,557만원 이하",
    "homelessPeriod": "무주택 세대구성원",
    "savingsAccount": "청약통장 불필요",
    "selectionMethod": "소득순위제 (소득 낮은 순)",
    "scoringCriteria": "소득기준, 해당지역 거주·근무기간, 부양가족수, 산단근로 여부",
    "notices": "• 임대차계약 2년 단위 (최장 6년)\n• 임대료 인상률 5% 이내\n• 전대 및 임대권 양도 불가\n• 평택항·산단 근로자 우대\n• 입주 시 계약금 10% 납부",
    "applicationMethod": "LH 청약센터 온라인 신청",
    "applicationUrl": "https://apply.lh.or.kr",
    "requiredDocs": "신분증, 주민등록등본, 가족관계증명서, 소득증빙서류, 자산증빙서류, 재직증명서(산단근로자)",
    "contactDept": "한국토지주택공사 경기지역본부",
    "contactPhone": "031-8045-4114",
    "features": "행복주택, 26㎡~51㎡ 다양한 평형",
    "surroundings": "평택역 인근, 대형마트·병원 접근 용이",
    "transportation": "평택역(지하철 1호선), 고속버스터미널 인근",
    "education": "소사벌초등학교, 소사중학교 도보 10분"
  }
}' WHERE id = 21;

-- Update extended_data for ID 23
UPDATE properties SET extended_data = '{
  "targetAudienceLines": [
    "전북 김제시 거주 또는 근무하는 무주택 세대주",
    "소득 100% 이하 충족하는 청년·신혼부부·고령자",
    "저렴한 임대료로 주거비 부담 완화 희망자"
  ],
  "details": {
    "targetTypes": "청년(만19~39세), 신혼부부(혼인7년이내), 고령자(만65세이상), 산단근로자",
    "incomeLimit": "도시근로자 월평균소득 100% 이하 (청년 120%, 신혼부부 120%)",
    "assetLimit": "총자산 2억 9,200만원 이하, 자동차 3,557만원 이하",
    "homelessPeriod": "무주택 세대구성원",
    "savingsAccount": "청약통장 불필요",
    "selectionMethod": "소득순위제 (소득 낮은 순)",
    "scoringCriteria": "소득기준, 해당지역 거주·근무기간, 부양가족수, 청약통장 가입기간",
    "notices": "• 임대차계약은 2년 단위로 체결\n• 최장 거주기간 6년\n• 임대료 인상률 5% 이내\n• 전대 및 임대권 양도 불가\n• 입주 시 계약금 10% 납부",
    "applicationMethod": "LH 청약센터 온라인 신청 (PC·모바일)",
    "applicationUrl": "https://apply.lh.or.kr",
    "requiredDocs": "신분증, 주민등록등본, 가족관계증명서, 소득증빙서류, 자산증빙서류, 혼인관계증명서(신혼부부)",
    "contactDept": "한국토지주택공사 전북지역본부",
    "contactPhone": "063-230-7114",
    "contactEmail": "info@lh.or.kr",
    "features": "행복주택 120세대, 26㎡·51㎡ 구성, 지평선산업단지 인근",
    "surroundings": "지평선산업단지 인근, 편의시설 접근 용이",
    "transportation": "시내버스 이용 편리, 산업단지 출퇴근 최적",
    "education": "김제초등학교, 김제중학교 인근"
  },
  "supplyInfo": [
    {"type": "26㎡", "area": "26㎡", "households": "60세대", "price": "보증금 1,527만원 / 월 8만원대"},
    {"type": "51㎡", "area": "51㎡", "households": "60세대", "price": "보증금 4,000만원 / 월 21만원대"}
  ]
}' WHERE id = 23;

-- Update extended_data for ID 24
UPDATE properties SET extended_data = '{
  "targetAudienceLines": [
    "세종시 거주 무주택 신혼부부",
    "청약통장 없어도 신청 가능",
    "소득·자산 제한 없는 공공분야 희망자"
  ],
  "details": {
    "targetTypes": "신혼부부 (혼인기간 7년 이내), 생애최초 구매자",
    "incomeLimit": "제한 없음 (공공분양)",
    "assetLimit": "제한 없음",
    "homelessPeriod": "무주택 세대주 우대",
    "savingsAccount": "청약통장 불필요",
    "selectionMethod": "무순위 추첨제",
    "notices": "• 무순위 청약으로 청약통장 불필요\n• 1인 1건 신청 가능\n• 중복당첨 시 모두 무효\n• 입주 시 잔금 납부 필요",
    "applicationMethod": "LH 청약센터 온라인 신청",
    "applicationUrl": "https://apply.lh.or.kr",
    "requiredDocs": "신분증, 주민등록등본, 가족관계증명서",
    "contactDept": "LH 신혼희망타운 콜센터",
    "contactPhone": "070-4470-7141",
    "features": "신혼희망타운 추가 입주자 모집, 55㎡ 3세대 공급",
    "surroundings": "세종시 중심지, 편의시설 우수",
    "transportation": "BRT, 시내버스 접근 용이"
  },
  "supplyInfo": [
    {"type": "55A", "area": "55.95㎡", "households": "1세대", "price": "2.44억"},
    {"type": "55B", "area": "55.96㎡", "households": "2세대", "price": "2.45억"}
  ]
}' WHERE id = 24;

-- Update extended_data for ID 26
UPDATE properties SET extended_data = '{
  "targetAudienceLines": [
    "경기도 광명시 거주 무주택 세대주",
    "청약통장 1순위 또는 2순위 자격 보유자",
    "소득 및 자산 기준 충족하는 신혼부부 우대"
  ],
  "details": {
    "targetTypes": "무주택 세대주 (1순위: 청약통장 가입 24개월 이상, 2순위: 청약통장 가입자)",
    "incomeLimit": "도시근로자 월평균소득 130% 이하 (맞벌이 160%)",
    "assetLimit": "부동산 3억 2,800만원 이하, 자동차 3,557만원 이하",
    "homelessPeriod": "무주택 세대주 (세대원 포함 무주택)",
    "savingsAccount": "청약저축 또는 청약예금 가입자 (1순위 24개월 이상)",
    "selectionMethod": "추첨제 (1순위 75%, 2순위 25%)",
    "scoringCriteria": "해당지역 거주기간, 부양가족수, 청약통장 가입기간 등",
    "notices": "• 중복청약 시 모두 무효 처리\n• 당첨자 발표 후 서류제출 필수\n• 부적격 시 예비입주자에게 공급\n• 전매제한: 소유권이전등기일부터 3년",
    "applicationMethod": "LH 청약센터 온라인 신청",
    "applicationUrl": "https://apply.lh.or.kr",
    "requiredDocs": "신분증, 주민등록등본, 가족관계증명서, 소득증빙서류, 자산증빙서류",
    "contactDept": "한국토지주택공사 경기지역본부",
    "contactPhone": "1600-1004",
    "features": "지하2층~지상29층, 296세대 공급, 다양한 평형 구성",
    "surroundings": "광명역 KTX 인근, 대형마트, 병원, 학교 등 생활편의시설 인접",
    "transportation": "광명역(KTX, 지하철 1호선), 버스노선 다수",
    "education": "광명초등학교, 광명중학교, 광명고등학교 등 교육시설 우수"
  },
  "supplyInfo": [
    {"type": "39A", "area": "39.94㎡", "households": "30세대", "price": "2.8억~3.2억"},
    {"type": "39B", "area": "39.96㎡", "households": "35세대", "price": "2.8억~3.2억"},
    {"type": "51", "area": "51.93㎡", "households": "80세대", "price": "3.5억~4.0억"},
    {"type": "59A", "area": "59.94㎡", "households": "60세대", "price": "4.2억~4.8억"},
    {"type": "59B", "area": "59.96㎡", "households": "45세대", "price": "4.2억~4.8억"},
    {"type": "59C", "area": "59.98㎡", "households": "20세대", "price": "4.3억~4.9억"},
    {"type": "74C", "area": "74.92㎡", "households": "15세대", "price": "5.0억~5.6억"},
    {"type": "74D", "area": "74.96㎡", "households": "10세대", "price": "5.0억~5.6억"},
    {"type": "84D", "area": "84.94㎡", "households": "1세대", "price": "5.8억~6.5억"}
  ]
}' WHERE id = 26;

-- Update extended_data for ID 27
UPDATE properties SET extended_data = '{
  "targetAudienceLines": [
    "세종시 1년 이상 거주 무주택 세대주",
    "청약통장 없어도 신청 가능",
    "역세권·대형마트·학군 우수지역 선호자"
  ],
  "details": {
    "targetTypes": "세종시 1년 이상 거주자, 무주택 세대주",
    "incomeLimit": "제한 없음",
    "assetLimit": "제한 없음",
    "homelessPeriod": "무주택 우대",
    "savingsAccount": "청약통장 불필요",
    "selectionMethod": "선착순 또는 추첨",
    "features": "역세권 도보 5분, 대형마트 인근, 학군 우수지역",
    "transportation": "버스·지하철 접근성 우수",
    "applicationMethod": "LH청약센터 온라인 신청",
    "applicationUrl": "https://apply.lh.or.kr"
  },
  "steps": [
    {"title": "LH청약센터 접속", "date": "신청기간 내"},
    {"title": "로그인 및 공고 검색", "date": "신청기간 내"},
    {"title": "분양권 잔금 납부", "date": "계약일"},
    {"title": "명의 변경 절차", "date": "계약 후"}
  ]
}' WHERE id = 27;
