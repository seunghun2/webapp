import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// Define types for Cloudflare bindings
type Bindings = {
  DB: D1Database;
  MOLIT_API_KEY?: string; // 국토교통부 API 키 (선택사항)
  KAKAO_REST_API_KEY?: string; // 카카오 REST API 키
  KAKAO_REDIRECT_URI?: string; // 카카오 리다이렉트 URI
  NAVER_CLIENT_ID?: string; // 네이버 클라이언트 ID
  NAVER_CLIENT_SECRET?: string; // 네이버 클라이언트 시크릿
  NAVER_REDIRECT_URI?: string; // 네이버 리다이렉트 URI
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// ==================== 카카오 로그인 API ====================

// 1. 카카오 로그인 시작 (로그인 버튼 클릭 시)
app.get('/auth/kakao/login', (c) => {
  const KAKAO_REST_API_KEY = c.env.KAKAO_REST_API_KEY || '4a2d6ac21713dbce3c2f9633ed25cca4'
  const KAKAO_REDIRECT_URI = c.env.KAKAO_REDIRECT_URI || 'https://hanchae365.com/auth/kakao/callback'
  
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_REST_API_KEY}&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}&response_type=code`
  
  return c.redirect(kakaoAuthUrl)
})

// 2. 카카오 로그인 콜백 (인증 완료 후)
app.get('/auth/kakao/callback', async (c) => {
  try {
    const code = c.req.query('code')
    const KAKAO_REST_API_KEY = c.env.KAKAO_REST_API_KEY || '4a2d6ac21713dbce3c2f9633ed25cca4'
    const KAKAO_REDIRECT_URI = c.env.KAKAO_REDIRECT_URI || 'https://hanchae365.com/auth/kakao/callback'
    
    if (!code) {
      return c.html(`
        <script>
          alert('로그인에 실패했습니다.');
          window.location.href = '/';
        </script>
      `)
    }

    // 1단계: 액세스 토큰 받기
    const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KAKAO_REST_API_KEY,
        redirect_uri: KAKAO_REDIRECT_URI,
        code: code
      }).toString()
    })

    const tokenData = await tokenResponse.json()
    
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token')
    }

    // 2단계: 사용자 정보 받기
    const userResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    const userData = await userResponse.json()
    
    // 3단계: DB에 사용자 저장/업데이트
    const { DB } = c.env
    
    const kakaoId = String(userData.id)
    const nickname = userData.properties?.nickname || '카카오 사용자'
    const profileImage = userData.properties?.profile_image || ''
    const email = userData.kakao_account?.email || ''

    // 기존 사용자 확인
    const existingUser = await DB.prepare(`
      SELECT * FROM users WHERE kakao_id = ?
    `).bind(kakaoId).first()

    let userId
    
    if (existingUser) {
      // 기존 사용자 업데이트
      await DB.prepare(`
        UPDATE users 
        SET nickname = ?, profile_image = ?, email = ?, last_login = datetime('now'), updated_at = datetime('now')
        WHERE kakao_id = ?
      `).bind(nickname, profileImage, email, kakaoId).run()
      
      userId = existingUser.id
    } else {
      // 신규 사용자 생성
      const result = await DB.prepare(`
        INSERT INTO users (kakao_id, nickname, profile_image, email, last_login)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).bind(kakaoId, nickname, profileImage, email).run()
      
      userId = result.meta.last_row_id
      
      // 알림 설정 기본값 생성
      await DB.prepare(`
        INSERT INTO notification_settings (user_id, notification_enabled)
        VALUES (?, 1)
      `).bind(userId).run()
    }

    // 로그인 성공 - 메인 페이지로 리다이렉트 (쿠키에 사용자 정보 저장)
    return c.html(`
      <script>
        localStorage.setItem('user', JSON.stringify({
          id: ${userId},
          kakaoId: '${kakaoId}',
          nickname: '${nickname}',
          profileImage: '${profileImage}',
          email: '${email}'
        }));
        alert('${nickname}님, 환영합니다!');
        window.location.href = '/';
      </script>
    `)

  } catch (error) {
    console.error('Kakao login error:', error)
    return c.html(`
      <script>
        alert('로그인 처리 중 오류가 발생했습니다.');
        window.location.href = '/';
      </script>
    `)
  }
})

// ==================== 네이버 로그인 API ====================

// 1. 네이버 로그인 시작
app.get('/auth/naver/login', (c) => {
  const NAVER_CLIENT_ID = c.env.NAVER_CLIENT_ID || 'txLNa6r7ObsEx0lTX85n'
  const NAVER_REDIRECT_URI = c.env.NAVER_REDIRECT_URI || 'https://hanchae365.com/auth/naver/callback'
  
  const state = Math.random().toString(36).substring(7) // CSRF 방지용 state
  
  const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(NAVER_REDIRECT_URI)}&state=${state}`
  
  return c.redirect(naverAuthUrl)
})

// 2. 네이버 로그인 콜백
app.get('/auth/naver/callback', async (c) => {
  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const NAVER_CLIENT_ID = c.env.NAVER_CLIENT_ID || 'txLNa6r7ObsEx0lTX85n'
    const NAVER_CLIENT_SECRET = c.env.NAVER_CLIENT_SECRET || 'uPfZL72eXW'
    
    if (!code || !state) {
      return c.html(`
        <script>
          alert('로그인에 실패했습니다.');
          window.location.href = '/';
        </script>
      `)
    }

    // 1단계: 액세스 토큰 받기
    const tokenResponse = await fetch(`https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${NAVER_CLIENT_ID}&client_secret=${NAVER_CLIENT_SECRET}&code=${code}&state=${state}`)

    const tokenData = await tokenResponse.json()
    
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token')
    }

    // 2단계: 사용자 정보 받기
    const userResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    const userData = await userResponse.json()
    
    if (userData.resultcode !== '00') {
      throw new Error('Failed to get user info')
    }
    
    // 3단계: DB에 사용자 저장/업데이트
    const { DB } = c.env
    
    const naverId = userData.response.id
    const nickname = userData.response.nickname || userData.response.name || '네이버 사용자'
    const profileImage = userData.response.profile_image || ''
    const email = userData.response.email || ''

    // 기존 사용자 확인
    const existingUser = await DB.prepare(`
      SELECT * FROM users WHERE naver_id = ?
    `).bind(naverId).first()

    let userId
    
    if (existingUser) {
      // 기존 사용자 업데이트
      await DB.prepare(`
        UPDATE users 
        SET nickname = ?, profile_image = ?, email = ?, last_login = datetime('now'), updated_at = datetime('now')
        WHERE naver_id = ?
      `).bind(nickname, profileImage, email, naverId).run()
      
      userId = existingUser.id
    } else {
      // 신규 사용자 생성
      const result = await DB.prepare(`
        INSERT INTO users (naver_id, nickname, profile_image, email, last_login, login_provider)
        VALUES (?, ?, ?, ?, datetime('now'), 'naver')
      `).bind(naverId, nickname, profileImage, email).run()
      
      userId = result.meta.last_row_id
      
      // 알림 설정 기본값 생성
      await DB.prepare(`
        INSERT INTO notification_settings (user_id, notification_enabled)
        VALUES (?, 1)
      `).bind(userId).run()
    }

    // 로그인 성공 - 메인 페이지로 리다이렉트
    return c.html(`
      <script>
        localStorage.setItem('user', JSON.stringify({
          id: ${userId},
          naverId: '${naverId}',
          nickname: '${nickname}',
          profileImage: '${profileImage}',
          email: '${email}',
          provider: 'naver'
        }));
        alert('${nickname}님, 환영합니다!');
        window.location.href = '/';
      </script>
    `)

  } catch (error) {
    console.error('Naver login error:', error)
    return c.html(`
      <script>
        alert('로그인 처리 중 오류가 발생했습니다.');
        window.location.href = '/';
      </script>
    `)
  }
})

// ==================== 이메일 로그인 API ====================

// Password hashing using Web Crypto API (compatible with Cloudflare Workers)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const hash = await hashPassword(password)
  return hash === hashedPassword
}

// 1. 이메일 회원가입
app.post('/auth/email/signup', async (c) => {
  try {
    const { email, password, nickname } = await c.req.json()
    const { DB } = c.env

    // 입력 검증
    if (!email || !password || !nickname) {
      return c.json({ error: '이메일, 비밀번호, 닉네임을 모두 입력해주세요.' }, 400)
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return c.json({ error: '올바른 이메일 형식이 아닙니다.' }, 400)
    }

    // 비밀번호 길이 검증
    if (password.length < 6) {
      return c.json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }, 400)
    }

    // 이메일 중복 확인
    const existingUser = await DB.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(email).first()

    if (existingUser) {
      return c.json({ error: '이미 사용 중인 이메일입니다.' }, 409)
    }

    // 비밀번호 해싱
    const passwordHash = await hashPassword(password)

    // 사용자 생성
    const result = await DB.prepare(`
      INSERT INTO users (email, password_hash, nickname, login_provider, last_login)
      VALUES (?, ?, ?, 'email', datetime('now'))
    `).bind(email, passwordHash, nickname).run()

    const userId = result.meta.last_row_id

    // 알림 설정 기본값 생성
    await DB.prepare(`
      INSERT INTO notification_settings (user_id, notification_enabled)
      VALUES (?, 1)
    `).bind(userId).run()

    return c.json({
      success: true,
      user: {
        id: userId,
        email,
        nickname,
        provider: 'email'
      }
    })

  } catch (error) {
    console.error('Email signup error:', error)
    return c.json({ error: '회원가입 처리 중 오류가 발생했습니다.' }, 500)
  }
})

// 2. 이메일 로그인
app.post('/auth/email/login', async (c) => {
  try {
    const { email, password } = await c.req.json()
    const { DB } = c.env

    // 입력 검증
    if (!email || !password) {
      return c.json({ error: '이메일과 비밀번호를 입력해주세요.' }, 400)
    }

    // 사용자 조회
    const user = await DB.prepare(`
      SELECT id, email, password_hash, nickname, profile_image
      FROM users WHERE email = ? AND login_provider = 'email'
    `).bind(email).first() as any

    if (!user) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    // 비밀번호 검증
    const isValid = await verifyPassword(password, user.password_hash)
    if (!isValid) {
      return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }

    // 마지막 로그인 시간 업데이트
    await DB.prepare(`
      UPDATE users SET last_login = datetime('now') WHERE id = ?
    `).bind(user.id).run()

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        profileImage: user.profile_image || '',
        provider: 'email'
      }
    })

  } catch (error) {
    console.error('Email login error:', error)
    return c.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, 500)
  }
})

// ==================== 공통 로그아웃 ====================

// 3. 로그아웃
app.get('/auth/logout', (c) => {
  return c.html(`
    <script>
      localStorage.removeItem('user');
      alert('로그아웃되었습니다.');
      window.location.href = '/';
    </script>
  `)
})

// 4. 사용자 정보 조회 API
app.get('/api/user/:id', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    const user = await DB.prepare(`
      SELECT id, kakao_id, nickname, profile_image, email, created_at, last_login
      FROM users WHERE id = ?
    `).bind(id).first()
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    return c.json(user)
  } catch (error) {
    console.error('Error fetching user:', error)
    return c.json({ error: 'Failed to fetch user' }, 500)
  }
})

// 5. 알림 설정 조회
app.get('/api/user/:id/notifications', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    const settings = await DB.prepare(`
      SELECT * FROM notification_settings WHERE user_id = ?
    `).bind(id).first()
    
    if (!settings) {
      return c.json({ error: 'Settings not found' }, 404)
    }
    
    return c.json(settings)
  } catch (error) {
    console.error('Error fetching notification settings:', error)
    return c.json({ error: 'Failed to fetch settings' }, 500)
  }
})

// 6. 알림 설정 업데이트
app.post('/api/user/:id/notifications', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const body = await c.req.json()
    
    const { notification_enabled, regions, property_types } = body
    
    await DB.prepare(`
      UPDATE notification_settings 
      SET notification_enabled = ?,
          regions = ?,
          property_types = ?,
          updated_at = datetime('now')
      WHERE user_id = ?
    `).bind(
      notification_enabled ? 1 : 0,
      regions ? JSON.stringify(regions) : null,
      property_types ? JSON.stringify(property_types) : null,
      id
    ).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error updating notification settings:', error)
    return c.json({ error: 'Failed to update settings' }, 500)
  }
})

// 7. 프로필 수정
app.put('/api/user/:id/profile', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const body = await c.req.json()
    
    const { nickname, bio, phone } = body
    
    // 닉네임 중복 확인 (자기 자신 제외)
    if (nickname) {
      const existingUser = await DB.prepare(`
        SELECT id FROM users WHERE nickname = ? AND id != ?
      `).bind(nickname, id).first()
      
      if (existingUser) {
        return c.json({ error: '이미 사용 중인 닉네임입니다.' }, 409)
      }
    }
    
    await DB.prepare(`
      UPDATE users 
      SET nickname = COALESCE(?, nickname),
          bio = ?,
          phone = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(nickname, bio, phone, id).run()
    
    // 업데이트된 사용자 정보 반환
    const user = await DB.prepare(`
      SELECT id, email, nickname, profile_image, bio, phone, login_provider
      FROM users WHERE id = ?
    `).bind(id).first()
    
    return c.json({ success: true, user })
  } catch (error) {
    console.error('Error updating profile:', error)
    return c.json({ error: 'Failed to update profile' }, 500)
  }
})

// 8. 비밀번호 변경 (이메일 로그인 사용자만)
app.put('/api/user/:id/password', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const { currentPassword, newPassword } = await c.req.json()
    
    // 사용자 조회
    const user = await DB.prepare(`
      SELECT password_hash, login_provider FROM users WHERE id = ?
    `).bind(id).first() as any
    
    if (!user) {
      return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)
    }
    
    if (user.login_provider !== 'email') {
      return c.json({ error: '소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.' }, 400)
    }
    
    // 현재 비밀번호 검증
    const isValid = await verifyPassword(currentPassword, user.password_hash)
    if (!isValid) {
      return c.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401)
    }
    
    // 새 비밀번호 해싱
    const newPasswordHash = await hashPassword(newPassword)
    
    // 비밀번호 업데이트
    await DB.prepare(`
      UPDATE users 
      SET password_hash = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(newPasswordHash, id).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error changing password:', error)
    return c.json({ error: 'Failed to change password' }, 500)
  }
})

// 9. 회원탈퇴
app.delete('/api/user/:id', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const { reason, password } = await c.req.json()
    
    // 사용자 조회
    const user = await DB.prepare(`
      SELECT password_hash, login_provider FROM users WHERE id = ?
    `).bind(id).first() as any
    
    if (!user) {
      return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)
    }
    
    // 이메일 로그인 사용자는 비밀번호 확인
    if (user.login_provider === 'email' && password) {
      const isValid = await verifyPassword(password, user.password_hash)
      if (!isValid) {
        return c.json({ error: '비밀번호가 올바르지 않습니다.' }, 401)
      }
    }
    
    // 소프트 삭제 (데이터는 보관)
    await DB.prepare(`
      UPDATE users 
      SET status = 'deleted',
          deleted_at = datetime('now'),
          deletion_reason = ?
      WHERE id = ?
    `).bind(reason || '', id).run()
    
    // 알림 설정도 비활성화
    await DB.prepare(`
      UPDATE notification_settings 
      SET notification_enabled = 0
      WHERE user_id = ?
    `).bind(id).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error deleting user:', error)
    return c.json({ error: 'Failed to delete user' }, 500)
  }
})

// ==================== 기존 API ====================

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
// ===== PDF 파싱 유틸리티 함수 =====

// PDF URL에서 텍스트 추출 (외부 API 사용)
async function extractPdfText(pdfUrl: string): Promise<string> {
  try {
    // 방법 1: pdf.co API 사용 (무료 티어: 월 300크레딧)
    // const pdfcoApiKey = 'YOUR_PDF_CO_API_KEY' // 나중에 환경변수로 설정
    
    // 방법 2: 일단 PDF URL만 반환하고 나중에 파싱
    // 현재는 간단하게 fetch로 PDF 바이너리를 가져와 간단한 텍스트 추출 시도
    
    const response = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    
    if (!response.ok) {
      console.error(`Failed to download PDF: ${response.status}`)
      return ''
    }
    
    // PDF 바이너리를 ArrayBuffer로 받기
    const pdfBuffer = await response.arrayBuffer()
    
    // 간단한 텍스트 추출 (PDF 내부의 평문 텍스트만 추출)
    // 주의: 이 방법은 제한적이며, 복잡한 PDF는 파싱하지 못함
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const pdfText = decoder.decode(pdfBuffer)
    
    return pdfText
  } catch (error) {
    console.error('PDF extraction error:', error)
    return ''
  }
}

// PDF 텍스트에서 전용면적 추출
function extractExclusiveArea(pdfText: string): string {
  // 패턴 예시: "25㎡~44㎡", "59㎡, 74㎡", "84.85㎡"
  const patterns = [
    /전용[면적]*\s*[:：]?\s*([\d.,~\s㎡]+)/,
    /([\d.]+㎡\s*[~]\s*[\d.]+㎡)/,
    /([\d.]+㎡(?:\s*,\s*[\d.]+㎡)+)/
  ]
  
  for (const pattern of patterns) {
    const match = pdfText.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }
  
  return ''
}

// PDF 텍스트에서 임대보증금 추출
function extractRentalDeposit(pdfText: string): { range: string, min: number, max: number } {
  // 패턴 예시: "1,314만원~4,348만원", "1천314만원 ~ 4천348만원"
  const patterns = [
    /임대보증금\s*[:：]?\s*([\d,천만억원\s~-]+)/,
    /보증금\s*[:：]?\s*([\d,천만억원\s~-]+)/
  ]
  
  for (const pattern of patterns) {
    const match = pdfText.match(pattern)
    if (match) {
      const range = match[1].trim()
      
      // 숫자 추출 (만원 단위로 변환)
      const numbers = range.match(/[\d,]+/g)
      if (numbers && numbers.length >= 2) {
        const min = parseFloat(numbers[0].replace(/,/g, '')) / 10000 // 만원 → 억원
        const max = parseFloat(numbers[1].replace(/,/g, '')) / 10000
        return { range, min, max }
      }
      
      return { range, min: 0, max: 0 }
    }
  }
  
  return { range: '', min: 0, max: 0 }
}

// PDF 텍스트에서 시공사 추출
function extractBuilder(pdfText: string): string {
  const patterns = [
    /시공[사업체]*\s*[:：]?\s*([가-힣\s(주)]+)/,
    /시공\s*[:：]?\s*([가-힣\s(주)]+)/,
    /건설사\s*[:：]?\s*([가-힣\s(주)]+)/
  ]
  
  for (const pattern of patterns) {
    const match = pdfText.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }
  
  return ''
}

// PDF 텍스트에서 청약일정 추출
function extractSubscriptionSchedule(pdfText: string): {
  noRankDate: string
  firstRankDate: string
  specialDate: string
  scheduleDetail: string
} {
  let noRankDate = ''
  let firstRankDate = ''
  let specialDate = ''
  
  // 무순위 청약일
  const noRankMatch = pdfText.match(/무순위.*?(\d{4}[-./]\d{2}[-./]\d{2})/)
  if (noRankMatch) noRankDate = noRankMatch[1].replace(/[./]/g, '-')
  
  // 1순위 청약일
  const firstRankMatch = pdfText.match(/1순위.*?(\d{4}[-./]\d{2}[-./]\d{2})/)
  if (firstRankMatch) firstRankDate = firstRankMatch[1].replace(/[./]/g, '-')
  
  // 특별청약일
  const specialMatch = pdfText.match(/특별[공급청약]*.*?(\d{4}[-./]\d{2}[-./]\d{2})/)
  if (specialMatch) specialDate = specialMatch[1].replace(/[./]/g, '-')
  
  const scheduleDetail = JSON.stringify({
    no_rank: noRankDate,
    first_rank: firstRankDate,
    special: specialDate
  })
  
  return { noRankDate, firstRankDate, specialDate, scheduleDetail }
}

// ===== LH 크롤러 API =====
app.post('/api/crawl/lh', async (c) => {
  try {
    const { DB } = c.env
    
    // LH 청약센터 URL
    const lhUrl = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do?mi=1027'
    
    // Fetch HTML from LH
    const response = await fetch(lhUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    })
    const html = await response.text()
    
    // HTML 파싱: <tbody> 내의 <tr> 태그 추출
    const tbodyMatch = html.match(/<tbody>(.*?)<\/tbody>/s)
    if (!tbodyMatch) {
      return c.json({
        success: false,
        error: 'Failed to find table data',
        message: 'No tbody found in HTML'
      }, 500)
    }
    
    const tbody = tbodyMatch[1]
    
    // 각 행과 첨부파일 정보를 추출하는 정규식 (더 넓은 범위 매칭)
    const rowRegex = /<tr>(.*?)<\/tr>/gs
    const rows = [...tbody.matchAll(rowRegex)]
    
    let newCount = 0
    let updateCount = 0
    let pdfParseCount = 0
    
    for (const match of rows) {
      const rowHtml = match[1]
      
      // 행 내부 데이터 추출
      const tdMatches = rowHtml.match(/<td[^>]*>(.*?)<\/td>/gs)
      if (!tdMatches || tdMatches.length < 9) continue // 총 9개 td 필요
      
      // 각 컬럼 추출 (정확한 인덱스)
      // TD[0]: 번호
      // TD[1]: 유형 (공공분양, 국민임대 등)
      // TD[2]: 제목
      // TD[3]: 지역
      // TD[4]: 첨부파일 (PDF 다운로드)
      // TD[5]: 공고일
      // TD[6]: 마감일
      // TD[7]: 상태 (공고중, 접수중 등)
      // TD[8]: 조회수
      
      const number = tdMatches[0].replace(/<[^>]+>/g, '').trim()
      const announcementType = tdMatches[1].replace(/<[^>]+>/g, '').trim()
      const titleRaw = tdMatches[2]
      const region = tdMatches[3].replace(/<[^>]+>/g, '').trim()
      const fileTd = tdMatches[4] // 첨부파일 컬럼
      const announcementDate = tdMatches[5].replace(/<[^>]+>/g, '').trim()
      const deadline = tdMatches[6].replace(/<[^>]+>/g, '').trim()
      const status = tdMatches[7].replace(/<[^>]+>/g, '').trim()
      
      // 제목 추출 (<span> 태그 안의 텍스트, "N일전" 제거)
      const titleMatch = titleRaw.match(/<span[^>]*>(.*?)<\/span>/)
      let titleText = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''
      // "1일전", "2일전" 등 제거
      titleText = titleText.replace(/\s*\d+일전\s*$/, '').trim()
      if (!titleText) continue
      
      // PDF 다운로드 링크 정보 추출 (TD[4]에서 찾기)
      let pdfUrl = ''
      
      // 정규식 매칭 (class 속성에 "listFileDown"이 포함된 경우)
      const pdfLinkMatch = fileTd.match(/class="[^"]*listFileDown[^"]*"[\s\S]*?data-id1="([^"]*)"[\s\S]*?data-id2="([^"]*)"[\s\S]*?data-id3="([^"]*)"[\s\S]*?data-id4="([^"]*)"[\s\S]*?data-id5="([^"]*)"/)
      
      if (pdfLinkMatch) {
        const [, id1, id2, id3, id4, id5] = pdfLinkMatch
        // LH PDF 다운로드 URL 구성
        pdfUrl = `https://apply.lh.or.kr/lhapply/wt/wrtanc/wrtFileDownl.do?pnuclrStle1=${id1}&pnuclrStle2=${id2}&pnuclrStle3=${id3}&pnuclrStle4=${id4}&pnuclrStle5=${id5}`
        console.log(`✅ PDF URL found for ${titleText}: ${pdfUrl}`)
      } else {
        console.log(`❌ No PDF link found for: ${titleText}`)
      }
      
      // 분양 타입 결정
      let propertyType = 'unsold' // 기본값
      
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
      
      // PDF 파싱 (URL이 있는 경우)
      let exclusiveAreaRange = ''
      let rentalDepositRange = ''
      let rentalDepositMin = 0
      let rentalDepositMax = 0
      let builder = ''
      let noRankDate = ''
      let firstRankDate = ''
      let specialDate = ''
      let subscriptionScheduleDetail = ''
      let pdfRawText = ''
      let pdfParsed = false
      
      if (pdfUrl) {
        try {
          console.log(`Parsing PDF for: ${titleText}`)
          const pdfText = await extractPdfText(pdfUrl)
          pdfRawText = pdfText.substring(0, 10000) // 최대 10KB만 저장
          
          // 데이터 추출
          exclusiveAreaRange = extractExclusiveArea(pdfText)
          const depositInfo = extractRentalDeposit(pdfText)
          rentalDepositRange = depositInfo.range
          rentalDepositMin = depositInfo.min
          rentalDepositMax = depositInfo.max
          builder = extractBuilder(pdfText)
          
          const scheduleInfo = extractSubscriptionSchedule(pdfText)
          noRankDate = scheduleInfo.noRankDate
          firstRankDate = scheduleInfo.firstRankDate
          specialDate = scheduleInfo.specialDate
          subscriptionScheduleDetail = scheduleInfo.scheduleDetail
          
          pdfParsed = true
          pdfParseCount++
        } catch (error) {
          console.error(`PDF parsing failed for ${titleText}:`, error)
        }
      }
      
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
            pdf_url = ?,
            exclusive_area_range = ?,
            rental_deposit_range = ?,
            rental_deposit_min = ?,
            rental_deposit_max = ?,
            builder = ?,
            no_rank_date = ?,
            first_rank_date = ?,
            subscription_schedule_detail = ?,
            pdf_parsed = ?,
            pdf_parsed_at = ?,
            pdf_raw_text = ?,
            last_crawled_at = ?,
            updated_at = ?
          WHERE lh_announcement_id = ? OR title = ?
        `).bind(
          status, deadline, pdfUrl,
          exclusiveAreaRange, rentalDepositRange, rentalDepositMin, rentalDepositMax,
          builder, noRankDate, firstRankDate, subscriptionScheduleDetail,
          pdfParsed ? 1 : 0, pdfParsed ? now : null, pdfRawText,
          now, now, lhId, titleText
        ).run()
        updateCount++
      } else {
        // 새로 삽입
        await DB.prepare(`
          INSERT INTO properties (
            type, title, location, status, deadline, price, households, tags,
            region, announcement_type, announcement_status, announcement_date,
            lh_announcement_id, source, pdf_url,
            exclusive_area_range, rental_deposit_range, rental_deposit_min, rental_deposit_max,
            builder, no_rank_date, first_rank_date, subscription_schedule_detail,
            pdf_parsed, pdf_parsed_at, pdf_raw_text,
            last_crawled_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          propertyType, titleText, region, status, deadline, '미정', '미정',
          JSON.stringify(['LH청약']), normalizedRegion, announcementType, status, announcementDate,
          lhId, 'lh_auto', pdfUrl,
          exclusiveAreaRange, rentalDepositRange, rentalDepositMin, rentalDepositMax,
          builder, noRankDate, firstRankDate, subscriptionScheduleDetail,
          pdfParsed ? 1 : 0, pdfParsed ? now : null, pdfRawText,
          now, now, now
        ).run()
        newCount++
      }
    }
    
    return c.json({
      success: true,
      message: `LH 크롤링 완료: 신규 ${newCount}건, 업데이트 ${updateCount}건, PDF 파싱 ${pdfParseCount}건`,
      newCount,
      updateCount,
      pdfParseCount,
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

// Google Search Console verification
app.get('/googlec6d53ea00693e752.html', (c) => {
  return c.text('google-site-verification: googlec6d53ea00693e752.html')
})

// Sitemap.xml for SEO
app.get('/sitemap.xml', (c) => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://hanchae365.com/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://hanchae365.com/terms</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://hanchae365.com/privacy</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`
  
  c.header('Content-Type', 'application/xml')
  return c.text(sitemap)
})

// Robots.txt for SEO
app.get('/robots.txt', (c) => {
  const robots = `User-agent: *
Allow: /

Sitemap: https://hanchae365.com/sitemap.xml`
  
  c.header('Content-Type', 'text/plain')
  return c.text(robots)
})

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>똑똑한한채 - 스마트 부동산 분양 정보 | 줍줍분양 실시간 업데이트</title>
        
        <!-- SEO Meta Tags -->
        <meta name="description" content="전국 부동산 분양 정보를 한눈에! 줍줍분양(미분양), 조합원 모집, 실시간 마감임박 정보를 놓치지 마세요. 똑똑한한채에서 확인하세요.">
        <meta name="keywords" content="부동산분양,줍줍분양,미분양,조합원모집,아파트분양,신규분양,분양정보,부동산,아파트,청약,분양가,부동산정보">
        <meta name="author" content="똑똑한한채">
        <meta name="robots" content="index, follow">
        <link rel="canonical" href="https://your-domain.pages.dev/">
        
        <!-- Open Graph Meta Tags (Facebook, KakaoTalk) -->
        <meta property="og:type" content="website">
        <meta property="og:title" content="똑똑한한채 - 스마트 부동산 분양 정보">
        <meta property="og:description" content="전국 부동산 분양 정보를 한눈에! 줍줍분양, 조합원 모집, 실시간 마감임박 정보">
        <meta property="og:url" content="https://your-domain.pages.dev/">
        <meta property="og:site_name" content="똑똑한한채">
        <meta property="og:locale" content="ko_KR">
        
        <!-- Twitter Card Meta Tags -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="똑똑한한채 - 스마트 부동산 분양 정보">
        <meta name="twitter:description" content="전국 부동산 분양 정보를 한눈에! 줍줍분양, 조합원 모집, 실시간 마감임박 정보">
        
        <!-- Google Search Console Verification -->
        <meta name="google-site-verification" content="WtjDvsKm64cdN8DHVNo95tjn1iQf2EEodfquYzSCcdE" />
        
        <!-- Naver Search Advisor Verification -->
        <meta name="naver-site-verification" content="84b2705d1e232018634d573e94e05c4e910baa96" />
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
          
          .stat-card.active .text-xs,
          .stat-card.active .text-3xl {
            color: white !important;
          }
          
          /* 호갱노노 스타일 필터 칩 */
          .filter-chip {
            appearance: none;
            padding: 8px 32px 8px 16px;
            background-color: #f5f5f5;
            border: 2px solid transparent;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 500;
            color: #333;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 16px;
          }
          
          .filter-chip:hover {
            background-color: #ebebeb;
          }
          
          .filter-chip:focus,
          .filter-chip.active {
            outline: none;
            border-color: #5856D6;
            background-color: white;
            color: #5856D6;
          }
          
          .filter-chip-reset {
            width: 40px;
            height: 40px;
            background-color: #f5f5f5;
            border: 2px solid transparent;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            color: #666;
          }
          
          .filter-chip-reset:hover {
            background-color: #ebebeb;
            color: #333;
          }
          
          /* 모바일에서 초기화 버튼 오른쪽 고정 */
          .filter-chip-reset-fixed {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            width: 40px;
            height: 40px;
            background-color: white;
            border: 2px solid #e5e5e5;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            color: #666;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            z-index: 10;
          }
          
          .filter-chip-reset-fixed:hover {
            background-color: #f5f5f5;
            color: #333;
            border-color: #d0d0d0;
          }
          
          .filter-chip-reset-fixed:active {
            transform: translateY(-50%) scale(0.95);
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
        <!-- 로그인 모달 -->
        <div id="loginModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-md w-full p-8 relative">
                <!-- 닫기 버튼 -->
                <button onclick="closeLoginModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
                
                <!-- 제목 -->
                <div class="text-center mb-8">
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">로그인</h2>
                    <p class="text-gray-600 text-sm">똑똑한한채에 오신 것을 환영합니다</p>
                </div>
                
                <!-- 로그인 버튼들 -->
                <div class="space-y-3">
                    <!-- 카카오 로그인 -->
                    <button onclick="window.location.href='/auth/kakao/login'" class="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all">
                        <i class="fas fa-comment text-xl"></i>
                        <span>카카오로 시작하기</span>
                    </button>
                    
                    <!-- 네이버 로그인 -->
                    <button onclick="window.location.href='/auth/naver/login'" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all">
                        <span class="text-xl font-bold">N</span>
                        <span>네이버로 시작하기</span>
                    </button>
                    
                    <!-- 이메일 로그인 -->
                    <button onclick="openEmailLoginModal()" class="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all">
                        <i class="fas fa-envelope text-xl"></i>
                        <span>이메일로 시작하기</span>
                    </button>
                </div>
                
                <!-- 회원가입 링크 -->
                <div class="text-center mt-6">
                    <p class="text-gray-600 text-sm">
                        계정이 없으신가요? 
                        <button onclick="openSignupModal()" class="text-primary font-bold hover:underline">회원가입</button>
                    </p>
                </div>
            </div>
        </div>
        
        <!-- 이메일 로그인 모달 -->
        <div id="emailLoginModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-md w-full p-8 relative">
                <!-- 닫기 버튼 -->
                <button onclick="closeEmailLoginModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
                
                <!-- 제목 -->
                <div class="text-center mb-8">
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">이메일 로그인</h2>
                    <p class="text-gray-600 text-sm">이메일과 비밀번호를 입력하세요</p>
                </div>
                
                <!-- 로그인 폼 -->
                <form id="emailLoginForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">이메일</label>
                        <input type="email" id="loginEmail" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="example@email.com">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
                        <input type="password" id="loginPassword" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="비밀번호를 입력하세요">
                    </div>
                    
                    <button type="submit" class="w-full bg-primary hover:bg-primary-light text-white font-bold py-4 rounded-xl transition-all">
                        로그인
                    </button>
                </form>
                
                <!-- 회원가입 링크 -->
                <div class="text-center mt-6">
                    <p class="text-gray-600 text-sm">
                        계정이 없으신가요? 
                        <button onclick="closeEmailLoginModal(); openSignupModal();" class="text-primary font-bold hover:underline">회원가입</button>
                    </p>
                </div>
            </div>
        </div>
        
        <!-- 회원가입 모달 -->
        <div id="signupModal" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl max-w-md w-full p-8 relative">
                <!-- 닫기 버튼 -->
                <button onclick="closeSignupModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
                
                <!-- 제목 -->
                <div class="text-center mb-8">
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">회원가입</h2>
                    <p class="text-gray-600 text-sm">똑똑한한채에 가입하세요</p>
                </div>
                
                <!-- 회원가입 폼 -->
                <form id="signupForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">이메일</label>
                        <input type="email" id="signupEmail" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="example@email.com">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">닉네임</label>
                        <input type="text" id="signupNickname" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="닉네임을 입력하세요">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
                        <input type="password" id="signupPassword" required minlength="6" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="최소 6자 이상">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">비밀번호 확인</label>
                        <input type="password" id="signupPasswordConfirm" required minlength="6" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="비밀번호를 다시 입력하세요">
                    </div>
                    
                    <button type="submit" class="w-full bg-primary hover:bg-primary-light text-white font-bold py-4 rounded-xl transition-all">
                        가입하기
                    </button>
                </form>
                
                <!-- 로그인 링크 -->
                <div class="text-center mt-6">
                    <p class="text-gray-600 text-sm">
                        이미 계정이 있으신가요? 
                        <button onclick="closeSignupModal(); openEmailLoginModal();" class="text-primary font-bold hover:underline">로그인</button>
                    </p>
                </div>
            </div>
        </div>
        
        <!-- 마이페이지 드롭다운 (사람인 스타일) -->
        <div id="myPageDropdown" class="hidden absolute top-16 right-4 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 z-50">
            <!-- 프로필 헤더 -->
            <div id="myPageHeader" class="px-6 py-5 border-b border-gray-100">
                <!-- User info will be injected here -->
            </div>
            
            <!-- 메뉴 리스트 -->
            <div class="py-2">
                <button onclick="openProfileEdit()" class="w-full px-6 py-3 text-left hover:bg-gray-50 transition-colors">
                    <span class="text-gray-700 text-sm">계정정보 설정</span>
                </button>
                
                <button onclick="openNotificationSettings()" class="w-full px-6 py-3 text-left hover:bg-gray-50 transition-colors">
                    <span class="text-gray-700 text-sm">알림 설정</span>
                </button>
                
                <button onclick="openContact()" class="w-full px-6 py-3 text-left hover:bg-gray-50 transition-colors">
                    <span class="text-gray-700 text-sm">고객센터</span>
                </button>
            </div>
            
            <!-- 하단 액션 -->
            <div class="border-t border-gray-100 py-2">
                <button onclick="handleLogout()" class="w-full px-6 py-3 text-left hover:bg-gray-50 transition-colors">
                    <span class="text-gray-600 text-sm">로그아웃</span>
                </button>
            </div>
        </div>
        
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
            
            <!-- 호갱노노 스타일 필터 -->
            <div class="bg-white px-4 py-3 mb-2 relative">
                <div class="overflow-x-auto pr-14" style="-webkit-overflow-scrolling: touch;">
                    <div class="flex gap-2 items-center min-w-max">
                    <!-- 정렬 (맨 앞) -->
                    <select id="filterSort" class="filter-chip">
                        <option value="deadline">마감순</option>
                        <option value="latest">최신순</option>
                        <option value="price-low">낮은가격</option>
                        <option value="price-high">높은가격</option>
                    </select>
                    
                    <!-- 지역 필터 -->
                    <select id="filterRegion" class="filter-chip">
                        <option value="all">지역</option>
                        <option value="all">전체</option>
                        <option value="서울">서울</option>
                        <option value="경기">경기</option>
                        <option value="인천">인천</option>
                        <option value="대전">대전</option>
                        <option value="세종">세종</option>
                        <option value="대구">대구</option>
                        <option value="부산">부산</option>
                        <option value="울산">울산</option>
                        <option value="광주">광주</option>
                    </select>
                    
                    <!-- 유형 필터 (매매=줍줍분양) -->
                    <select id="filterType" class="filter-chip">
                        <option value="all">매매</option>
                        <option value="unsold">줍줍분양</option>
                        <option value="johab">모집중</option>
                        <option value="next">조합원</option>
                    </select>
                    
                    <!-- 평형 필터 -->
                    <select id="filterArea" class="filter-chip">
                        <option value="all">평형</option>
                        <option value="small">소형</option>
                        <option value="medium">중형</option>
                        <option value="large">대형</option>
                    </select>
                    
                    <!-- 세대수 필터 -->
                    <select id="filterHousehold" class="filter-chip">
                        <option value="all">세대수</option>
                        <option value="0-50">50↓</option>
                        <option value="50-300">50-300</option>
                        <option value="300-1000">300-1000</option>
                        <option value="1000-+">1000↑</option>
                    </select>
                    
                    </div>
                </div>
                
                <!-- 초기화 버튼 (오른쪽 고정) -->
                <button id="btnResetFilters" class="filter-chip-reset-fixed">
                    <i class="fas fa-redo text-xs"></i>
                </button>
            </div>
            
            <!-- 선택된 필터 표시 -->
            <div id="selectedFilters" class="bg-white px-4 pb-3 mb-4 hidden">
                <div class="flex gap-2 flex-wrap items-center">
                    <!-- JavaScript로 동적 생성 -->
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
              return { text: '오늘 마감', class: 'bg-red-500', days: 0 };
            } else if (diffDays <= 7) {
              return { text: \`\${diffDays}일 남음\`, class: 'bg-red-500', days: diffDays };
            } else if (diffDays <= 30) {
              return { text: \`\${diffDays}일 남음\`, class: 'bg-orange-500', days: diffDays };
            } else {
              return { text: \`\${diffDays}일 남음\`, class: 'bg-blue-500', days: diffDays };
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

                  <!-- Basic Info (Toss Simple Style) -->
                  <div class="bg-gray-50 rounded-lg p-5">
                    <h3 class="text-base font-bold text-gray-900 mb-4">단지 정보</h3>
                    <div class="space-y-3">
                      \${property.exclusive_area_range || property.area_type ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">전용면적</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.exclusive_area_range || property.area_type}</span>
                        </div>
                      \` : ''}
                      <div class="flex justify-between items-center py-2 border-b border-gray-200">
                        <span class="text-sm text-gray-600">\${
                          property.title && (property.title.includes('행복주택') || property.title.includes('희망타운') || property.title.includes('임대'))
                            ? '임대보증금'
                            : '분양가'
                        }</span>
                        <span class="text-sm font-semibold text-gray-900">\${
                          (() => {
                            if (property.title && (property.title.includes('행복주택') || property.title.includes('희망타운') || property.title.includes('임대'))) {
                              if (property.rental_deposit_range) return property.rental_deposit_range;
                              if (property.rental_deposit_min && property.rental_deposit_max) {
                                return property.rental_deposit_min.toFixed(1) + '억~' + property.rental_deposit_max.toFixed(1) + '억';
                              }
                            }
                            return property.price;
                          })()
                        }</span>
                      </div>
                      <div class="flex justify-between items-center py-2 border-b border-gray-200">
                        <span class="text-sm text-gray-600">모집세대</span>
                        <span class="text-sm font-semibold text-gray-900">\${property.households}</span>
                      </div>
                      \${property.move_in_date ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">입주예정</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.move_in_date}</span>
                        </div>
                      \` : ''}
                      \${property.parking ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">주차</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.parking}</span>
                        </div>
                      \` : ''}
                      \${property.heating ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">난방</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.heating}</span>
                        </div>
                      \` : ''}
                      \${property.builder ? \`
                        <div class="flex justify-between items-center py-2">
                          <span class="text-sm text-gray-600">시공사</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.builder}</span>
                        </div>
                      \` : ''}
                    </div>
                  </div>

                  <!-- Selection Timeline (6 Steps) -->
                  \${property.application_start_date || property.no_rank_date || property.first_rank_date || property.special_subscription_date ? \`
                    <div class="bg-gray-50 rounded-lg p-5">
                      <h3 class="text-base font-bold text-gray-900 mb-4">📋 선정 절차</h3>
                      
                      <!-- Timeline Container -->
                      <div class="relative">
                        <!-- Vertical Line -->
                        <div class="absolute left-4 top-3 bottom-3 w-0.5 bg-gray-300"></div>
                        
                        <!-- Timeline Steps -->
                        <div class="space-y-4">
                          \${(() => {
                            // 오늘 날짜
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            // 각 단계의 날짜와 정보
                            const steps = [
                              { 
                                date: property.application_end_date || property.application_start_date,
                                step: 1,
                                title: '청약신청',
                                subtitle: '현장·인터넷·모바일',
                                dateDisplay: property.application_start_date + (property.application_end_date && property.application_end_date !== property.application_start_date ? '~' + property.application_end_date : '')
                              },
                              { 
                                date: property.document_submission_date,
                                step: 2,
                                title: '서류제출 대상자 발표',
                                subtitle: '인터넷·모바일 신청자 한함',
                                dateDisplay: property.document_submission_date
                              },
                              { 
                                date: property.document_acceptance_end_date || property.document_acceptance_start_date,
                                step: 3,
                                title: '사업주체 대상자 서류접수',
                                subtitle: '인터넷 신청자',
                                dateDisplay: property.document_acceptance_start_date + (property.document_acceptance_end_date && property.document_acceptance_end_date !== property.document_acceptance_start_date ? '~' + property.document_acceptance_end_date : '')
                              },
                              { 
                                date: property.qualification_verification_date,
                                step: 4,
                                title: '입주자격 검증 및 부적격자 소명',
                                subtitle: '',
                                dateDisplay: property.qualification_verification_date
                              },
                              { 
                                date: property.appeal_review_date,
                                step: 5,
                                title: '소명 절차 및 심사',
                                subtitle: '',
                                dateDisplay: property.appeal_review_date
                              },
                              { 
                                date: property.final_announcement_date,
                                step: 6,
                                title: '예비입주자 당첨자 발표',
                                subtitle: '',
                                dateDisplay: property.final_announcement_date
                              }
                            ];
                            
                            // 현재 단계 찾기
                            let currentStep = 6;
                            for (const s of steps) {
                              if (s.date) {
                                const stepDate = new Date(s.date);
                                stepDate.setHours(0, 0, 0, 0);
                                if (stepDate >= today) {
                                  currentStep = s.step;
                                  break;
                                }
                              }
                            }
                            
                            // 각 단계 렌더링
                            return steps.filter(s => s.date).map(s => {
                              const isCurrent = s.step === currentStep;
                              const dotColor = isCurrent ? 'bg-primary' : 'bg-gray-400';
                              const labelColor = isCurrent ? 'text-primary font-bold' : 'text-gray-500';
                              const titleColor = isCurrent ? 'text-primary font-bold' : 'text-gray-700';
                              const dateColor = isCurrent ? 'text-primary font-bold' : 'text-gray-600';
                              
                              return \`
                                <div class="relative pl-10">
                                  <div class="absolute left-2.5 top-1.5 w-3 h-3 \${dotColor} rounded-full border-2 border-white"></div>
                                  <div class="bg-white rounded-lg p-3 shadow-sm">
                                    <div class="flex justify-between items-start mb-1">
                                      <div>
                                        <span class="text-xs \${labelColor}">STEP \${s.step}</span>
                                        <h4 class="text-sm \${titleColor}">\${s.title}</h4>
                                        \${s.subtitle ? \`<p class="text-xs text-gray-500 mt-1">\${s.subtitle}</p>\` : ''}
                                      </div>
                                      <span class="text-xs \${dateColor}">\${s.dateDisplay}</span>
                                    </div>
                                  </div>
                                </div>
                              \`;
                            }).join('');
                          })()}
                        </div>

                        </div>
                      </div>
                    </div>
                  \` : ''}

                  <!-- Detailed Description (Simple Style) -->
                  \${property.description ? \`
                    <div class="space-y-4">
                      \${(() => {
                        const desc = property.description;
                        const sections = [];
                        
                        // 단지 개요 추출
                        const overviewMatch = desc.match(/🏢 단지 개요([\\s\\S]*?)(?=📐|💰|🏡|🎯|✨|📞|⚠️|💻|🔗|👍|$)/);
                        if (overviewMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">단지 개요</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${overviewMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 임대 조건 추출
                        const rentalMatch = desc.match(/💰 임대 조건([\\s\\S]*?)(?=🏡|🎯|✨|📞|⚠️|💻|🔗|👍|$)/);
                        if (rentalMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">임대 조건</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${rentalMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 주의사항 추출
                        const warningMatch = desc.match(/⚠️ 주의사항([\\s\\S]*?)(?=💻|🔗|👍|$)/);
                        if (warningMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">주의사항</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${warningMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 온라인 신청 추출
                        const onlineMatch = desc.match(/💻 온라인 신청([\\s\\S]*?)(?=🔗|👍|$)/);
                        if (onlineMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">온라인 신청</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${onlineMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        return sections.join('');
                      })()}
                    </div>
                  \` : ''}

                  <!-- Brochure/Pamphlet Section -->
                  \${property.brochure_url ? \`
                    <div class="bg-gray-50 rounded-lg p-5">
                      <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center">
                        <i class="fas fa-book-open text-primary mr-2"></i>
                        단지 팸플릿
                      </h3>
                      <div class="bg-white rounded-lg p-3">
                        <p class="text-sm text-gray-600 mb-3">단지의 상세 정보를 확인하세요</p>
                        <embed src="\${property.brochure_url}" 
                               type="application/pdf" 
                               width="100%" 
                               height="800px"
                               class="rounded-lg border border-gray-200" />
                        <div class="mt-3 text-center">
                          <a href="\${property.brochure_url}" 
                             target="_blank" 
                             class="inline-flex items-center gap-2 text-primary font-medium hover:underline">
                            <i class="fas fa-external-link-alt"></i>
                            새 탭에서 크게 보기
                          </a>
                        </div>
                      </div>
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
                <div class="stat-card bg-white rounded-xl shadow-sm p-5" data-type="all">
                  <div class="text-xs text-gray-500 mb-2 font-medium">전체분양</div>
                  <div class="text-3xl font-bold text-gray-900">\${stats.unsold + stats.johab + stats.next}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-5 active" data-type="unsold">
                  <div class="text-xs text-gray-500 mb-2 font-medium">줍줍분양</div>
                  <div class="text-3xl font-bold">\${stats.unsold}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-5" data-type="today">
                  <div class="text-xs text-gray-500 mb-2 font-medium">오늘청약</div>
                  <div class="text-3xl font-bold text-gray-900">0</div>
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
                          <h3 class="text-lg font-bold text-gray-900 mb-2">\${property.title}</h3>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="\${dday.class} text-white text-xs font-bold px-2 py-1 rounded">
                            \${dday.text}
                          </span>
                        </div>
                      </div>
                      
                      <!-- Location & Map Button -->
                      <div class="mb-3 flex items-center justify-between">
                        <div class="flex items-center gap-2 text-sm text-gray-600">
                          <i class="fas fa-map-marker-alt text-gray-400 text-xs"></i>
                          <span>\${property.full_address || property.location}</span>
                        </div>
                        \${property.full_address ? \`
                          <button onclick="openMap('\${property.full_address.replace(/'/g, "\\\\'")}', \${property.lat}, \${property.lng})" 
                                  class="text-gray-400 hover:text-gray-600 transition-colors"
                                  title="지도에서 보기">
                            <i class="fas fa-map-marker-alt text-lg"></i>
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
                            <div class="font-bold text-gray-900">\${property.exclusive_area_range || property.exclusive_area || '-'}</div>
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
                            <div class="text-xs text-gray-500 mb-1">\${
                              property.title && (property.title.includes('행복주택') || property.title.includes('희망타운') || property.title.includes('임대'))
                                ? '💰 임대보증금'
                                : '💰 분양가격'
                            }</div>
                            <div class="font-bold text-gray-900 text-xs">\${
                              (() => {
                                // 임대주택인 경우 rental_deposit_range 우선 표시
                                if (property.title && (property.title.includes('행복주택') || property.title.includes('희망타운') || property.title.includes('임대'))) {
                                  if (property.rental_deposit_range) {
                                    return property.rental_deposit_range;
                                  } else if (property.rental_deposit_min && property.rental_deposit_max) {
                                    return property.rental_deposit_min.toFixed(1) + '억~' + property.rental_deposit_max.toFixed(1) + '억';
                                  }
                                }
                                // 분양주택인 경우 기존 로직
                                if (property.sale_price_min && property.sale_price_max) {
                                  return property.sale_price_min.toFixed(1) + '억~' + property.sale_price_max.toFixed(1) + '억';
                                }
                                return property.price;
                              })()
                            }</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">🏗️ 시공사</div>
                            <div class="font-bold text-gray-900 text-xs">\${property.builder || '-'}</div>
                          </div>
                          \${(() => {
                            // 현재 날짜와 가장 가까운 다음 단계만 표시
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            const steps = [
                              { 
                                date: property.application_end_date || property.application_start_date,
                                icon: '📝',
                                label: '청약신청',
                                subtitle: '현장·인터넷·모바일',
                                dateDisplay: property.application_start_date + (property.application_end_date && property.application_end_date !== property.application_start_date ? '~' + property.application_end_date : '')
                              },
                              { 
                                date: property.document_submission_date,
                                icon: '📄',
                                label: '서류제출 대상자 발표',
                                subtitle: '인터넷·모바일 신청자 한함',
                                dateDisplay: property.document_submission_date
                              },
                              { 
                                date: property.document_acceptance_end_date || property.document_acceptance_start_date,
                                icon: '📋',
                                label: '사업주체 대상자 서류접수',
                                subtitle: '인터넷 신청자',
                                dateDisplay: property.document_acceptance_start_date + (property.document_acceptance_end_date && property.document_acceptance_end_date !== property.document_acceptance_start_date ? '~' + property.document_acceptance_end_date : '')
                              },
                              { 
                                date: property.qualification_verification_date,
                                icon: '✅',
                                label: '입주자격 검증 및 부적격자 소명',
                                subtitle: '',
                                dateDisplay: property.qualification_verification_date
                              },
                              { 
                                date: property.appeal_review_date,
                                icon: '📊',
                                label: '소명 절차 및 심사',
                                subtitle: '',
                                dateDisplay: property.appeal_review_date
                              },
                              { 
                                date: property.final_announcement_date,
                                icon: '🎉',
                                label: '예비입주자 당첨자 발표',
                                subtitle: '',
                                dateDisplay: property.final_announcement_date
                              }
                            ];
                            
                            // 현재 단계 찾기
                            let currentStep = null;
                            for (const s of steps) {
                              if (s.date) {
                                const stepDate = new Date(s.date);
                                stepDate.setHours(0, 0, 0, 0);
                                if (stepDate >= today) {
                                  currentStep = s;
                                  break;
                                }
                              }
                            }
                            
                            // 모든 단계가 지났으면 마지막 단계 표시
                            if (!currentStep && steps[steps.length - 1].date) {
                              currentStep = steps[steps.length - 1];
                            }
                            
                            if (!currentStep) return '';
                            
                            return \`
                              <div class="col-span-2">
                                <div class="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
                                  <div class="flex items-start justify-between">
                                    <div class="flex-1">
                                      <div class="text-xs text-blue-600 font-bold mb-1">\${currentStep.icon} \${currentStep.label}</div>
                                      \${currentStep.subtitle ? \`<div class="text-xs text-gray-600 mb-2">\${currentStep.subtitle}</div>\` : ''}
                                      <div class="text-sm font-bold text-primary">\${currentStep.dateDisplay}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            \`;
                          })()}
                        </div>
                        \${property.description ? \`
                          <div class="mt-3 pt-3 border-t border-gray-200">
                            <div class="text-xs font-medium text-gray-500 mb-1">💡 AI 요약</div>
                            <div class="text-xs text-gray-600 leading-relaxed">\${
                              (() => {
                                // 추천 대상 섹션에서 핵심 키워드 추출하여 한 줄 요약
                                const match = property.description.match(/👍 추천 대상[:\\s]*([^📢🏢📐💰🏡🎯✨📞⚠️💻🔗]*)/);
                                if (match && match[1]) {
                                  const lines = match[1].trim().split('\\n').filter(line => line.trim());
                                  // 첫 2개 라인의 핵심 키워드만 추출
                                  const keywords = lines.slice(0, 2).map(line => 
                                    line.replace(/[•\\-]/g, '').trim()
                                  ).join(', ');
                                  return keywords.length > 60 ? keywords.substring(0, 57) + '...' : keywords;
                                }
                                return '임대주택을 찾는 무주택 세대주에게 적합';
                              })()
                            }</div>
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
                                class="w-full bg-white border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-sm">
                          상세정보 보기
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

          // 호갱노노 스타일 필터 핸들러
          function setupNewFilters() {
            const filterRegion = document.getElementById('filterRegion');
            const filterType = document.getElementById('filterType');
            const filterHousehold = document.getElementById('filterHousehold');
            const filterArea = document.getElementById('filterArea');
            const filterSort = document.getElementById('filterSort');
            const btnReset = document.getElementById('btnResetFilters');
            const selectedFiltersContainer = document.getElementById('selectedFilters');
            
            // 필터 변경 시 active 클래스 토글
            function updateActiveClass(select) {
              if (select.value !== select.options[0].value) {
                select.classList.add('active');
              } else {
                select.classList.remove('active');
              }
            }
            
            // 선택된 필터 표시
            function updateSelectedFilters() {
              const selected = [];
              
              // 정렬은 기본값이 아닐 때만 표시
              if (filterSort.value !== 'deadline') {
                selected.push({
                  label: filterSort.options[filterSort.selectedIndex].text,
                  key: 'sort'
                });
              }
              
              // 지역
              if (filterRegion.value !== 'all') {
                selected.push({
                  label: filterRegion.options[filterRegion.selectedIndex].text,
                  key: 'region'
                });
              }
              
              // 매매 타입
              if (filterType.value !== 'all') {
                selected.push({
                  label: filterType.options[filterType.selectedIndex].text,
                  key: 'type'
                });
              }
              
              // 평형
              if (filterArea.value !== 'all') {
                selected.push({
                  label: filterArea.options[filterArea.selectedIndex].text,
                  key: 'area'
                });
              }
              
              // 세대수
              if (filterHousehold.value !== 'all') {
                selected.push({
                  label: filterHousehold.options[filterHousehold.selectedIndex].text,
                  key: 'household'
                });
              }
              
              // 선택된 필터가 있으면 표시
              if (selected.length > 0) {
                selectedFiltersContainer.classList.remove('hidden');
                selectedFiltersContainer.innerHTML = \`
                  <div class="flex gap-2 flex-wrap items-center">
                    \${selected.map(item => \`
                      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-full">
                        \${item.label}
                        <button onclick="removeSelectedFilter('\${item.key}')" class="hover:bg-white/20 rounded-full p-0.5 transition-colors">
                          <i class="fas fa-times text-xs"></i>
                        </button>
                      </span>
                    \`).join('')}
                    <button onclick="resetAllFilters()" class="text-sm text-gray-500 hover:text-gray-700 font-medium">
                      전체 해제
                    </button>
                  </div>
                \`;
              } else {
                selectedFiltersContainer.classList.add('hidden');
              }
            }
            
            // 개별 필터 제거
            window.removeSelectedFilter = function(key) {
              if (key === 'sort') {
                filterSort.value = 'deadline';
                filterSort.classList.remove('active');
                filters.sort = 'deadline';
              } else if (key === 'region') {
                filterRegion.value = 'all';
                filterRegion.classList.remove('active');
                filters.region = 'all';
              } else if (key === 'type') {
                filterType.value = 'all';
                filterType.classList.remove('active');
                filters.type = 'all';
              } else if (key === 'area') {
                filterArea.value = 'all';
                filterArea.classList.remove('active');
                filters.area = 'all';
              } else if (key === 'household') {
                filterHousehold.value = 'all';
                filterHousehold.classList.remove('active');
                filters.household = 'all';
              }
              updateSelectedFilters();
              loadProperties();
            };
            
            // 전체 필터 초기화
            window.resetAllFilters = function() {
              btnReset.click();
            };
            
            // 정렬 필터 (맨 앞)
            filterSort.addEventListener('change', () => {
              filters.sort = filterSort.value;
              updateActiveClass(filterSort);
              updateSelectedFilters();
              loadProperties();
            });
            
            // 지역 필터
            filterRegion.addEventListener('change', () => {
              filters.region = filterRegion.value;
              updateActiveClass(filterRegion);
              updateSelectedFilters();
              loadProperties();
            });
            
            // 유형 필터
            filterType.addEventListener('change', () => {
              filters.type = filterType.value;
              updateActiveClass(filterType);
              updateSelectedFilters();
              loadProperties();
              
              // Update stat card active state
              document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
              const targetCard = document.querySelector(\`.stat-card[data-type="\${filterType.value}"]\`);
              if (targetCard) targetCard.classList.add('active');
            });
            
            // 평형 필터
            filterArea.addEventListener('change', () => {
              filters.area = filterArea.value;
              updateActiveClass(filterArea);
              updateSelectedFilters();
              loadProperties();
            });
            
            // 세대수 필터
            filterHousehold.addEventListener('change', () => {
              filters.household = filterHousehold.value;
              updateActiveClass(filterHousehold);
              updateSelectedFilters();
              loadProperties();
            });
            
            // 초기화 버튼
            btnReset.addEventListener('click', () => {
              filters.region = 'all';
              filters.type = 'all';
              filters.household = 'all';
              filters.area = 'all';
              filters.sort = 'deadline';
              
              filterRegion.value = 'all';
              filterType.value = 'all';
              filterHousehold.value = 'all';
              filterArea.value = 'all';
              filterSort.value = 'deadline';
              
              // Remove all active classes
              filterRegion.classList.remove('active');
              filterType.classList.remove('active');
              filterHousehold.classList.remove('active');
              filterArea.classList.remove('active');
              filterSort.classList.remove('active');
              
              updateSelectedFilters();
              loadProperties();
            });
          }

          // ==================== 로그인 관리 ====================
          
          // 로그인 모달 열기
          function openLoginModal() {
            document.getElementById('loginModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
          }
          
          // 로그인 모달 닫기
          window.closeLoginModal = function() {
            document.getElementById('loginModal').classList.add('hidden');
            document.body.style.overflow = 'auto';
          }
          
          // 이메일 로그인 모달 열기
          window.openEmailLoginModal = function() {
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('emailLoginModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
          }
          
          // 이메일 로그인 모달 닫기
          window.closeEmailLoginModal = function() {
            document.getElementById('emailLoginModal').classList.add('hidden');
            document.body.style.overflow = 'auto';
          }
          
          // 회원가입 모달 열기
          window.openSignupModal = function() {
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('signupModal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
          }
          
          // 회원가입 모달 닫기
          window.closeSignupModal = function() {
            document.getElementById('signupModal').classList.add('hidden');
            document.body.style.overflow = 'auto';
          }
          
          // 이메일 로그인 처리
          document.getElementById('emailLoginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            try {
              const response = await fetch('/auth/email/login', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
              });
              
              const data = await response.json();
              
              if (data.success) {
                // 로그인 성공
                localStorage.setItem('user', JSON.stringify(data.user));
                alert(\`\${data.user.nickname}님, 환영합니다!\`);
                window.location.reload();
              } else {
                alert(data.error || '로그인에 실패했습니다.');
              }
            } catch (error) {
              console.error('Login error:', error);
              alert('로그인 처리 중 오류가 발생했습니다.');
            }
          });
          
          // 회원가입 처리
          document.getElementById('signupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('signupEmail').value;
            const nickname = document.getElementById('signupNickname').value;
            const password = document.getElementById('signupPassword').value;
            const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
            
            // 비밀번호 확인
            if (password !== passwordConfirm) {
              alert('비밀번호가 일치하지 않습니다.');
              return;
            }
            
            try {
              const response = await fetch('/auth/email/signup', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, nickname, password })
              });
              
              const data = await response.json();
              
              if (data.success) {
                // 회원가입 성공
                localStorage.setItem('user', JSON.stringify(data.user));
                alert(\`\${data.user.nickname}님, 가입을 환영합니다!\`);
                window.location.reload();
              } else {
                alert(data.error || '회원가입에 실패했습니다.');
              }
            } catch (error) {
              console.error('Signup error:', error);
              alert('회원가입 처리 중 오류가 발생했습니다.');
            }
          });
          
          // 로그인 상태 확인 및 UI 업데이트
          function checkLoginStatus() {
            const userStr = localStorage.getItem('user');
            const loginBtn = document.getElementById('loginBtn');
            
            if (userStr) {
              try {
                const user = JSON.parse(userStr);
                // 로그인 상태: 프로필 이미지 + 닉네임 표시
                loginBtn.innerHTML = \`
                  <div class="flex items-center gap-2">
                    <img src="\${user.profileImage || 'https://via.placeholder.com/32'}" 
                         class="w-8 h-8 rounded-full" 
                         onerror="this.src='https://via.placeholder.com/32'">
                    <span class="hidden sm:inline">\${user.nickname}</span>
                    <i class="fas fa-chevron-down text-xs"></i>
                  </div>
                \`;
                loginBtn.onclick = showUserMenu;
              } catch (e) {
                console.error('Failed to parse user data:', e);
                localStorage.removeItem('user');
              }
            } else {
              // 로그아웃 상태: 로그인 버튼 - 모달 열기
              loginBtn.innerHTML = '로그인';
              loginBtn.onclick = openLoginModal;
            }
          }
          
          // ==================== 마이페이지 드롭다운 (사람인 스타일) ====================
          
          // 드롭다운 열기/닫기 토글
          function showUserMenu() {
            const userStr = localStorage.getItem('user');
            if (!userStr) return;
            
            const user = JSON.parse(userStr);
            const dropdown = document.getElementById('myPageDropdown');
            
            // 이미 열려있으면 닫기
            if (!dropdown.classList.contains('hidden')) {
              dropdown.classList.add('hidden');
              return;
            }
            
            // 프로필 헤더 업데이트
            const header = document.getElementById('myPageHeader');
            const providerLabel = {
              'kakao': '카카오',
              'naver': '네이버',
              'email': '이메일'
            }[user.provider] || '소셜';
            
            header.innerHTML = \`
              <div class="flex items-center gap-3">
                <img src="\${user.profileImage || 'https://via.placeholder.com/60'}" 
                     class="w-12 h-12 rounded-full border border-gray-200" 
                     onerror="this.src='https://via.placeholder.com/60'">
                <div class="flex-1">
                  <h3 class="font-bold text-gray-900">\${user.nickname}</h3>
                  <p class="text-xs text-gray-500 mt-0.5">\${providerLabel} 로그인</p>
                </div>
              </div>
            \`;
            
            // 드롭다운 표시
            dropdown.classList.remove('hidden');
          }
          
          // 드롭다운 외부 클릭 시 닫기
          document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('myPageDropdown');
            const loginBtn = document.getElementById('loginBtn');
            
            if (dropdown && !dropdown.contains(e.target) && e.target !== loginBtn && !loginBtn.contains(e.target)) {
              dropdown.classList.add('hidden');
            }
          });
          
          // 계정정보 설정 (프로필 수정)
          window.openProfileEdit = function() {
            // 드롭다운 닫기
            document.getElementById('myPageDropdown').classList.add('hidden');
            
            const userStr = localStorage.getItem('user');
            if (!userStr) return;
            
            const user = JSON.parse(userStr);
            
            const nickname = prompt('새 닉네임을 입력하세요:', user.nickname);
            if (!nickname || nickname === user.nickname) return;
            
            fetch(\`/api/user/\${user.id}/profile\`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nickname })
            })
            .then(res => res.json())
            .then(data => {
              if (data.success) {
                user.nickname = data.user.nickname;
                localStorage.setItem('user', JSON.stringify(user));
                alert('프로필이 수정되었습니다!');
                window.location.reload();
              } else {
                alert(data.error || '프로필 수정에 실패했습니다.');
              }
            })
            .catch(error => {
              console.error('Profile update error:', error);
              alert('프로필 수정 중 오류가 발생했습니다.');
            });
          }
          
          // 알림 설정
          window.openNotificationSettings = function() {
            // 드롭다운 닫기
            document.getElementById('myPageDropdown').classList.add('hidden');
            
            const userStr = localStorage.getItem('user');
            if (!userStr) return;
            
            const user = JSON.parse(userStr);
            showNotificationSettings(user);
          }
          
          // 고객센터 (문의하기)
          window.openContact = function() {
            // 드롭다운 닫기
            document.getElementById('myPageDropdown').classList.add('hidden');
            
            const email = 'support@hanchae365.com';
            const subject = '[똑똑한한채] 문의하기';
            window.location.href = \`mailto:\${email}?subject=\${encodeURIComponent(subject)}\`;
          }
          
          // 로그아웃
          window.handleLogout = function() {
            if (confirm('로그아웃 하시겠습니까?')) {
              window.location.href = '/auth/logout';
            }
          }
          
          // 알림 설정 모달 표시
          async function showNotificationSettings(user) {
            try {
              // 현재 알림 설정 불러오기
              const response = await fetch(\`/api/user/\${user.id}/notifications\`);
              const settings = await response.json();
              
              const enabled = settings.notification_enabled === 1;
              const regions = settings.regions ? JSON.parse(settings.regions) : [];
              const propertyTypes = settings.property_types ? JSON.parse(settings.property_types) : [];
              
              // 간단한 설정 UI (나중에 모달로 개선)
              const enableNotification = confirm(
                \`알림 받기 설정\\n\\n현재 상태: \${enabled ? 'ON' : 'OFF'}\\n\\n확인: 알림 켜기\\n취소: 알림 끄기\`
              );
              
              // 설정 업데이트
              await fetch(\`/api/user/\${user.id}/notifications\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  notification_enabled: enableNotification ? 1 : 0,
                  regions: regions.length > 0 ? regions : ['전체'],
                  property_types: propertyTypes.length > 0 ? propertyTypes : ['전체']
                })
              });
              
              alert(\`알림이 \${enableNotification ? '켜졌' : '꺼졌'}습니다!\\n\\n새 분양 공고가 등록되면 카카오톡으로 알림을 보내드립니다.\`);
              
            } catch (error) {
              console.error('Failed to update notification settings:', error);
              alert('알림 설정 중 오류가 발생했습니다.');
            }
          }

          // Initialize
          checkLoginStatus();
          loadStats();
          loadProperties();
          setupNewFilters();
        </script>
    </body>
    </html>
  `)
})

export default app
