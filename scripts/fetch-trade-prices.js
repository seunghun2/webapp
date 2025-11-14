#!/usr/bin/env node

/**
 * 국토교통부 아파트 실거래가 데이터 자동 수집 스크립트
 * GitHub Actions에서 매일 실행되어 D1 데이터베이스에 저장
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .dev.vars 파일에서 API 키 읽기
function loadEnvVars() {
  try {
    const envPath = join(__dirname, '..', '.dev.vars');
    const envContent = readFileSync(envPath, 'utf-8');
    const vars = {};
    
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        vars[key.trim()] = valueParts.join('=').trim();
      }
    });
    
    return vars;
  } catch (error) {
    console.error('Failed to load .dev.vars:', error.message);
    return {};
  }
}

const envVars = loadEnvVars();
const MOLIT_API_KEY = process.env.MOLIT_API_KEY || envVars.MOLIT_API_KEY;

// 지역 코드 매핑
const regionCodes = {
  '세종특별자치시': '36110',
  '세종': '36110',
  '전라북도 김제시': '45210',
  '전북 김제': '45210',
  '김제': '45210',
  '경기도 평택시': '41220',
  '경기 평택': '41220',
  '평택': '41220',
  '경기도 화성시': '41590',
  '경기 화성': '41590',
  '화성': '41590',
  '서울특별시 강남구': '11680',
  '서울 강남구': '11680',
  '강남': '11680',
  '서울특별시 서초구': '11650',
  '서울 서초구': '11650',
  '서초': '11650',
  '광주광역시 광산구': '29200',
  '광주 광산구': '29200',
  '광주광역시': '29200',
  '광주': '29200',
};

// XML 파싱 함수
function parseXML(xmlText) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    const item = {};

    // 각 필드 파싱
    const fields = {
      '아파트': 'aptName',
      '거래금액': 'dealAmount',
      '건축년도': 'buildYear',
      '년': 'year',
      '월': 'month',
      '일': 'day',
      '전용면적': 'area',
      '층': 'floor',
      '법정동': 'dong',
      '지번': 'jibun',
      '지역코드': 'regionCode'
    };

    for (const [xmlTag, fieldName] of Object.entries(fields)) {
      const regex = new RegExp(`<${xmlTag}>([^<]*)<\/${xmlTag}>`);
      const fieldMatch = itemXml.match(regex);
      if (fieldMatch) {
        item[fieldName] = fieldMatch[1].trim();
      }
    }

    if (item.aptName && item.dealAmount) {
      items.push(item);
    }
  }

  return items;
}

// 실거래가 데이터 수집
async function fetchTradePrices(sigunguCode, sigunguName, year, month) {
  const dealYmd = `${year}${String(month).padStart(2, '0')}`;
  
  const apiUrl = 'https://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev';
  const params = new URLSearchParams({
    serviceKey: MOLIT_API_KEY,
    LAWD_CD: sigunguCode,
    DEAL_YMD: dealYmd,
    numOfRows: '1000'
  });

  console.log(`📡 수집 중: ${sigunguName} (${sigunguCode}) - ${year}년 ${month}월`);

  try {
    const response = await fetch(`${apiUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      console.error(`❌ API 호출 실패: ${response.status} ${response.statusText}`);
      return [];
    }

    const xmlText = await response.text();
    
    // API 에러 확인
    if (xmlText.includes('<errMsg>') || xmlText.includes('SERVICE_KEY')) {
      console.error('❌ API 키 오류 또는 서비스 에러');
      return [];
    }

    const items = parseXML(xmlText);
    console.log(`✅ ${items.length}건 수집 완료`);
    
    return items.map(item => ({
      sigungu_code: sigunguCode,
      sigungu_name: sigunguName,
      apt_name: item.aptName,
      deal_amount: parseInt(item.dealAmount.replace(/,/g, '')) * 10000,
      deal_year: parseInt(item.year),
      deal_month: parseInt(item.month),
      deal_day: parseInt(item.day),
      area: parseFloat(item.area),
      floor: item.floor ? parseInt(item.floor) : null,
      build_year: item.buildYear ? parseInt(item.buildYear) : null,
      dong: item.dong || null,
      jibun: item.jibun || null
    }));
  } catch (error) {
    console.error(`❌ 오류 발생: ${error.message}`);
    return [];
  }
}

// D1 데이터베이스에 저장 (wrangler d1 execute 사용)
async function saveToPricesDatabase(data) {
  if (data.length === 0) {
    console.log('⚠️  저장할 데이터가 없습니다.');
    return;
  }

  console.log(`💾 D1 데이터베이스에 ${data.length}건 저장 중...`);

  // SQL INSERT 문 생성
  const values = data.map(item => {
    const dealAmount = item.deal_amount;
    const area = item.area;
    const floor = item.floor !== null ? item.floor : 'NULL';
    const buildYear = item.build_year !== null ? item.build_year : 'NULL';
    const dong = item.dong ? `'${item.dong.replace(/'/g, "''")}'` : 'NULL';
    const jibun = item.jibun ? `'${item.jibun.replace(/'/g, "''")}'` : 'NULL';
    const aptName = item.apt_name.replace(/'/g, "''");
    
    return `('${item.sigungu_code}', '${item.sigungu_name}', '${aptName}', ${dealAmount}, ${item.deal_year}, ${item.deal_month}, ${item.deal_day}, ${area}, ${floor}, ${buildYear}, ${dong}, ${jibun}, datetime('now'), datetime('now'))`;
  }).join(',\n    ');

  const sql = `
DELETE FROM trade_prices 
WHERE sigungu_code = '${data[0].sigungu_code}' 
  AND deal_year = ${data[0].deal_year} 
  AND deal_month = ${data[0].deal_month};

INSERT INTO trade_prices (
  sigungu_code, sigungu_name, apt_name, deal_amount, 
  deal_year, deal_month, deal_day, area, floor, build_year, 
  dong, jibun, created_at, updated_at
) VALUES 
    ${values};
`;

  // SQL 파일로 저장
  const { writeFileSync } = await import('fs');
  const tmpSqlPath = join(__dirname, '..', '.tmp-insert.sql');
  writeFileSync(tmpSqlPath, sql);

  // wrangler d1 execute 실행
  const { execSync } = await import('child_process');
  try {
    execSync(`npx wrangler d1 execute webapp-production --local --file=${tmpSqlPath}`, {
      cwd: join(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('✅ 데이터 저장 완료!');
  } catch (error) {
    console.error('❌ 데이터 저장 실패:', error.message);
  }
}

// 메인 실행
async function main() {
  console.log('🚀 아파트 실거래가 데이터 수집 시작...\n');

  if (!MOLIT_API_KEY) {
    console.error('❌ MOLIT_API_KEY가 설정되지 않았습니다.');
    console.error('   .dev.vars 파일 또는 환경변수를 확인하세요.');
    process.exit(1);
  }

  // 현재 날짜 기준으로 최근 3개월 데이터 수집
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const months = [];
  for (let i = 0; i < 3; i++) {
    let year = currentYear;
    let month = currentMonth - i;
    
    if (month <= 0) {
      month += 12;
      year -= 1;
    }
    
    months.push({ year, month });
  }

  // 모든 지역에 대해 수집
  for (const [regionName, regionCode] of Object.entries(regionCodes)) {
    // 중복 지역 코드 건너뛰기
    if (['세종', '전북 김제', '김제', '경기 평택', '평택', '경기 화성', '화성', 
         '서울 강남구', '강남', '서울 서초구', '서초', '광주 광산구', '광주광역시', '광주'].includes(regionName)) {
      continue;
    }

    console.log(`\n📍 지역: ${regionName}`);
    
    for (const { year, month } of months) {
      const data = await fetchTradePrices(regionCode, regionName, year, month);
      
      if (data.length > 0) {
        await saveToPricesDatabase(data);
      }
      
      // API 호출 간격 (초당 1회 제한 고려)
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.log('\n✨ 모든 데이터 수집 완료!');
}

main().catch(error => {
  console.error('💥 치명적 오류:', error);
  process.exit(1);
});
