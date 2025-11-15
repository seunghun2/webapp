/**
 * GitHub Actions용 실거래가 수집 스크립트
 * 국토교통부 API에서 데이터를 가져와 SQL 파일로 저장
 */

import axios from 'axios';
import fs from 'fs';

// 환경 변수에서 API 키 가져오기
const MOLIT_API_KEY = process.env.MOLIT_API_KEY;

if (!MOLIT_API_KEY) {
  console.error('❌ MOLIT_API_KEY 환경 변수가 설정되지 않았습니다!');
  process.exit(1);
}

// 지역 코드 매핑 (전국 주요 시군구)
const REGIONS = [
  // 서울 (주요 구)
  { name: '서울특별시 강남구', code: '11680' },
  { name: '서울특별시 서초구', code: '11650' },
  { name: '서울특별시 송파구', code: '11710' },
  { name: '서울특별시 강동구', code: '11740' },
  { name: '서울특별시 용산구', code: '11170' },
  { name: '서울특별시 성동구', code: '11200' },
  { name: '서울특별시 광진구', code: '11215' },
  { name: '서울특별시 마포구', code: '11440' },
  { name: '서울특별시 영등포구', code: '11560' },
  { name: '서울특별시 강서구', code: '11500' },
  { name: '서울특별시 양천구', code: '11470' },
  { name: '서울특별시 구로구', code: '11530' },
  { name: '서울특별시 동작구', code: '11590' },
  { name: '서울특별시 관악구', code: '11620' },
  { name: '서울특별시 종로구', code: '11110' },
  { name: '서울특별시 중구', code: '11140' },
  
  // 부산
  { name: '부산광역시 해운대구', code: '26350' },
  { name: '부산광역시 수영구', code: '26320' },
  { name: '부산광역시 남구', code: '26290' },
  { name: '부산광역시 동래구', code: '26260' },
  { name: '부산광역시 연제구', code: '26470' },
  { name: '부산광역시 부산진구', code: '26230' },
  { name: '부산광역시 서구', code: '26170' },
  { name: '부산광역시 사상구', code: '26530' },
  
  // 대구
  { name: '대구광역시 수성구', code: '27200' },
  { name: '대구광역시 달서구', code: '27290' },
  { name: '대구광역시 중구', code: '27110' },
  { name: '대구광역시 동구', code: '27140' },
  
  // 인천
  { name: '인천광역시 남동구', code: '28200' },
  { name: '인천광역시 연수구', code: '28185' },
  { name: '인천광역시 부평구', code: '28237' },
  { name: '인천광역시 서구', code: '28260' },
  
  // 광주
  { name: '광주광역시 광산구', code: '29200' },
  { name: '광주광역시 남구', code: '29155' },
  { name: '광주광역시 북구', code: '29170' },
  
  // 대전
  { name: '대전광역시 유성구', code: '30200' },
  { name: '대전광역시 서구', code: '30170' },
  { name: '대전광역시 중구', code: '30110' },
  
  // 울산
  { name: '울산광역시 남구', code: '31140' },
  { name: '울산광역시 동구', code: '31170' },
  { name: '울산광역시 북구', code: '31200' },
  
  // 세종
  { name: '세종특별자치시', code: '36110' },
  
  // 경기 (주요 시)
  { name: '경기도 수원시', code: '41110' },
  { name: '경기도 성남시', code: '41130' },
  { name: '경기도 고양시', code: '41280' },
  { name: '경기도 용인시', code: '41460' },
  { name: '경기도 부천시', code: '41190' },
  { name: '경기도 안산시', code: '41270' },
  { name: '경기도 안양시', code: '41170' },
  { name: '경기도 남양주시', code: '41360' },
  { name: '경기도 화성시', code: '41590' },
  { name: '경기도 평택시', code: '41220' },
  { name: '경기도 의정부시', code: '41150' },
  { name: '경기도 시흥시', code: '41390' },
  { name: '경기도 파주시', code: '41480' },
  { name: '경기도 김포시', code: '41570' },
  { name: '경기도 광명시', code: '41210' },
  { name: '경기도 광주시', code: '41610' },
  { name: '경기도 군포시', code: '41410' },
  { name: '경기도 하남시', code: '41450' },
  
  // 강원
  { name: '강원특별자치도 춘천시', code: '51110' },
  { name: '강원특별자치도 원주시', code: '51130' },
  { name: '강원특별자치도 강릉시', code: '51150' },
  
  // 충북
  { name: '충청북도 청주시', code: '43110' },
  { name: '충청북도 충주시', code: '43130' },
  
  // 충남
  { name: '충청남도 천안시', code: '44130' },
  { name: '충청남도 아산시', code: '44200' },
  { name: '충청남도 서산시', code: '44210' },
  
  // 전북
  { name: '전북특별자치도 전주시', code: '45110' },
  { name: '전북특별자치도 익산시', code: '45140' },
  { name: '전북특별자치도 김제시', code: '45210' },
  
  // 전남
  { name: '전라남도 목포시', code: '46110' },
  { name: '전라남도 여수시', code: '46130' },
  { name: '전라남도 순천시', code: '46150' },
  
  // 경북
  { name: '경상북도 포항시', code: '47110' },
  { name: '경상북도 경주시', code: '47130' },
  { name: '경상북도 구미시', code: '47190' },
  
  // 경남
  { name: '경상남도 창원시', code: '48120' },
  { name: '경상남도 김해시', code: '48250' },
  { name: '경상남도 양산시', code: '48330' },
  { name: '경상남도 진주시', code: '48170' },
  
  // 제주
  { name: '제주특별자치도 제주시', code: '50110' },
  { name: '제주특별자치도 서귀포시', code: '50130' },
];

// 날짜 계산 (최근 3년: 2022-11 ~ 2025-11)
function getDateRange() {
  const dates = [];
  
  // 2022년 12월 ~ 2025년 11월 (3년)
  // 2022년 12월
  dates.push({ year: 2022, month: '12' });
  
  // 2023년 전체
  for (let month = 1; month <= 12; month++) {
    dates.push({ year: 2023, month: String(month).padStart(2, '0') });
  }
  
  // 2024년 전체
  for (let month = 1; month <= 12; month++) {
    dates.push({ year: 2024, month: String(month).padStart(2, '0') });
  }
  
  // 2025년 1월 ~ 11월
  for (let month = 1; month <= 11; month++) {
    dates.push({ year: 2025, month: String(month).padStart(2, '0') });
  }
  
  return dates;
}

// 국토교통부 API 호출
async function fetchMOLITData(regionCode, year, month) {
  const url = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
  
  try {
    console.log(`  📡 API 호출: ${regionCode} ${year}-${month}`);
    
    const response = await axios.get(url, {
      params: {
        serviceKey: MOLIT_API_KEY,
        LAWD_CD: regionCode,
        DEAL_YMD: `${year}${month}`,
        numOfRows: 999,
      },
      timeout: 30000,
    });
    
    const data = response.data;
    
    // JSON 응답 확인
    if (typeof data === 'object' && data.response) {
      const body = data.response.body;
      
      if (body.items && body.items.item) {
        const itemList = Array.isArray(body.items.item) ? body.items.item : [body.items.item];
        console.log(`  ✅ JSON 파싱: ${itemList.length}건`);
        
        const items = [];
        for (const item of itemList) {
          const aptName = item.aptNm;
          const dealAmount = String(item.dealAmount).replace(/,/g, '');
          
          if (aptName && dealAmount) {
            items.push({
              sigungu_code: regionCode,
              apt_name: aptName,
              deal_amount: parseInt(dealAmount) * 10000, // 만원 → 원
              deal_year: parseInt(item.dealYear),
              deal_month: parseInt(item.dealMonth),
              deal_day: parseInt(item.dealDay),
              area: parseFloat(item.excluUseAr),
              floor: item.floor ? parseInt(item.floor) : null,
              dong: item.aptDong ? String(item.aptDong).trim() : '',
              jibun: item.jibun ? String(item.jibun) : '',
            });
          }
        }
        
        return items;
      } else {
        console.log(`  ℹ️  데이터 없음`);
        return [];
      }
    } else {
      console.log(`  ⚠️  예상치 못한 응답 형식`);
      return [];
    }
  } catch (error) {
    console.error(`  ❌ API 호출 실패: ${error.message}`);
    return [];
  }
}

// 메인 실행
async function main() {
  console.log('🚀 실거래가 데이터 수집 시작 (GitHub Actions)\n');
  
  const dates = getDateRange();
  console.log(`📅 수집 기간: ${dates[0].year}-${dates[0].month} ~ ${dates[dates.length-1].year}-${dates[dates.length-1].month}`);
  console.log(`📍 수집 지역: ${REGIONS.length}개 지역\n`);
  
  const allItems = [];
  
  for (const region of REGIONS) {
    console.log(`\n🏘️  ${region.name} (${region.code})`);
    
    for (const date of dates) {
      const items = await fetchMOLITData(region.code, date.year, date.month);
      
      // sigungu_name 추가
      items.forEach(item => {
        item.sigungu_name = region.name;
      });
      
      allItems.push(...items);
      
      // API 호출 제한 방지 (1초 대기)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`\n\n📊 총 수집 건수: ${allItems.length}건`);
  
  if (allItems.length === 0) {
    console.log('⚠️  수집된 데이터가 없습니다.');
    return;
  }
  
  // SQL 생성 (100건씩 나눠서 INSERT)
  const BATCH_SIZE = 100;
  const batches = [];
  
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE);
    const values = batch.map(item => 
      `('${item.sigungu_code}', '${item.sigungu_name.replace(/'/g, "''")}', '${item.apt_name.replace(/'/g, "''")}', ${item.deal_amount}, ${item.deal_year}, ${item.deal_month}, ${item.deal_day}, ${item.area}, ${item.floor}, '${item.dong.replace(/'/g, "''")}', '${item.jibun.replace(/'/g, "''")}')`
    ).join(',\n  ');
    
    batches.push(`INSERT OR IGNORE INTO trade_prices (sigungu_code, sigungu_name, apt_name, deal_amount, deal_year, deal_month, deal_day, area, floor, dong, jibun) VALUES\n  ${values};`);
  }
  
  const sql = `-- 실거래가 데이터 삽입 (중복 무시)
-- 생성일: ${new Date().toISOString()}
-- 총 건수: ${allItems.length}
-- 배치 수: ${batches.length}

${batches.join('\n\n')}
`;
  
  // SQL 파일 저장
  fs.writeFileSync('/tmp/insert_trades.sql', sql);
  console.log('\n✅ SQL 파일 생성 완료: /tmp/insert_trades.sql');
  console.log(`📝 파일 크기: ${(sql.length / 1024).toFixed(2)} KB`);
}

main().catch(error => {
  console.error('❌ 스크립트 실행 실패:', error);
  process.exit(1);
});
