/**
 * 국토교통부 실거래가 API에서 데이터를 가져와 D1 Database에 저장하는 스크립트
 * 
 * 사용법:
 * node scripts/fetch-trade-prices.js
 */

import axios from 'axios';
import { execSync } from 'child_process';
import fs from 'fs';

// 환경 변수 로드
const envFile = fs.readFileSync('.dev.vars', 'utf-8');
const MOLIT_API_KEY = envFile.match(/MOLIT_API_KEY=(.+)/)?.[1];

if (!MOLIT_API_KEY) {
  console.error('❌ MOLIT_API_KEY가 .dev.vars 파일에 없습니다!');
  process.exit(1);
}

// 지역 코드 매핑 (광주광역시 광산구)
const REGIONS = [
  { name: '광주광역시 광산구', code: '29200' },
  { name: '세종특별자치시', code: '36110' },
  { name: '경기도 화성시', code: '41590' },
  { name: '경기도 평택시', code: '41220' },
];

// 날짜 계산 (최근 3년: 2022-01 ~ 2024-11)
function getDateRange() {
  const dates = [];
  
  // 2022년 1월부터 2024년 11월까지 (약 35개월)
  for (let year = 2022; year <= 2024; year++) {
    const endMonth = year === 2024 ? 11 : 12; // 2024년은 11월까지
    for (let month = 1; month <= endMonth; month++) {
      dates.push({
        year: year,
        month: String(month).padStart(2, '0')
      });
    }
  }
  
  return dates;
}

// 국토교통부 API 호출
async function fetchMOLITData(regionCode, year, month) {
  const url = 'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev';
  
  try {
    const response = await axios.get(url, {
      params: {
        serviceKey: MOLIT_API_KEY,
        LAWD_CD: regionCode,
        DEAL_YMD: `${year}${month}`,
        numOfRows: 999,
      },
      timeout: 30000,
    });
    
    const xml = response.data;
    
    // XML 파싱 (간단한 정규식)
    const items = [];
    const itemMatches = xml.matchAll(/<item>[\s\S]*?<\/item>/g);
    
    for (const itemMatch of itemMatches) {
      const item = itemMatch[0];
      
      const aptName = item.match(/<아파트>(.*?)<\/아파트>/)?.[1]?.trim();
      const dealAmount = item.match(/<거래금액>(.*?)<\/거래금액>/)?.[1]?.replace(/,/g, '').trim();
      const dealYear = item.match(/<년>(.*?)<\/년>/)?.[1]?.trim();
      const dealMonth = item.match(/<월>(.*?)<\/월>/)?.[1]?.trim();
      const dealDay = item.match(/<일>(.*?)<\/일>/)?.[1]?.trim();
      const area = item.match(/<전용면적>(.*?)<\/전용면적>/)?.[1]?.trim();
      const floor = item.match(/<층>(.*?)<\/층>/)?.[1]?.trim();
      const dong = item.match(/<법정동>(.*?)<\/법정동>/)?.[1]?.trim();
      const jibun = item.match(/<지번>(.*?)<\/지번>/)?.[1]?.trim();
      
      if (aptName && dealAmount) {
        items.push({
          sigungu_code: regionCode,
          apt_name: aptName,
          deal_amount: parseInt(dealAmount) * 10000, // 만원 → 원
          deal_year: parseInt(dealYear),
          deal_month: parseInt(dealMonth),
          deal_day: parseInt(dealDay),
          area: parseFloat(area),
          floor: floor ? parseInt(floor) : null,
          dong: dong || '',
          jibun: jibun || '',
        });
      }
    }
    
    return items;
  } catch (error) {
    console.error(`❌ API 호출 실패 (${regionCode}, ${year}-${month}):`, error.message);
    return [];
  }
}

// D1에 데이터 삽입
function insertToD1(items) {
  if (items.length === 0) return;
  
  // SQL 생성
  const values = items.map(item => 
    `('${item.sigungu_code}', '${item.apt_name.replace(/'/g, "''")}', ${item.deal_amount}, ${item.deal_year}, ${item.deal_month}, ${item.deal_day}, ${item.area}, ${item.floor}, '${item.dong.replace(/'/g, "''")}', '${item.jibun.replace(/'/g, "''")}')`
  ).join(',\n  ');
  
  const sql = `INSERT INTO trade_prices (sigungu_code, apt_name, deal_amount, deal_year, deal_month, deal_day, area, floor, dong, jibun) VALUES\n  ${values};`;
  
  // 임시 SQL 파일 저장
  fs.writeFileSync('/tmp/insert_trades.sql', sql);
  
  // wrangler 실행
  try {
    execSync('npx wrangler d1 execute webapp-production --local --file=/tmp/insert_trades.sql', {
      cwd: '/home/user/webapp',
      stdio: 'inherit'
    });
    console.log(`✅ ${items.length}건 삽입 완료`);
  } catch (error) {
    console.error('❌ D1 삽입 실패:', error.message);
  }
}

// 메인 실행
async function main() {
  console.log('🚀 실거래가 데이터 수집 시작...\n');
  
  const dates = getDateRange();
  console.log(`📅 수집 기간: ${dates[0].year}-${dates[0].month} ~ ${dates[dates.length-1].year}-${dates[dates.length-1].month}`);
  console.log(`📍 수집 지역: ${REGIONS.length}개 지역\n`);
  
  let totalCount = 0;
  
  for (const region of REGIONS) {
    console.log(`\n🏘️  ${region.name} (${region.code})`);
    
    for (const date of dates) {
      process.stdout.write(`  ${date.year}-${date.month} 조회 중... `);
      
      const items = await fetchMOLITData(region.code, date.year, date.month);
      
      if (items.length > 0) {
        insertToD1(items);
        totalCount += items.length;
        console.log(`✅ ${items.length}건`);
      } else {
        console.log('⚠️  0건');
      }
      
      // API 호출 제한 방지 (0.5초 대기)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n\n🎉 완료! 총 ${totalCount}건의 실거래가 데이터를 수집했습니다.`);
}

main().catch(console.error);
