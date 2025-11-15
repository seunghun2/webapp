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

// 지역 코드 매핑
const REGIONS = [
  { name: '광주광역시 광산구', code: '29200' },
  { name: '세종특별자치시', code: '36110' },
  { name: '경기도 화성시', code: '41590' },
  { name: '경기도 평택시', code: '41220' },
];

// 날짜 계산 (최근 1년: 2024-01 ~ 2024-11)
function getDateRange() {
  const dates = [];
  
  // 2024년 1월부터 11월까지 (11개월)
  for (let month = 1; month <= 11; month++) {
    dates.push({
      year: 2024,
      month: String(month).padStart(2, '0')
    });
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
              dong: item.aptDong?.trim() || '',
              jibun: item.jibun || '',
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
  
  // SQL 생성 (중복 방지를 위해 INSERT OR IGNORE 사용)
  const values = allItems.map(item => 
    `('${item.sigungu_code}', '${item.apt_name.replace(/'/g, "''")}', ${item.deal_amount}, ${item.deal_year}, ${item.deal_month}, ${item.deal_day}, ${item.area}, ${item.floor}, '${item.dong.replace(/'/g, "''")}', '${item.jibun.replace(/'/g, "''")}')`
  ).join(',\n  ');
  
  const sql = `-- 실거래가 데이터 삽입 (중복 무시)
-- 생성일: ${new Date().toISOString()}
-- 총 건수: ${allItems.length}

INSERT OR IGNORE INTO trade_prices (sigungu_code, apt_name, deal_amount, deal_year, deal_month, deal_day, area, floor, dong, jibun) VALUES
  ${values};
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
