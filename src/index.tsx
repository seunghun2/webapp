import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// Define types for Cloudflare bindings
type Bindings = {
  DB: D1Database;
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
    const sort = c.req.query('sort') || 'latest'
    
    // Exclude expired properties (deadline < today)
    let query = "SELECT * FROM properties WHERE deadline >= date('now')"
    let params: any[] = []
    
    // Type filter
    if (type !== 'all' && type !== 'today') {
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

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>줍줍분양</title>
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
          
          .dropdown-content {
            display: none;
            z-index: 1000;
          }
          
          .dropdown-content.show {
            display: block;
          }
          
          .filter-dropdown {
            position: relative;
            z-index: 100;
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
                        <h1 class="text-xl font-bold text-gray-900">줍줍분양</h1>
                        <span class="text-xs text-gray-500 hidden sm:inline">실전 투자 정보</span>
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
            <div class="bg-white rounded-xl shadow-sm p-4 mb-6 fade-in">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-semibold text-gray-700 mr-2">필터</span>
                    
                    <!-- Region Filter -->
                    <div class="relative filter-dropdown">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="region">
                            <span class="filter-text">지역</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 min-w-[200px] z-10">
                            <div class="p-2">
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="region" data-value="all">전체</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="region" data-value="서울">서울</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="region" data-value="경기">경기</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="region" data-value="인천">인천</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Type Filter -->
                    <div class="relative filter-dropdown">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="type">
                            <span class="filter-text">분양타입</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 min-w-[180px] z-10">
                            <div class="p-2">
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="type" data-value="all">전체</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="type" data-value="unsold">줍줍분양</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="type" data-value="today">오늘청약</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="type" data-value="johab">모집중</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="type" data-value="next">조합원</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Household Filter -->
                    <div class="relative filter-dropdown">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="household">
                            <span class="filter-text">세대수</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 min-w-[180px] z-10">
                            <div class="p-2">
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="household" data-value="all">전체</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="household" data-value="0-50">50세대 이하</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="household" data-value="50-300">50-300세대</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="household" data-value="300-1000">300-1000세대</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="household" data-value="1000-+">1000세대 이상</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Sort Filter -->
                    <div class="relative filter-dropdown">
                        <button class="filter-btn px-4 py-2 rounded-lg text-sm font-medium bg-white" data-filter="sort">
                            <span class="filter-text">최신순</span> <i class="fas fa-chevron-down ml-2 text-xs"></i>
                        </button>
                        <div class="dropdown-content absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 min-w-[150px] z-10">
                            <div class="p-2">
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="sort" data-value="latest">최신순</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="sort" data-value="deadline">마감임박순</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="sort" data-value="price-low">낮은가격순</button>
                                <button class="filter-option w-full text-left px-3 py-2 rounded hover:bg-primary-lighter text-sm" data-filter-type="sort" data-value="price-high">높은가격순</button>
                            </div>
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
                        <h4 class="text-white font-bold mb-4">줍줍분양</h4>
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
                    <p>© 2025 줍줍분양. All rights reserved.</p>
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
                <p class="text-gray-600 text-sm mb-8">줍줍분양에 오신 것을 환영합니다</p>
                
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

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
        <script>
          // Filter state
          const filters = {
            region: 'all',
            type: 'all',
            household: 'all',
            sort: 'latest'
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
                  <div class="text-3xl font-bold text-gray-900">\${stats.today}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-5" data-type="johab">
                  <div class="text-xs text-gray-500 mb-2 font-medium">모집중</div>
                  <div class="text-3xl font-bold text-gray-900">\${stats.johab}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-5" data-type="next">
                  <div class="text-xs text-gray-500 mb-2 font-medium">조합원</div>
                  <div class="text-3xl font-bold text-gray-900">\${stats.next}</div>
                </div>
              \`;
              
              // Add click handlers
              document.querySelectorAll('.stat-card').forEach(card => {
                card.addEventListener('click', () => {
                  const type = card.dataset.type;
                  filters.type = type;
                  updateActiveFilters();
                  loadProperties();
                  
                  // Update active state
                  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
                  card.classList.add('active');
                });
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
                container.innerHTML = \`
                  <div class="col-span-2 text-center py-12">
                    <div class="text-6xl mb-4">🏠</div>
                    <h3 class="text-xl font-bold text-gray-900 mb-2">분양 정보가 없습니다</h3>
                    <p class="text-gray-600">필터를 조정해보세요!</p>
                  </div>
                \`;
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
                          <button onclick="openMap('\${property.full_address}', \${property.lat}, \${property.lng})" 
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
                            <div class="text-xs text-gray-500 mb-1">📐 타입</div>
                            <div class="font-bold text-gray-900">\${property.area_type || '-'}</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">🏠 줍줍 물량</div>
                            <div class="font-bold text-gray-900">\${property.households}</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">🏗️ 시공사</div>
                            <div class="font-bold text-gray-900 text-xs">\${property.builder || '-'}</div>
                          </div>
                        </div>
                        \${property.description ? \`
                          <div class="mt-3 pt-3 border-t border-gray-200">
                            <div class="text-xs text-gray-600">\${property.description}</div>
                          </div>
                        \` : ''}
                      </div>
                      
                      <!-- Investment Info -->
                      \${margin ? \`
                        <div class="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-lg p-4 mb-3">
                          <div class="text-xs font-bold text-gray-700 mb-2">💰 투자 정보</div>
                          <div class="space-y-1.5">
                            <div class="flex justify-between items-center text-sm">
                              <span class="text-gray-600">기존 분양가</span>
                              <span class="font-bold text-gray-900">\${property.original_price.toFixed(1)}억</span>
                            </div>
                            <div class="flex justify-between items-center text-sm">
                              <span class="text-gray-600">최근 실거래가</span>
                              <span class="font-bold text-gray-900">\${property.recent_trade_price.toFixed(1)}억</span>
                            </div>
                            <div class="border-t-2 border-red-300 pt-2 flex justify-between items-center">
                              <span class="text-sm font-bold text-gray-900">예상 마진</span>
                              <span class="\${margin.color} text-lg font-bold">\${margin.text}</span>
                            </div>
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
                      
                      <!-- Action Buttons -->
                      <div class="flex gap-2">
                        \${property.type === 'next' ? \`
                          <!-- 조합원 등록 문의 버튼 (조합원 타입만) -->
                          <button onclick="showJohapInquiry()" 
                                  class="flex-1 bg-primary text-white font-bold py-2.5 rounded-lg hover:bg-primary-light transition-all text-sm">
                            <i class="fas fa-user-plus mr-1"></i>
                            등록 문의
                          </button>
                          <button onclick="showDetail(\${property.id})" 
                                  class="flex-1 bg-white border-2 border-primary text-primary font-medium py-2 rounded-lg hover:bg-primary hover:text-white transition-all text-xs">
                            상세 정보
                          </button>
                        \` : \`
                          <!-- 기본 상세 정보 버튼 -->
                          <button onclick="showDetail(\${property.id})" 
                                  class="w-full bg-white border-2 border-primary text-primary font-medium py-2 rounded-lg hover:bg-primary hover:text-white transition-all text-xs">
                            상세 정보 보기
                          </button>
                        \`}
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
              const typeNames = { unsold: '줍줍분양', today: '오늘청약', johab: '모집중', next: '조합원' };
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
            if (filters.sort !== 'latest') {
              const sortNames = {
                deadline: '마감임박순',
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
            if (type === 'sort') filters.sort = 'latest';
            
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
                const typeNames = { unsold: '줍줍분양', today: '오늘청약', johab: '모집중', next: '조합원' };
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
              } else if (filterType === 'sort' && filters.sort !== 'latest') {
                const sortNames = {
                  deadline: '마감임박',
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
                if (filterType === 'sort') text.textContent = '최신순';
                btn.classList.remove('active');
              }
            });
          }

          // Dropdown handlers
          document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const dropdown = btn.nextElementSibling;
              
              // Close other dropdowns
              document.querySelectorAll('.dropdown-content').forEach(d => {
                if (d !== dropdown) d.classList.remove('show');
              });
              
              dropdown.classList.toggle('show');
            });
          });

          // Filter option handlers
          document.querySelectorAll('.filter-option').forEach(option => {
            option.addEventListener('click', (e) => {
              e.stopPropagation();
              const filterType = option.dataset.filterType;
              const value = option.dataset.value;
              
              filters[filterType] = value;
              
              // Close dropdown
              option.closest('.dropdown-content').classList.remove('show');
              
              updateActiveFilters();
              updateFilterButtonTexts();
              loadProperties();
            });
          });

          // Close dropdowns when clicking outside
          document.addEventListener('click', () => {
            document.querySelectorAll('.dropdown-content').forEach(d => {
              d.classList.remove('show');
            });
          });

          // Reset filters
          document.getElementById('resetFilters').addEventListener('click', () => {
            filters.region = 'all';
            filters.type = 'all';
            filters.household = 'all';
            filters.sort = 'latest';
            
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
            alert('문의가 접수되었습니다!\n담당자가 빠른 시일 내에 연락드리겠습니다.');
            
            // 폼 초기화 및 모달 닫기
            johapForm.reset();
            johapModal.classList.remove('show');
          });

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
