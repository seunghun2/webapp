import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// Define types for Cloudflare bindings
type Bindings = {
  DB: D1Database;
  MOLIT_API_KEY?: string; // 국토교통부 API 키 (선택사항)
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// API endpoint for property statistics
app.get('/api/stats', async (c) => {
  try {
    const { DB } = c.env
    
    const result = await DB.prepare(`
      SELECT 
        type,
        COUNT(*) as count
      FROM properties
      GROUP BY type
    `).all()
    
    const stats = {
      unsold: 0,
      today: 0,
      johab: 0,
      next: 0
    }
    
    result.results.forEach((row: any) => {
      stats[row.type as keyof typeof stats] = row.count
    })
    
    return c.json(stats)
  } catch (error) {
    console.error('Error fetching stats:', error)
    return c.json({ error: 'Failed to fetch statistics' }, 500)
  }
})

// API endpoint for properties with filters
app.get('/api/properties', async (c) => {
  try {
    const { DB } = c.env
    const type = c.req.query('type') || 'all'
    const region = c.req.query('region') || 'all'
    const household = c.req.query('household') || 'all'
    const area = c.req.query('area') || 'all'
    const sort = c.req.query('sort') || 'latest'
    
    // Exclude expired properties (deadline < today)
    let query = "SELECT * FROM properties WHERE deadline >= date('now')"
    let params: any[] = []
    
    // Type filter
    if (type === 'today') {
      // 오늘청약: 오늘이 청약일인 항목만 표시
      query += " AND date(deadline) = date('now')"
    } else if (type !== 'all') {
      query += ' AND type = ?'
      params.push(type)
    }
    
    // Region filter
    if (region !== 'all') {
      query += ' AND region = ?'
      params.push(region)
    }
    
    // Household filter
    if (household !== 'all') {
      const [min, max] = household.split('-')
      if (max === '+') {
        query += ' AND household_count >= ?'
        params.push(parseInt(min))
      } else {
        query += ' AND household_count >= ? AND household_count < ?'
        params.push(parseInt(min), parseInt(max))
      }
    }
    
    // Area filter (평형)
    if (area !== 'all') {
      // area_size는 숫자로 저장되어 있다고 가정 (단위: ㎡)
      switch (area) {
        case 'small': // 59㎡ 이하
          query += ' AND area_size <= 59'
          break
        case 'medium': // 60-84㎡
          query += ' AND area_size >= 60 AND area_size <= 84'
          break
        case 'large': // 85㎡ 이상
          query += ' AND area_size >= 85'
          break
      }
    }
    
    // Sorting
    switch (sort) {
      case 'deadline':
        query += ' ORDER BY deadline ASC'
        break
      case 'price-low':
        query += ' ORDER BY sale_price_min ASC'
        break
      case 'price-high':
        query += ' ORDER BY sale_price_max DESC'
        break
      default:
        query += ' ORDER BY created_at DESC'
    }
    
    let stmt = DB.prepare(query)
    if (params.length > 0) {
      stmt = stmt.bind(...params)
    }
    
    const result = await stmt.all()
    
    const properties = result.results.map((prop: any) => ({
      ...prop,
      tags: JSON.parse(prop.tags)
    }))
    
    return c.json(properties)
  } catch (error) {
    console.error('Error fetching properties:', error)
    return c.json({ error: 'Failed to fetch properties' }, 500)
  }
})

// API endpoint to get single property
app.get('/api/properties/detail/:id', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    const result = await DB.prepare(
      'SELECT * FROM properties WHERE id = ?'
    ).bind(id).first()
    
    if (!result) {
      return c.json({ error: 'Property not found' }, 404)
    }
    
    const property = {
      ...result,
      tags: JSON.parse(result.tags as string)
    }
    
    return c.json(property)
  } catch (error) {
    console.error('Error fetching property:', error)
    return c.json({ error: 'Failed to fetch property' }, 500)
  }
})

// LH 청약센터 크롤링 API
app.post('/api/crawl/lh', async (c) => {
  try {
    const { DB } = c.env
    
    // LH 청약센터 URL
    const lhUrl = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1027'
    
    // Fetch HTML from LH
    const response = await fetch(lhUrl)
    const html = await response.text()
    
    // 간단한 HTML 파싱 (정규식 사용)
    const tableRegex = /<tr[^>]*>(.*?)<\/tr>/gs
    const rows = [...html.matchAll(tableRegex)]
    
    let newCount = 0
    let updateCount = 0
    
    for (const row of rows) {
      const rowHtml = row[1]
      
      // 공고명 추출
      const titleMatch = rowHtml.match(/class="tal"[^>]*>(.*?)<\/td>/s)
      if (!titleMatch) continue
      
      const titleText = titleMatch[1].replace(/<[^>]+>/g, '').trim()
      if (!titleText || titleText === '공고명') continue
      
      // 지역 추출
      const regionMatch = rowHtml.match(/class="ta-c"[^>]*>([^<]+)<\/td>/s)
      const region = regionMatch ? regionMatch[1].trim() : ''
      
      // 게시일/마감일 추출  
      const dateMatches = [...rowHtml.matchAll(/(\d{4}\.\d{2}\.\d{2})/g)]
      const announcementDate = dateMatches[0] ? dateMatches[0][1] : ''
      const deadline = dateMatches[1] ? dateMatches[1][1] : ''
      
      // 상태 추출
      const statusMatch = rowHtml.match(/공고중|접수중|마감/)
      const status = statusMatch ? statusMatch[0] : '공고중'
      
      // 유형 추출
      let propertyType = 'unsold' // 기본값
      let announcementType = '분양주택'
      
      if (titleText.includes('신혼희망')) {
        announcementType = '공공분양(신혼희망)'
      } else if (titleText.includes('공공분양')) {
        announcementType = '공공분양'
      }
      
      // 지역명 정규화
      let normalizedRegion = ''
      if (region.includes('서울')) normalizedRegion = '서울'
      else if (region.includes('부산')) normalizedRegion = '부산'
      else if (region.includes('대구')) normalizedRegion = '대구'
      else if (region.includes('인천')) normalizedRegion = '인천'
      else if (region.includes('광주')) normalizedRegion = '광주'
      else if (region.includes('대전')) normalizedRegion = '대전'
      else if (region.includes('울산')) normalizedRegion = '울산'
      else if (region.includes('세종')) normalizedRegion = '세종'
      else if (region.includes('경기')) normalizedRegion = '경기'
      else if (region.includes('강원')) normalizedRegion = '강원'
      else if (region.includes('충북') || region.includes('충청북')) normalizedRegion = '충북'
      else if (region.includes('충남') || region.includes('충청남')) normalizedRegion = '충남'
      else if (region.includes('전북') || region.includes('전라북')) normalizedRegion = '전북'
      else if (region.includes('전남') || region.includes('전라남')) normalizedRegion = '전라'
      else if (region.includes('경북') || region.includes('경상북')) normalizedRegion = '경북'
      else if (region.includes('경남') || region.includes('경상남')) normalizedRegion = '경상'
      else if (region.includes('제주')) normalizedRegion = '제주'
      
      // LH 공고 ID 생성 (제목 기반)
      const lhId = Buffer.from(titleText).toString('base64').substring(0, 32)
      
      // 기존 데이터 확인
      const existing = await DB.prepare(
        'SELECT id FROM properties WHERE lh_announcement_id = ? OR title = ?'
      ).bind(lhId, titleText).first()
      
      const now = new Date().toISOString()
      
      if (existing) {
        // 업데이트
        await DB.prepare(`
          UPDATE properties SET
            announcement_status = ?,
            deadline = ?,
            last_crawled_at = ?,
            updated_at = ?
          WHERE lh_announcement_id = ? OR title = ?
        `).bind(status, deadline, now, now, lhId, titleText).run()
        updateCount++
      } else {
        // 새로 삽입
        await DB.prepare(`
          INSERT INTO properties (
            type, title, location, status, deadline, price, households, tags,
            region, announcement_type, announcement_status, announcement_date,
            lh_announcement_id, source, last_crawled_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          propertyType,
          titleText,
          region,
          status,
          deadline,
          '미정',
          '미정',
          JSON.stringify(['LH청약']),
          normalizedRegion,
          announcementType,
          status,
          announcementDate,
          lhId,
          'lh_auto',
          now,
          now,
          now
        ).run()
        newCount++
      }
    }
    
    return c.json({
      success: true,
      message: `LH 크롤링 완료: 신규 ${newCount}건, 업데이트 ${updateCount}건`,
      newCount,
      updateCount,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('LH crawling error:', error)
    return c.json({ 
      success: false,
      error: 'Failed to crawl LH data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// API endpoint to update KB market price
app.post('/api/properties/:id/update-price', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const body = await c.req.json()
    
    const { 
      original_price,
      sale_price_date,
      recent_trade_price, 
      recent_trade_date 
    } = body
    
    if (!recent_trade_price || isNaN(recent_trade_price)) {
      return c.json({ error: 'Invalid price value' }, 400)
    }
    
    if (!recent_trade_date) {
      return c.json({ error: 'Recent trade date is required' }, 400)
    }
    
    // Get current property data
    const property = await DB.prepare(
      'SELECT original_price, sale_price_date FROM properties WHERE id = ?'
    ).bind(id).first()
    
    if (!property) {
      return c.json({ error: 'Property not found' }, 404)
    }
    
    // Use provided original price or existing one
    const orig_price = original_price !== undefined ? Number(original_price) : Number(property.original_price) || 0
    const recent_price = Number(recent_trade_price)
    
    // Calculate margin and increase rate
    const margin = recent_price - orig_price
    const margin_rate = orig_price > 0 ? (margin / orig_price) * 100 : 0
    const price_increase_amount = margin
    const price_increase_rate = margin_rate
    
    // Update property with all fields
    await DB.prepare(`
      UPDATE properties 
      SET original_price = ?,
          sale_price_date = ?,
          recent_trade_price = ?,
          recent_trade_date = ?,
          expected_margin = ?,
          margin_rate = ?,
          price_increase_amount = ?,
          price_increase_rate = ?,
          last_price_update = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      orig_price,
      sale_price_date || null,
      recent_price,
      recent_trade_date,
      margin,
      margin_rate,
      price_increase_amount,
      price_increase_rate,
      id
    ).run()
    
    return c.json({
      success: true,
      data: {
        original_price: orig_price,
        sale_price_date: sale_price_date,
        recent_trade_price: recent_price,
        recent_trade_date: recent_trade_date,
        expected_margin: margin,
        margin_rate: margin_rate,
        price_increase_amount: price_increase_amount,
        price_increase_rate: price_increase_rate
      }
    })
  } catch (error) {
    console.error('Error updating price:', error)
    return c.json({ error: 'Failed to update price' }, 500)
  }
})

// Helper function: 주소에서 시군구 코드 추출
function extractSigunguCode(location: string): string | null {
  const regionMap: Record<string, Record<string, string>> = {
    '서울': { '강남구': '11680', '강동구': '11740', '강북구': '11305', '강서구': '11500', '관악구': '11620', '광진구': '11215', '구로구': '11530', '금천구': '11545', '노원구': '11350', '도봉구': '11320', '동대문구': '11230', '동작구': '11590', '마포구': '11440', '서대문구': '11410', '서초구': '11650', '성동구': '11200', '성북구': '11290', '송파구': '11710', '양천구': '11470', '영등포구': '11560', '용산구': '11170', '은평구': '11380', '종로구': '11110', '중구': '11140', '중랑구': '11260' },
    '인천': { '계양구': '28245', '남동구': '28200', '동구': '28110', '미추홀구': '28177', '부평구': '28237', '서구': '28260', '연수구': '28185', '중구': '28140', '강화군': '28710', '옹진군': '28720' },
    '경기': { '고양시': '41281', '과천시': '41290', '광명시': '41210', '광주시': '41610', '구리시': '41310', '군포시': '41410', '김포시': '41570', '남양주시': '41360', '동두천시': '41250', '부천시': '41190', '성남시': '41130', '수원시': '41110', '시흥시': '41390', '안산시': '41270', '안성시': '41550', '안양시': '41170', '양주시': '41630', '여주시': '41670', '오산시': '41370', '용인시': '41460', '의왕시': '41430', '의정부시': '41150', '이천시': '41500', '파주시': '41480', '평택시': '41220', '포천시': '41650', '하남시': '41450', '화성시': '41590' },
    '세종': { '세종시': '36110' }
  };
  
  for (const [sido, districts] of Object.entries(regionMap)) {
    if (location.includes(sido)) {
      for (const [district, code] of Object.entries(districts)) {
        if (location.includes(district)) {
          return code;
        }
      }
    }
  }
  return null;
}

// Helper function: 아파트명 정리 (괄호, 특수문자 제거)
function cleanApartmentName(title: string): string {
  return title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim().split(' ')[0];
}

// API endpoint: 모든 물건의 실거래가 자동 업데이트
app.post('/api/auto-update-all-prices', async (c) => {
  try {
    const { DB } = c.env
    const serviceKey = c.env.MOLIT_API_KEY
    
    if (!serviceKey) {
      return c.json({ 
        error: 'API 키가 설정되지 않았습니다',
        message: '.dev.vars 파일에 MOLIT_API_KEY를 설정하세요.'
      }, 400)
    }
    
    // 모든 물건 조회
    const properties = await DB.prepare('SELECT * FROM properties').all()
    
    const results = {
      total: properties.results.length,
      updated: 0,
      failed: 0,
      skipped: 0,
      details: [] as any[]
    }
    
    // 현재 날짜에서 6개월 전까지 조회
    const today = new Date()
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1)
    const yearMonth = sixMonthsAgo.getFullYear() + (sixMonthsAgo.getMonth() + 1).toString().padStart(2, '0')
    
    for (const property of properties.results as any[]) {
      const location = property.location || property.full_address || ''
      const title = property.title || ''
      
      // 시군구 코드 추출
      let sigunguCode = property.sigungu_code
      if (!sigunguCode) {
        sigunguCode = extractSigunguCode(location)
        if (sigunguCode) {
          await DB.prepare('UPDATE properties SET sigungu_code = ? WHERE id = ?')
            .bind(sigunguCode, property.id).run()
        }
      }
      
      // 아파트명 추출
      let apartmentName = property.apartment_name
      if (!apartmentName) {
        apartmentName = cleanApartmentName(title)
        if (apartmentName) {
          await DB.prepare('UPDATE properties SET apartment_name = ? WHERE id = ?')
            .bind(apartmentName, property.id).run()
        }
      }
      
      if (!sigunguCode || !apartmentName) {
        results.skipped++
        continue
      }
      
      try {
        // 국토교통부 API 호출
        const apiUrl = 'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev?serviceKey=' + serviceKey + '&LAWD_CD=' + sigunguCode + '&DEAL_YMD=' + yearMonth
        
        const response = await fetch(apiUrl)
        const xmlText = await response.text()
        
        // XML 파싱
        const itemMatches = xmlText.matchAll(/<item>(.*?)<\/item>/gs)
        let foundMatch = false
        
        for (const match of itemMatches) {
          const itemXml = match[1]
          
          const getTagValue = (tag: string) => {
            const regex = new RegExp('<' + tag + '><!\[CDATA\[(.*?)\]\]><\/' + tag + '>', 's')
            const match = itemXml.match(regex)
            return match ? match[1].trim() : null
          }
          
          const aptName = getTagValue('아파트')
          const price = getTagValue('거래금액')
          const year = getTagValue('년')
          const month = getTagValue('월')
          const day = getTagValue('일')
          
          // 아파트명 매칭
          if (aptName && aptName.includes(apartmentName) && price) {
            const priceInBillion = parseInt(price.replace(/,/g, '')) / 10000
            const tradeDate = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0')
            
            // 분양가와 비교하여 상승률 계산
            const originalPrice = Number(property.original_price) || 0
            const increase = priceInBillion - originalPrice
            const increaseRate = originalPrice > 0 ? (increase / originalPrice) * 100 : 0
            
            // DB 업데이트
            await DB.prepare(`
              UPDATE properties 
              SET recent_trade_price = ?,
                  recent_trade_date = ?,
                  expected_margin = ?,
                  margin_rate = ?,
                  price_increase_amount = ?,
                  price_increase_rate = ?,
                  last_price_update = datetime('now'),
                  updated_at = datetime('now')
              WHERE id = ?
            `).bind(priceInBillion, tradeDate, increase, increaseRate, increase, increaseRate, property.id).run()
            
            results.updated++
            results.details.push({
              id: property.id,
              title: title,
              price: priceInBillion,
              date: tradeDate,
              increase: increase.toFixed(1),
              rate: increaseRate.toFixed(1)
            })
            
            foundMatch = true
            break
          }
        }
        
        if (!foundMatch) {
          results.skipped++
        }
        
      } catch (error) {
        results.failed++
        console.error('Failed to update property', property.id, error)
      }
    }
    
    return c.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Auto update error:', error)
    return c.json({ error: '자동 업데이트 실패' }, 500)
  }
})

// API endpoint to fetch real trade price from MOLIT (국토교통부)
app.post('/api/fetch-molit-price', async (c) => {
  try {
    const body = await c.req.json()
    const { sigungu_code, year_month, apartment_name } = body
    
    // 환경 변수에서 API 키 가져오기 (없으면 에러 메시지)
    const serviceKey = c.env.MOLIT_API_KEY
    
    if (!serviceKey) {
      return c.json({ 
        error: 'API 키가 설정되지 않았습니다',
        message: '공공데이터포털(data.go.kr)에서 서비스 키를 발급받아 .dev.vars 파일에 MOLIT_API_KEY를 설정하세요.'
      }, 400)
    }
    
    if (!sigungu_code || !year_month) {
      return c.json({ error: '시군구 코드와 년월을 입력해주세요' }, 400)
    }
    
    // 국토교통부 API 호출
    const apiUrl = 'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev?serviceKey=' + serviceKey + '&LAWD_CD=' + sigungu_code + '&DEAL_YMD=' + year_month
    
    const response = await fetch(apiUrl)
    const xmlText = await response.text()
    
    // XML 파싱 (간단한 정규식 사용)
    const items = []
    const itemMatches = xmlText.matchAll(/<item>(.*?)<\/item>/gs)
    
    for (const match of itemMatches) {
      const itemXml = match[1]
      
      const getTagValue = (tag) => {
        const regex = new RegExp('<' + tag + '><!\[CDATA\[(.*?)\]\]><\/' + tag + '>', 's')
        const match = itemXml.match(regex)
        return match ? match[1].trim() : null
      }
      
      const aptName = getTagValue('아파트')
      const price = getTagValue('거래금액')
      const area = getTagValue('전용면적')
      const year = getTagValue('년')
      const month = getTagValue('월')
      const day = getTagValue('일')
      const dong = getTagValue('법정동')
      const floor = getTagValue('층')
      
      // 아파트명 필터링 (제공된 경우)
      if (apartment_name && aptName && !aptName.includes(apartment_name)) {
        continue
      }
      
      if (aptName && price) {
        items.push({
          apartment: aptName,
          price: price.replace(/,/g, '').trim(),
          price_formatted: (parseInt(price.replace(/,/g, '')) / 10000).toFixed(1) + '억',
          area: area,
          date: year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0'),
          dong: dong,
          floor: floor
        })
      }
    }
    
    return c.json({
      success: true,
      count: items.length,
      data: items.slice(0, 20) // 최대 20건만 반환
    })
    
  } catch (error) {
    console.error('MOLIT API Error:', error)
    return c.json({ 
      error: '실거래가 조회 실패',
      message: error.message
    }, 500)
  }
})

// API endpoint to auto-search nearby apartments with real prices
app.post('/api/properties/:id/auto-nearby', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const serviceKey = c.env.MOLIT_API_KEY
    
    if (!serviceKey) {
      return c.json({ 
        error: 'API 키가 설정되지 않았습니다',
        message: '.dev.vars 파일에 MOLIT_API_KEY를 설정하세요.'
      }, 400)
    }
    
    // Get property info
    const property = await DB.prepare('SELECT * FROM properties WHERE id = ?').bind(id).first()
    
    if (!property) {
      return c.json({ error: 'Property not found' }, 404)
    }
    
    const location = property.location || property.full_address || ''
    
    // Extract sigungu code
    const sigunguCode = property.sigungu_code || extractSigunguCode(location)
    
    if (!sigunguCode) {
      return c.json({ error: '지역 코드를 찾을 수 없습니다' }, 400)
    }
    
    // Get recent 6 months data
    const today = new Date()
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 6, 1)
    const yearMonth = sixMonthsAgo.getFullYear() + (sixMonthsAgo.getMonth() + 1).toString().padStart(2, '0')
    
    try {
      // Call MOLIT API
      const apiUrl = 'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev?serviceKey=' + serviceKey + '&LAWD_CD=' + sigunguCode + '&DEAL_YMD=' + yearMonth
      
      const response = await fetch(apiUrl)
      const xmlText = await response.text()
      
      // Parse XML and group by apartment
      const apartmentMap = new Map()
      const itemMatches = xmlText.matchAll(/<item>(.*?)<\/item>/gs)
      
      for (const match of itemMatches) {
        const itemXml = match[1]
        
        const getTagValue = (tag: string) => {
          const regex = new RegExp('<' + tag + '><!\[CDATA\[(.*?)\]\]><\/' + tag + '>', 's')
          const match = itemXml.match(regex)
          return match ? match[1].trim() : null
        }
        
        const aptName = getTagValue('아파트')
        const price = getTagValue('거래금액')
        const year = getTagValue('년')
        const month = getTagValue('월')
        const day = getTagValue('일')
        const dong = getTagValue('법정동')
        
        if (aptName && price) {
          const priceInBillion = parseInt(price.replace(/,/g, '')) / 10000
          const tradeDate = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0')
          
          // Group by apartment name
          if (!apartmentMap.has(aptName)) {
            apartmentMap.set(aptName, {
              name: aptName,
              recent_price: priceInBillion,
              date: tradeDate,
              distance: dong || ''
            })
          } else {
            // Keep only the most recent trade
            const existing = apartmentMap.get(aptName)
            if (tradeDate > existing.date) {
              existing.recent_price = priceInBillion
              existing.date = tradeDate
            }
          }
        }
      }
      
      // Convert to array and get top 5
      const nearbyApartments = Array.from(apartmentMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map(apt => ({
          name: apt.name,
          recent_price: apt.recent_price.toFixed(1),
          date: apt.date,
          distance: apt.distance
        }))
      
      // Update property with nearby apartments
      await DB.prepare(`
        UPDATE properties 
        SET nearby_apartments = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(JSON.stringify(nearbyApartments), id).run()
      
      return c.json({
        success: true,
        count: nearbyApartments.length,
        data: nearbyApartments
      })
      
    } catch (error) {
      console.error('MOLIT API Error:', error)
      return c.json({ 
        error: '실거래가 조회 실패',
        message: error.message
      }, 500)
    }
    
  } catch (error) {
    console.error('Error auto-searching nearby apartments:', error)
    return c.json({ error: 'Failed to auto-search nearby apartments' }, 500)
  }
})

// API endpoint to update nearby apartments info
app.post('/api/properties/:id/update-nearby', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const body = await c.req.json()
    
    const { nearby_apartments } = body
    
    if (!Array.isArray(nearby_apartments)) {
      return c.json({ error: 'Invalid nearby apartments data' }, 400)
    }
    
    // Update property
    await DB.prepare(`
      UPDATE properties 
      SET nearby_apartments = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(JSON.stringify(nearby_apartments), id).run()
    
    return c.json({
      success: true,
      data: {
        nearby_apartments: nearby_apartments
      }
    })
  } catch (error) {
    console.error('Error updating nearby apartments:', error)
    return c.json({ error: 'Failed to update nearby apartments' }, 500)
  }
})

// Terms of Service page
app.get('/terms', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>이용약관 - 똑똑한한채</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          * { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
        </style>
    </head>
    <body class="bg-gray-50">
        <header class="bg-white sticky top-0 z-50 shadow-sm border-b border-gray-200">
            <div class="max-w-4xl mx-auto px-4 py-3">
                <a href="/" class="text-xl font-bold text-gray-900">똑똑한한채</a>
            </div>
        </header>
        
        <main class="max-w-4xl mx-auto px-4 py-12">
            <h1 class="text-3xl font-bold text-gray-900 mb-8">이용약관</h1>
            
            <div class="bg-white rounded-xl shadow-sm p-8 space-y-8">
                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제1조 (목적)</h2>
                    <p class="text-gray-700 leading-relaxed">
                        본 약관은 똑똑한한채(이하 "회사")가 제공하는 부동산 분양 정보 서비스(이하 "서비스")의 이용과 관련하여 
                        회사와 이용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제2조 (정의)</h2>
                    <p class="text-gray-700 leading-relaxed mb-2">본 약관에서 사용하는 용어의 정의는 다음과 같습니다:</p>
                    <ul class="list-disc list-inside space-y-2 text-gray-700">
                        <li>"서비스"란 회사가 제공하는 부동산 분양 정보 제공 플랫폼을 의미합니다.</li>
                        <li>"이용자"란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
                        <li>"회원"이란 회사와 서비스 이용계약을 체결하고 회원 아이디를 부여받은 자를 말합니다.</li>
                        <li>"비회원"이란 회원으로 가입하지 않고 회사가 제공하는 서비스를 이용하는 자를 말합니다.</li>
                    </ul>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제3조 (약관의 효력 및 변경)</h2>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>본 약관은 서비스를 이용하고자 하는 모든 이용자에 대하여 그 효력을 발생합니다.</li>
                        <li>회사는 필요한 경우 관련 법령을 위배하지 않는 범위 내에서 본 약관을 변경할 수 있습니다.</li>
                        <li>약관이 변경되는 경우 회사는 변경사항을 시행일자 7일 전부터 서비스 내 공지사항을 통해 공지합니다.</li>
                    </ol>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제4조 (서비스의 제공)</h2>
                    <p class="text-gray-700 leading-relaxed mb-2">회사가 제공하는 서비스는 다음과 같습니다:</p>
                    <ul class="list-disc list-inside space-y-2 text-gray-700">
                        <li>부동산 분양 정보 제공 서비스</li>
                        <li>줍줍분양, 청약, 조합원 모집 등 관련 정보 제공</li>
                        <li>분양 일정 및 투자 정보 제공</li>
                        <li>관심 물건 등록 및 알림 서비스</li>
                        <li>기타 회사가 추가 개발하거나 제휴계약 등을 통해 이용자에게 제공하는 일체의 서비스</li>
                    </ul>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제5조 (서비스 이용시간)</h2>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>서비스의 이용은 연중무휴 1일 24시간을 원칙으로 합니다.</li>
                        <li>회사는 컴퓨터 등 정보통신설비의 보수점검, 교체 및 고장, 통신두절 또는 운영상 상당한 이유가 있는 경우 서비스의 제공을 일시적으로 중단할 수 있습니다.</li>
                    </ol>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제6조 (이용자의 의무)</h2>
                    <p class="text-gray-700 leading-relaxed mb-2">이용자는 다음 행위를 하여서는 안 됩니다:</p>
                    <ul class="list-disc list-inside space-y-2 text-gray-700">
                        <li>신청 또는 변경 시 허위내용의 등록</li>
                        <li>타인의 정보 도용</li>
                        <li>회사가 게시한 정보의 변경</li>
                        <li>회사가 정한 정보 이외의 정보(컴퓨터 프로그램 등) 등의 송신 또는 게시</li>
                        <li>회사와 기타 제3자의 저작권 등 지적재산권에 대한 침해</li>
                        <li>회사 및 기타 제3자의 명예를 손상시키거나 업무를 방해하는 행위</li>
                    </ul>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제7조 (저작권의 귀속 및 이용제한)</h2>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>회사가 작성한 저작물에 대한 저작권 기타 지적재산권은 회사에 귀속합니다.</li>
                        <li>이용자는 서비스를 이용함으로써 얻은 정보 중 회사에게 지적재산권이 귀속된 정보를 회사의 사전 승낙 없이 복제, 송신, 출판, 배포, 방송 기타 방법에 의하여 영리목적으로 이용하거나 제3자에게 이용하게 하여서는 안됩니다.</li>
                    </ol>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제8조 (면책조항)</h2>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.</li>
                        <li>회사는 이용자의 귀책사유로 인한 서비스 이용의 장애에 대하여 책임을 지지 않습니다.</li>
                        <li>회사는 이용자가 서비스를 이용하여 기대하는 수익을 상실한 것에 대하여 책임을 지지 않으며, 그 밖에 서비스를 통하여 얻은 자료로 인한 손해에 관하여 책임을 지지 않습니다.</li>
                        <li>회사는 제공된 분양 정보의 정확성, 신뢰성에 대해서는 보증하지 않으며, 이용자는 자신의 책임 하에 정보를 확인하고 이용해야 합니다.</li>
                    </ol>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제9조 (분쟁해결)</h2>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>회사와 이용자는 서비스와 관련하여 발생한 분쟁을 원만하게 해결하기 위하여 필요한 모든 노력을 하여야 합니다.</li>
                        <li>본 약관에 명시되지 않은 사항은 전기통신사업법 등 관계법령과 상관습에 따릅니다.</li>
                    </ol>
                </section>

                <section class="text-right text-sm text-gray-500 mt-12">
                    <p>시행일: 2025년 1월 1일</p>
                </section>
            </div>
            
            <div class="mt-8 text-center">
                <a href="/" class="inline-block bg-gray-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-all">
                    메인으로 돌아가기
                </a>
            </div>
        </main>
    </body>
    </html>
  `)
})

// Privacy Policy page
app.get('/privacy', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>개인정보처리방침 - 똑똑한한채</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          * { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
        </style>
    </head>
    <body class="bg-gray-50">
        <header class="bg-white sticky top-0 z-50 shadow-sm border-b border-gray-200">
            <div class="max-w-4xl mx-auto px-4 py-3">
                <a href="/" class="text-xl font-bold text-gray-900">똑똑한한채</a>
            </div>
        </header>
        
        <main class="max-w-4xl mx-auto px-4 py-12">
            <h1 class="text-3xl font-bold text-gray-900 mb-8">개인정보처리방침</h1>
            
            <div class="bg-white rounded-xl shadow-sm p-8 space-y-8">
                <section>
                    <p class="text-gray-700 leading-relaxed mb-4">
                        똑똑한한채(이하 "회사")는 「개인정보 보호법」 제30조에 따라 정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보 처리방침을 수립·공개합니다.
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제1조 (개인정보의 처리 목적)</h2>
                    <p class="text-gray-700 leading-relaxed mb-2">회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.</p>
                    <ul class="list-disc list-inside space-y-2 text-gray-700">
                        <li>회원 가입 및 관리: 회원 가입의사 확인, 회원제 서비스 제공에 따른 본인 식별·인증</li>
                        <li>서비스 제공: 분양 정보 제공, 관심 물건 알림, 조합원 문의 상담</li>
                        <li>마케팅 및 광고: 신규 서비스 개발 및 맞춤 서비스 제공, 이벤트 정보 및 참여기회 제공</li>
                    </ul>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제2조 (처리하는 개인정보의 항목)</h2>
                    <div class="space-y-4">
                        <div>
                            <h3 class="font-bold text-gray-900 mb-2">1. 회원가입 시</h3>
                            <ul class="list-disc list-inside space-y-1 text-gray-700 ml-4">
                                <li>필수항목: 이름, 이메일, 연락처(휴대전화번호)</li>
                                <li>선택항목: 관심 지역, 선호 평형대</li>
                            </ul>
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-900 mb-2">2. 조합원 문의 시</h3>
                            <ul class="list-disc list-inside space-y-1 text-gray-700 ml-4">
                                <li>필수항목: 이름, 연락처, 관심 지역</li>
                                <li>선택항목: 이메일, 문의 내용</li>
                            </ul>
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-900 mb-2">3. 서비스 이용 과정에서 자동 수집되는 정보</h3>
                            <ul class="list-disc list-inside space-y-1 text-gray-700 ml-4">
                                <li>IP주소, 쿠키, 방문 일시, 서비스 이용 기록</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제3조 (개인정보의 처리 및 보유기간)</h2>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>회사는 법령에 따른 개인정보 보유·이용기간 또는 정보주체로부터 개인정보를 수집 시에 동의받은 개인정보 보유·이용기간 내에서 개인정보를 처리·보유합니다.</li>
                        <li>각각의 개인정보 처리 및 보유 기간은 다음과 같습니다:
                            <ul class="list-disc list-inside ml-6 mt-2 space-y-1">
                                <li>회원정보: 회원 탈퇴 시까지</li>
                                <li>조합원 문의: 상담 완료 후 3개월</li>
                                <li>서비스 이용기록: 3개월</li>
                            </ul>
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제4조 (개인정보의 제3자 제공)</h2>
                    <p class="text-gray-700 leading-relaxed">
                        회사는 정보주체의 개인정보를 제1조(개인정보의 처리 목적)에서 명시한 범위 내에서만 처리하며, 정보주체의 동의, 법률의 특별한 규정 등 「개인정보 보호법」 제17조 및 제18조에 해당하는 경우에만 개인정보를 제3자에게 제공합니다.
                    </p>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제5조 (개인정보처리의 위탁)</h2>
                    <p class="text-gray-700 leading-relaxed mb-2">
                        회사는 원활한 개인정보 업무처리를 위하여 다음과 같이 개인정보 처리업무를 위탁하고 있습니다:
                    </p>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-gray-300">
                                    <th class="text-left py-2">수탁업체</th>
                                    <th class="text-left py-2">위탁업무 내용</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="border-b border-gray-200">
                                    <td class="py-2">Cloudflare</td>
                                    <td class="py-2">서버 호스팅 및 데이터 저장</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제6조 (정보주체의 권리·의무 및 행사방법)</h2>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>정보주체는 회사에 대해 언제든지 개인정보 열람·정정·삭제·처리정지 요구 등의 권리를 행사할 수 있습니다.</li>
                        <li>권리 행사는 회사에 대해 「개인정보 보호법」 시행령 제41조제1항에 따라 서면, 전자우편 등을 통하여 하실 수 있으며 회사는 이에 대해 지체 없이 조치하겠습니다.</li>
                        <li>정보주체가 개인정보의 오류 등에 대한 정정 또는 삭제를 요구한 경우에는 회사는 정정 또는 삭제를 완료할 때까지 당해 개인정보를 이용하거나 제공하지 않습니다.</li>
                    </ol>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제7조 (개인정보의 파기)</h2>
                    <ol class="list-decimal list-inside space-y-2 text-gray-700">
                        <li>회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.</li>
                        <li>파기의 절차 및 방법은 다음과 같습니다:
                            <ul class="list-disc list-inside ml-6 mt-2 space-y-1">
                                <li>파기절차: 불필요한 개인정보는 개인정보 보호책임자의 승인절차를 거쳐 파기합니다.</li>
                                <li>파기방법: 전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용합니다.</li>
                            </ul>
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제8조 (개인정보의 안전성 확보조치)</h2>
                    <p class="text-gray-700 leading-relaxed mb-2">회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다:</p>
                    <ul class="list-disc list-inside space-y-2 text-gray-700">
                        <li>관리적 조치: 내부관리계획 수립·시행, 정기적 직원 교육</li>
                        <li>기술적 조치: 개인정보처리시스템 등의 접근권한 관리, 접근통제시스템 설치, 개인정보의 암호화</li>
                        <li>물리적 조치: 전산실, 자료보관실 등의 접근통제</li>
                    </ul>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제9조 (개인정보 보호책임자)</h2>
                    <p class="text-gray-700 leading-relaxed mb-4">
                        회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
                    </p>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="font-bold text-gray-900">개인정보 보호책임자</p>
                        <ul class="mt-2 space-y-1 text-gray-700">
                            <li>이메일: privacy@smarthome.com</li>
                            <li>전화번호: 0505-321-8000</li>
                        </ul>
                    </div>
                </section>

                <section>
                    <h2 class="text-xl font-bold text-gray-900 mb-4">제10조 (개인정보 처리방침의 변경)</h2>
                    <p class="text-gray-700 leading-relaxed">
                        이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.
                    </p>
                </section>

                <section class="text-right text-sm text-gray-500 mt-12">
                    <p>시행일: 2025년 1월 1일</p>
                </section>
            </div>
            
            <div class="mt-8 text-center">
                <a href="/" class="inline-block bg-gray-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-all">
                    메인으로 돌아가기
                </a>
            </div>
        </main>
    </body>
    </html>
  `)
})

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>똑똑한한채 - 스마트 부동산 분양 정보</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          
          * {
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          }
          
          /* Toss Blue Color System */
          :root {
            --primary: #3182F6;
            --primary-light: #5599FF;
            --primary-lighter: #EBF4FF;
            --blue-gray: #4E5968;
            --light-gray: #F2F4F6;
          }
          
          .bg-primary { background-color: var(--primary); }
          .bg-primary-light { background-color: var(--primary-light); }
          .bg-primary-lighter { background-color: var(--primary-lighter); }
          .text-primary { color: var(--primary); }
          .border-primary { border-color: var(--primary); }
          
          .toss-card {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .toss-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          }
          
          .stat-card {
            transition: all 0.2s ease;
            cursor: pointer;
          }
          
          .stat-card:hover {
            transform: scale(1.02);
          }
          
          .stat-card.active {
            background: var(--primary);
            color: white;
          }
          
          .badge-new {
            background: #FF6B6B;
          }
          
          .badge-hot {
            background: #FF8C00;
          }
          
          .filter-btn {
            transition: all 0.2s ease;
            border: 1px solid #E5E8EB;
          }
          
          .filter-btn:hover {
            border-color: var(--primary);
            color: var(--primary);
          }
          
          .filter-btn.active {
            background-color: var(--primary);
            color: white;
            border-color: var(--primary);
          }
          
          .stat-card.active .text-xs,
          .stat-card.active .text-3xl {
            color: white !important;
          }
          
          /* 필터 섹션 전체 z-index */
          .filters-section {
            position: relative !important;
            z-index: 999999 !important;
          }
          
          .dropdown-content {
            display: none;
            position: fixed;
            background: white;
            border: 1px solid #E5E8EB;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.15);
            min-width: 180px;
            max-height: 400px;
            overflow-y: auto;
            padding: 8px;
            z-index: 999999 !important;
          }
          
          .dropdown-content.show {
            display: block;
          }
          
          .dropdown-content .filter-option {
            display: block;
            width: 100%;
            text-align: left;
            padding: 10px 16px;
            margin: 2px 0;
            background: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            color: #191F28;
            transition: all 0.2s;
            position: relative;
            z-index: 1;
          }
          
          .dropdown-content .filter-option:hover {
            background: #F0F9FF;
            color: var(--primary);
          }
          
          .filter-dropdown {
            position: relative !important;
            z-index: 10000 !important;
          }
          
          .filter-dropdown.open {
            z-index: 100000 !important;
          }
          
          /* 카드 컨테이너 z-index 제한 */
          #propertiesContainer {
            position: relative;
            z-index: 1 !important;
          }
          
          .toss-card {
            position: relative;
            z-index: 1 !important;
          }
          
          .toss-card * {
            position: relative;
            z-index: auto;
          }
          
          /* 메인 컨텐츠 영역 z-index 제한 */
          main {
            position: relative;
            z-index: 1 !important;
          }
          
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          .fade-in {
            animation: fadeIn 0.5s ease-out forwards;
          }
          
          .loading {
            opacity: 0.5;
            pointer-events: none;
          }
          
          .detail-row {
            display: flex;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
          }
          
          .detail-label {
            min-width: 80px;
            color: #666;
            font-size: 13px;
          }
          
          .detail-value {
            flex: 1;
            color: #191F28;
            font-size: 14px;
            font-weight: 500;
          }
          
          .modal {
            display: none;
          }
          
          .modal.show {
            display: flex;
          }
          
          .investment-positive {
            color: #dc2626;
            font-weight: 700;
          }
          
          .investment-negative {
            color: #2563eb;
            font-weight: 700;
          }
          
          .profit-badge {
            background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
            color: white;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 13px;
            display: inline-block;
            margin-left: 8px;
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <!-- Header -->
        <header class="bg-white sticky top-0 z-50 shadow-sm border-b border-gray-200">
            <div class="max-w-6xl mx-auto px-4 py-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <h1 class="text-xl font-bold text-gray-900">똑똑한한채</h1>
                        <span class="text-xs text-gray-500 hidden sm:inline">스마트 부동산 분양 정보</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-all">
                            <i class="fas fa-bell"></i>
                        </button>
                        <button id="loginBtn" class="bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-all text-sm">
                            로그인
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <!-- Stats Cards -->
        <section class="max-w-6xl mx-auto px-4 py-6">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3" id="statsContainer">
                <!-- Stats will be loaded here -->
            </div>
        </section>

        <!-- Main Content -->
        <main class="max-w-6xl mx-auto px-4 pb-12">
            <!-- Filters Section -->
            <div class="filters-section bg-white rounded-xl shadow-sm p-4 mb-6 fade-in">
                <div class="flex items-center gap-2 overflow-x-auto" style="white-space: nowrap; -webkit-overflow-scrolling: touch;">
                    <!-- Region Filter -->
                    <div class="relative filter-dropdown flex-shrink-0">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="region">
                            <span class="filter-text">지역</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content">
                            <button class="filter-option" data-filter-type="region" data-value="all">전국</button>
                            <button class="filter-option" data-filter-type="region" data-value="서울">서울특별시</button>
                            <button class="filter-option" data-filter-type="region" data-value="부산">부산광역시</button>
                            <button class="filter-option" data-filter-type="region" data-value="대구">대구광역시</button>
                            <button class="filter-option" data-filter-type="region" data-value="인천">인천광역시</button>
                            <button class="filter-option" data-filter-type="region" data-value="광주">광주광역시</button>
                            <button class="filter-option" data-filter-type="region" data-value="대전">대전광역시</button>
                            <button class="filter-option" data-filter-type="region" data-value="울산">울산광역시</button>
                            <button class="filter-option" data-filter-type="region" data-value="세종">세종특별자치시</button>
                            <button class="filter-option" data-filter-type="region" data-value="경기">경기도</button>
                            <button class="filter-option" data-filter-type="region" data-value="강원">강원특별자치도</button>
                            <button class="filter-option" data-filter-type="region" data-value="충북">충청북도</button>
                            <button class="filter-option" data-filter-type="region" data-value="충남">충청남도</button>
                            <button class="filter-option" data-filter-type="region" data-value="전북">전북특별자치도</button>
                            <button class="filter-option" data-filter-type="region" data-value="전라">전라남도</button>
                            <button class="filter-option" data-filter-type="region" data-value="경북">경상북도</button>
                            <button class="filter-option" data-filter-type="region" data-value="경상">경상남도</button>
                            <button class="filter-option" data-filter-type="region" data-value="제주">제주특별자치도</button>
                        </div>
                    </div>
                    
                    <!-- Type Filter -->
                    <div class="relative filter-dropdown flex-shrink-0">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="type">
                            <span class="filter-text">분양타입</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content">
                            <button class="filter-option" data-filter-type="type" data-value="all">전체</button>
                            <button class="filter-option" data-filter-type="type" data-value="unsold">줍줍분양</button>
                            <button class="filter-option" data-filter-type="type" data-value="today">오늘청약</button>
                            <button class="filter-option" data-filter-type="type" data-value="johab">모집중</button>
                            <button class="filter-option" data-filter-type="type" data-value="next">조합원</button>
                        </div>
                    </div>
                    
                    <!-- Household Filter -->
                    <div class="relative filter-dropdown flex-shrink-0">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="household">
                            <span class="filter-text">세대수</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content">
                            <button class="filter-option" data-filter-type="household" data-value="all">전체</button>
                            <button class="filter-option" data-filter-type="household" data-value="0-50">50세대 이하</button>
                            <button class="filter-option" data-filter-type="household" data-value="50-300">50-300세대</button>
                            <button class="filter-option" data-filter-type="household" data-value="300-1000">300-1000세대</button>
                            <button class="filter-option" data-filter-type="household" data-value="1000-+">1000세대 이상</button>
                        </div>
                    </div>
                    
                    <!-- Area Type Filter (평형) -->
                    <div class="relative filter-dropdown flex-shrink-0">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="area">
                            <span class="filter-text">평형</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content">
                            <button class="filter-option" data-filter-type="area" data-value="all">전체</button>
                            <button class="filter-option" data-filter-type="area" data-value="small">소형 (59㎡ 이하)</button>
                            <button class="filter-option" data-filter-type="area" data-value="medium">중형 (60-84㎡)</button>
                            <button class="filter-option" data-filter-type="area" data-value="large">대형 (85㎡ 이상)</button>
                        </div>
                    </div>
                    
                    <!-- Sort Filter -->
                    <div class="relative filter-dropdown flex-shrink-0">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="sort">
                            <span class="filter-text">마감임박순</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content">
                            <button class="filter-option" data-filter-type="sort" data-value="latest">최신순</button>
                            <button class="filter-option" data-filter-type="sort" data-value="deadline">마감임박순</button>
                            <button class="filter-option" data-filter-type="sort" data-value="price-low">낮은가격순</button>
                            <button class="filter-option" data-filter-type="sort" data-value="price-high">높은가격순</button>
                        </div>
                    </div>
                    
                    <!-- Reset Button -->
                    <button id="resetFilters" class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 ml-auto">
                        <i class="fas fa-redo text-xs mr-1"></i> 초기화
                    </button>
                </div>
                
                <!-- Active Filters Display -->
                <div id="activeFilters" class="mt-3 flex gap-2 flex-wrap hidden">
                    <!-- Active filter chips will appear here -->
                </div>
            </div>

            <!-- Properties Grid -->
            <div id="propertiesContainer" class="grid md:grid-cols-2 gap-6">
                <!-- Properties will be loaded here -->
            </div>

            <!-- Loading State -->
            <div id="loadingState" class="hidden text-center py-12">
                <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p class="text-gray-600 mt-4">로딩 중...</p>
            </div>
        </main>

        <!-- Event Banner -->
        <section class="max-w-6xl mx-auto px-4 pb-12">
            <div class="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl shadow-xl p-8 text-white fade-in">
                <div class="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h3 class="text-2xl font-bold mb-2">🎉 1월 관심등록 이벤트</h3>
                        <p class="text-purple-100">시흥센트럴 푸르지오 관심등록하고 상품권 받아가세요!</p>
                    </div>
                    <button class="bg-white text-purple-600 px-8 py-3 rounded-xl font-bold hover:bg-purple-50 transition-all">
                        자세히 보기
                    </button>
                </div>
            </div>
        </section>

        <!-- Notice Section -->
        <section class="max-w-6xl mx-auto px-4 pb-12">
            <div class="bg-gray-100 border-l-4 border-gray-400 p-6 rounded-xl">
                <div class="flex items-start gap-3">
                    <i class="fas fa-info-circle text-gray-500 text-lg mt-1"></i>
                    <div>
                        <h3 class="font-bold text-gray-900 mb-3 text-sm">공지사항</h3>
                        <ul class="text-xs text-gray-600 space-y-2">
                            <li>• 줍줍분양에 게시된 분양공고 내용을 외부에 등록 할 경우 반드시 출처에 "줍줍분양"를 표시하셔야 합니다.</li>
                            <li>• 분양공고 상세문의는 각 공고처(LH공사, SH공사)로 연락하세요.</li>
                            <li>• LH주택공사 고객센터: <strong>1600-1004</strong></li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- Footer -->
        <footer class="bg-gray-900 text-gray-400 py-12">
            <div class="max-w-6xl mx-auto px-4">
                <div class="grid md:grid-cols-3 gap-8">
                    <div>
                        <h4 class="text-white font-bold mb-4">똑똑한한채</h4>
                        <p class="text-sm">실전 투자 정보를 한눈에</p>
                    </div>
                    <div>
                        <h4 class="text-white font-bold mb-4">고객센터</h4>
                        <p class="text-sm">0505-321-8000</p>
                        <p class="text-sm">평일 09:00 - 18:00</p>
                    </div>
                    <div>
                        <h4 class="text-white font-bold mb-4">협력사</h4>
                        <p class="text-sm">LH주택공사: 1600-1004</p>
                        <p class="text-sm">SH공사: 1600-3456</p>
                    </div>
                </div>
                <div class="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
                    <div class="flex justify-center gap-6 mb-4">
                        <a href="/terms" class="hover:text-white transition-colors">이용약관</a>
                        <a href="/privacy" class="hover:text-white transition-colors">개인정보처리방침</a>
                    </div>
                    <p>© 2025 똑똑한한채. All rights reserved.</p>
                </div>
            </div>
        </footer>

        <!-- Detail Modal -->
        <div id="detailModal" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto relative">
                <button id="closeDetailModal" class="sticky top-4 right-4 float-right text-gray-400 hover:text-gray-600 text-2xl z-10 bg-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg">
                    <i class="fas fa-times"></i>
                </button>
                
                <div id="modalContent" class="p-8">
                    <!-- Modal content will be loaded here -->
                </div>
            </div>
        </div>

        <!-- Login Modal -->
        <div id="loginModal" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-md w-full p-8 relative fade-in">
                <button id="closeLoginModal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl">
                    <i class="fas fa-times"></i>
                </button>
                
                <h2 class="text-2xl font-bold text-gray-900 mb-2">로그인</h2>
                <p class="text-gray-600 text-sm mb-8">똑똑한한채에 오신 것을 환영합니다</p>
                
                <div class="space-y-3">
                    <!-- Kakao Login -->
                    <button class="social-btn w-full bg-[#FEE500] text-[#000000] py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-[#FDD835] transition-all">
                        <i class="fab fa-kickstarter text-xl"></i>
                        카카오로 시작하기
                    </button>
                    
                    <!-- Naver Login -->
                    <button class="social-btn w-full bg-[#03C75A] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-[#02b351] transition-all">
                        <span class="font-bold text-xl">N</span>
                        네이버로 시작하기
                    </button>
                    
                    <!-- Email Login -->
                    <button class="social-btn w-full bg-gray-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-800 transition-all">
                        <i class="fas fa-envelope text-lg"></i>
                        이메일로 시작하기
                    </button>
                </div>
                
                <div class="mt-8 text-center">
                    <p class="text-sm text-gray-600">
                        계정이 없으신가요?
                        <button id="signupBtn" class="text-gray-900 font-bold hover:underline ml-1">
                            회원가입
                        </button>
                    </p>
                </div>
            </div>
        </div>

        <!-- 조합원 등록 문의 Modal -->
        <div id="johapInquiryModal" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-lg w-full p-8 relative fade-in">
                <button id="closeJohapModal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl">
                    <i class="fas fa-times"></i>
                </button>
                
                <div class="mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">조합원 등록 문의</h2>
                    <p class="text-gray-600 text-sm">정보를 입력해주시면 담당자가 빠르게 연락드리겠습니다</p>
                </div>
                
                <form id="johapInquiryForm" class="space-y-4">
                    <!-- 이름 -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            이름 <span class="text-red-500">*</span>
                        </label>
                        <input type="text" id="johapName" required
                               class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                               placeholder="이름을 입력하세요">
                    </div>
                    
                    <!-- 연락처 -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            연락처 <span class="text-red-500">*</span>
                        </label>
                        <input type="tel" id="johapPhone" required
                               class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                               placeholder="010-1234-5678">
                    </div>
                    
                    <!-- 이메일 -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            이메일
                        </label>
                        <input type="email" id="johapEmail"
                               class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                               placeholder="example@email.com">
                    </div>
                    
                    <!-- 관심 지역 -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            관심 지역 <span class="text-red-500">*</span>
                        </label>
                        <select id="johapRegion" required
                                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all">
                            <option value="">선택해주세요</option>
                            <option value="서울">서울</option>
                            <option value="경기">경기</option>
                            <option value="인천">인천</option>
                            <option value="기타">기타</option>
                        </select>
                    </div>
                    
                    <!-- 문의 내용 -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">
                            문의 내용
                        </label>
                        <textarea id="johapMessage" rows="4"
                                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all resize-none"
                                  placeholder="문의하실 내용을 자유롭게 입력해주세요"></textarea>
                    </div>
                    
                    <!-- 개인정보 수집 동의 -->
                    <div class="flex items-start gap-2 bg-gray-50 p-4 rounded-lg">
                        <input type="checkbox" id="johapAgree" required
                               class="mt-1 w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary">
                        <label for="johapAgree" class="text-xs text-gray-600">
                            (필수) 개인정보 수집 및 이용에 동의합니다.<br>
                            수집 항목: 이름, 연락처, 이메일, 관심 지역<br>
                            이용 목적: 조합원 등록 문의 상담<br>
                            보유 기간: 상담 완료 후 3개월
                        </label>
                    </div>
                    
                    <!-- 제출 버튼 -->
                    <button type="submit"
                            class="w-full bg-primary text-white py-4 rounded-xl font-bold hover:bg-primary-light transition-all text-base">
                        <i class="fas fa-paper-plane mr-2"></i>
                        문의하기
                    </button>
                </form>
            </div>
        </div>

        <!-- 주변 아파트 정보 Modal -->
        <div id="nearbyApartmentModal" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-2xl w-full p-8 relative fade-in max-h-[90vh] overflow-y-auto">
                <button id="closeNearbyModal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl">
                    <i class="fas fa-times"></i>
                </button>
                
                <div class="mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">
                        <i class="fas fa-building text-primary mr-2"></i>
                        주변 아파트 정보 관리
                    </h2>
                    <p class="text-gray-600 text-sm">일반 분양의 경우 주변 아파트 시세를 추가하여 비교할 수 있습니다</p>
                </div>
                
                <form id="nearbyApartmentForm" class="space-y-6">
                    <input type="hidden" id="nearbyPropertyId">
                    
                    <!-- 현재 물건 정보 -->
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="text-sm font-semibold text-gray-700 mb-2">대상 물건</div>
                        <div id="nearbyPropertyTitle" class="text-lg font-bold text-gray-900"></div>
                    </div>
                    
                    <!-- 주변 아파트 목록 -->
                    <div id="nearbyApartmentList" class="space-y-3">
                        <!-- JavaScript로 동적 생성 -->
                    </div>
                    
                    <!-- 새 아파트 추가 -->
                    <div class="border-2 border-dashed border-gray-300 rounded-lg p-4">
                        <div class="text-sm font-bold text-gray-700 mb-4">
                            <i class="fas fa-plus-circle text-primary mr-2"></i>
                            새 주변 아파트 추가
                        </div>
                        
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-semibold text-gray-600 mb-1">
                                    아파트명 <span class="text-red-500">*</span>
                                </label>
                                <input type="text" id="newAptName" required
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm"
                                       placeholder="예: 래미안 푸르지오">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-600 mb-1">
                                    거리
                                </label>
                                <input type="text" id="newAptDistance"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm"
                                       placeholder="예: 500m">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-600 mb-1">
                                    최근 실거래가 (억원) <span class="text-red-500">*</span>
                                </label>
                                <input type="number" id="newAptPrice" step="0.1" min="0" required
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm"
                                       placeholder="예: 5.2">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-600 mb-1">
                                    거래 날짜 <span class="text-red-500">*</span>
                                </label>
                                <input type="date" id="newAptDate" required
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm">
                            </div>
                        </div>
                        
                        <button type="button" id="addNearbyApartment"
                                class="mt-4 w-full bg-primary text-white py-2 rounded-lg font-semibold hover:bg-primary-light transition-all text-sm">
                            <i class="fas fa-plus mr-2"></i>
                            추가하기
                        </button>
                    </div>
                    
                    <!-- 제출 버튼 -->
                    <div class="flex gap-3 pt-4 border-t">
                        <button type="button" id="cancelNearby"
                                class="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-300 transition-all">
                            닫기
                        </button>
                        <button type="submit"
                                class="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary-light transition-all">
                            <i class="fas fa-save mr-2"></i>
                            저장하기
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
        <script>
          // Filter state
          const filters = {
            region: 'all',
            type: 'all',
            household: 'all',
            area: 'all',
            sort: 'deadline'
          };

          // Calculate D-Day
          function calculateDDay(deadlineStr) {
            const deadline = new Date(deadlineStr);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            deadline.setHours(0, 0, 0, 0);
            
            const diffTime = deadline - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) {
              return { text: '마감', class: 'bg-gray-400', days: diffDays };
            } else if (diffDays === 0) {
              return { text: 'D-Day', class: 'bg-red-500', days: 0 };
            } else if (diffDays <= 7) {
              return { text: \`D-\${diffDays}\`, class: 'bg-red-500', days: diffDays };
            } else if (diffDays <= 30) {
              return { text: \`D-\${diffDays}\`, class: 'bg-orange-500', days: diffDays };
            } else {
              return { text: \`D-\${diffDays}\`, class: 'bg-blue-500', days: diffDays };
            }
          }

          // Open map
          function openMap(address, lat, lng) {
            if (lat && lng && lat !== 0 && lng !== 0) {
              window.open(\`https://map.kakao.com/link/map/\${encodeURIComponent(address)},\${lat},\${lng}\`, '_blank');
            } else {
              window.open(\`https://map.kakao.com/link/search/\${encodeURIComponent(address)}\`, '_blank');
            }
          }

          // Format margin
          function formatMargin(margin, rate) {
            if (!margin || margin === 0) return null;
            
            const sign = margin > 0 ? '+' : '';
            const color = margin > 0 ? 'investment-positive' : 'investment-negative';
            
            return {
              text: \`\${sign}\${margin.toFixed(1)}억 (\${sign}\${rate.toFixed(1)}%)\`,
              color: color
            };
          }

          // Show detail modal
          async function showDetail(id) {
            try {
              const response = await axios.get(\`/api/properties/detail/\${id}\`);
              const property = response.data;
              
              const dday = calculateDDay(property.deadline);
              const margin = formatMargin(property.expected_margin, property.margin_rate);
              
              const modalContent = document.getElementById('modalContent');
              modalContent.innerHTML = \`
                <div class="space-y-6">
                  <!-- Header -->
                  <div>
                    <div class="flex items-start justify-between mb-2">
                      <h2 class="text-2xl font-bold text-gray-900">\${property.title}</h2>
                      \${property.badge ? \`
                        <span class="badge-\${property.badge.toLowerCase()} text-white text-xs font-bold px-3 py-1 rounded-full">
                          \${property.badge}
                        </span>
                      \` : ''}
                    </div>
                    
                    <div class="flex items-center gap-2 text-gray-600 mb-2">
                      <i class="fas fa-map-marker-alt text-primary"></i>
                      <span class="text-sm">\${property.full_address || property.location}</span>
                      <button onclick="openMap('\${property.full_address || property.location}', \${property.lat}, \${property.lng})" 
                              class="text-primary text-sm font-medium hover:underline ml-2">
                        <i class="fas fa-map-marked-alt mr-1"></i>지도에서 보기
                      </button>
                    </div>
                    
                    <div class="flex items-center gap-2">
                      <span class="\${dday.class} text-white text-xs font-bold px-3 py-1 rounded-full">
                        \${dday.text}
                      </span>
                      <span class="text-sm text-gray-600">\${property.deadline}까지</span>
                    </div>
                  </div>

                  <!-- Investment Info -->
                  \${margin ? \`
                    <div class="bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-xl p-6">
                      <h3 class="text-lg font-bold text-gray-900 mb-4 flex items-center">
                        <i class="fas fa-chart-line text-red-500 mr-2"></i>
                        투자 분석
                      </h3>
                      <div class="space-y-3">
                        <div class="flex justify-between items-center">
                          <span class="text-sm text-gray-600">분양 당시</span>
                          <span class="font-bold text-gray-900">\${property.original_price.toFixed(1)}억</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-sm text-gray-600">최근 실거래가</span>
                          <span class="font-bold text-gray-900">\${property.recent_trade_price.toFixed(1)}억</span>
                        </div>
                        <div class="border-t-2 border-red-200 pt-3 flex justify-between items-center">
                          <span class="text-base font-bold text-gray-900">예상 마진</span>
                          <div class="text-right">
                            <div class="\${margin.color} text-xl">\${margin.text}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  \` : ''}

                  <!-- Basic Info -->
                  <div class="bg-gray-50 rounded-xl p-6">
                    <h3 class="text-lg font-bold text-gray-900 mb-4 flex items-center">
                      <i class="fas fa-building text-primary mr-2"></i>
                      단지 정보
                    </h3>
                    <div class="space-y-3">
                      \${property.area_type ? \`
                        <div class="flex justify-between">
                          <span class="text-sm text-gray-600">면적</span>
                          <span class="text-sm font-medium text-gray-900">\${property.area_type}</span>
                        </div>
                      \` : ''}
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">분양가</span>
                        <span class="text-sm font-medium text-gray-900">\${property.price}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-sm text-gray-600">모집세대</span>
                        <span class="text-sm font-medium text-gray-900">\${property.households}</span>
                      </div>
                      \${property.move_in_date ? \`
                        <div class="flex justify-between">
                          <span class="text-sm text-gray-600">입주예정</span>
                          <span class="text-sm font-medium text-gray-900">\${property.move_in_date}</span>
                        </div>
                      \` : ''}
                      \${property.parking ? \`
                        <div class="flex justify-between">
                          <span class="text-sm text-gray-600">주차</span>
                          <span class="text-sm font-medium text-gray-900">\${property.parking}</span>
                        </div>
                      \` : ''}
                      \${property.heating ? \`
                        <div class="flex justify-between">
                          <span class="text-sm text-gray-600">난방</span>
                          <span class="text-sm font-medium text-gray-900">\${property.heating}</span>
                        </div>
                      \` : ''}
                      \${property.builder ? \`
                        <div class="flex justify-between">
                          <span class="text-sm text-gray-600">시공사</span>
                          <span class="text-sm font-medium text-gray-900">\${property.builder}</span>
                        </div>
                      \` : ''}
                    </div>
                  </div>

                  <!-- Infrastructure -->
                  <div class="grid md:grid-cols-2 gap-4">
                    \${property.transportation ? \`
                      <div class="bg-blue-50 rounded-xl p-4">
                        <h4 class="text-sm font-bold text-gray-900 mb-2 flex items-center">
                          <i class="fas fa-subway text-primary mr-2"></i>교통
                        </h4>
                        <p class="text-xs text-gray-700 leading-relaxed">\${property.transportation}</p>
                      </div>
                    \` : ''}
                    
                    \${property.education ? \`
                      <div class="bg-green-50 rounded-xl p-4">
                        <h4 class="text-sm font-bold text-gray-900 mb-2 flex items-center">
                          <i class="fas fa-school text-green-600 mr-2"></i>교육
                        </h4>
                        <p class="text-xs text-gray-700 leading-relaxed">\${property.education}</p>
                      </div>
                    \` : ''}
                    
                    \${property.shopping ? \`
                      <div class="bg-purple-50 rounded-xl p-4">
                        <h4 class="text-sm font-bold text-gray-900 mb-2 flex items-center">
                          <i class="fas fa-shopping-cart text-purple-600 mr-2"></i>쇼핑
                        </h4>
                        <p class="text-xs text-gray-700 leading-relaxed">\${property.shopping}</p>
                      </div>
                    \` : ''}
                    
                    \${property.medical ? \`
                      <div class="bg-red-50 rounded-xl p-4">
                        <h4 class="text-sm font-bold text-gray-900 mb-2 flex items-center">
                          <i class="fas fa-hospital text-red-600 mr-2"></i>병원
                        </h4>
                        <p class="text-xs text-gray-700 leading-relaxed">\${property.medical}</p>
                      </div>
                    \` : ''}
                  </div>

                  <!-- Official Documents -->
                  <div class="flex gap-3">
                    \${property.lh_notice_url ? \`
                      <a href="\${property.lh_notice_url}" target="_blank" 
                         class="flex-1 bg-primary text-white text-center py-3 rounded-xl font-bold hover:bg-primary-light transition-all">
                        <i class="fas fa-external-link-alt mr-2"></i>LH 공고 보기
                      </a>
                    \` : ''}
                    \${property.pdf_url ? \`
                      <a href="\${property.pdf_url}" target="_blank" 
                         class="flex-1 bg-gray-800 text-white text-center py-3 rounded-xl font-bold hover:bg-gray-700 transition-all">
                        <i class="fas fa-file-pdf mr-2"></i>PDF 다운로드
                      </a>
                    \` : ''}
                  </div>
                </div>
              \`;
              
              document.getElementById('detailModal').classList.add('show');
            } catch (error) {
              console.error('Failed to load detail:', error);
              alert('상세 정보를 불러올 수 없습니다.');
            }
          }

          // Load statistics
          async function loadStats() {
            try {
              const response = await axios.get('/api/stats');
              const stats = response.data;
              
              const statsContainer = document.getElementById('statsContainer');
              statsContainer.innerHTML = \`
                <div class="stat-card bg-white rounded-xl shadow-sm p-5 active" data-type="unsold">
                  <div class="text-xs text-gray-500 mb-2 font-medium">줍줍분양</div>
                  <div class="text-3xl font-bold">\${stats.unsold}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-5" data-type="today">
                  <div class="text-xs text-gray-500 mb-2 font-medium">오늘청약</div>
                  <div class="text-3xl font-bold text-gray-900">0</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-5" data-type="all">
                  <div class="text-xs text-gray-500 mb-2 font-medium">전체분양</div>
                  <div class="text-3xl font-bold text-gray-900">\${stats.unsold + stats.johab + stats.next}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-5 cursor-pointer" onclick="openJohapInquiry()">
                  <div class="text-xs text-gray-500 mb-2 font-medium">조합원</div>
                  <div class="text-3xl font-bold text-gray-900">0</div>
                </div>
              \`;
              
              // Add click handlers
              document.querySelectorAll('.stat-card').forEach(card => {
                const type = card.dataset.type;
                // 조합원 카드는 onclick으로 처리되므로 제외
                if (!card.hasAttribute('onclick')) {
                  card.addEventListener('click', () => {
                    filters.type = type;
                    updateActiveFilters();
                    loadProperties();
                    
                    // Update active state
                    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                  });
                }
              });
            } catch (error) {
              console.error('Failed to load stats:', error);
            }
          }

          // Load properties
          async function loadProperties() {
            const container = document.getElementById('propertiesContainer');
            container.classList.add('loading');
            
            try {
              const params = new URLSearchParams(filters);
              const response = await axios.get(\`/api/properties?\${params}\`);
              const properties = response.data;
              
              if (properties.length === 0) {
                // 조합원 탭일 경우 다른 메시지 표시
                if (filters.type === 'next') {
                  container.innerHTML = \`
                    <div class="col-span-2 text-center py-12">
                      <div class="text-6xl mb-4">👥</div>
                      <h3 class="text-xl font-bold text-gray-900 mb-2">등록되어 있는 조합원이 없습니다</h3>
                    </div>
                  \`;
                } else {
                  container.innerHTML = \`
                    <div class="col-span-2 text-center py-12">
                      <div class="text-6xl mb-4">🏠</div>
                      <h3 class="text-xl font-bold text-gray-900 mb-2">분양 정보가 없습니다</h3>
                      <p class="text-gray-600">필터를 조정해보세요!</p>
                    </div>
                  \`;
                }
              } else {
                container.innerHTML = properties.map(property => {
                  const dday = calculateDDay(property.deadline);
                  const margin = formatMargin(property.expected_margin, property.margin_rate);
                  
                  return \`
                  <div class="toss-card bg-white rounded-xl shadow-sm overflow-hidden fade-in">
                    <div class="p-5">
                      <!-- Header -->
                      <div class="flex items-start justify-between mb-3">
                        <div class="flex-1">
                          <div class="flex items-center gap-2 mb-2">
                            <h3 class="text-lg font-bold text-gray-900">\${property.title}</h3>
                            \${property.badge ? \`
                              <span class="badge-\${property.badge.toLowerCase()} text-white text-xs font-bold px-2 py-0.5 rounded">
                                \${property.badge}
                              </span>
                            \` : ''}
                          </div>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="\${dday.class} text-white text-xs font-bold px-2 py-1 rounded">
                            \${dday.text}
                          </span>
                        </div>
                      </div>
                      
                      <!-- Location -->
                      <div class="mb-3">
                        <div class="flex items-center gap-2 text-sm text-gray-700 mb-1">
                          <i class="fas fa-map-marker-alt text-primary text-xs"></i>
                          <span class="font-medium">\${property.full_address || property.location}</span>
                        </div>
                        \${property.full_address ? \`
                          <button onclick="openMap('\${property.full_address.replace(/'/g, "\\\\'")}', \${property.lat}, \${property.lng})" 
                                  class="text-primary text-xs hover:underline ml-5 flex items-center gap-1">
                            🗺️ 지도에서 보기
                          </button>
                        \` : ''}
                      </div>
                      
                      <!-- Key Info Grid -->
                      <div class="bg-gray-50 rounded-lg p-4 mb-3">
                        <div class="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div class="text-xs text-gray-500 mb-1">📅 줍줍일</div>
                            <div class="font-bold text-gray-900">\${property.deadline}</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">🏠 분양세대</div>
                            <div class="font-bold text-gray-900">\${property.household_count ? property.household_count + '세대' : property.households}</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">📏 전용면적</div>
                            <div class="font-bold text-gray-900">\${property.exclusive_area || '-'}</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">📐 공급면적</div>
                            <div class="font-bold text-gray-900">\${
                              (() => {
                                // supply_area에 범위(~)가 포함되어 있으면 잘못된 데이터이므로 전용면적 기반 계산
                                if (property.supply_area && property.supply_area.includes('~')) {
                                  if (property.exclusive_area) {
                                    const exclusiveNum = parseFloat(property.exclusive_area);
                                    if (!isNaN(exclusiveNum)) {
                                      const supplyNum = (exclusiveNum * 1.33).toFixed(2);
                                      return supplyNum + '㎡';
                                    }
                                  }
                                  return '-';
                                }
                                // 정상 데이터는 그대로 표시
                                return property.supply_area || '-';
                              })()
                            }</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">💰 분양가격</div>
                            <div class="font-bold text-gray-900 text-xs">\${
                              property.sale_price_min && property.sale_price_max 
                                ? property.sale_price_min.toFixed(1) + '억~' + property.sale_price_max.toFixed(1) + '억'
                                : property.price
                            }</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">🏗️ 시공사</div>
                            <div class="font-bold text-gray-900 text-xs">\${property.builder || '-'}</div>
                          </div>
                          \${property.special_supply_date ? \`
                          <div>
                            <div class="text-xs text-gray-500 mb-1">⭐ 특별청약</div>
                            <div class="font-bold text-primary text-xs">\${property.special_supply_date}</div>
                          </div>
                          \` : ''}
                          \${property.subscription_start || property.subscription_end ? \`
                          <div>
                            <div class="text-xs text-gray-500 mb-1">📝 무순위청약</div>
                            <div class="font-bold text-primary text-xs">\${property.subscription_start}\${property.subscription_end && property.subscription_end !== property.subscription_start ? '~' + property.subscription_end : ''}</div>
                          </div>
                          \` : ''}
                        </div>
                        \${property.description ? \`
                          <div class="mt-3 pt-3 border-t border-gray-200">
                            <div class="text-xs text-gray-600">\${property.description}</div>
                          </div>
                        \` : ''}
                        \${property.contact_number ? \`
                          <div class="mt-3 pt-3 border-t border-gray-200">
                            <div class="flex items-center justify-between">
                              <span class="text-xs text-gray-500">📞 상담문의</span>
                              <a href="tel:\${property.contact_number}" class="text-sm font-bold text-primary hover:underline">\${property.contact_number}</a>
                            </div>
                          </div>
                        \` : ''}
                      </div>
                      
                      <!-- 💰 투자 정보 (투자형만 표시) -->
                      \${property.type === 'unsold' && (property.sale_price_min >= 0.1 || property.sale_price_max >= 0.1 || property.recent_trade_price >= 0.1) ? \`
                      <div class="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-400 rounded-xl p-4 mb-3">
                        <div class="text-sm font-bold text-gray-800 mb-3">💰 투자 정보</div>
                        <div class="space-y-3">
                          <!-- 기존 분양가 (0.1억 이상만 표시) -->
                          \${(property.sale_price_min >= 0.1 || property.sale_price_max >= 0.1) ? \`
                            <div class="flex justify-between items-center">
                              <div class="flex flex-col">
                                <span class="text-sm text-gray-700 font-semibold">기존 분양가</span>
                                \${property.sale_price_date ? \`
                                  <span class="text-xs text-gray-500 mt-0.5">(\${property.sale_price_date})</span>
                                \` : ''}
                              </div>
                              <div class="text-right">
                                <div class="text-base font-semibold text-gray-900">
                                  \${property.sale_price_min >= 0.1 && property.sale_price_max >= 0.1
                                    ? \`\${property.sale_price_min.toFixed(2)}억 ~ \${property.sale_price_max.toFixed(2)}억\`
                                    : property.sale_price_min >= 0.1
                                      ? \`\${property.sale_price_min.toFixed(2)}억\`
                                      : \`\${property.sale_price_max.toFixed(2)}억\`
                                  }
                                </div>
                              </div>
                            </div>
                          \` : ''}
                          
                          <!-- 최근 실거래가 (0.1억 이상만 표시) -->
                          \${property.recent_trade_price >= 0.1 ? \`
                            <div class="flex justify-between items-center \${(property.sale_price_min >= 0.1 || property.sale_price_max >= 0.1) ? 'border-t border-red-200 pt-3' : ''}">
                              <div class="flex flex-col">
                                <span class="text-sm text-gray-700 font-semibold">최근 실거래가</span>
                                \${property.recent_trade_date ? \`
                                  <span class="text-xs text-gray-500 mt-0.5">(\${property.recent_trade_date})</span>
                                \` : ''}
                              </div>
                              <div class="text-base font-semibold text-gray-900">
                                \${property.recent_trade_price.toFixed(1)}억
                              </div>
                            </div>
                          \` : ''}
                          
                          <!-- 상승률 표시 -->
                          \${(property.sale_price_min >= 0.1 || property.sale_price_max >= 0.1) && property.recent_trade_price >= 0.1 ? \`
                            <div class="border-t border-red-200 pt-3">
                              <div class="flex justify-between items-center">
                                <span class="text-sm text-gray-600">기존 분양가 대비</span>
                                <span class="text-base font-bold \${(() => {
                                  const basePrice = property.sale_price_max || property.sale_price_min;
                                  const rate = ((property.recent_trade_price - basePrice) / basePrice * 100);
                                  return rate > 0 ? 'text-red-600' : 'text-blue-600';
                                })()}">
                                  \${(() => {
                                    const basePrice = property.sale_price_max || property.sale_price_min;
                                    const rate = ((property.recent_trade_price - basePrice) / basePrice * 100);
                                    return (rate > 0 ? '+' : '') + rate.toFixed(1) + '%';
                                  })()}
                                </span>
                              </div>
                            </div>
                          \` : ''}
                        </div>
                      </div>
                      \` : ''}
                      
                      <!-- Tags -->
                      <div class="flex flex-wrap gap-1.5 mb-3">
                        \${property.tags.map(tag => \`
                          <span class="bg-primary-lighter text-primary text-xs font-medium px-2 py-1 rounded">
                            \${tag}
                          </span>
                        \`).join('')}
                      </div>
                      
                      <!-- 주변 아파트 정보 (일반 분양만) -->
                      \${property.type !== 'next' && property.type !== 'unsold' && property.nearby_apartments ? (() => {
                        try {
                          const nearby = JSON.parse(property.nearby_apartments);
                          if (nearby.length > 0) {
                            return \`
                              <div class="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 mb-3">
                                <div class="text-xs font-bold text-gray-700 mb-2 flex items-center justify-between">
                                  <span><i class="fas fa-building text-blue-600 mr-1"></i> 주변 아파트 시세</span>
                                  <button onclick="showNearbyApartments(\${property.id})" 
                                          class="text-blue-600 hover:text-blue-800 text-xs">
                                    <i class="fas fa-edit mr-1"></i>편집
                                  </button>
                                </div>
                                <div class="space-y-2">
                                  \${nearby.slice(0, 3).map(apt => \`
                                    <div class="flex justify-between items-center text-xs bg-white p-2 rounded">
                                      <div class="flex-1">
                                        <span class="font-semibold text-gray-900">\${apt.name}</span>
                                        <span class="text-gray-500 ml-2">\${apt.distance || ''}</span>
                                      </div>
                                      <div class="text-right">
                                        <div class="font-bold text-blue-600">\${apt.recent_price}억</div>
                                        <div class="text-gray-400 text-xs">\${apt.date}</div>
                                      </div>
                                    </div>
                                  \`).join('')}
                                  \${nearby.length > 3 ? \`
                                    <div class="text-center text-xs text-gray-500">
                                      외 \${nearby.length - 3}건 더보기
                                    </div>
                                  \` : ''}
                                </div>
                              </div>
                            \`;
                          }
                        } catch (e) {}
                        return '';
                      })() : ''}
                      
                      <!-- Action Buttons -->
                      <div class="flex gap-2">
                        <!-- 상세 정보 버튼 (모든 타입 공통) -->
                        <button onclick="showDetail(\${property.id})" 
                                class="w-full bg-white border-2 border-primary text-primary font-medium py-2.5 rounded-lg hover:bg-primary transition-all text-sm group">
                          <span class="group-hover:text-white">
                            <i class="fas fa-info-circle mr-1"></i>
                            상세 정보
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                \`;
                }).join('');
              }
            } catch (error) {
              console.error('Failed to load properties:', error);
              container.innerHTML = \`
                <div class="col-span-2 text-center py-12">
                  <div class="text-6xl mb-4">😢</div>
                  <h3 class="text-xl font-bold text-gray-900 mb-2">정보를 불러올 수 없습니다</h3>
                  <p class="text-gray-600">잠시 후 다시 시도해주세요.</p>
                </div>
              \`;
            } finally {
              container.classList.remove('loading');
            }
          }

          // Update active filters display
          function updateActiveFilters() {
            const activeFiltersContainer = document.getElementById('activeFilters');
            const activeFilters = [];
            
            if (filters.region !== 'all') activeFilters.push({ type: 'region', value: filters.region });
            if (filters.type !== 'all') {
              const typeNames = { unsold: '줍줍분양', today: '오늘청약', all: '전체분양', johab: '모집중', next: '조합원' };
              activeFilters.push({ type: 'type', value: typeNames[filters.type] });
            }
            if (filters.household !== 'all') {
              const householdNames = {
                '0-50': '50세대 이하',
                '50-300': '50-300세대',
                '300-1000': '300-1000세대',
                '1000-+': '1000세대 이상'
              };
              activeFilters.push({ type: 'household', value: householdNames[filters.household] });
            }
            if (filters.area !== 'all') {
              const areaNames = {
                small: '소형 (59㎡↓)',
                medium: '중형 (60-84㎡)',
                large: '대형 (85㎡↑)'
              };
              activeFilters.push({ type: 'area', value: areaNames[filters.area] });
            }
            if (filters.sort !== 'deadline') {
              const sortNames = {
                latest: '최신순',
                'price-low': '낮은가격순',
                'price-high': '높은가격순'
              };
              activeFilters.push({ type: 'sort', value: sortNames[filters.sort] });
            }
            
            if (activeFilters.length > 0) {
              activeFiltersContainer.classList.remove('hidden');
              activeFiltersContainer.innerHTML = activeFilters.map(filter => \`
                <span class="bg-primary text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
                  \${filter.value}
                  <button class="hover:bg-primary-light rounded-full" onclick="removeFilter('\${filter.type}')">
                    <i class="fas fa-times text-xs"></i>
                  </button>
                </span>
              \`).join('');
            } else {
              activeFiltersContainer.classList.add('hidden');
            }
          }

          // Remove filter
          window.removeFilter = function(type) {
            if (type === 'region') filters.region = 'all';
            if (type === 'type') filters.type = 'all';
            if (type === 'household') filters.household = 'all';
            if (type === 'area') filters.area = 'all';
            if (type === 'sort') filters.sort = 'deadline';
            
            updateActiveFilters();
            updateFilterButtonTexts();
            loadProperties();
          };

          // Update filter button texts
          function updateFilterButtonTexts() {
            const filterBtns = document.querySelectorAll('.filter-btn');
            filterBtns.forEach(btn => {
              const filterType = btn.dataset.filter;
              const text = btn.querySelector('.filter-text');
              
              if (filterType === 'region' && filters.region !== 'all') {
                text.textContent = filters.region;
                btn.classList.add('active');
              } else if (filterType === 'type' && filters.type !== 'all') {
                const typeNames = { unsold: '줍줍분양', today: '오늘청약', all: '전체분양', johab: '모집중', next: '조합원' };
                text.textContent = typeNames[filters.type];
                btn.classList.add('active');
              } else if (filterType === 'household' && filters.household !== 'all') {
                const householdNames = {
                  '0-50': '50세대↓',
                  '50-300': '50-300',
                  '300-1000': '300-1000',
                  '1000-+': '1000↑'
                };
                text.textContent = householdNames[filters.household];
                btn.classList.add('active');
              } else if (filterType === 'area' && filters.area !== 'all') {
                const areaNames = {
                  small: '소형',
                  medium: '중형',
                  large: '대형'
                };
                text.textContent = areaNames[filters.area];
                btn.classList.add('active');
              } else if (filterType === 'sort' && filters.sort !== 'deadline') {
                const sortNames = {
                  latest: '최신순',
                  'price-low': '낮은가격',
                  'price-high': '높은가격'
                };
                text.textContent = sortNames[filters.sort];
                btn.classList.add('active');
              } else {
                // Reset to default
                if (filterType === 'region') text.textContent = '지역';
                if (filterType === 'type') text.textContent = '분양타입';
                if (filterType === 'household') text.textContent = '세대수';
                if (filterType === 'area') text.textContent = '평형';
                if (filterType === 'sort') text.textContent = '마감임박순';
                btn.classList.remove('active');
              }
            });
          }

          // Dropdown handlers
          // Filter button click handlers
          document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
              e.stopPropagation();
              
              const dropdown = this.nextElementSibling;
              const parent = this.closest('.filter-dropdown');
              const isOpen = dropdown.classList.contains('show');
              
              // Close all other dropdowns
              document.querySelectorAll('.dropdown-content.show').forEach(d => {
                if (d !== dropdown) {
                  d.classList.remove('show');
                  d.closest('.filter-dropdown').classList.remove('open');
                }
              });
              
              // Toggle this dropdown
              if (isOpen) {
                dropdown.classList.remove('show');
                parent.classList.remove('open');
              } else {
                // Calculate position
                const rect = this.getBoundingClientRect();
                dropdown.style.top = rect.bottom + 4 + 'px';
                dropdown.style.left = rect.left + 'px';
                dropdown.style.minWidth = rect.width + 'px';
                
                dropdown.classList.add('show');
                parent.classList.add('open');
              }
            });
          });

          // Filter option click handlers
          document.querySelectorAll('.filter-option').forEach(option => {
            option.addEventListener('click', function(e) {
              e.stopPropagation();
              
              const filterType = this.dataset.filterType;
              const value = this.dataset.value;
              filters[filterType] = value;
              
              // Close dropdown
              const dropdown = this.closest('.dropdown-content');
              dropdown.classList.remove('show');
              dropdown.closest('.filter-dropdown').classList.remove('open');
              
              updateActiveFilters();
              updateFilterButtonTexts();
              loadProperties();
            });
          });

          // Close dropdowns when clicking outside
          document.addEventListener('click', function() {
            document.querySelectorAll('.dropdown-content.show').forEach(d => {
              d.classList.remove('show');
              d.closest('.filter-dropdown').classList.remove('open');
            });
          });

          // Reset filters
          document.getElementById('resetFilters').addEventListener('click', () => {
            filters.region = 'all';
            filters.type = 'all';
            filters.household = 'all';
            filters.area = 'all';
            filters.sort = 'deadline';
            
            updateActiveFilters();
            updateFilterButtonTexts();
            loadProperties();
          });

          // Modal handlers
          document.getElementById('closeDetailModal').addEventListener('click', () => {
            document.getElementById('detailModal').classList.remove('show');
          });

          document.getElementById('detailModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('detailModal')) {
              document.getElementById('detailModal').classList.remove('show');
            }
          });

          // Login modal handlers
          const loginModal = document.getElementById('loginModal');
          const loginBtn = document.getElementById('loginBtn');
          const closeLoginModal = document.getElementById('closeLoginModal');
          const signupBtn = document.getElementById('signupBtn');

          loginBtn.addEventListener('click', () => {
            loginModal.classList.add('show');
          });

          closeLoginModal.addEventListener('click', () => {
            loginModal.classList.remove('show');
          });

          loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) {
              loginModal.classList.remove('show');
            }
          });

          // 조합원 문의 modal handlers
          const johapModal = document.getElementById('johapInquiryModal');
          const closeJohapModal = document.getElementById('closeJohapModal');
          const johapForm = document.getElementById('johapInquiryForm');

          // 조합원 문의 팝업 열기 함수
          window.showJohapInquiry = function() {
            johapModal.classList.add('show');
          };

          // 닫기 버튼
          closeJohapModal.addEventListener('click', () => {
            johapModal.classList.remove('show');
          });

          // 배경 클릭 시 닫기
          johapModal.addEventListener('click', (e) => {
            if (e.target === johapModal) {
              johapModal.classList.remove('show');
            }
          });

          // 폼 제출 처리
          johapForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
              name: document.getElementById('johapName').value,
              phone: document.getElementById('johapPhone').value,
              email: document.getElementById('johapEmail').value,
              region: document.getElementById('johapRegion').value,
              message: document.getElementById('johapMessage').value,
              agreed: document.getElementById('johapAgree').checked,
              timestamp: new Date().toISOString()
            };
            
            // TODO: 실제 서버로 전송 (현재는 콘솔 출력)
            console.log('조합원 등록 문의:', formData);
            
            // 성공 메시지
            alert('문의가 접수되었습니다!\\n담당자가 빠른 시일 내에 연락드리겠습니다.');
            
            // 폼 초기화 및 모달 닫기
            johapForm.reset();
            johapModal.classList.remove('show');
          });

          // 주변 아파트 정보 modal handlers
          const nearbyModal = document.getElementById('nearbyApartmentModal');
          const closeNearbyModal = document.getElementById('closeNearbyModal');
          const cancelNearby = document.getElementById('cancelNearby');
          const nearbyForm = document.getElementById('nearbyApartmentForm');
          let currentNearbyApartments = [];

          // 주변 아파트 정보 팝업 열기 함수
          window.showNearbyApartments = async function(id) {
            try {
              // 1. 먼저 물건 정보 가져오기
              const response = await axios.get(\`/api/properties/detail/\${id}\`);
              const property = response.data;
              
              document.getElementById('nearbyPropertyId').value = property.id;
              document.getElementById('nearbyPropertyTitle').textContent = property.title;
              
              // 2. 기존 주변 아파트 정보 확인
              currentNearbyApartments = property.nearby_apartments ? JSON.parse(property.nearby_apartments) : [];
              
              // 3. 주변 아파트가 없으면 자동 검색 수행
              if (currentNearbyApartments.length === 0) {
                // 로딩 표시
                const list = document.getElementById('nearbyApartmentList');
                list.innerHTML = \`
                  <div class="text-center py-12">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p class="text-gray-600">주변 아파트 실거래가를 검색 중...</p>
                  </div>
                \`;
                
                // 모달 먼저 열기
                nearbyModal.classList.add('show');
                
                try {
                  // 자동 검색 API 호출
                  const autoResponse = await axios.post(\`/api/properties/\${id}/auto-nearby\`);
                  
                  if (autoResponse.data.success && autoResponse.data.data) {
                    currentNearbyApartments = autoResponse.data.data;
                    renderNearbyApartments();
                    
                    // 성공 메시지
                    if (currentNearbyApartments.length > 0) {
                      // 임시 성공 메시지 표시 (2초 후 사라짐)
                      const successMsg = document.createElement('div');
                      successMsg.className = 'fixed top-20 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
                      successMsg.innerHTML = \`
                        <i class="fas fa-check-circle mr-2"></i>
                        \${currentNearbyApartments.length}개의 주변 아파트를 찾았습니다!
                      \`;
                      document.body.appendChild(successMsg);
                      setTimeout(() => successMsg.remove(), 2000);
                    }
                  } else {
                    throw new Error('자동 검색 실패');
                  }
                } catch (autoError) {
                  console.error('자동 검색 실패:', autoError);
                  // 실패해도 모달은 열어서 수동 등록 가능하도록
                  currentNearbyApartments = [];
                  renderNearbyApartments();
                }
              } else {
                // 기존 데이터 있으면 바로 렌더링
                renderNearbyApartments();
                nearbyModal.classList.add('show');
              }
              
            } catch (error) {
              console.error('물건 정보 가져오기 실패:', error);
              alert('물건 정보를 불러오는데 실패했습니다.');
            }
          };

          // 주변 아파트 목록 렌더링
          function renderNearbyApartments() {
            const list = document.getElementById('nearbyApartmentList');
            
            if (currentNearbyApartments.length === 0) {
              list.innerHTML = \`
                <div class="text-center py-8 text-gray-400">
                  <i class="fas fa-building text-4xl mb-2"></i>
                  <p class="text-sm">등록된 주변 아파트가 없습니다</p>
                </div>
              \`;
              return;
            }
            
            list.innerHTML = currentNearbyApartments.map((apt, index) => \`
              <div class="bg-gray-50 rounded-lg p-4 relative">
                <button onclick="removeNearbyApartment(\${index})" 
                        class="absolute top-2 right-2 text-gray-400 hover:text-red-600">
                  <i class="fas fa-times"></i>
                </button>
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span class="text-gray-500">아파트명</span>
                    <div class="font-bold text-gray-900">\${apt.name}</div>
                  </div>
                  <div>
                    <span class="text-gray-500">거리</span>
                    <div class="font-semibold text-gray-700">\${apt.distance || '-'}</div>
                  </div>
                  <div>
                    <span class="text-gray-500">실거래가</span>
                    <div class="font-bold text-primary">\${apt.recent_price}억원</div>
                  </div>
                  <div>
                    <span class="text-gray-500">거래일</span>
                    <div class="font-semibold text-gray-700">\${apt.date}</div>
                  </div>
                </div>
              </div>
            \`).join('');
          }

          // 주변 아파트 제거
          window.removeNearbyApartment = function(index) {
            if (confirm('이 주변 아파트 정보를 삭제하시겠습니까?')) {
              currentNearbyApartments.splice(index, 1);
              renderNearbyApartments();
            }
          };

          // 주변 아파트 추가
          document.getElementById('addNearbyApartment').addEventListener('click', () => {
            const name = document.getElementById('newAptName').value.trim();
            const distance = document.getElementById('newAptDistance').value.trim();
            const price = document.getElementById('newAptPrice').value;
            const date = document.getElementById('newAptDate').value;
            
            if (!name || !price || !date) {
              alert('필수 항목을 모두 입력해주세요.');
              return;
            }
            
            currentNearbyApartments.push({
              name: name,
              distance: distance,
              recent_price: parseFloat(price),
              date: date
            });
            
            // 입력 필드 초기화
            document.getElementById('newAptName').value = '';
            document.getElementById('newAptDistance').value = '';
            document.getElementById('newAptPrice').value = '';
            document.getElementById('newAptDate').value = '';
            
            renderNearbyApartments();
          });

          // 닫기 버튼
          closeNearbyModal.addEventListener('click', () => {
            nearbyModal.classList.remove('show');
          });

          cancelNearby.addEventListener('click', () => {
            nearbyModal.classList.remove('show');
          });

          nearbyModal.addEventListener('click', (e) => {
            if (e.target === nearbyModal) {
              nearbyModal.classList.remove('show');
            }
          });

          // 폼 제출
          nearbyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const propertyId = document.getElementById('nearbyPropertyId').value;
            
            try {
              const response = await axios.post(\`/api/properties/\${propertyId}/update-nearby\`, {
                nearby_apartments: currentNearbyApartments
              });
              
              if (response.data.success) {
                alert(\`주변 아파트 정보가 업데이트되었습니다! (총 \${currentNearbyApartments.length}건)\`);
                nearbyModal.classList.remove('show');
                loadProperties();
              } else {
                alert('업데이트에 실패했습니다.');
              }
            } catch (error) {
              console.error('주변 아파트 업데이트 실패:', error);
              alert('주변 아파트 정보 업데이트에 실패했습니다.');
            }
          });

          // 조합원 문의 모달 열기
          window.openJohapInquiry = function() {
            const johapModal = document.getElementById('johapInquiryModal');
            johapModal.classList.add('show');
          };

          signupBtn.addEventListener('click', () => {
            alert('회원가입 기능은 준비 중입니다!');
          });

          // Social login buttons
          document.querySelectorAll('.social-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const text = btn.textContent.trim();
              if (text.includes('카카오')) {
                alert('카카오 로그인 기능은 준비 중입니다!');
              } else if (text.includes('네이버')) {
                alert('네이버 로그인 기능은 준비 중입니다!');
              } else if (text.includes('이메일')) {
                alert('이메일 로그인 기능은 준비 중입니다!');
              }
            });
          });

          // Initialize
          loadStats();
          loadProperties();
        </script>
    </body>
    </html>
  `)
})

export default app
