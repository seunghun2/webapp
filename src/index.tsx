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
    
    // Get all non-deleted properties
    const result = await DB.prepare(`
      SELECT 
        type,
        deadline
      FROM properties
      WHERE deleted_at IS NULL
    `).all()
    
    // Calculate stats with deadline filtering (same logic as frontend)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const stats = {
      rental: 0,
      general: 0,
      unsold: 0,
      today: 0
    }
    
    result.results.forEach((row: any) => {
      let shouldCount = true
      
      // Apply deadline filtering (same as frontend loadProperties)
      if (row.deadline) {
        try {
          const deadline = new Date(row.deadline)
          deadline.setHours(0, 0, 0, 0)
          
          // deadline + 1일 계산
          const deadlinePlusOne = new Date(deadline)
          deadlinePlusOne.setDate(deadlinePlusOne.getDate() + 1)
          
          // today가 deadline + 1일 이전이면 카운트
          shouldCount = today < deadlinePlusOne
        } catch (e) {
          // 파싱 실패하면 카운트
          shouldCount = true
        }
      }
      
      if (shouldCount) {
        stats[row.type as keyof typeof stats] = (stats[row.type as keyof typeof stats] || 0) + 1
      }
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
    const sort = c.req.query('sort') || 'latest'
    const search = c.req.query('search') || ''
    const includeAll = c.req.query('includeAll') || 'false' // Admin에서 사용
    
    // Build query - excluding soft-deleted
    let query = "SELECT * FROM properties WHERE deleted_at IS NULL"
    let params: any[] = []
    
    // Admin이 아니면 active 상태만 표시 (draft 필터링)
    if (includeAll !== 'true') {
      query += " AND status = 'active'"
    }
    
    // Type filter
    if (type === 'today') {
      // 오늘청약: 오늘이 청약일인 항목만 표시
      query += " AND date(deadline) = date('now')"
    } else if (type !== 'all') {
      query += ' AND type = ?'
      params.push(type)
    }
    
    // Search filter (단지명, 지역, 태그로 검색)
    if (search) {
      query += ' AND (title LIKE ? OR location LIKE ? OR tags LIKE ?)'
      const searchParam = `%${search}%`
      params.push(searchParam, searchParam, searchParam)
    }
    
    // Sorting
    switch (sort) {
      case 'deadline':
        query += ' ORDER BY deadline ASC'
        break
      default:
        query += ' ORDER BY created_at DESC'
    }
    
    let stmt = DB.prepare(query)
    if (params.length > 0) {
      stmt = stmt.bind(...params)
    }
    
    const result = await stmt.all()
    
    const properties = result.results.map((prop: any) => {
      let parsedTags = []
      try {
        if (typeof prop.tags === 'string') {
          // JSON 배열 형식인 경우 파싱
          if (prop.tags.startsWith('[')) {
            parsedTags = JSON.parse(prop.tags)
          } else {
            // 쉼표로 구분된 문자열
            parsedTags = prop.tags.split(',').map((t: string) => t.trim()).filter(t => t)
          }
        } else {
          parsedTags = prop.tags || []
        }
      } catch (e) {
        console.warn('Failed to parse tags:', e)
        parsedTags = []
      }
      
      return {
        ...prop,
        tags: parsedTags
      }
    })
    
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
      tags: typeof result.tags === 'string' ? result.tags.split(',').map((t: string) => t.trim()) : (result.tags || [])
    }
    
    return c.json(property)
  } catch (error) {
    console.error('Error fetching property:', error)
    return c.json({ error: 'Failed to fetch property' }, 500)
  }
})

// ==================== 국토교통부 실거래가 API ====================

// 법정동 코드 매핑 (주요 지역만 - 필요시 확장)
const LAWD_CD_MAP: { [key: string]: string } = {
  '세종': '36110',
  '익산': '35140',
  '평택': '31070',
  '서울': '11000',
  '부산': '26000',
  '대구': '27000',
  '인천': '28000',
  '광주': '29000',
  '대전': '30000',
  '울산': '31000',
  // 필요시 추가
}

// 아파트 이름 자동 매칭 함수
function findBestMatchingApartment(
  userInputName: string,
  apiApartments: string[]
): { bestMatch: string | null; score: number } {
  if (apiApartments.length === 0) {
    return { bestMatch: null, score: 0 }
  }

  // 사용자 입력에서 숫자와 한글만 추출 (영문, 특수문자 제거)
  const cleanInput = userInputName
    .replace(/[a-zA-Z\s\-_.()]/g, '')
    .replace(/단지|아파트|타운|빌라|맨션|APT/gi, '')
    .trim()

  let bestMatch: string | null = null
  let highestScore = 0

  for (const aptName of apiApartments) {
    let score = 0

    // 1. 완전 일치 (최고 점수)
    if (aptName === userInputName) {
      return { bestMatch: aptName, score: 100 }
    }

    // 2. 포함 관계
    if (aptName.includes(cleanInput)) {
      score += 80
    } else if (cleanInput.includes(aptName)) {
      score += 70
    }

    // 3. 숫자 패턴 매칭 (예: "6-3" → "6-3단지")
    const numberPattern = cleanInput.match(/\d+[-]\d+|\d+/g)
    if (numberPattern) {
      numberPattern.forEach(num => {
        if (aptName.includes(num)) {
          score += 50
        }
      })
    }

    // 4. 한글 키워드 매칭
    const koreanPattern = cleanInput.match(/[가-힣]+/g)
    if (koreanPattern) {
      koreanPattern.forEach(keyword => {
        if (keyword.length >= 2 && aptName.includes(keyword)) {
          score += 30
        }
      })
    }

    // 5. 부분 일치 점수
    let matchCount = 0
    for (let i = 0; i < cleanInput.length; i++) {
      if (aptName.includes(cleanInput[i])) {
        matchCount++
      }
    }
    score += (matchCount / cleanInput.length) * 20

    if (score > highestScore) {
      highestScore = score
      bestMatch = aptName
    }
  }

  return { bestMatch, score: highestScore }
}

// 국토교통부 실거래가 API 호출 (개선 버전)
async function fetchApartmentTrades(
  lawdCd: string,
  dealYmd: string,
  apiKey: string,
  apartmentName?: string
): Promise<any[]> {
  try {
    // 국토교통부 아파트 매매 실거래 자료 API (공공데이터포털)
    const endpoint = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade'
    
    const params = new URLSearchParams({
      serviceKey: apiKey,
      LAWD_CD: lawdCd,
      DEAL_YMD: dealYmd,
      numOfRows: '1000',
      pageNo: '1'
    })

    const response = await fetch(`${endpoint}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (!response.ok) {
      console.error(`MOLIT API error: ${response.status}`)
      return []
    }

    const xmlText = await response.text()
    
    // XML 파싱 (간단한 방법 - DOMParser 대신 정규식 사용)
    const items: any[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemXml = match[1]
      
      // 각 필드 추출
      const getField = (fieldName: string) => {
        const regex = new RegExp(`<${fieldName}>([^<]*)<\/${fieldName}>`)
        const m = itemXml.match(regex)
        return m ? m[1].trim() : ''
      }

      const aptName = getField('aptNm')
      
      // 아파트 이름 필터링 (제공된 경우)
      if (apartmentName && !aptName.includes(apartmentName)) {
        continue
      }

      items.push({
        apartmentName: aptName,
        dealAmount: getField('dealAmount').replace(/,/g, '').trim(),
        buildYear: getField('buildYear'),
        dealYear: getField('dealYear'),
        dealMonth: getField('dealMonth'),
        dealDay: getField('dealDay'),
        area: getField('excluUseAr'),
        floor: getField('floor'),
        dong: getField('umdNm'),
        jibun: getField('jibun')
      })
    }

    return items
  } catch (error) {
    console.error('Error fetching apartment trades:', error)
    return []
  }
}

// 실거래가 데이터 분석 (평균, 최고, 최저, 최근)
function analyzeTradeData(trades: any[]): {
  averagePrice: number
  maxPrice: number
  minPrice: number
  recentPrice: number
  recentDate: string
  totalCount: number
} {
  if (trades.length === 0) {
    return {
      averagePrice: 0,
      maxPrice: 0,
      minPrice: 0,
      recentPrice: 0,
      recentDate: '',
      totalCount: 0
    }
  }

  // 거래금액을 숫자로 변환 (만원 → 억원)
  const prices = trades.map(t => parseFloat(t.dealAmount) / 10000)
  
  const sum = prices.reduce((a, b) => a + b, 0)
  const avg = sum / prices.length
  const max = Math.max(...prices)
  const min = Math.min(...prices)

  // 최근 거래 찾기 (날짜순 정렬)
  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = `${a.dealYear}-${a.dealMonth.padStart(2, '0')}-${a.dealDay.padStart(2, '0')}`
    const dateB = `${b.dealYear}-${b.dealMonth.padStart(2, '0')}-${b.dealDay.padStart(2, '0')}`
    return dateB.localeCompare(dateA) // 내림차순
  })

  const recent = sortedTrades[0]
  const recentPrice = parseFloat(recent.dealAmount) / 10000
  const recentDate = `${recent.dealYear}-${recent.dealMonth.padStart(2, '0')}-${recent.dealDay.padStart(2, '0')}`

  return {
    averagePrice: parseFloat(avg.toFixed(2)),
    maxPrice: parseFloat(max.toFixed(2)),
    minPrice: parseFloat(min.toFixed(2)),
    recentPrice: parseFloat(recentPrice.toFixed(2)),
    recentDate,
    totalCount: trades.length
  }
}

// API: 매물 ID로 실거래가 자동 조회 및 업데이트
app.post('/api/properties/:id/update-trade-price', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const apiKey = c.env.MOLIT_API_KEY

    if (!apiKey) {
      return c.json({ 
        error: 'MOLIT_API_KEY not configured',
        message: '국토교통부 API 키가 설정되지 않았습니다. wrangler secret을 사용하여 설정하세요.'
      }, 500)
    }

    // 매물 정보 조회
    const property = await DB.prepare(
      'SELECT id, title, city, district, full_address FROM properties WHERE id = ?'
    ).bind(id).first()

    if (!property) {
      return c.json({ error: 'Property not found' }, 404)
    }

    // 도시명에서 법정동 코드 찾기
    const lawdCd = LAWD_CD_MAP[property.city as string]
    if (!lawdCd) {
      return c.json({ 
        error: 'City code not found',
        message: `${property.city}의 법정동 코드를 찾을 수 없습니다.`
      }, 400)
    }

    // 최근 3개월 실거래가 조회
    const today = new Date()
    const months = []
    
    for (let i = 0; i < 3; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
      months.push(ym)
    }

    // 1단계: 먼저 필터링 없이 모든 아파트 조회
    let allApartments: string[] = []
    for (const month of months) {
      const trades = await fetchApartmentTrades(lawdCd, month, apiKey)
      trades.forEach(trade => {
        if (!allApartments.includes(trade.apartmentName)) {
          allApartments.push(trade.apartmentName)
        }
      })
    }

    if (allApartments.length === 0) {
      return c.json({ 
        success: false,
        message: '해당 지역에 실거래가 데이터가 없습니다.',
        lawdCd,
        months
      })
    }

    // 2단계: 자동 매칭으로 최적의 아파트 이름 찾기
    const { bestMatch, score } = findBestMatchingApartment(property.title as string, allApartments)

    if (!bestMatch || score < 30) {
      return c.json({ 
        success: false,
        message: '매칭되는 아파트를 찾을 수 없습니다.',
        userInput: property.title,
        availableApartments: allApartments.slice(0, 10),
        bestMatch,
        matchScore: score
      })
    }

    // 3단계: 매칭된 아파트의 실거래가 조회
    let allTrades: any[] = []
    for (const month of months) {
      const trades = await fetchApartmentTrades(lawdCd, month, apiKey, bestMatch)
      allTrades = [...allTrades, ...trades]
    }

    if (allTrades.length === 0) {
      return c.json({ 
        success: false,
        message: '실거래가 데이터를 찾을 수 없습니다.',
        matchedApartmentName: bestMatch,
        lawdCd,
        months
      })
    }

    // 데이터 분석
    const analysis = analyzeTradeData(allTrades)

    // DB 업데이트
    await DB.prepare(`
      UPDATE properties 
      SET 
        recent_trade_price = ?,
        recent_trade_date = ?,
        last_price_update = datetime('now')
      WHERE id = ?
    `).bind(
      analysis.recentPrice,
      analysis.recentDate,
      id
    ).run()

    return c.json({
      success: true,
      propertyId: id,
      userInputName: property.title,
      matchedApartmentName: bestMatch,
      matchScore: score,
      analysis,
      tradesFound: allTrades.length,
      message: '실거래가 정보가 업데이트되었습니다.'
    })

  } catch (error) {
    console.error('Error updating trade price:', error)
    return c.json({ 
      error: 'Failed to update trade price',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// API: 모든 unsold 매물의 실거래가 일괄 업데이트
app.post('/api/properties/batch-update-trade-price', async (c) => {
  try {
    const { DB } = c.env
    const apiKey = c.env.MOLIT_API_KEY

    if (!apiKey) {
      return c.json({ 
        error: 'MOLIT_API_KEY not configured'
      }, 500)
    }

    // unsold 타입 매물만 조회
    const properties = await DB.prepare(
      'SELECT id, title, city FROM properties WHERE type = ?'
    ).bind('unsold').all()

    const results = []

    for (const property of properties.results as any[]) {
      try {
        const lawdCd = LAWD_CD_MAP[property.city]
        if (!lawdCd) continue

        const today = new Date()
        const ym = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`
        
        const apartmentName = property.title.split(' ')[0]
        const trades = await fetchApartmentTrades(lawdCd, ym, apiKey, apartmentName)

        if (trades.length > 0) {
          const analysis = analyzeTradeData(trades)
          
          await DB.prepare(`
            UPDATE properties 
            SET 
              recent_trade_price = ?,
              recent_trade_date = ?,
              last_price_update = datetime('now')
            WHERE id = ?
          `).bind(
            analysis.recentPrice,
            analysis.recentDate,
            property.id
          ).run()

          results.push({
            id: property.id,
            title: property.title,
            success: true,
            tradesFound: trades.length
          })
        }
      } catch (error) {
        results.push({
          id: property.id,
          title: property.title,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return c.json({
      success: true,
      totalProperties: properties.results.length,
      results
    })

  } catch (error) {
    console.error('Error batch updating trade prices:', error)
    return c.json({ 
      error: 'Failed to batch update',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
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
// 크롤링 임시 비활성화 (2025-11-16)
app.post('/api/crawl/lh', async (c) => {
  return c.json({ 
    success: false, 
    message: '크롤링이 일시적으로 비활성화되었습니다.' 
  }, 503)
  
  /* 
  // 원래 크롤링 코드 (비활성화됨)
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
  */
})

// 청약홈 HTML 크롤링 (마감되지 않은 매물만, 로컬 DB에만 저장)
app.post('/api/crawl/applyhome', async (c) => {
  try {
    const { DB } = c.env
    
    console.log('🏠 청약홈 크롤링 시작...')
    
    let newCount = 0
    let updateCount = 0
    let skipCount = 0
    let totalProcessed = 0
    
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    
    // 페이지네이션: 여러 페이지 크롤링
    const maxPages = 27 // 최대 27페이지까지 (전체 페이지)
    
    for (let page = 1; page <= maxPages; page++) {
      try {
        console.log(`\n📄 ${page}페이지 크롤링 중...`)
        
        const applyHomeUrl = `https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancListView.do?pageIndex=${page}`
        
        const response = await fetch(applyHomeUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        })
        
        if (!response.ok) {
          console.log(`⚠️  ${page}페이지 접속 실패: ${response.status}`)
          break
        }
        
        const html = await response.text()
        
        // HTML 테이블 파싱 - data-honm 속성을 가진 행만 추출
        const rowRegex = /<tr[^>]*data-honm="([^"]+)"[^>]*>(.*?)<\/tr>/gs
        const rows = [...html.matchAll(rowRegex)]
        
        if (rows.length === 0) {
          console.log(`📭 ${page}페이지에 더 이상 공고 없음`)
          break
        }
        
        console.log(`📊 ${page}페이지: ${rows.length}개 공고 발견`)
        
        // 각 행 처리
        for (const row of rows) {
      try {
        const titleText = row[1] // data-honm 속성 값
        const rowHtml = row[2] // <tr> 내부 HTML
        
        console.log(`📝 처리 중: ${titleText}`)
        
        // <td> 태그들 추출
        const tdRegex = /<td[^>]*>(.*?)<\/td>/gs
        const tds = [...rowHtml.matchAll(tdRegex)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        
        if (tds.length < 8) {
          console.log(`⏭️  데이터 부족, 스킵: ${titleText}`)
          skipCount++
          continue
        }
        
        // TD 구조: [0]=지역, [1]=민영/공공, [2]=분양유형, [3]=주택명, [4]=시공사, [5]=전화번호, [6]=공고일, [7]=청약기간, [8]=당첨자발표
        const location = tds[0] // 지역 (예: 전북, 경기)
        const houseType = tds[1] // 민영/공공
        const saleType = tds[2] // 분양주택/임대주택
        const announcementDate = tds[6] // 모집공고일
        const applicationPeriod = tds[7] // 청약기간 (2025-11-19 ~ 2025-11-21)
        
        // 청약 마감일 추출 (청약기간에서 끝 날짜)
        const periodMatch = applicationPeriod.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/)
        if (!periodMatch) {
          console.log(`⏭️  청약기간 형식 오류, 스킵: ${titleText}`)
          skipCount++
          continue
        }
        
        const deadlineStr = periodMatch[2] // 청약 마감일
        
        // 마감일 체크 - 오늘 이후인 것만
        const deadlineDate = new Date(deadlineStr)
        if (deadlineDate < todayDate) {
          console.log(`⏭️  마감된 공고 스킵: ${titleText} (마감: ${deadlineStr})`)
          skipCount++
          continue
        }
        
        // 상태 판단
        const announcementStatus = '접수중'
        
        // 유형 판단 (houseType과 saleType 기반)
        let propertyType = 'general' // 기본값: 일반분양
        let announcementType = saleType // 기본값: 분양주택/임대주택
        
        if (houseType === '공공' || titleText.includes('LH')) {
          propertyType = 'unsold'
          announcementType = '공공분양'
        } else if (houseType === '민영') {
          propertyType = 'general'
          announcementType = '민간분양'
        }
        
        if (saleType.includes('임대')) {
          propertyType = 'rental'
        }
        
        // 지역 정규화 (location은 이미 지역명: 전북, 경기, 충남 등)
        let normalizedRegion = location
        
        // 세부 지역 매핑
        if (location === '경북') normalizedRegion = '경북'
        else if (location === '경남') normalizedRegion = '경남'
        else if (location === '전북') normalizedRegion = '전북'
        else if (location === '전남') normalizedRegion = '전남'
        else if (location === '충북') normalizedRegion = '충북'
        else if (location === '충남') normalizedRegion = '충남'
        else normalizedRegion = location // 서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 제주
        
        // 중복 체크 (제목 기반)
        const existing = await DB.prepare(
          'SELECT id FROM properties WHERE title = ? AND deleted_at IS NULL LIMIT 1'
        ).bind(titleText).first()
        
        const now = new Date().toISOString()
        
        if (existing) {
          // 업데이트
          await DB.prepare(`
            UPDATE properties SET
              announcement_status = ?,
              deadline = ?,
              updated_at = ?
            WHERE id = ?
          `).bind(announcementStatus, deadlineStr, now, existing.id).run()
          
          console.log(`🔄 기존 매물 업데이트: ${titleText}`)
          updateCount++
        } else {
          // 새로 삽입 (로컬 DB에만) - draft 상태로 저장 (메인 카드 비노출)
          await DB.prepare(`
            INSERT INTO properties (
              type, title, location, status, deadline, price, households, tags,
              region, announcement_type, announcement_status, announcement_date,
              source, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            propertyType,
            titleText,
            location,
            'draft', // 크롤링된 매물은 임시저장 상태
            deadlineStr,
            '미정',
            '미정',
            JSON.stringify(['청약홈']),
            normalizedRegion,
            announcementType,
            announcementStatus,
            announcementDate,
            'applyhome',
            now,
            now
          ).run()
          
          console.log(`✅ 신규 매물 추가 (임시저장): ${titleText}`)
          newCount++
        }
        
        totalProcessed++
        
      } catch (itemError) {
        console.error(`❌ 매물 처리 실패:`, itemError)
      }
    } // end of row loop
    
    console.log(`✅ ${page}페이지 완료: 신규 ${newCount}건, 업데이트 ${updateCount}건, 스킵 ${skipCount}건`)
    
  } catch (pageError) {
    console.error(`❌ ${page}페이지 처리 오류:`, pageError)
    break
  }
} // end of page loop
    
    console.log(`\n🎉 전체 크롤링 완료!`)
    console.log(`📊 총 처리: ${totalProcessed}건`)
    console.log(`✅ 신규 추가: ${newCount}건`)
    console.log(`🔄 업데이트: ${updateCount}건`)
    console.log(`⏭️  마감 스킵: ${skipCount}건`)
    
    return c.json({
      success: true,
      message: `청약홈 크롤링 완료 (로컬 DB): 총 ${totalProcessed}건 처리, 신규 ${newCount}건, 업데이트 ${updateCount}건, 마감 스킵 ${skipCount}건`,
      totalProcessed,
      newCount,
      updateCount,
      skipCount,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ 청약홈 크롤링 오류:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
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

// PDF Upload and Parse API
app.post('/api/properties/:id/upload-pdf', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    // Get PDF text from request body (already extracted by frontend)
    const body = await c.req.json()
    const { pdfText, fileName } = body
    
    if (!pdfText) {
      return c.json({ error: 'PDF text is required' }, 400)
    }
    
    // Update property with PDF text
    await DB.prepare(`
      UPDATE properties 
      SET pdf_raw_text = ?,
          pdf_url = ?,
          pdf_parsed = 0,
          pdf_parsed_at = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(pdfText, fileName || '', id).run()
    
    return c.json({
      success: true,
      message: 'PDF text saved successfully. Ready for parsing.',
      propertyId: id,
      textLength: pdfText.length
    })
  } catch (error) {
    console.error('Error uploading PDF:', error)
    return c.json({ error: 'Failed to upload PDF' }, 500)
  }
})

// Get PDF text for Claude to analyze
app.get('/api/properties/:id/pdf-text', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    const property = await DB.prepare(`
      SELECT id, title, type, pdf_raw_text FROM properties WHERE id = ?
    `).bind(id).first()
    
    if (!property) {
      return c.json({ error: 'Property not found' }, 404)
    }
    
    return c.json({
      id: property.id,
      title: property.title,
      type: property.type,
      pdfText: property.pdf_raw_text || '',
      hasText: !!property.pdf_raw_text
    })
  } catch (error) {
    console.error('Error getting PDF text:', error)
    return c.json({ error: 'Failed to get PDF text' }, 500)
  }
})

// Update property with Claude-parsed data
app.post('/api/properties/:id/update-parsed', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    const body = await c.req.json()
    const updates = body.updates
    
    if (!updates || Object.keys(updates).length === 0) {
      return c.json({ error: 'No updates provided' }, 400)
    }
    
    // Tags는 이미 JSON string으로 전달됨 - 추가 처리 불필요
    // (프론트엔드에서 JSON.stringify(tags) 처리됨)
    
    // Update database
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ')
    const values = Object.values(updates)
    
    await DB.prepare(`
      UPDATE properties 
      SET ${setClause},
          pdf_parsed = 1,
          pdf_parsed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(...values, id).run()
    
    return c.json({
      success: true,
      message: 'Property updated successfully',
      updates: updates,
      updatedFields: Object.keys(updates).length
    })
  } catch (error) {
    console.error('Error updating property:', error)
    console.error('Error message:', error.message)
    console.error('Error cause:', error.cause)
    console.error('Updates object:', updates)
    return c.json({ 
      error: 'Failed to update property', 
      details: error.message,
      updatesKeys: Object.keys(updates || {})
    }, 500)
  }
})

// Delete property (Admin)
app.delete('/api/properties/:id', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    // 소프트 삭제: deleted_at을 현재 시간으로 설정
    const result = await DB.prepare(`UPDATE properties SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`).bind(id).run()
    
    // 영향받은 row 수 확인
    if (result.meta.changes === 0) {
      return c.json({
        success: false,
        message: 'Property not found or already deleted'
      }, 404)
    }
    
    return c.json({
      success: true,
      message: 'Property deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting property:', error)
    return c.json({ error: 'Failed to delete property' }, 500)
  }
})

// Get deleted properties (Admin)
app.get('/api/properties/deleted', async (c) => {
  try {
    const { DB } = c.env
    const search = c.req.query('search') || ''
    
    let query = "SELECT * FROM properties WHERE deleted_at IS NOT NULL"
    let params: any[] = []
    
    // Search filter
    if (search) {
      query += ' AND (title LIKE ? OR location LIKE ? OR tags LIKE ?)'
      const searchParam = `%${search}%`
      params.push(searchParam, searchParam, searchParam)
    }
    
    query += ' ORDER BY deleted_at DESC'
    
    let stmt = DB.prepare(query)
    if (params.length > 0) {
      stmt = stmt.bind(...params)
    }
    
    const result = await stmt.all()
    
    const properties = result.results.map((prop: any) => {
      let parsedTags = []
      try {
        if (typeof prop.tags === 'string') {
          if (prop.tags.startsWith('[')) {
            parsedTags = JSON.parse(prop.tags)
          } else {
            parsedTags = prop.tags.split(',').map((t: string) => t.trim()).filter(t => t)
          }
        } else {
          parsedTags = prop.tags || []
        }
      } catch (e) {
        console.warn('Failed to parse tags:', e)
        parsedTags = []
      }
      
      return {
        ...prop,
        tags: parsedTags
      }
    })
    
    return c.json(properties)
  } catch (error) {
    console.error('Error fetching deleted properties:', error)
    return c.json({ error: 'Failed to fetch deleted properties' }, 500)
  }
})

// Restore deleted property (Admin)
app.post('/api/properties/:id/restore', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    
    // 복원: deleted_at을 NULL로 설정 (삭제된 매물만 복원 가능)
    const result = await DB.prepare(`UPDATE properties SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`).bind(id).run()
    
    // 영향받은 row 수 확인
    if (result.meta.changes === 0) {
      return c.json({
        success: false,
        message: 'Property not found or not deleted'
      }, 404)
    }
    
    return c.json({
      success: true,
      message: 'Property restored successfully'
    })
  } catch (error) {
    console.error('Error restoring property:', error)
    return c.json({ error: 'Failed to restore property' }, 500)
  }
})

// Create property (Admin)
app.post('/api/properties/create', async (c) => {
  try {
    const { DB } = c.env
    const data = await c.req.json()
    
    // Auto-calculate deadline from extended_data if not provided or if extended_data exists
    let finalDeadline = data.deadline || ''
    
    try {
      const extData = typeof data.extended_data === 'string' 
        ? JSON.parse(data.extended_data) 
        : data.extended_data;
      
      if (extData && extData.steps && Array.isArray(extData.steps) && extData.steps.length > 0) {
        // 마지막 step의 끝 날짜를 deadline으로 사용
        const lastStep = extData.steps[extData.steps.length - 1];
        
        if (lastStep && lastStep.date) {
          const dateParts = lastStep.date.split('~');
          
          if (dateParts.length === 2) {
            // 범위가 있으면 끝 날짜 사용
            finalDeadline = dateParts[1].trim();
          } else {
            // 범위가 없으면 해당 날짜 사용
            finalDeadline = dateParts[0].trim();
          }
        }
        
        console.log('📅 Auto-calculated deadline:', {
          stepsCount: extData.steps.length,
          lastStep: lastStep,
          finalDeadline: finalDeadline
        });
      }
    } catch (e) {
      console.warn('Failed to auto-calculate deadline:', e);
      // 실패하면 원래 deadline 사용
    }
    
    const result = await DB.prepare(`
      INSERT INTO properties (
        title, type, location, full_address, deadline, announcement_date,
        move_in_date, households, area_type, price, price_label, constructor, tags,
        description, extended_data, status, sale_price_min, sale_price_max, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))
    `).bind(
      data.title,
      data.type,
      data.location || '',
      data.full_address || '',
      finalDeadline,
      data.announcement_date || '',
      data.move_in_date || '',
      data.households || '',
      data.area_type || '',
      data.price || '',
      data.price_label || '분양가격',
      data.constructor || '',
      data.tags || '[]',
      data.description || '',
      data.extended_data || '{}',
      data.sale_price_min || 0,
      data.sale_price_max || 0
    ).run()
    
    return c.json({
      success: true,
      message: 'Property created successfully',
      id: result.meta.last_row_id,
      deadline: finalDeadline
    })
  } catch (error) {
    console.error('Error creating property:', error)
    return c.json({ error: 'Failed to create property' }, 500)
  }
})

// Contact inquiry API (광고 문의 - DB 저장)
app.post('/api/contact/inquiry', async (c) => {
  try {
    const { DB } = c.env
    const body = await c.req.json()
    const { name, contact, message } = body
    
    // DB에 저장
    const result = await DB.prepare(`
      INSERT INTO ad_inquiries (name, contact, message, status)
      VALUES (?, ?, ?, 'pending')
    `).bind(name, contact, message).run()
    
    console.log('📧 Ad Inquiry Saved to DB:', {
      id: result.meta.last_row_id,
      name,
      contact
    })
    
    return c.json({
      success: true,
      message: '문의가 성공적으로 접수되었습니다.',
      id: result.meta.last_row_id
    })
  } catch (error) {
    console.error('Contact inquiry error:', error)
    return c.json({
      success: false,
      error: '문의 접수 중 오류가 발생했습니다.'
    }, 500)
  }
})

// Get ad inquiries (Admin)
app.get('/api/ad-inquiries', async (c) => {
  try {
    const { DB } = c.env
    const status = c.req.query('status') || 'all'
    
    let query = 'SELECT * FROM ad_inquiries'
    let params: any[] = []
    
    if (status !== 'all') {
      query += ' WHERE status = ?'
      params.push(status)
    }
    
    query += ' ORDER BY created_at DESC'
    
    let stmt = DB.prepare(query)
    if (params.length > 0) {
      stmt = stmt.bind(...params)
    }
    
    const result = await stmt.all()
    return c.json(result.results)
  } catch (error) {
    console.error('Error fetching ad inquiries:', error)
    return c.json({ error: 'Failed to fetch ad inquiries' }, 500)
  }
})

// Update ad inquiry status (Admin)
app.post('/api/ad-inquiries/:id/status', async (c) => {
  try {
    const { DB } = c.env
    const id = c.req.param('id')
    const { status, admin_note } = await c.req.json()
    
    await DB.prepare(`
      UPDATE ad_inquiries 
      SET status = ?,
          admin_note = ?,
          replied_at = CASE WHEN ? = 'replied' THEN datetime('now') ELSE replied_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(status, admin_note || null, status, id).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error updating ad inquiry:', error)
    return c.json({ error: 'Failed to update ad inquiry' }, 500)
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

// Admin login API
app.post('/api/admin/login', async (c) => {
  try {
    const { password } = await c.req.json()
    const ADMIN_PASSWORD = c.env.ADMIN_PASSWORD || 'admin1234'
    
    if (password === ADMIN_PASSWORD) {
      return c.json({ success: true, token: 'admin-session-token' })
    } else {
      return c.json({ success: false, message: 'Invalid password' }, 401)
    }
  } catch (error) {
    return c.json({ error: 'Login failed' }, 500)
  }
})

// PDF parsing with Gemini → Claude fallback
app.post('/api/admin/parse-pdf', async (c) => {
  try {
    const { pdfBase64, filename } = await c.req.json()
    const GEMINI_API_KEY = c.env.GEMINI_API_KEY
    const CLAUDE_API_KEY = c.env.CLAUDE_API_KEY
    
    console.log('🏠 PDF 파싱 시작:', filename)
    
    // 공통 프롬프트 (숫자 포맷: n억n,nnn만원)
    const promptText = `Analyze this real estate sales announcement PDF and extract information in STRICT JSON format.

CRITICAL: Your response must be ONLY valid JSON. No explanations, no markdown, no code blocks. Just pure JSON.

NUMBER FORMAT RULES (매우 중요):
- 모든 가격/금액은 반드시 "n억n,nnn만원" 형식으로 표기
- 예시: "3억2,500만원", "1억5,000만원", "8,500만원" (1억 미만)
- 억 단위가 없으면: "5,000만원", "800만원"
- 천 단위 구분 쉼표는 만원 단위에만 사용
- 예: "보증금 1억2,000만원 / 월 50만원"

Required JSON structure (based on best practice format):
{
  "projectName": "project name from PDF",
  "saleType": "rental OR general OR unsold",
  "supplyType": "supply type (e.g., 행복주택, 국민임대, 신혼희망타운)",
  "region": "region name",
  "fullAddress": "full address",
  "constructor": "construction company",
  "mainImage": "",
  "hashtags": "comma,separated,tags",
  "targetAudienceLines": [
    "First target audience description (e.g., 해당 지역 거주 또는 근무하는 청년·신혼부부)",
    "Second benefit or requirement (e.g., 소득 100% 이하 무주택 세대원)",
    "Third key point (e.g., 저렴한 임대료로 주거비 부담 완화)"
  ],
  "steps": [
    {"date":"YYYY-MM-DD","title":"입주자모집공고일","details":"LH 청약센터 공고"},
    {"date":"YYYY-MM-DD","title":"청약접수 시작일","details":"인터넷·모바일·현장"},
    {"date":"YYYY-MM-DD","title":"당첨자 발표일","details":"청약홈 및 개별 통보"},
    {"date":"YYYY-MM-DD","title":"계약체결일","details":"견본주택 방문 계약"}
  ],
  "supplyInfo": [
    {"type":"26㎡","area":"26㎡","households":"60세대","price":"보증금 1,527만원 / 월 8만원"},
    {"type":"51㎡","area":"51㎡","households":"60세대","price":"보증금 4,000만원 / 월 21만원"}
  ],
  "details": {
    "targetTypes": "청년(만19~39세), 신혼부부(혼인7년이내), 고령자(만65세이상)",
    "incomeLimit": "도시근로자 월평균소득 100% 이하 (청년 120%, 신혼부부 120%)",
    "assetLimit": "총자산 2억 9,200만원 이하, 자동차 3,557만원 이하",
    "homelessPeriod": "무주택 세대구성원",
    "savingsAccount": "청약통장 불필요 OR 필요",
    "selectionMethod": "소득순위제 (소득 낮은 순) OR 추첨제",
    "scoringCriteria": "소득기준, 해당지역 거주·근무기간, 부양가족수, 청약통장 가입기간",
    "notices": "• 임대차계약 2년 단위\\n• 최장 거주기간 6년\\n• 임대료 인상률 5% 이내",
    "applicationMethod": "LH 청약센터 온라인 신청 (PC·모바일)",
    "applicationUrl": "https://apply.lh.or.kr",
    "requiredDocs": "신분증, 주민등록등본, 가족관계증명서, 소득증빙서류, 자산증빙서류",
    "contactDept": "담당 부서명",
    "contactPhone": "전화번호",
    "contactEmail": "이메일 (없으면 빈 문자열)",
    "features": "단지 특징 (예: 행복주택 120세대, 26㎡·51㎡ 구성)",
    "surroundings": "주변환경 (예: 산업단지 도보 5분, 편의시설 인근)",
    "transportation": "교통여건 (예: 시내버스 이용 편리, 산단 출퇴근 최적)",
    "education": "교육시설 (예: OO초등학교, OO중학교 인근)"
  }
}

Rules:
- If information not found, use empty string ""
- Dates in steps must be YYYY-MM-DD format
- saleType must be exactly "rental", "general", or "unsold"
- targetAudienceLines must have 3 items (key selling points for main card)
- Response must be valid JSON only
- Extract ALL schedule dates into steps array
- Use newline \\n for multi-line text in notices
- 모든 가격은 "n억n,nnn만원" 형식 필수`

    let parsedData = null
    let usedModel = 'none'
    let geminiError = null

    // ============================================
    // 1차 시도: Gemini API
    // ============================================
    if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here') {
      console.log('📊 1차 파싱: Gemini API 시도...')
      
      try {
        const maxRetries = 3
        let response
        let lastError
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const retryDelay = attempt > 1 ? 1000 * attempt : 0
            
            if (attempt > 1) {
              console.log(`  ↻ Gemini 재시도 ${attempt}/${maxRetries} (${retryDelay/1000}초 대기)`)
              await new Promise(resolve => setTimeout(resolve, retryDelay))
            }
            
            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: promptText },
                    { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } }
                  ]
                }],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 8192,
                  responseMimeType: "application/json"
                }
              })
            })
            
            // 429 (할당량 초과)는 재시도 불필요 - 바로 Claude로 fallback
            if (response.status === 429) {
              console.log(`  ⚠️ 429 할당량 초과 - Claude로 즉시 전환`)
              geminiError = 'Quota exceeded (429)'
              break
            }
            
            // 503 (서버 과부하)만 재시도
            if (response.status === 503 && attempt < maxRetries) {
              console.log(`  ⚠️ 503 에러, 재시도 예정...`)
              continue
            }
            
            break
            
          } catch (error) {
            lastError = error
            if (attempt < maxRetries) {
              console.log(`  ⚠️ 네트워크 에러, 재시도 예정...`)
            }
          }
        }

        if (response && response.ok) {
          const result = await response.json()
          
          if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0]
            
            if (candidate.finishReason !== 'MAX_TOKENS') {
              const content = candidate.content.parts[0].text
              
              let jsonText = content
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1')
                .trim()
              
              parsedData = JSON.parse(jsonText)
              usedModel = 'gemini'
              console.log('✅ Gemini 파싱 성공!')
            } else {
              geminiError = 'MAX_TOKENS 초과'
            }
          } else {
            geminiError = '응답 생성 실패'
          }
        } else if (response) {
          // response가 있지만 ok가 아닌 경우
          const errorText = await response.text()
          geminiError = `API 오류 (${response.status}): ${errorText.substring(0, 200)}`
          console.log(`  ⚠️ Gemini 오류 상세:`, errorText.substring(0, 300))
        } else {
          // response가 없는 경우 (네트워크 에러)
          geminiError = `네트워크 에러: ${lastError?.message || 'Unknown'}`
        }
        
      } catch (e) {
        geminiError = `예외 발생: ${e.message}`
        console.error('❌ Gemini 파싱 실패:', e)
      }
    } else {
      console.log('⚠️ Gemini API 키 없음, Claude로 바로 시도')
    }

    // ============================================
    // 2차 시도: Claude API (Gemini 실패시)
    // ============================================
    if (!parsedData) {
      if (geminiError) {
        console.log(`⚠️ Gemini 실패 (${geminiError}), Claude 폴백 시작...`)
      }
      
      if (!CLAUDE_API_KEY || CLAUDE_API_KEY === 'your_claude_api_key_here') {
        return c.json({ 
          success: false, 
          error: `Gemini 실패: ${geminiError || '알 수 없음'}. Claude API 키도 설정되지 않았습니다. .dev.vars에 CLAUDE_API_KEY를 추가해주세요.` 
        }, 500)
      }
      
      console.log('🤖 2차 파싱: Claude API 시도...')
      
      try {
        // Claude API는 PDF를 직접 지원하지만 beta feature입니다
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'pdfs-2024-09-25'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 8192,
            temperature: 0.1,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: pdfBase64
                  },
                  cache_control: { type: 'ephemeral' }
                },
                {
                  type: 'text',
                  text: promptText
                }
              ]
            }]
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Claude API 오류 (${response.status}): ${errorText}`)
        }

        const result = await response.json()
        
        if (result.content && result.content.length > 0) {
          const content = result.content[0].text
          
          let jsonText = content
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1')
            .trim()
          
          parsedData = JSON.parse(jsonText)
          usedModel = 'claude'
          console.log('✅ Claude 파싱 성공!')
        } else {
          throw new Error('Claude 응답에 컨텐츠가 없습니다')
        }
        
      } catch (e) {
        console.error('❌ Claude 파싱도 실패:', e)
        return c.json({ 
          success: false, 
          error: `모든 AI 파싱 실패. Gemini: ${geminiError || '시도 안함'}, Claude: ${e.message}` 
        }, 500)
      }
    }

    // ============================================
    // 최종 성공
    // ============================================
    return c.json({
      success: true,
      data: parsedData,
      model: usedModel,
      message: usedModel === 'gemini' ? 'Gemini로 파싱 완료' : 'Claude로 파싱 완료 (Gemini 실패 후 fallback)'
    })
    
  } catch (error) {
    console.error('❌ PDF 파싱 전체 오류:', error)
    return c.json({ 
      success: false, 
      error: error.message || 'PDF 파싱 중 오류가 발생했습니다.' 
    }, 500)
  }
})

// Image upload API (R2)
app.post('/api/admin/upload-image', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('image') as File
    
    if (!file) {
      return c.json({ success: false, error: '이미지 파일이 없습니다.' }, 400)
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return c.json({ 
        success: false, 
        error: '지원하지 않는 파일 형식입니다. (JPG, PNG, WEBP, GIF만 가능)' 
      }, 400)
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return c.json({ 
        success: false, 
        error: '파일 크기는 5MB를 초과할 수 없습니다.' 
      }, 400)
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(7)
    const extension = file.name.split('.').pop()
    const filename = `properties/${timestamp}-${randomStr}.${extension}`

    // Upload to R2
    const { IMAGES } = c.env
    const arrayBuffer = await file.arrayBuffer()
    
    await IMAGES.put(filename, arrayBuffer, {
      httpMetadata: {
        contentType: file.type
      }
    })

    // Generate public URL using Workers proxy endpoint
    // Images will be served through /api/images/:filename endpoint
    const imageUrl = `/api/images/${filename}`
    
    return c.json({
      success: true,
      url: imageUrl,  // Changed from imageUrl to url to match frontend
      filename: filename,
      message: '이미지 업로드 완료'
    })
  } catch (error) {
    console.error('이미지 업로드 오류:', error)
    return c.json({ 
      success: false, 
      error: error.message || '이미지 업로드 중 오류가 발생했습니다.' 
    }, 500)
  }
})

// Serve images from R2
app.get('/api/images/:path{.+}', async (c) => {
  try {
    const path = c.req.param('path')
    const { IMAGES } = c.env
    
    const object = await IMAGES.get(path)
    
    if (!object) {
      return c.notFound()
    }
    
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'public, max-age=31536000') // Cache for 1 year
    
    return new Response(object.body, {
      headers
    })
  } catch (error) {
    console.error('이미지 조회 오류:', error)
    return c.notFound()
  }
})

// Delete image from R2
app.delete('/api/admin/delete-image/:filename', async (c) => {
  try {
    const filename = c.req.param('filename')
    const { IMAGES } = c.env
    
    await IMAGES.delete(filename)
    
    return c.json({
      success: true,
      message: '이미지 삭제 완료'
    })
  } catch (error) {
    console.error('이미지 삭제 오류:', error)
    return c.json({ 
      success: false, 
      error: error.message || '이미지 삭제 중 오류가 발생했습니다.' 
    }, 500)
  }
})

// Real Estate Transaction Price API (D1 데이터베이스에서 조회)
app.post('/api/admin/fetch-trade-price', async (c) => {
  try {
    const { address, exclusiveArea, apartmentName } = await c.req.json()
    const DB = c.env.DB
    
    // 주소에서 시/군/구 정보 추출
    const addressParts = address.split(' ')
    let sigunguCode = ''
    let sigunguName = ''
    
    // 전국 지역 코드 매핑
    const regionCodes = {
      // 서울
      '서울특별시 강남구': '11680', '서울 강남구': '11680',
      '서울특별시 서초구': '11650', '서울 서초구': '11650',
      '서울특별시 송파구': '11710', '서울 송파구': '11710',
      '서울특별시 강동구': '11740', '서울 강동구': '11740',
      '서울특별시 용산구': '11170', '서울 용산구': '11170',
      '서울특별시 성동구': '11200', '서울 성동구': '11200',
      '서울특별시 광진구': '11215', '서울 광진구': '11215',
      '서울특별시 마포구': '11440', '서울 마포구': '11440',
      '서울특별시 영등포구': '11560', '서울 영등포구': '11560',
      '서울특별시 강서구': '11500', '서울 강서구': '11500',
      '서울특별시 양천구': '11470', '서울 양천구': '11470',
      '서울특별시 구로구': '11530', '서울 구로구': '11530',
      '서울특별시 동작구': '11590', '서울 동작구': '11590',
      '서울특별시 관악구': '11620', '서울 관악구': '11620',
      '서울특별시 종로구': '11110', '서울 종로구': '11110',
      '서울특별시 중구': '11140', '서울 중구': '11140',
      
      // 부산
      '부산광역시 해운대구': '26350', '부산 해운대구': '26350',
      '부산광역시 수영구': '26320', '부산 수영구': '26320',
      '부산광역시 남구': '26290', '부산 남구': '26290',
      '부산광역시 동래구': '26260', '부산 동래구': '26260',
      '부산광역시 연제구': '26470', '부산 연제구': '26470',
      '부산광역시 부산진구': '26230', '부산 부산진구': '26230',
      '부산광역시 서구': '26170', '부산 서구': '26170',
      '부산광역시 사상구': '26530', '부산 사상구': '26530',
      
      // 대구
      '대구광역시 수성구': '27200', '대구 수성구': '27200',
      '대구광역시 달서구': '27290', '대구 달서구': '27290',
      '대구광역시 중구': '27110', '대구 중구': '27110',
      '대구광역시 동구': '27140', '대구 동구': '27140',
      
      // 인천
      '인천광역시 남동구': '28200', '인천 남동구': '28200',
      '인천광역시 연수구': '28185', '인천 연수구': '28185',
      '인천광역시 부평구': '28237', '인천 부평구': '28237',
      '인천광역시 서구': '28260', '인천 서구': '28260',
      
      // 광주
      '광주광역시 광산구': '29200', '광주 광산구': '29200',
      '광주광역시 남구': '29155', '광주 남구': '29155',
      '광주광역시 북구': '29170', '광주 북구': '29170',
      '광주광역시': '29200', '광주': '29200',
      
      // 대전
      '대전광역시 유성구': '30200', '대전 유성구': '30200',
      '대전광역시 서구': '30170', '대전 서구': '30170',
      '대전광역시 중구': '30110', '대전 중구': '30110',
      
      // 울산
      '울산광역시 남구': '31140', '울산 남구': '31140',
      '울산광역시 동구': '31170', '울산 동구': '31170',
      '울산광역시 북구': '31200', '울산 북구': '31200',
      
      // 세종
      '세종특별자치시': '36110', '세종': '36110',
      
      // 경기
      '경기도 수원시': '41110', '경기 수원': '41110',
      '경기도 성남시': '41130', '경기 성남': '41130',
      '경기도 고양시': '41280', '경기 고양': '41280',
      '경기도 용인시': '41460', '경기 용인': '41460',
      '경기도 부천시': '41190', '경기 부천': '41190',
      '경기도 안산시': '41270', '경기 안산': '41270',
      '경기도 안양시': '41170', '경기 안양': '41170',
      '경기도 남양주시': '41360', '경기 남양주': '41360',
      '경기도 화성시': '41590', '경기 화성': '41590',
      '경기도 평택시': '41220', '경기 평택': '41220',
      '경기도 의정부시': '41150', '경기 의정부': '41150',
      '경기도 시흥시': '41390', '경기 시흥': '41390',
      '경기도 파주시': '41480', '경기 파주': '41480',
      '경기도 김포시': '41570', '경기 김포': '41570',
      '경기도 광명시': '41210', '경기 광명': '41210',
      '경기도 광주시': '41610', '경기 광주': '41610',
      '경기도 군포시': '41410', '경기 군포': '41410',
      '경기도 하남시': '41450', '경기 하남': '41450',
      
      // 강원
      '강원특별자치도 춘천시': '51110', '강원 춘천': '51110',
      '강원특별자치도 원주시': '51130', '강원 원주': '51130',
      '강원특별자치도 강릉시': '51150', '강원 강릉': '51150',
      
      // 충북
      '충청북도 청주시': '43110', '충북 청주': '43110',
      '충청북도 충주시': '43130', '충북 충주': '43130',
      
      // 충남
      '충청남도 천안시': '44130', '충남 천안': '44130',
      '충청남도 아산시': '44200', '충남 아산': '44200',
      '충청남도 서산시': '44210', '충남 서산': '44210',
      
      // 전북
      '전북특별자치도 전주시': '45110', '전북 전주': '45110',
      '전북특별자치도 익산시': '45140', '전북 익산': '45140',
      '전북특별자치도 김제시': '45210', '전북 김제': '45210',
      
      // 전남
      '전라남도 목포시': '46110', '전남 목포': '46110',
      '전라남도 여수시': '46130', '전남 여수': '46130',
      '전라남도 순천시': '46150', '전남 순천': '46150',
      
      // 경북
      '경상북도 포항시': '47110', '경북 포항': '47110',
      '경상북도 경주시': '47130', '경북 경주': '47130',
      '경상북도 구미시': '47190', '경북 구미': '47190',
      
      // 경남
      '경상남도 창원시': '48120', '경남 창원': '48120',
      '경상남도 김해시': '48250', '경남 김해': '48250',
      '경상남도 양산시': '48330', '경남 양산': '48330',
      '경상남도 진주시': '48170', '경남 진주': '48170',
      
      // 제주
      '제주특별자치도 제주시': '50110', '제주 제주시': '50110',
      '제주특별자치도 서귀포시': '50130', '제주 서귀포시': '50130',
    }
    
    // 시/도 또는 시/도+시/군/구 조합으로 코드 찾기
    if (addressParts.length >= 2) {
      const sido = addressParts[0]
      const sigungu = addressParts[1]
      sigunguName = `${sido} ${sigungu}`
      
      // 1. 시/도 + 시/군/구 조합으로 찾기
      sigunguCode = regionCodes[sigunguName] || ''
      
      // 2. 찾지 못하면 시/도만으로 찾기 (세종시, 제주시 등)
      if (!sigunguCode) {
        sigunguCode = regionCodes[sido] || ''
        sigunguName = sido
      }
    } else if (addressParts.length === 1) {
      // 주소가 하나만 있는 경우 (예: "세종특별자치시")
      sigunguName = addressParts[0]
      sigunguCode = regionCodes[sigunguName] || ''
    }
    
    if (!sigunguCode) {
      return c.json({ 
        success: false, 
        error: `지역 코드를 찾을 수 없습니다: ${sigunguName}. 전국 주요 시/군/구를 지원합니다.` 
      }, 400)
    }

    console.log('D1 실거래가 조회:', sigunguCode, exclusiveArea, apartmentName)

    // D1 데이터베이스에서 실거래가 조회
    let result
    
    // 아파트명이 있으면 해당 아파트만 필터링
    if (apartmentName) {
      result = await DB.prepare(`
        SELECT 
          apt_name as apartmentName,
          area as exclusiveArea,
          deal_amount as dealAmount,
          deal_year as dealYear,
          deal_month as dealMonth,
          deal_day as dealDay,
          floor,
          dong,
          jibun
        FROM trade_prices
        WHERE sigungu_code = ?
          AND apt_name = ?
        ORDER BY deal_year DESC, deal_month DESC, deal_day DESC
        LIMIT 100
      `).bind(sigunguCode, apartmentName).all()
    } else if (exclusiveArea && !isNaN(exclusiveArea)) {
      // 전용면적이 있으면 ±5㎡ 범위로 조회
      const areaMin = exclusiveArea - 5
      const areaMax = exclusiveArea + 5
      
      result = await DB.prepare(`
        SELECT 
          apt_name as apartmentName,
          area as exclusiveArea,
          deal_amount as dealAmount,
          deal_year as dealYear,
          deal_month as dealMonth,
          deal_day as dealDay,
          floor,
          dong,
          jibun
        FROM trade_prices
        WHERE sigungu_code = ?
          AND area >= ? AND area <= ?
        ORDER BY deal_year DESC, deal_month DESC, deal_day DESC
        LIMIT 100
      `).bind(sigunguCode, areaMin, areaMax).all()
    } else {
      // 전용면적이 없으면 해당 지역 전체 조회
      result = await DB.prepare(`
        SELECT 
          apt_name as apartmentName,
          area as exclusiveArea,
          deal_amount as dealAmount,
          deal_year as dealYear,
          deal_month as dealMonth,
          deal_day as dealDay,
          floor,
          dong,
          jibun
        FROM trade_prices
        WHERE sigungu_code = ?
        ORDER BY deal_year DESC, deal_month DESC, deal_day DESC
        LIMIT 100
      `).bind(sigunguCode).all()
    }

    const items = result.results || []

    console.log(`D1에서 ${items.length}개의 실거래 데이터 조회 완료`)

    if (items.length === 0) {
      return c.json({
        success: true,
        data: {
          found: false,
          message: '해당 지역의 실거래가 정보가 아직 수집되지 않았습니다. GitHub Actions가 매일 자동으로 데이터를 업데이트합니다.',
          totalResults: 0
        }
      })
    }

    // 가장 최근 거래
    const latestTrade = items[0]

    // 거래금액을 억 단위로 변환 (DB에 원 단위로 저장됨)
    const dealAmountInEok = latestTrade.dealAmount / 100000000

    return c.json({
      success: true,
      data: {
        found: true,
        apartmentName: latestTrade.apartmentName,
        exclusiveArea: latestTrade.exclusiveArea,
        recentTradePrice: dealAmountInEok,
        recentTradeDate: `${latestTrade.dealYear}.${String(latestTrade.dealMonth).padStart(2, '0')}`,
        dealYear: latestTrade.dealYear,
        dealMonth: latestTrade.dealMonth,
        dealDay: latestTrade.dealDay,
        location: latestTrade.dong && latestTrade.jibun ? `${latestTrade.dong} ${latestTrade.jibun}` : '-',
        totalResults: items.length,
        dataSource: 'D1 Database (GitHub Actions auto-sync)',
        trades: items.slice(0, 10).map(item => ({
          apartmentName: item.apartmentName,
          exclusiveArea: item.exclusiveArea,
          dealAmount: item.dealAmount / 100000000,
          dealYear: item.dealYear,
          dealMonth: item.dealMonth,
          dealDay: item.dealDay,
          floor: item.floor,
          dong: item.dong || '-',
          jibun: item.jibun || '-',
          location: item.dong && item.jibun ? `${item.dong} ${item.jibun}` : '-'
        }))
      }
    })
  } catch (error) {
    console.error('실거래가 조회 오류:', error)
    return c.json({ 
      success: false, 
      error: error.message || '실거래가 조회 중 오류가 발생했습니다.' 
    }, 500)
  }
})

// Admin - Search apartments by address
app.post('/api/admin/search-apartments', async (c) => {
  try {
    const { address } = await c.req.json()
    const DB = c.env.DB
    
    if (!address) {
      return c.json({ success: false, error: '주소를 입력해주세요.' }, 400)
    }

    // Extract sigungu code from address
    const regionCodes = {
      // 서울특별시 (16개 구)
      '서울특별시 강남구': '11680', '서울 강남구': '11680',
      '서울특별시 서초구': '11650', '서울 서초구': '11650',
      '서울특별시 송파구': '11710', '서울 송파구': '11710',
      '서울특별시 강동구': '11740', '서울 강동구': '11740',
      '서울특별시 영등포구': '11560', '서울 영등포구': '11560',
      '서울특별시 마포구': '11440', '서울 마포구': '11440',
      '서울특별시 용산구': '11170', '서울 용산구': '11170',
      '서울특별시 성동구': '11200', '서울 성동구': '11200',
      '서울특별시 광진구': '11215', '서울 광진구': '11215',
      '서울특별시 종로구': '11110', '서울 종로구': '11110',
      '서울특별시 중구': '11140', '서울 중구': '11140',
      '서울특별시 동대문구': '11230', '서울 동대문구': '11230',
      '서울특별시 성북구': '11290', '서울 성북구': '11290',
      '서울특별시 노원구': '11350', '서울 노원구': '11350',
      '서울특별시 강북구': '11305', '서울 강북구': '11305',
      '서울특별시 은평구': '11380', '서울 은평구': '11380',
      
      // 부산광역시 (8개 구/군)
      '부산광역시 해운대구': '26350', '부산 해운대구': '26350',
      '부산광역시 수영구': '26380', '부산 수영구': '26380',
      '부산광역시 동래구': '26260', '부산 동래구': '26260',
      '부산광역시 부산진구': '26230', '부산 부산진구': '26230',
      '부산광역시 남구': '26200', '부산 남구': '26200',
      '부산광역시 연제구': '26470', '부산 연제구': '26470',
      '부산광역시 기장군': '26710', '부산 기장군': '26710',
      '부산광역시 사상구': '26530', '부산 사상구': '26530',
      
      // 대구광역시 (4개 구)
      '대구광역시 수성구': '27200', '대구 수성구': '27200',
      '대구광역시 달서구': '27290', '대구 달서구': '27290',
      '대구광역시 북구': '27230', '대구 북구': '27230',
      '대구광역시 중구': '27140', '대구 중구': '27140',
      
      // 인천광역시 (5개 구/군)
      '인천광역시 연수구': '28185', '인천 연수구': '28185',
      '인천광역시 남동구': '28200', '인천 남동구': '28200',
      '인천광역시 부평구': '28237', '인천 부평구': '28237',
      '인천광역시 서구': '28260', '인천 서구': '28260',
      '인천광역시 계양구': '28245', '인천 계양구': '28245',
      
      // 광주광역시 (2개 구)
      '광주광역시 광산구': '29200', '광주 광산구': '29200',
      '광주광역시 서구': '29155', '광주 서구': '29155',
      
      // 대전광역시 (3개 구)
      '대전광역시 유성구': '30200', '대전 유성구': '30200',
      '대전광역시 서구': '30170', '대전 서구': '30170',
      '대전광역시 중구': '30110', '대전 중구': '30110',
      
      // 울산광역시 (2개 구)
      '울산광역시 남구': '31140', '울산 남구': '31140',
      '울산광역시 중구': '31110', '울산 중구': '31110',
      
      // 세종특별자치시
      '세종특별자치시': '36110', '세종시': '36110', '세종': '36110',
      
      // 경기도 (18개 시)
      '경기도 수원시': '41110', '수원시': '41110', '수원': '41110',
      '경기도 성남시': '41130', '성남시': '41130', '성남': '41130',
      '경기도 고양시': '41280', '고양시': '41280', '고양': '41280',
      '경기도 용인시': '41460', '용인시': '41460', '용인': '41460',
      '경기도 부천시': '41190', '부천시': '41190', '부천': '41190',
      '경기도 안산시': '41270', '안산시': '41270', '안산': '41270',
      '경기도 화성시': '41590', '화성시': '41590', '화성': '41590',
      '경기도 남양주시': '41360', '남양주시': '41360', '남양주': '41360',
      '경기도 평택시': '41220', '평택시': '41220', '평택': '41220',
      '경기도 의정부시': '41150', '의정부시': '41150', '의정부': '41150',
      '경기도 시흥시': '41390', '시흥시': '41390', '시흥': '41390',
      '경기도 파주시': '41480', '파주시': '41480', '파주': '41480',
      '경기도 김포시': '41570', '김포시': '41570', '김포': '41570',
      '경기도 광명시': '41210', '광명시': '41210', '광명': '41210',
      '경기도 광주시': '41610', '광주시': '41610', '광주': '41610',
      '경기도 안양시': '41170', '안양시': '41170', '안양': '41170',
      '경기도 하남시': '41450', '하남시': '41450', '하남': '41450',
      '경기도 오산시': '41370', '오산시': '41370', '오산': '41370',
      
      // 강원도 (3개 시)
      '강원특별자치도 춘천시': '42110', '강원도 춘천시': '42110', '춘천시': '42110', '춘천': '42110',
      '강원특별자치도 원주시': '42130', '강원도 원주시': '42130', '원주시': '42130', '원주': '42130',
      '강원특별자치도 강릉시': '42150', '강원도 강릉시': '42150', '강릉시': '42150', '강릉': '42150',
      
      // 충청북도 (2개 시)
      '충청북도 청주시': '43110', '청주시': '43110', '청주': '43110',
      '충청북도 충주시': '43130', '충주시': '43130', '충주': '43130',
      
      // 충청남도 (3개 시)
      '충청남도 천안시': '44130', '천안시': '44130', '천안': '44130',
      '충청남도 아산시': '44200', '아산시': '44200', '아산': '44200',
      '충청남도 당진시': '44270', '당진시': '44270', '당진': '44270',
      
      // 전라북도 (3개 시)
      '전북특별자치도 전주시': '45110', '전라북도 전주시': '45110', '전주시': '45110', '전주': '45110',
      '전북특별자치도 익산시': '45140', '전라북도 익산시': '45140', '익산시': '45140', '익산': '45140',
      '전북특별자치도 군산시': '45130', '전라북도 군산시': '45130', '군산시': '45130', '군산': '45130',
      
      // 전라남도 (3개 시)
      '전라남도 여수시': '46130', '여수시': '46130', '여수': '46130',
      '전라남도 순천시': '46150', '순천시': '46150', '순천': '46150',
      '전라남도 목포시': '46110', '목포시': '46110', '목포': '46110',
      
      // 경상북도 (3개 시)
      '경상북도 포항시': '47110', '포항시': '47110', '포항': '47110',
      '경상북도 구미시': '47190', '구미시': '47190', '구미': '47190',
      '경상북도 경산시': '47290', '경산시': '47290', '경산': '47290',
      
      // 경상남도 (4개 시)
      '경상남도 창원시': '48120', '창원시': '48120', '창원': '48120',
      '경상남도 김해시': '48250', '김해시': '48250', '김해': '48250',
      '경상남도 양산시': '48330', '양산시': '48330', '양산': '48330',
      '경상남도 진주시': '48170', '진주시': '48170', '진주': '48170',
      
      // 제주특별자치도 (2개 시)
      '제주특별자치도 제주시': '50110', '제주도 제주시': '50110', '제주시': '50110', '제주': '50110',
      '제주특별자치도 서귀포시': '50130', '제주도 서귀포시': '50130', '서귀포시': '50130', '서귀포': '50130',
    }

    let sigunguCode = null
    for (const [region, code] of Object.entries(regionCodes)) {
      if (address.includes(region)) {
        sigunguCode = code
        break
      }
    }

    if (!sigunguCode) {
      return c.json({ 
        success: false, 
        error: '지원하지 않는 지역입니다. 전국 83개 주요 시/구/군만 지원됩니다.' 
      }, 400)
    }

    // Query database for apartments in this area
    const result = await DB.prepare(`
      SELECT 
        apt_name,
        COUNT(*) as trade_count,
        MAX(deal_year) as recent_year,
        MAX(deal_month) as recent_month,
        deal_amount as recent_price,
        MAX(deal_year || '-' || printf('%02d', deal_month)) as sort_date
      FROM trade_prices
      WHERE sigungu_code = ?
      GROUP BY apt_name
      ORDER BY sort_date DESC
      LIMIT 50
    `).bind(sigunguCode).all()

    if (!result.success || result.results.length === 0) {
      return c.json({ 
        success: false, 
        error: '해당 지역에 등록된 아파트가 없습니다.' 
      })
    }

    // Format apartment list
    const apartments = result.results.map(apt => {
      // Get most recent price for this apartment and convert to 억 unit
      return {
        name: apt.apt_name,
        count: apt.trade_count,
        recentPrice: (apt.recent_price / 100000000).toFixed(2), // Convert to 억 and format
        recentDate: `${apt.recent_year}.${String(apt.recent_month).padStart(2, '0')}`
      }
    })

    return c.json({
      success: true,
      apartments: apartments,
      region: sigunguCode
    })
  } catch (error) {
    console.error('아파트 검색 오류:', error)
    return c.json({ 
      success: false, 
      error: error.message || '아파트 검색 중 오류가 발생했습니다.' 
    }, 500)
  }
})

// GitHub Actions - Trigger Trade Price Collection
app.post('/api/admin/trigger-trade-price-collection', async (c) => {
  try {
    const GITHUB_TOKEN = c.env.GITHUB_TOKEN
    const GITHUB_OWNER = c.env.GITHUB_OWNER || 'seunghun2'
    const GITHUB_REPO = c.env.GITHUB_REPO || 'webapp'
    
    if (!GITHUB_TOKEN) {
      return c.json({
        success: false,
        error: 'GitHub Token이 설정되지 않았습니다. .dev.vars 파일에 GITHUB_TOKEN을 추가해주세요.'
      }, 400)
    }
    
    // GitHub Actions workflow dispatch
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/fetch-trade-prices.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'webapp-admin-panel'
        },
        body: JSON.stringify({
          ref: 'main' // branch name
        })
      }
    )
    
    if (response.status === 204) {
      return c.json({
        success: true,
        message: '실거래가 수집이 시작되었습니다. GitHub Actions에서 진행 상황을 확인하세요.',
        githubUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`
      })
    } else {
      const errorText = await response.text()
      return c.json({
        success: false,
        error: 'GitHub Actions 트리거 실패',
        details: errorText
      }, response.status)
    }
  } catch (error) {
    console.error('GitHub Actions Trigger Error:', error)
    return c.json({
      success: false,
      error: error.message || 'GitHub Actions 트리거 중 오류가 발생했습니다.'
    }, 500)
  }
})

// Get Trade Price Stats
app.get('/api/admin/trade-price-stats', async (c) => {
  try {
    const { DB } = c.env
    
    // 총 거래 건수
    const totalResult = await DB.prepare(`
      SELECT COUNT(*) as total FROM trade_prices
    `).first()
    
    // 지역별 건수
    const regionResult = await DB.prepare(`
      SELECT sigungu_name, COUNT(*) as count 
      FROM trade_prices 
      GROUP BY sigungu_name
      ORDER BY count DESC
    `).all()
    
    // 최신 거래 일자
    const latestResult = await DB.prepare(`
      SELECT deal_year, deal_month, deal_day
      FROM trade_prices
      ORDER BY deal_year DESC, deal_month DESC, deal_day DESC
      LIMIT 1
    `).first()
    
    return c.json({
      success: true,
      stats: {
        total: totalResult?.total || 0,
        regions: regionResult?.results || [],
        latestDate: latestResult ? 
          `${latestResult.deal_year}-${String(latestResult.deal_month).padStart(2, '0')}-${String(latestResult.deal_day).padStart(2, '0')}` 
          : null
      }
    })
  } catch (error) {
    console.error('Trade Price Stats Error:', error)
    return c.json({
      success: false,
      error: error.message
    }, 500)
  }
})

// Admin login page
app.get('/admin/login', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>관리자 로그인 - 한채365</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-100 flex items-center justify-center min-h-screen">
        <div class="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
            <div class="text-center mb-8">
                <i class="fas fa-shield-alt text-5xl text-blue-600 mb-4"></i>
                <h1 class="text-2xl font-bold text-gray-900">관리자 로그인</h1>
                <p class="text-sm text-gray-500 mt-2">한채365 어드민 시스템</p>
            </div>
            
            <form id="loginForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">비밀번호</label>
                    <input 
                        type="password" 
                        id="password" 
                        required 
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="관리자 비밀번호를 입력하세요"
                        autofocus
                    >
                </div>
                
                <button 
                    type="submit" 
                    class="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                    <i class="fas fa-sign-in-alt mr-2"></i>
                    로그인
                </button>
                
                <div id="errorMsg" class="hidden text-red-600 text-sm text-center mt-2"></div>
            </form>
            
            <div class="mt-6 text-center">
                <a href="/" class="text-sm text-gray-500 hover:text-gray-700">
                    <i class="fas fa-arrow-left mr-1"></i>
                    메인으로 돌아가기
                </a>
            </div>
        </div>
        
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const password = document.getElementById('password').value;
                const errorMsg = document.getElementById('errorMsg');
                
                try {
                    const response = await axios.post('/api/admin/login', { password });
                    
                    if (response.data.success) {
                        // Save token to localStorage
                        localStorage.setItem('adminToken', response.data.token);
                        // Redirect to admin page
                        window.location.href = '/admin';
                    } else {
                        errorMsg.textContent = '비밀번호가 올바르지 않습니다.';
                        errorMsg.classList.remove('hidden');
                    }
                } catch (error) {
                    errorMsg.textContent = '로그인에 실패했습니다. 다시 시도해주세요.';
                    errorMsg.classList.remove('hidden');
                }
            });
        </script>
    </body>
    </html>
  `)
})

// Admin page (protected)
app.get('/admin', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Admin - 한채365</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
          
          * {
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          }
          
          .tab-active { border-bottom: 3px solid #007AFF; color: #007AFF; }
          .modal { display: none; }
          .modal.active { display: flex; }
          
          /* Sidebar Styles */
          .sidebar {
            transition: width 0.3s ease;
          }
          
          .sidebar-collapsed {
            width: 80px;
          }
          
          .sidebar-expanded {
            width: 260px;
          }
          
          .sidebar-link {
            transition: all 0.2s ease;
          }
          
          .sidebar-link:hover {
            background-color: #EBF4FF;
            transform: translateX(4px);
          }
          
          .sidebar-link.active {
            background-color: #3182F6;
            color: white;
          }
          
          .sidebar-link.active:hover {
            background-color: #2563EB;
          }
          
          /* Dashboard Card Animation */
          .stat-card {
            transition: all 0.3s ease;
          }
          
          .stat-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
          }
          
          /* Table Row Hover */
          tbody tr {
            transition: background-color 0.2s ease;
          }
          
          tbody tr:hover {
            background-color: #F9FAFB;
          }
          
          /* Smooth Scroll */
          html {
            scroll-behavior: smooth;
          }
          
          /* Content Area */
          .main-content {
            transition: margin-left 0.3s ease;
          }
          
          /* Auto-resize Textarea */
          textarea.auto-resize {
            overflow: hidden;
            resize: vertical;
            min-height: 72px; /* 3 rows minimum */
            transition: height 0.1s ease;
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <!-- Sidebar -->
        <aside id="sidebar" class="sidebar sidebar-expanded fixed left-0 top-0 bottom-0 bg-white shadow-lg z-40 hidden lg:block">
            <div class="h-full flex flex-col">
                <!-- Logo -->
                <div class="p-6 border-b">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-home text-white text-lg"></i>
                        </div>
                        <div class="sidebar-text">
                            <h2 class="font-bold text-gray-900 text-lg">한채365</h2>
                            <p class="text-xs text-gray-500">Admin</p>
                        </div>
                    </div>
                </div>
                
                <!-- Navigation -->
                <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
                    <a href="javascript:void(0)" onclick="showSection('dashboard')" class="sidebar-link active flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium" data-section="dashboard">
                        <i class="fas fa-chart-line text-lg w-5"></i>
                        <span class="sidebar-text">대시보드</span>
                    </a>
                    <a href="javascript:void(0)" onclick="showSection('properties')" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700" data-section="properties">
                        <i class="fas fa-building text-lg w-5"></i>
                        <span class="sidebar-text">매물 관리</span>
                    </a>
                    <a href="javascript:void(0)" onclick="showSection('deleted')" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700" data-section="deleted">
                        <i class="fas fa-trash-restore text-lg w-5"></i>
                        <span class="sidebar-text">삭제된 매물</span>
                    </a>
                    <a href="javascript:void(0)" onclick="showSection('statistics')" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700" data-section="statistics">
                        <i class="fas fa-chart-bar text-lg w-5"></i>
                        <span class="sidebar-text">통계</span>
                    </a>
                    <a href="javascript:void(0)" onclick="showSection('settings')" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700" data-section="settings">
                        <i class="fas fa-cog text-lg w-5"></i>
                        <span class="sidebar-text">설정</span>
                    </a>
                </nav>
                
                <!-- Bottom Actions -->
                <div class="p-4 border-t space-y-2">
                    <button onclick="window.location.href='/'" class="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">
                        <i class="fas fa-arrow-left text-lg w-5"></i>
                        <span class="sidebar-text">메인으로</span>
                    </button>
                    <button onclick="logout()" class="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50">
                        <i class="fas fa-sign-out-alt text-lg w-5"></i>
                        <span class="sidebar-text">로그아웃</span>
                    </button>
                </div>
            </div>
        </aside>

        <!-- Main Content Area -->
        <div id="mainContent" class="main-content lg:ml-[260px]">
            <!-- Header -->
            <header class="bg-white shadow-sm sticky top-0 z-30">
                <div class="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <button onclick="toggleSidebar()" class="hidden lg:block text-gray-600 hover:text-gray-900">
                            <i class="fas fa-bars text-xl"></i>
                        </button>
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900" id="pageTitle">대시보드</h1>
                            <p class="text-sm text-gray-500" id="pageSubtitle">전체 현황을 확인하세요</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <button class="hidden sm:block px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                            <i class="fas fa-bell mr-2"></i>알림
                        </button>
                        <div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                            A
                        </div>
                    </div>
                </div>
            </header>

            <!-- Dashboard Section -->
            <div id="dashboardSection" class="section-content p-4 sm:p-6 lg:p-8">
                <!-- Stats Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div class="stat-card bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                                <i class="fas fa-building text-blue-600 text-xl"></i>
                            </div>
                            <span class="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">+12%</span>
                        </div>
                        <h3 class="text-gray-500 text-sm font-medium mb-1">전체 매물</h3>
                        <p class="text-3xl font-bold text-gray-900" id="totalProperties">0</p>
                        <p class="text-xs text-gray-400 mt-2">지난달 대비</p>
                    </div>
                    
                    <div class="stat-card bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                                <i class="fas fa-home text-green-600 text-xl"></i>
                            </div>
                            <span class="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">활성</span>
                        </div>
                        <h3 class="text-gray-500 text-sm font-medium mb-1">임대분양</h3>
                        <p class="text-3xl font-bold text-gray-900" id="rentalProperties">0</p>
                        <p class="text-xs text-gray-400 mt-2">현재 모집중</p>
                    </div>
                    
                    <div class="stat-card bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                                <i class="fas fa-fire text-orange-600 text-xl"></i>
                            </div>
                            <span class="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded">인기</span>
                        </div>
                        <h3 class="text-gray-500 text-sm font-medium mb-1">줍줍분양</h3>
                        <p class="text-3xl font-bold text-gray-900" id="unsoldProperties">0</p>
                        <p class="text-xs text-gray-400 mt-2">미분양 매물</p>
                    </div>
                    
                    <div class="stat-card bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                        <div class="flex items-center justify-between mb-4">
                            <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                                <i class="fas fa-clock text-purple-600 text-xl"></i>
                            </div>
                            <span class="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">긴급</span>
                        </div>
                        <h3 class="text-gray-500 text-sm font-medium mb-1">마감 임박</h3>
                        <p class="text-3xl font-bold text-gray-900" id="urgentProperties">0</p>
                        <p class="text-xs text-gray-400 mt-2">7일 이내 마감</p>
                    </div>
                </div>
                
                <!-- Quick Actions -->
                <div class="bg-white rounded-xl shadow-sm p-6 mb-8 border border-gray-100">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">빠른 작업</h3>
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <button onclick="openAddModal()" class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-all">
                            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <i class="fas fa-plus text-blue-600 text-xl"></i>
                            </div>
                            <span class="text-sm font-medium text-gray-700">매물 등록</span>
                        </button>
                        <button onclick="showSection('properties')" class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 hover:border-green-500 hover:bg-green-50 transition-all">
                            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <i class="fas fa-list text-green-600 text-xl"></i>
                            </div>
                            <span class="text-sm font-medium text-gray-700">매물 목록</span>
                        </button>
                        <button onclick="triggerTradePriceCollection()" class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 hover:border-red-500 hover:bg-red-50 transition-all">
                            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                                <i class="fas fa-sync-alt text-red-600 text-xl"></i>
                            </div>
                            <span class="text-sm font-medium text-gray-700">실시간 수집</span>
                        </button>
                        <button onclick="showSection('statistics')" class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 hover:border-purple-500 hover:bg-purple-50 transition-all">
                            <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                                <i class="fas fa-chart-pie text-purple-600 text-xl"></i>
                            </div>
                            <span class="text-sm font-medium text-gray-700">통계 보기</span>
                        </button>
                        <button onclick="exportData()" class="flex flex-col items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 hover:border-orange-500 hover:bg-orange-50 transition-all">
                            <div class="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                                <i class="fas fa-download text-orange-600 text-xl"></i>
                            </div>
                            <span class="text-sm font-medium text-gray-700">데이터 내보내기</span>
                        </button>
                    </div>
                </div>
                
                <!-- Trade Price Stats Card -->
                <div class="bg-white rounded-xl shadow-sm p-6 mb-8 border border-gray-100">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-bold text-gray-900">실거래가 데이터 현황</h3>
                        <button onclick="loadTradePriceStats()" class="text-sm text-blue-600 hover:text-blue-800">
                            <i class="fas fa-refresh mr-1"></i>새로고침
                        </button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="p-4 bg-blue-50 rounded-lg">
                            <div class="text-sm text-gray-600 mb-1">총 거래 건수</div>
                            <div class="text-2xl font-bold text-gray-900" id="tradePriceTotal">-</div>
                        </div>
                        <div class="p-4 bg-green-50 rounded-lg">
                            <div class="text-sm text-gray-600 mb-1">수집 지역</div>
                            <div class="text-2xl font-bold text-gray-900" id="tradePriceRegions">-</div>
                        </div>
                        <div class="p-4 bg-purple-50 rounded-lg">
                            <div class="text-sm text-gray-600 mb-1">최신 거래일</div>
                            <div class="text-2xl font-bold text-gray-900" id="tradePriceLatest">-</div>
                        </div>
                    </div>
                </div>
                
                <!-- Recent Activities -->
                <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">최근 활동</h3>
                    <div class="space-y-4" id="recentActivities">
                        <p class="text-sm text-gray-500 text-center py-8">아직 활동 내역이 없습니다.</p>
                    </div>
                </div>
            </div>

            <!-- Properties Section -->
            <div id="propertiesSection" class="section-content p-4 sm:p-6 lg:p-8 hidden">
                <!-- Tabs -->
                <div class="bg-white rounded-xl shadow-sm mb-6 border border-gray-100 overflow-hidden">
                    <div class="flex overflow-x-auto">
                        <button onclick="switchTab('all')" class="tab-btn px-6 py-4 font-medium text-sm text-gray-600 tab-active whitespace-nowrap border-b-2" data-tab="all">
                            전체분양
                        </button>
                        <button onclick="switchTab('rental')" class="tab-btn px-6 py-4 font-medium text-sm text-gray-600 whitespace-nowrap border-b-2 border-transparent" data-tab="rental">
                            임대분양
                        </button>
                        <button onclick="switchTab('general')" class="tab-btn px-6 py-4 font-medium text-sm text-gray-600 whitespace-nowrap border-b-2 border-transparent" data-tab="general">
                            청약분양
                        </button>
                        <button onclick="switchTab('unsold')" class="tab-btn px-6 py-4 font-medium text-sm text-gray-600 whitespace-nowrap border-b-2 border-transparent" data-tab="unsold">
                            줍줍분양
                        </button>
                        <button onclick="switchTab('deleted')" class="tab-btn px-6 py-4 font-medium text-sm text-gray-600 whitespace-nowrap border-b-2 border-transparent" data-tab="deleted">
                            삭제된 매물
                        </button>
                        <button onclick="switchTab('ad-inquiries')" class="tab-btn px-6 py-4 font-medium text-sm text-gray-600 whitespace-nowrap border-b-2 border-transparent" data-tab="ad-inquiries">
                            광고 문의
                        </button>
                    </div>
                </div>
                
            <!-- Search & Actions -->
            <div class="bg-white rounded-lg shadow-sm p-3 sm:p-4 mb-3 sm:mb-4">
                <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-2">
                    <input type="text" id="searchInput" placeholder="단지명, 지역, 태그로 검색..." 
                           onkeyup="handleSearchKeyup(event)"
                           class="flex-1 px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500">
                    <div class="flex gap-2 sm:gap-3">
                        <button onclick="searchProperties()" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm sm:text-base">
                            <i class="fas fa-search sm:mr-2"></i><span class="hidden sm:inline">검색</span>
                        </button>
                        <button onclick="clearSearch()" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm sm:text-base">
                            <i class="fas fa-times sm:mr-2"></i><span class="hidden sm:inline">초기화</span>
                        </button>
                        <button onclick="openAddModal()" class="flex-1 sm:flex-none sm:w-auto px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm sm:text-base whitespace-nowrap">
                            <i class="fas fa-plus sm:mr-2"></i>신규등록
                        </button>
                    </div>
                </div>
                <div id="searchResultCount" class="text-sm text-gray-600 hidden">
                    <i class="fas fa-info-circle mr-1"></i>
                    <span id="searchResultText"></span>
                </div>
            </div>

            <!-- Properties Table -->
            <div class="bg-white rounded-lg shadow-sm overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full min-w-[640px]">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">단지명</th>
                                <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">지역</th>
                                <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">타입</th>
                                <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">마감일</th>
                                <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">등록일</th>
                                <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">수정일</th>
                                <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                            </tr>
                        </thead>
                        <tbody id="propertiesTable" class="divide-y divide-gray-200">
                            <!-- Data will be loaded here -->
                        </tbody>
                    </table>
                </div>
            </div>
            </div>

            <!-- Deleted Properties Section -->
            <div id="deletedSection" class="section-content p-4 sm:p-6 lg:p-8 hidden">
                <div class="bg-white rounded-xl shadow-sm mb-6 border border-gray-100 p-6">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h3 class="text-lg font-bold text-gray-900">삭제된 매물</h3>
                            <p class="text-sm text-gray-500 mt-1">삭제된 매물을 복원하거나 영구 삭제할 수 있습니다</p>
                        </div>
                        <button onclick="loadDeletedProperties()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                            <i class="fas fa-sync-alt mr-2"></i>새로고침
                        </button>
                    </div>
                    
                    <!-- Deleted Properties Table -->
                    <div class="overflow-x-auto">
                        <table class="w-full min-w-[640px]">
                            <thead class="bg-gray-50 border-b">
                                <tr>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">단지명</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">지역</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">타입</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">삭제일</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                                </tr>
                            </thead>
                            <tbody id="deletedPropertiesTable" class="divide-y divide-gray-200">
                                <!-- Data will be loaded here -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Ad Inquiries Section -->
            <div id="ad-inquiriesSection" class="section-content p-4 sm:p-6 lg:p-8 hidden">
                <div class="bg-white rounded-xl shadow-sm mb-6 border border-gray-100 p-6">
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h3 class="text-lg font-bold text-gray-900">광고 문의</h3>
                            <p class="text-sm text-gray-500 mt-1">사용자가 남긴 광고 문의를 확인하고 답변할 수 있습니다</p>
                        </div>
                        <button onclick="loadAdInquiries()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                            <i class="fas fa-sync-alt mr-2"></i>새로고침
                        </button>
                    </div>
                    
                    <!-- Status Filters -->
                    <div class="flex gap-2 mb-6">
                        <button onclick="filterAdInquiries('all')" class="ad-filter-btn px-4 py-2 text-sm rounded-lg bg-blue-100 text-blue-700 font-medium" data-status="all">
                            전체
                        </button>
                        <button onclick="filterAdInquiries('pending')" class="ad-filter-btn px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-600" data-status="pending">
                            대기중
                        </button>
                        <button onclick="filterAdInquiries('replied')" class="ad-filter-btn px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-600" data-status="replied">
                            답변완료
                        </button>
                    </div>
                    
                    <!-- Ad Inquiries Table -->
                    <div class="overflow-x-auto">
                        <table class="w-full min-w-[640px]">
                            <thead class="bg-gray-50 border-b">
                                <tr>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">연락처</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">문의내용</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">접수일</th>
                                    <th class="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                                </tr>
                            </thead>
                            <tbody id="adInquiriesTable" class="divide-y divide-gray-200">
                                <!-- Data will be loaded here -->
                            </tbody>
                        </table>
                    </div>
                    <div id="noAdInquiries" class="hidden p-8 text-center text-gray-500">
                        <i class="fas fa-inbox text-4xl mb-3"></i>
                        <p>광고 문의가 없습니다.</p>
                    </div>
                </div>
            </div>

            <!-- Statistics Section -->
            <div id="statisticsSection" class="section-content p-4 sm:p-6 lg:p-8 hidden">
                <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <h3 class="text-lg font-bold text-gray-900 mb-6">통계 및 분석</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="border rounded-lg p-6">
                            <h4 class="font-semibold text-gray-900 mb-4">타입별 분포</h4>
                            <div class="space-y-3">
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-gray-600">임대분양</span>
                                    <span class="text-sm font-bold text-gray-900">45%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="bg-blue-600 h-2 rounded-full" style="width: 45%"></div>
                                </div>
                            </div>
                            <div class="space-y-3 mt-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-gray-600">청약분양</span>
                                    <span class="text-sm font-bold text-gray-900">30%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="bg-green-600 h-2 rounded-full" style="width: 30%"></div>
                                </div>
                            </div>
                            <div class="space-y-3 mt-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-gray-600">줍줍분양</span>
                                    <span class="text-sm font-bold text-gray-900">25%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="bg-orange-600 h-2 rounded-full" style="width: 25%"></div>
                                </div>
                            </div>
                        </div>
                        <div class="border rounded-lg p-6">
                            <h4 class="font-semibold text-gray-900 mb-4">지역별 분포</h4>
                            <div class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-gray-600">서울/경기</span>
                                    <span class="text-sm font-bold text-gray-900">60%</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-gray-600">세종/충청</span>
                                    <span class="text-sm font-bold text-gray-900">20%</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-gray-600">기타 지역</span>
                                    <span class="text-sm font-bold text-gray-900">20%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Settings Section -->
            <div id="settingsSection" class="section-content p-4 sm:p-6 lg:p-8 hidden">
                <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                    <h3 class="text-lg font-bold text-gray-900 mb-6">설정</h3>
                    <div class="space-y-6">
                        <div>
                            <h4 class="font-semibold text-gray-900 mb-3">시스템 정보</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-gray-600">버전</span>
                                    <span class="font-medium">v1.0.0</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">마지막 업데이트</span>
                                    <span class="font-medium">2025-01-15</span>
                                </div>
                            </div>
                        </div>
                        <div class="pt-6 border-t">
                            <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                                설정 저장
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add/Edit Modal -->
        <div id="editModal" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 items-center justify-center p-2 sm:p-4">
            <div class="bg-white rounded-xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
                <div class="sticky top-0 bg-white border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
                    <h2 id="modalTitle" class="text-lg sm:text-xl font-bold text-gray-900">신규 등록</h2>
                    <button onclick="closeEditModal()" class="text-gray-400 hover:text-gray-600 p-2 -m-2">
                        <i class="fas fa-times text-xl sm:text-2xl"></i>
                    </button>
                </div>
                <div class="p-4 sm:p-6">
                    <form id="propertyForm" class="space-y-4 sm:space-y-6">
                        <input type="hidden" id="propertyId">
                        
                        <!-- PDF 업로드 및 자동 파싱 -->
                        <div class="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-dashed border-purple-300 rounded-xl p-4 sm:p-6">
                            <h3 class="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4 flex items-center">
                                <span class="bg-purple-600 text-white w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs sm:text-sm mr-2">
                                    <i class="fas fa-magic text-xs"></i>
                                </span>
                                PDF 자동 파싱 (1차 세팅)
                            </h3>
                            <p class="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                                PDF 파일을 업로드하면 AI가 자동으로 내용을 분석하여 아래 폼을 채워드립니다.
                            </p>
                            
                            <div class="flex flex-col sm:flex-row gap-3 sm:gap-4">
                                <label class="flex-1 cursor-pointer">
                                    <div class="border-2 border-gray-300 border-dashed rounded-lg p-3 sm:p-4 hover:border-purple-500 hover:bg-white transition-all">
                                        <div class="flex items-center gap-2 sm:gap-3">
                                            <i class="fas fa-file-pdf text-2xl sm:text-3xl text-red-500 flex-shrink-0"></i>
                                            <div class="flex-1 min-w-0">
                                                <p class="text-xs sm:text-sm font-medium text-gray-700">
                                                    <span id="pdfFileName" class="truncate block">PDF 파일을 선택하세요</span>
                                                </p>
                                                <p class="text-xs text-gray-500">최대 10MB, PDF 형식만 가능</p>
                                            </div>
                                        </div>
                                    </div>
                                    <input type="file" id="pdfFile" accept=".pdf" class="hidden" onchange="handlePdfSelect(event)">
                                </label>
                                
                                <button type="button" onclick="parsePdf()" id="parsePdfBtn" class="px-4 sm:px-6 py-2.5 sm:py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm sm:text-base disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap" disabled>
                                    <i class="fas fa-magic mr-1 sm:mr-2"></i>
                                    자동 파싱
                                </button>
                            </div>
                            
                            <div id="pdfParsingStatus" class="hidden mt-4 p-4 bg-white rounded-lg border">
                                <div class="flex items-center gap-3">
                                    <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                                    <p class="text-sm text-gray-700">
                                        <span id="parsingStatusText">PDF 분석 중...</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 메인카드 입력폼 -->
                        <div class="border-b pb-4 sm:pb-6">
                            <h3 class="text-base sm:text-lg font-bold text-gray-900 mb-2 flex items-center">
                                <span class="bg-blue-600 text-white w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs sm:text-sm mr-2">1</span>
                                메인카드 정보
                            </h3>
                            <p class="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 ml-7 sm:ml-8">메인 페이지에 표시될 카드 정보를 입력하세요. (* 필수 항목)</p>
                            
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                                <div>
                                    <label class="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                                        단지명 *
                                        <span class="text-gray-400 font-normal ml-1">(공식 분양명)</span>
                                    </label>
                                    <input type="text" id="projectName" required class="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg" placeholder="예: 엘리프세종 6-3M4 신혼희망타운">
                                </div>
                                <div>
                                    <label class="block text-xs sm:text-sm font-medium text-gray-700 mb-1">타입 *</label>
                                    <select id="saleType" required class="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg">
                                        <option value="rental">임대분양</option>
                                        <option value="general">청약분양</option>
                                        <option value="unsold">줍줍분양</option>
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        공급유형
                                        <span class="text-gray-400 font-normal text-xs ml-1">(분양 종류)</span>
                                    </label>
                                    <input type="text" id="supplyType" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="예: 신혼희망타운, 행복주택, 국민임대">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        지역
                                        <span class="text-gray-400 font-normal text-xs ml-1">(시/도 + 시/군/구)</span>
                                    </label>
                                    <input type="text" id="region" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="예: 경기 화성, 세종시">
                                </div>
                            </div>

                            <div class="mb-4">
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    전체주소
                                    <span class="text-gray-400 font-normal text-xs ml-1">(단지 위치 상세 주소)</span>
                                </label>
                                <input type="text" id="fullAddress" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="예: 세종특별자치시 연기면 세종리 6-3블록">
                            </div>

                            <div class="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">
                                        시공사
                                        <span class="text-gray-400 font-normal text-xs ml-1">(건설사명)</span>
                                    </label>
                                    <input type="text" id="constructor" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="예: LH, 현대건설, GS건설">
                                </div>
                            </div>

                            <!-- 가격 정보 (라벨 선택 + 입력) -->
                            <div class="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <h4 class="text-sm font-bold text-gray-900 mb-3 flex items-center">
                                    <i class="fas fa-won-sign text-blue-600 mr-2"></i>
                                    가격 정보
                                </h4>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">
                                            가격 라벨
                                            <span class="text-gray-400 font-normal text-xs ml-1">(메인 카드 표시명)</span>
                                        </label>
                                        <select id="priceLabel" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            <option value="임대보증금">임대보증금</option>
                                            <option value="분양가격">분양가격</option>
                                            <option value="조합가격">조합가격</option>
                                        </select>
                                        <p class="text-xs text-gray-500 mt-1">💡 타입에 따라 자동 설정되지만 수동 변경 가능</p>
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-1">
                                            가격
                                            <span class="text-gray-400 font-normal text-xs ml-1">(메인 카드에 표시)</span>
                                        </label>
                                        <input type="text" id="mainPrice" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="예: 1,527만원, 3.5억원">
                                        <p class="text-xs text-gray-500 mt-1">💡 이 값이 메인 카드에 표시됩니다</p>
                                    </div>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">대표이미지 <span class="text-gray-400 text-xs">(선택)</span></label>
                                    
                                    <!-- Image Upload Area -->
                                    <div class="space-y-3">
                                        <!-- Preview Area -->
                                        <div id="imagePreviewArea" class="hidden">
                                            <div class="relative inline-block">
                                                <img id="imagePreview" src="" alt="미리보기" class="max-w-xs max-h-48 rounded-lg border-2 border-gray-300">
                                                <button type="button" onclick="removeImage()" class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <!-- Upload Button -->
                                        <div class="flex gap-2">
                                            <label class="flex-1 cursor-pointer">
                                                <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 transition-all text-center">
                                                    <i class="fas fa-cloud-upload-alt text-3xl text-gray-400 mb-2"></i>
                                                    <p class="text-sm text-gray-600">
                                                        <span class="font-semibold text-blue-600">파일 선택</span> 또는 드래그 앤 드롭
                                                    </p>
                                                    <p class="text-xs text-gray-500 mt-1">JPG, PNG, WEBP, GIF (최대 5MB)</p>
                                                </div>
                                                <input type="file" id="imageFile" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" class="hidden" onchange="handleImageSelect(event)">
                                            </label>
                                        </div>
                                        
                                        <!-- URL Input (Alternative) -->
                                        <div class="relative">
                                            <div class="absolute inset-0 flex items-center">
                                                <div class="w-full border-t border-gray-300"></div>
                                            </div>
                                            <div class="relative flex justify-center text-xs">
                                                <span class="bg-white px-2 text-gray-500">또는 URL 직접 입력</span>
                                            </div>
                                        </div>
                                        
                                        <input type="text" id="mainImage" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="https://example.com/image.jpg">
                                        
                                        <!-- Upload Status -->
                                        <div id="uploadStatus" class="hidden text-sm"></div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    해시태그
                                    <span class="text-gray-400 font-normal text-xs ml-1">(쉼표로 구분, 최대 5개 권장)</span>
                                </label>
                                <input type="text" id="hashtags" class="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="예: 국민임대, 신혼부부, 전북김제, 청약통장무관">
                            </div>

                            <!-- 추천대상 3줄 -->
                            <div class="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                                <h4 class="text-sm font-bold text-gray-900 mb-2 flex items-center">
                                    <i class="fas fa-users text-green-600 mr-2"></i>
                                    추천 대상 (3줄 구조)
                                </h4>
                                <p class="text-xs text-green-800 mb-3">
                                    <i class="fas fa-info-circle mr-1"></i>
                                    메인 카드 하단에 표시될 핵심 타겟 정보를 3줄로 요약해주세요.
                                </p>
                                <div class="space-y-3">
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1">
                                            <span class="bg-green-600 text-white px-2 py-0.5 rounded mr-1">1</span>
                                            거주지 + 신청 대상
                                        </label>
                                        <input type="text" id="targetAudience1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" placeholder="예: 세종시 거주 무주택 신혼부부">
                                        <p class="text-xs text-gray-500 mt-1">💡 지역 + 주체를 명확히 작성하세요</p>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1">
                                            <span class="bg-green-600 text-white px-2 py-0.5 rounded mr-1">2</span>
                                            주요 신청 자격/조건
                                        </label>
                                        <input type="text" id="targetAudience2" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" placeholder="예: 청약통장 없어도 신청 가능">
                                        <p class="text-xs text-gray-500 mt-1">💡 가장 중요한 자격 조건을 작성하세요</p>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium text-gray-700 mb-1">
                                            <span class="bg-green-600 text-white px-2 py-0.5 rounded mr-1">3</span>
                                            추가 조건 또는 특별 혜택
                                        </label>
                                        <input type="text" id="targetAudience3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" placeholder="예: 소득·자산 제한 없는 공공분야 희망자">
                                        <p class="text-xs text-gray-500 mt-1">💡 추가 조건이나 특별한 장점을 강조하세요</p>
                                    </div>
                                </div>
                            </div>

                            <!-- 줍줍분양 실거래가 정보 (타입이 unsold일 때만 표시) -->
                            <div id="tradePriceSection" class="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg" style="display: none;">
                                <div class="flex items-center justify-between mb-3">
                                    <h4 class="text-sm font-bold text-gray-900">📊 실거래가 정보 (줍줍분양 전용)</h4>
                                    <button type="button" onclick="fetchTradePrice()" id="fetchTradePriceBtn" class="px-3 py-1 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700">
                                        <i class="fas fa-sync-alt mr-1"></i> 실거래가 조회
                                    </button>
                                </div>
                                
                                <!-- 아파트명 입력 필드 (검색 아이콘 포함) -->
                                <div class="mb-3">
                                    <label class="block text-xs font-medium text-gray-600 mb-1">아파트명</label>
                                    <div class="relative">
                                        <input type="text" id="apartmentName" class="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm" placeholder="예) 아크로힐스논현" readonly>
                                        <button type="button" onclick="openApartmentSearch()" class="absolute right-2 top-1/2 transform -translate-y-1/2 text-blue-600 hover:text-blue-700 transition-colors">
                                            <i class="fas fa-search text-lg"></i>
                                        </button>
                                    </div>
                                    <p class="text-xs text-gray-500 mt-1">💡 검색 아이콘(<i class="fas fa-search text-blue-600"></i>)을 클릭해서 아파트를 선택하세요</p>
                                </div>
                                
                                <div id="tradePriceResult" class="hidden space-y-3">
                                    <div class="grid grid-cols-2 gap-3">
                                        <div>
                                            <label class="block text-xs font-medium text-gray-600 mb-1">최근 실거래가 (억원)</label>
                                            <input type="number" id="recentTradePrice" step="0.01" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="24.8">
                                        </div>
                                        <div>
                                            <label class="block text-xs font-medium text-gray-600 mb-1">거래 년월</label>
                                            <input type="text" id="recentTradeDate" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="2024.11">
                                        </div>
                                    </div>
                                    <div class="grid grid-cols-2 gap-3">
                                        <div>
                                            <label class="block text-xs font-medium text-gray-600 mb-1">기존 분양가 (억원)</label>
                                            <input type="number" id="originalPrice" step="0.01" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="20.0">
                                        </div>
                                        <div>
                                            <label class="block text-xs font-medium text-gray-600 mb-1">분양 날짜</label>
                                            <input type="text" id="salePriceDate" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="2023.05">
                                        </div>
                                    </div>
                                </div>
                                
                                <div id="tradePriceLoading" class="hidden text-center py-4">
                                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                                    <p class="text-sm text-gray-600 mt-2">실거래가 조회 중...</p>
                                </div>
                                
                                <div id="tradePriceMessage" class="text-xs text-gray-500 mt-2">
                                    실거래가 조회 버튼을 클릭하면 국토교통부 API에서 자동으로 최근 실거래가를 가져옵니다.
                                </div>
                            </div>
                        </div>

                        <!-- 입주자 선정 일정 -->
                        <div class="border-b pb-6">
                            <div class="mb-4">
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="text-lg font-bold text-gray-900 flex items-center">
                                        <span class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">2</span>
                                        입주자 선정 일정
                                    </h3>
                                    <button type="button" onclick="addStep()" class="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                                        <i class="fas fa-plus mr-1"></i> 스텝 추가
                                    </button>
                                </div>
                                <p class="text-xs sm:text-sm text-gray-500 ml-8">청약신청, 당첨자 발표 등 단계별 일정을 입력하세요.</p>
                                <div class="mt-2 ml-8 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p class="text-xs text-blue-800">
                                        <i class="fas fa-info-circle mr-1"></i>
                                        <strong>입력 가이드:</strong><br>
                                        • <strong>스텝 제목:</strong> 예) 청약신청, 당첨자 발표<br>
                                        • <strong>날짜:</strong> 단일 날짜(2025-01-01) 또는 기간(2025-01-01 ~ 2025-01-03)<br>
                                        • <strong>상세 설명:</strong> 예) 현장·인터넷·모바일, 청약홈 발표
                                    </p>
                                </div>
                            </div>
                            <div id="stepsContainer" class="space-y-2">
                                <!-- 동적으로 추가됨 -->
                            </div>
                        </div>

                        <!-- 상세카드 -->
                        <div>
                            <h3 class="text-lg font-bold text-gray-900 mb-2 flex items-center">
                                <span class="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2">3</span>
                                상세카드 정보
                            </h3>
                            <p class="text-xs sm:text-sm text-gray-500 mb-4 ml-8">상세 페이지에 표시될 추가 정보를 입력하세요. (모두 선택 사항)</p>

                            <!-- Accordion Sections -->
                            <div class="space-y-2">
                                <!-- 1. 단지정보 -->
                                <div class="border rounded-lg">
                                    <button type="button" onclick="toggleSection('section1')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">📍 단지정보</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section1" class="hidden p-4 space-y-3">
                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">위치</label>
                                                <input type="text" id="detail_location" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">대지면적</label>
                                                <input type="text" id="detail_landArea" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                        </div>
                                        <div class="grid grid-cols-3 gap-3">
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">건설호수</label>
                                                <input type="text" id="detail_totalHouseholds" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">주차대수</label>
                                                <input type="text" id="detail_parking" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">주차비율</label>
                                                <input type="text" id="detail_parkingRatio" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                        </div>
                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">건축사</label>
                                                <input type="text" id="detail_architect" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">시공사</label>
                                                <input type="text" id="detail_constructor" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">홈페이지 <span class="text-gray-400 text-xs">(선택)</span></label>
                                            <input type="text" id="detail_website" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="https://example.com">
                                        </div>
                                    </div>
                                </div>

                                <!-- 2. 신청자격 -->
                                <div class="border rounded-lg">
                                    <button type="button" onclick="toggleSection('section2')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">👥 신청자격</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section2" class="hidden p-4 space-y-3">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">대상유형 (쉼표로 구분)</label>
                                            <input type="text" id="detail_targetTypes" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="신혼부부, 생애최초, 다자녀가구">
                                        </div>
                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">소득기준</label>
                                                <input type="text" id="detail_incomeLimit" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">자산기준</label>
                                                <input type="text" id="detail_assetLimit" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                        </div>
                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">무주택기간</label>
                                                <input type="text" id="detail_homelessPeriod" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">청약통장</label>
                                                <input type="text" id="detail_savingsAccount" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 3. 공급세대정보 -->
                                <div class="border rounded-lg">
                                    <button type="button" onclick="toggleSection('section3')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">🏠 공급세대정보</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section3" class="hidden p-4 space-y-4">
                                        <!-- 공급 세대 이미지 -->
                                        <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                                <i class="fas fa-image text-blue-600 mr-1"></i>
                                                공급 세대 정보 이미지
                                                <span class="text-gray-400 font-normal text-xs ml-1">(선택사항)</span>
                                            </label>
                                            
                                            <!-- 이미지 미리보기 -->
                                            <div id="supplyInfoImagePreviewArea" class="hidden mb-3">
                                                <div class="relative inline-block">
                                                    <img id="supplyInfoImagePreview" src="" alt="미리보기" class="max-w-full max-h-48 rounded-lg border-2 border-gray-300">
                                                    <button type="button" onclick="removeSupplyInfoImage()" class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600">
                                                        <i class="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <!-- 업로드 버튼 -->
                                            <label class="cursor-pointer">
                                                <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 transition-all text-center">
                                                    <i class="fas fa-cloud-upload-alt text-3xl text-gray-400 mb-2"></i>
                                                    <p class="text-sm text-gray-600">
                                                        <span class="font-semibold text-blue-600">파일 선택</span> 또는 드래그 앤 드롭
                                                    </p>
                                                    <p class="text-xs text-gray-500 mt-1">JPG, PNG, WEBP (최대 5MB)</p>
                                                </div>
                                                <input type="file" id="supplyInfoImageFile" accept="image/jpeg,image/jpg,image/png,image/webp" class="hidden" onchange="handleSupplyInfoImageSelect(event)">
                                            </label>
                                            
                                            <!-- 숨겨진 URL 필드 -->
                                            <input type="hidden" id="supplyInfoImage">
                                            
                                            <!-- 업로드 상태 -->
                                            <div id="supplyInfoImageUploadStatus" class="hidden mt-2 text-sm"></div>
                                            
                                            <p class="text-xs text-gray-500 mt-2">💡 상세 팝업의 공급 세대 정보 테이블 위에 표시됩니다</p>
                                        </div>
                                        
                                        <!-- 공급 세대 타입 입력 -->
                                        <div>
                                            <div class="mb-2 flex justify-between items-center">
                                                <span class="text-sm font-medium text-gray-700">공급 타입 목록</span>
                                                <button type="button" onclick="addSupplyRow()" class="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700">
                                                    <i class="fas fa-plus mr-1"></i> 타입 추가
                                                </button>
                                            </div>
                                            <div id="supplyRowsContainer" class="space-y-2">
                                                <!-- 동적으로 추가됨 -->
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 4. 입주자선정기준 -->
                                <div class="border rounded-lg">
                                    <button type="button" onclick="toggleSection('section4')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">📋 입주자선정기준</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section4" class="hidden p-4 space-y-3">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">선정방식</label>
                                            <input type="text" id="detail_selectionMethod" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">가점항목</label>
                                            <textarea id="detail_scoringCriteria" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></textarea>
                                        </div>
                                    </div>
                                </div>

                                <!-- 5. 주의사항 -->
                                <div class="border rounded-lg">
                                    <button type="button" onclick="toggleSection('section5')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">⚠️ 주의사항</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section5" class="hidden p-4">
                                        <textarea id="detail_notices" rows="4" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="주의사항을 입력하세요"></textarea>
                                    </div>
                                </div>

                                <!-- 6. 온라인신청 -->
                                <div class="border rounded-lg">
                                    <button type="button" onclick="toggleSection('section6')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">💻 온라인신청</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section6" class="hidden p-4 space-y-3">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">신청방법</label>
                                            <input type="text" id="detail_applicationMethod" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">신청URL <span class="text-gray-400 text-xs">(선택)</span></label>
                                            <input type="text" id="detail_applicationUrl" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="https://apply.example.com">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">필요서류</label>
                                            <textarea id="detail_requiredDocs" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"></textarea>
                                        </div>
                                    </div>
                                </div>

                                <!-- 7. 문의처 -->
                                <div class="border rounded-lg">
                                    <button type="button" onclick="toggleSection('section7')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">📞 문의처</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section7" class="hidden p-4 space-y-3">
                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">담당부서</label>
                                                <input type="text" id="detail_contactDept" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                                                <input type="tel" id="detail_contactPhone" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                        </div>
                                        <div class="grid grid-cols-2 gap-3">
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                                                <input type="email" id="detail_contactEmail" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700 mb-1">주소</label>
                                                <input type="text" id="detail_contactAddress" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 8. 단지개요 -->
                                <div class="border rounded-lg">
                                    <button type="button" onclick="toggleSection('section8')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">📝 단지개요</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section8" class="hidden p-4 space-y-3">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">단지특징</label>
                                            <textarea id="detail_features" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm auto-resize" oninput="autoResize(this)"></textarea>
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">주변환경</label>
                                            <textarea id="detail_surroundings" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm auto-resize" oninput="autoResize(this)"></textarea>
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">교통여건</label>
                                            <textarea id="detail_transportation" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm auto-resize" oninput="autoResize(this)"></textarea>
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">교육시설</label>
                                            <textarea id="detail_education" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm auto-resize" oninput="autoResize(this)"></textarea>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Section 9: 상세 정보 이미지 갤러리 -->
                                <div class="border-b">
                                    <button type="button" onclick="toggleSection('section9')" class="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between">
                                        <span class="font-medium text-gray-900">🖼️ 상세 정보 이미지 (최대 30개)</span>
                                        <i class="fas fa-chevron-down text-gray-400"></i>
                                    </button>
                                    <div id="section9" class="hidden p-4 space-y-3">
                                        <div class="mb-3">
                                            <p class="text-xs text-gray-600 mb-2">
                                                <i class="fas fa-info-circle text-blue-500 mr-1"></i>
                                                상세 정보 카드 하단에 표시될 이미지를 업로드하세요. 순서대로 저장됩니다.
                                            </p>
                                        </div>
                                        
                                        <!-- 이미지 업로드 버튼 -->
                                        <div class="mb-4">
                                            <label class="cursor-pointer">
                                                <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-500 hover:bg-blue-50 transition-all text-center">
                                                    <i class="fas fa-images text-4xl text-gray-400 mb-2"></i>
                                                    <p class="text-sm text-gray-600 mb-1">
                                                        <span class="font-semibold text-blue-600">이미지 선택</span> 또는 드래그 앤 드롭
                                                    </p>
                                                    <p class="text-xs text-gray-500">JPG, PNG, WEBP (최대 5MB, 최대 30개)</p>
                                                </div>
                                                <input type="file" id="detailImagesInput" accept="image/jpeg,image/jpg,image/png,image/webp" multiple class="hidden" onchange="handleDetailImagesSelect(event)">
                                            </label>
                                        </div>
                                        
                                        <!-- 업로드 상태 표시 -->
                                        <div id="detailImagesUploadStatus" class="hidden mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm"></div>
                                        
                                        <!-- 이미지 미리보기 그리드 -->
                                        <div id="detailImagesPreviewContainer" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                            <!-- 이미지 미리보기가 여기에 동적으로 추가됨 -->
                                        </div>
                                        
                                        <!-- 숨겨진 URL 필드 (JSON 배열로 저장) -->
                                        <input type="hidden" id="detailImagesUrls" value="[]">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="flex gap-3 pt-4 border-t">
                            <button type="button" onclick="closeEditModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                                취소
                            </button>
                            <button type="button" onclick="saveDraft()" class="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium">
                                임시저장
                            </button>
                            <button type="submit" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                                저장
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Delete Modal -->
        <div id="deleteModal" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 items-center justify-center p-4">
            <div class="bg-white rounded-xl max-w-md w-full p-6">
                <h2 class="text-xl font-bold text-gray-900 mb-2">삭제 확인</h2>
                <p class="text-gray-600 mb-6">정말 이 데이터를 삭제하시겠습니까?</p>
                <div class="flex gap-3">
                    <button onclick="closeDeleteModal()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        취소
                    </button>
                    <button onclick="confirmDelete()" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                        삭제
                    </button>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            // Check authentication
            const adminToken = localStorage.getItem('adminToken');
            if (!adminToken) {
                window.location.href = '/admin/login';
            }

            // Section Management
            function showSection(sectionName) {
                // Hide all sections
                document.querySelectorAll('.section-content').forEach(el => el.classList.add('hidden'));
                
                // Show selected section
                const section = document.getElementById(sectionName + 'Section');
                if (section) {
                    section.classList.remove('hidden');
                }
                
                // Update active sidebar link
                document.querySelectorAll('.sidebar-link').forEach(link => {
                    link.classList.remove('active');
                });
                const activeLink = document.querySelector(\`.sidebar-link[data-section="\${sectionName}"]\`);
                if (activeLink) {
                    activeLink.classList.add('active');
                }
                
                // Update page title
                const titles = {
                    'dashboard': ['대시보드', '전체 현황을 확인하세요'],
                    'properties': ['매물 관리', '등록된 매물을 관리하세요'],
                    'deleted': ['삭제된 매물', '삭제된 매물을 복원하세요'],
                    'statistics': ['통계', '데이터 분석 및 통계'],
                    'settings': ['설정', '시스템 설정을 관리하세요']
                };
                if (titles[sectionName]) {
                    document.getElementById('pageTitle').textContent = titles[sectionName][0];
                    document.getElementById('pageSubtitle').textContent = titles[sectionName][1];
                }
                
                // Load data for specific sections
                if (sectionName === 'properties') {
                    loadProperties();
                } else if (sectionName === 'deleted') {
                    loadDeletedProperties();
                } else if (sectionName === 'dashboard') {
                    loadDashboardStats();
                }
            }
            
            // Toggle Sidebar
            function toggleSidebar() {
                const sidebar = document.getElementById('sidebar');
                const mainContent = document.getElementById('mainContent');
                
                if (sidebar.classList.contains('sidebar-expanded')) {
                    sidebar.classList.remove('sidebar-expanded');
                    sidebar.classList.add('sidebar-collapsed');
                    mainContent.classList.remove('lg:ml-[260px]');
                    mainContent.classList.add('lg:ml-[80px]');
                    
                    // Hide text
                    document.querySelectorAll('.sidebar-text').forEach(el => {
                        el.style.display = 'none';
                    });
                } else {
                    sidebar.classList.remove('sidebar-collapsed');
                    sidebar.classList.add('sidebar-expanded');
                    mainContent.classList.remove('lg:ml-[80px]');
                    mainContent.classList.add('lg:ml-[260px]');
                    
                    // Show text
                    document.querySelectorAll('.sidebar-text').forEach(el => {
                        el.style.display = 'block';
                    });
                }
            }
            
            // Load Dashboard Stats
            async function loadDashboardStats() {
                try {
                    const response = await axios.get('/api/properties?type=all');
                    const properties = response.data;
                    
                    // Total properties
                    document.getElementById('totalProperties').textContent = properties.length;
                    
                    // Rental properties
                    const rentalCount = properties.filter(p => p.type === 'rental').length;
                    document.getElementById('rentalProperties').textContent = rentalCount;
                    
                    // Unsold properties
                    const unsoldCount = properties.filter(p => p.type === 'unsold').length;
                    document.getElementById('unsoldProperties').textContent = unsoldCount;
                    
                    // Urgent properties (7 days or less)
                    const today = new Date();
                    const urgentCount = properties.filter(p => {
                        if (!p.deadline) return false;
                        const deadline = new Date(p.deadline);
                        const diffTime = deadline - today;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return diffDays >= 0 && diffDays <= 7;
                    }).length;
                    document.getElementById('urgentProperties').textContent = urgentCount;
                    
                } catch (error) {
                    console.error('Failed to load stats:', error);
                }
            }
            
            // Load Deleted Properties
            async function loadDeletedProperties() {
                try {
                    const response = await axios.get('/api/properties/deleted');
                    const deletedProperties = response.data;
                    
                    const tableBody = document.getElementById('deletedPropertiesTable');
                    tableBody.innerHTML = '';
                    
                    if (deletedProperties.length === 0) {
                        const emptyRow = document.createElement('tr');
                        emptyRow.innerHTML = '<td colspan="6" class="px-6 py-8 text-center text-gray-500"><i class="fas fa-inbox text-4xl mb-2"><' + '/i><p>삭제된 매물이 없습니다<' + '/p><' + '/td>';
                        tableBody.appendChild(emptyRow);
                        return;
                    }
                    
                    deletedProperties.forEach(property => {
                        const typeLabels = {
                            'rental': '임대분양',
                            'general': '청약분양',
                            'unsold': '줍줍분양'
                        };
                        
                        const typeColors = {
                            'rental': 'bg-blue-100 text-blue-800',
                            'general': 'bg-green-100 text-green-800',
                            'unsold': 'bg-orange-100 text-orange-800'
                        };
                        
                        const deletedAt = new Date(property.deleted_at).toLocaleString('ko-KR');
                        
                        const row = document.createElement('tr');
                        row.className = 'hover:bg-gray-50';
                        row.innerHTML = '<td class="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-900">#' + property.id + '<' + '/td>' +
                            '<td class="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">' + property.title + '<' + '/td>' +
                            '<td class="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-600 hidden sm:table-cell">' + property.location + '<' + '/td>' +
                            '<td class="px-3 sm:px-6 py-3 sm:py-4">' +
                                '<span class="px-2 py-1 text-xs font-medium rounded-full ' + (typeColors[property.type] || 'bg-gray-100 text-gray-800') + '">' +
                                    (typeLabels[property.type] || property.type) +
                                '<' + '/span>' +
                            '<' + '/td>' +
                            '<td class="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-600 hidden md:table-cell">' + deletedAt + '<' + '/td>' +
                            '<td class="px-3 sm:px-6 py-3 sm:py-4">' +
                                '<div class="flex gap-2">' +
                                    '<button onclick="restoreProperty(' + property.id + ')" class="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">' +
                                        '<i class="fas fa-trash-restore mr-1"><' + '/i>복원' +
                                    '<' + '/button>' +
                                '<' + '/div>' +
                            '<' + '/td>';
                        tableBody.appendChild(row);
                    });
                } catch (error) {
                    console.error('Failed to load deleted properties:', error);
                    alert('삭제된 매물 목록을 불러오는데 실패했습니다.');
                }
            }
            
            // Restore Property
            async function restoreProperty(id) {
                if (!confirm('이 매물을 복원하시겠습니까?')) {
                    return;
                }
                
                try {
                    await axios.post(\`/api/properties/\${id}/restore\`);
                    alert('매물이 복원되었습니다.');
                    loadDeletedProperties();
                } catch (error) {
                    console.error('Failed to restore property:', error);
                    alert('매물 복원에 실패했습니다.');
                }
            }
            
            // Load Ad Inquiries
            let currentAdInquiryStatus = 'all';
            async function loadAdInquiries() {
                try {
                    const response = await axios.get(\`/api/ad-inquiries?status=\${currentAdInquiryStatus}\`);
                    const inquiries = response.data;
                    
                    const tableBody = document.getElementById('adInquiriesTable');
                    tableBody.innerHTML = '';
                    
                    if (inquiries.length === 0) {
                        document.getElementById('noAdInquiries').classList.remove('hidden');
                        return;
                    }
                    
                    document.getElementById('noAdInquiries').classList.add('hidden');
                    
                    inquiries.forEach(inquiry => {
                        const statusLabels = {
                            'pending': '대기중',
                            'replied': '답변완료'
                        };
                        
                        const statusColors = {
                            'pending': 'bg-yellow-100 text-yellow-800',
                            'replied': 'bg-green-100 text-green-800'
                        };
                        
                        const createdAt = new Date(inquiry.created_at).toLocaleString('ko-KR');
                        const messagePreview = inquiry.message.length > 30 ? inquiry.message.substring(0, 30) + '...' : inquiry.message;
                        
                        const row = document.createElement('tr');
                        row.className = 'hover:bg-gray-50';
                        row.innerHTML = \`
                            <td class="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-900">#\${inquiry.id}</td>
                            <td class="px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium text-gray-900">\${inquiry.name}</td>
                            <td class="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-600 hidden sm:table-cell">\${inquiry.contact}</td>
                            <td class="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-600">\${messagePreview}</td>
                            <td class="px-3 sm:px-6 py-3 sm:py-4">
                                <span class="px-2 py-1 text-xs font-medium rounded-full \${statusColors[inquiry.status]}">\${statusLabels[inquiry.status]}</span>
                            </td>
                            <td class="px-3 sm:px-6 py-3 sm:py-4 text-sm text-gray-600 hidden md:table-cell">\${createdAt}</td>
                            <td class="px-3 sm:px-6 py-3 sm:py-4">
                                <button onclick="viewAdInquiry(\${inquiry.id})" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                                    <i class="fas fa-eye mr-1"></i>보기
                                </button>
                            </td>
                        \`;
                        tableBody.appendChild(row);
                    });
                } catch (error) {
                    console.error('Failed to load ad inquiries:', error);
                    alert('광고 문의 목록을 불러오는데 실패했습니다.');
                }
            }
            
            // Filter Ad Inquiries
            function filterAdInquiries(status) {
                currentAdInquiryStatus = status;
                document.querySelectorAll('.ad-filter-btn').forEach(btn => {
                    btn.classList.remove('bg-blue-100', 'text-blue-700', 'font-medium');
                    btn.classList.add('bg-gray-100', 'text-gray-600');
                });
                document.querySelector(\`[data-status="\${status}"]\`).classList.remove('bg-gray-100', 'text-gray-600');
                document.querySelector(\`[data-status="\${status}"]\`).classList.add('bg-blue-100', 'text-blue-700', 'font-medium');
                loadAdInquiries();
            }
            
            // View Ad Inquiry Detail
            async function viewAdInquiry(id) {
                try {
                    const response = await axios.get(\`/api/ad-inquiries\`);
                    const inquiry = response.data.find(i => i.id === id);
                    
                    if (!inquiry) {
                        alert('문의 내용을 찾을 수 없습니다.');
                        return;
                    }
                    
                    const createdAt = new Date(inquiry.created_at).toLocaleString('ko-KR');
                    const statusText = inquiry.status === 'pending' ? '대기중' : '답변완료';
                    
                    const adminNote = inquiry.admin_note ? \`
                        <div class="bg-green-50 p-4 rounded-lg">
                            <p class="text-sm font-medium text-green-800 mb-2">관리자 메모</p>
                            <p class="text-sm text-green-700">\${inquiry.admin_note}</p>
                        </div>
                    \` : '';
                    
                    const modalHtml = \`
                        <div class="fixed inset-0 z-[110] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.5);">
                            <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
                                <div class="flex justify-between items-start mb-6">
                                    <h3 class="text-xl font-bold text-gray-900">광고 문의 #\${inquiry.id}</h3>
                                    <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                                        <i class="fas fa-times text-xl"></i>
                                    </button>
                                </div>
                                
                                <div class="space-y-4">
                                    <div>
                                        <p class="text-sm text-gray-500">이름</p>
                                        <p class="text-base font-medium text-gray-900">\${inquiry.name}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm text-gray-500">연락처</p>
                                        <p class="text-base font-medium text-gray-900">\${inquiry.contact}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm text-gray-500">문의 내용</p>
                                        <p class="text-base text-gray-900 whitespace-pre-wrap">\${inquiry.message}</p>
                                    </div>
                                    <div class="flex gap-4">
                                        <div>
                                            <p class="text-sm text-gray-500">상태</p>
                                            <span class="inline-block px-3 py-1 text-sm font-medium rounded-full \${inquiry.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">\${statusText}</span>
                                        </div>
                                        <div>
                                            <p class="text-sm text-gray-500">접수일</p>
                                            <p class="text-base text-gray-900">\${createdAt}</p>
                                        </div>
                                    </div>
                                    
                                    \${adminNote}
                                    
                                    <div class="pt-4">
                                        <label class="block text-sm font-medium text-gray-700 mb-2">관리자 메모</label>
                                        <textarea id="adminNoteInput" class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" rows="3" placeholder="답변 내용을 입력하세요">\${inquiry.admin_note || ''}</textarea>
                                    </div>
                                    
                                    <div class="flex gap-2">
                                        <button onclick="updateAdInquiryStatus(\${inquiry.id}, 'replied')" class="flex-1 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium">
                                            답변 완료
                                        </button>
                                        <button onclick="updateAdInquiryStatus(\${inquiry.id}, 'pending')" class="flex-1 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 font-medium">
                                            대기중으로 변경
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`;
                    
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                } catch (error) {
                    console.error('Failed to view ad inquiry:', error);
                    alert('문의 내용을 불러오는데 실패했습니다.');
                }
            }
            
            // Update Ad Inquiry Status
            async function updateAdInquiryStatus(id, status) {
                const adminNote = document.getElementById('adminNoteInput').value;
                
                try {
                    await axios.post(\`/api/ad-inquiries/\${id}/status\`, {
                        status,
                        admin_note: adminNote
                    });
                    
                    alert('상태가 업데이트되었습니다.');
                    document.querySelector('.fixed.z-\\[110\\]').remove();
                    loadAdInquiries();
                } catch (error) {
                    console.error('Failed to update status:', error);
                    alert('상태 업데이트에 실패했습니다.');
                }
            }
            
            // Export Data
            function exportData() {
                alert('데이터 내보내기 기능은 준비 중입니다.');
            }
            
            // Trigger Trade Price Collection
            async function triggerTradePriceCollection() {
                if (!confirm('실거래가 데이터 수집을 시작하시겠습니까?\\n\\n수집 범위: 2022년 12월 ~ 2025년 11월 (3년)\\n예상 시간: 약 5-10분')) {
                    return;
                }
                
                try {
                    const response = await axios.post('/api/admin/trigger-trade-price-collection');
                    
                    if (response.data.success) {
                        alert('✅ ' + response.data.message + '\\n\\nGitHub Actions에서 진행 상황을 확인하세요.');
                        window.open(response.data.githubUrl, '_blank');
                        // Reload stats after 2 minutes
                        setTimeout(loadTradePriceStats, 120000);
                    } else {
                        alert('❌ ' + response.data.error);
                    }
                } catch (error) {
                    console.error('Trade Price Collection Error:', error);
                    alert('❌ 실거래가 수집 시작 실패: ' + (error.response?.data?.error || error.message));
                }
            }
            
            // Load Trade Price Stats
            async function loadTradePriceStats() {
                try {
                    const response = await axios.get('/api/admin/trade-price-stats');
                    
                    if (response.data.success) {
                        const stats = response.data.stats;
                        
                        document.getElementById('tradePriceTotal').textContent = stats.total.toLocaleString() + '건';
                        document.getElementById('tradePriceRegions').textContent = stats.regions.length + '개 지역';
                        document.getElementById('tradePriceLatest').textContent = stats.latestDate || '-';
                    }
                } catch (error) {
                    console.error('Trade Price Stats Error:', error);
                    document.getElementById('tradePriceTotal').textContent = '오류';
                    document.getElementById('tradePriceRegions').textContent = '오류';
                    document.getElementById('tradePriceLatest').textContent = '오류';
                }
            }
            
            // Test Seoul Trade Price
            // Initialize dashboard on load
            window.addEventListener('DOMContentLoaded', () => {
                loadDashboardStats();
                loadTradePriceStats();
            });

            let currentTab = 'all';
            let deleteTargetId = null;
            let stepCounter = 0;
            let supplyCounter = 0;
            let selectedPdfFile = null;
            let selectedImageFile = null;
            let uploadedImageUrl = null;

            // Handle image file selection
            function handleImageSelect(event) {
                const file = event.target.files[0];
                if (!file) return;

                // Validate file type
                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
                if (!allowedTypes.includes(file.type)) {
                    alert('JPG, PNG, WEBP, GIF 형식만 업로드 가능합니다.');
                    return;
                }

                // Validate file size (5MB)
                if (file.size > 5 * 1024 * 1024) {
                    alert('파일 크기는 5MB를 초과할 수 없습니다.');
                    return;
                }

                selectedImageFile = file;

                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById('imagePreview').src = e.target.result;
                    document.getElementById('imagePreviewArea').classList.remove('hidden');
                };
                reader.readAsDataURL(file);

                // Auto upload
                uploadImage();
            }

            // Upload image to R2
            async function uploadImage() {
                if (!selectedImageFile) return;

                const statusDiv = document.getElementById('uploadStatus');
                statusDiv.classList.remove('hidden');
                statusDiv.innerHTML = '<span class="text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>이미지 업로드 중...</span>';

                try {
                    const formData = new FormData();
                    formData.append('image', selectedImageFile);

                    const response = await axios.post('/api/admin/upload-image', formData, {
                        headers: {
                            'Content-Type': 'multipart/form-data'
                        }
                    });

                    if (response.data.success) {
                        uploadedImageUrl = response.data.imageUrl;
                        document.getElementById('mainImage').value = uploadedImageUrl;
                        statusDiv.innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle mr-2"></i>업로드 완료!</span>';
                        setTimeout(() => {
                            statusDiv.classList.add('hidden');
                        }, 3000);
                    } else {
                        throw new Error(response.data.error || '업로드 실패');
                    }
                } catch (error) {
                    console.error('이미지 업로드 오류:', error);
                    statusDiv.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-2"></i>업로드 실패: ' + (error.response?.data?.error || error.message) + '</span>';
                    removeImage();
                }
            }

            // Remove selected image
            function removeImage() {
                selectedImageFile = null;
                uploadedImageUrl = null;
                document.getElementById('imageFile').value = '';
                document.getElementById('imagePreview').src = '';
                document.getElementById('imagePreviewArea').classList.add('hidden');
                document.getElementById('uploadStatus').classList.add('hidden');
                // Don't clear mainImage input - user might have entered URL manually
            }

            // Supply Info Image Upload
            let selectedSupplyInfoImageFile = null;
            let uploadedSupplyInfoImageUrl = null;

            function handleSupplyInfoImageSelect(event) {
                const file = event.target.files[0];
                if (!file) return;

                // Validate file type
                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
                if (!allowedTypes.includes(file.type)) {
                    alert('JPG, PNG, WEBP 형식만 업로드 가능합니다.');
                    return;
                }

                // Validate file size (5MB)
                if (file.size > 5 * 1024 * 1024) {
                    alert('파일 크기는 5MB를 초과할 수 없습니다.');
                    return;
                }

                selectedSupplyInfoImageFile = file;

                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById('supplyInfoImagePreview').src = e.target.result;
                    document.getElementById('supplyInfoImagePreviewArea').classList.remove('hidden');
                };
                reader.readAsDataURL(file);

                // Auto upload
                uploadSupplyInfoImage();
            }

            async function uploadSupplyInfoImage() {
                if (!selectedSupplyInfoImageFile) return;

                const statusDiv = document.getElementById('supplyInfoImageUploadStatus');
                statusDiv.classList.remove('hidden');
                statusDiv.innerHTML = '<span class="text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>이미지 업로드 중...</span>';

                try {
                    const formData = new FormData();
                    formData.append('image', selectedSupplyInfoImageFile);

                    const response = await axios.post('/api/admin/upload-image', formData, {
                        headers: {
                            'Content-Type': 'multipart/form-data'
                        }
                    });

                    if (response.data.success) {
                        uploadedSupplyInfoImageUrl = response.data.url;
                        document.getElementById('supplyInfoImage').value = response.data.url;
                        statusDiv.innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle mr-2"></i>업로드 완료!</span>';
                    } else {
                        throw new Error(response.data.error || '업로드 실패');
                    }
                } catch (error) {
                    console.error('Upload failed:', error);
                    statusDiv.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-2"></i>업로드 실패</span>';
                    alert('이미지 업로드에 실패했습니다.');
                }
            }

            function removeSupplyInfoImage() {
                selectedSupplyInfoImageFile = null;
                uploadedSupplyInfoImageUrl = null;
                document.getElementById('supplyInfoImageFile').value = '';
                document.getElementById('supplyInfoImagePreview').src = '';
                document.getElementById('supplyInfoImagePreviewArea').classList.add('hidden');
                document.getElementById('supplyInfoImageUploadStatus').classList.add('hidden');
                document.getElementById('supplyInfoImage').value = '';
            }

            // Auto-resize textarea based on content
            function autoResize(textarea) {
                if (!textarea) return;
                
                // Reset height to auto to get the correct scrollHeight
                textarea.style.height = 'auto';
                
                // Set height to scrollHeight (content height)
                textarea.style.height = textarea.scrollHeight + 'px';
            }

            // Detail Images Gallery Upload (최대 30개)
            let detailImagesArray = [];
            const MAX_DETAIL_IMAGES = 30;

            async function handleDetailImagesSelect(event) {
                const files = Array.from(event.target.files);
                
                if (detailImagesArray.length + files.length > MAX_DETAIL_IMAGES) {
                    alert(\`최대 \${MAX_DETAIL_IMAGES}개의 이미지만 업로드할 수 있습니다. 현재: \${detailImagesArray.length}개\`);
                    return;
                }

                const statusDiv = document.getElementById('detailImagesUploadStatus');
                statusDiv.classList.remove('hidden');
                statusDiv.innerHTML = '<span class="text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>이미지 업로드 중...</span>';

                let successCount = 0;
                let failCount = 0;

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    
                    // Validate file type
                    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
                    if (!allowedTypes.includes(file.type)) {
                        failCount++;
                        continue;
                    }

                    // Validate file size (5MB)
                    if (file.size > 5 * 1024 * 1024) {
                        failCount++;
                        continue;
                    }

                    try {
                        const formData = new FormData();
                        formData.append('image', file);

                        const response = await axios.post('/api/admin/upload-image', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });

                        if (response.data.success) {
                            detailImagesArray.push(response.data.url);
                            successCount++;
                            updateDetailImagesPreview();
                        } else {
                            failCount++;
                        }
                    } catch (error) {
                        console.error('Image upload error:', error);
                        failCount++;
                    }

                    // Update progress
                    statusDiv.innerHTML = \`<span class="text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>업로드 중... (\${i + 1}/\${files.length})</span>\`;
                }

                // Show final status
                if (failCount === 0) {
                    statusDiv.innerHTML = \`<span class="text-green-600"><i class="fas fa-check-circle mr-2"></i>\${successCount}개 이미지 업로드 완료!</span>\`;
                } else {
                    statusDiv.innerHTML = \`<span class="text-yellow-600"><i class="fas fa-exclamation-triangle mr-2"></i>성공: \${successCount}개, 실패: \${failCount}개</span>\`;
                }

                // Hide status after 3 seconds
                setTimeout(() => {
                    statusDiv.classList.add('hidden');
                }, 3000);

                // Clear file input
                event.target.value = '';
            }

            function updateDetailImagesPreview() {
                const container = document.getElementById('detailImagesPreviewContainer');
                container.innerHTML = detailImagesArray.map((url, index) => \`
                    <div class="relative group">
                        <img src="\${url}" alt="상세 이미지 \${index + 1}" class="w-full h-32 object-cover rounded-lg border-2 border-gray-200">
                        <div class="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded">\${index + 1}</div>
                        <button type="button" onclick="removeDetailImage(\${index})" class="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <i class="fas fa-times text-xs"></i>
                        </button>
                        <div class="absolute bottom-2 left-2 right-2 flex gap-1">
                            \${index > 0 ? \`<button type="button" onclick="moveDetailImage(\${index}, -1)" class="flex-1 bg-white text-gray-700 text-xs py-1 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-arrow-left"></i></button>\` : ''}
                            \${index < detailImagesArray.length - 1 ? \`<button type="button" onclick="moveDetailImage(\${index}, 1)" class="flex-1 bg-white text-gray-700 text-xs py-1 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fas fa-arrow-right"></i></button>\` : ''}
                        </div>
                    </div>
                \`).join('');

                // Update hidden field
                document.getElementById('detailImagesUrls').value = JSON.stringify(detailImagesArray);
            }

            function removeDetailImage(index) {
                if (confirm('이 이미지를 삭제하시겠습니까?')) {
                    detailImagesArray.splice(index, 1);
                    updateDetailImagesPreview();
                }
            }

            function moveDetailImage(index, direction) {
                const newIndex = index + direction;
                if (newIndex < 0 || newIndex >= detailImagesArray.length) return;

                // Swap images
                [detailImagesArray[index], detailImagesArray[newIndex]] = 
                [detailImagesArray[newIndex], detailImagesArray[index]];
                
                updateDetailImagesPreview();
            }

            // Toggle trade price section and update price label based on sale type
            document.getElementById('saleType').addEventListener('change', function() {
                const tradePriceSection = document.getElementById('tradePriceSection');
                const priceLabelSelect = document.getElementById('priceLabel');
                
                // Toggle trade price section for unsold type
                if (this.value === 'unsold') {
                    tradePriceSection.style.display = 'block';
                } else {
                    tradePriceSection.style.display = 'none';
                }
                
                // Auto-update price label based on type
                if (this.value === 'rental') {
                    priceLabelSelect.value = '임대보증금';
                } else if (this.value === 'johab') {
                    priceLabelSelect.value = '조합가격';
                } else {
                    priceLabelSelect.value = '분양가격';
                }
            });

            // Open apartment search modal
            function openApartmentSearch() {
                const address = document.getElementById('fullAddress').value;
                
                if (!address) {
                    alert('주소를 먼저 입력해주세요.');
                    return;
                }
                
                // Create modal
                const modal = document.createElement('div');
                modal.id = 'apartmentSearchModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
                modal.onclick = (e) => {
                    if (e.target === modal) modal.remove();
                };
                
                modal.innerHTML = \`
                    <div class="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                        <div class="p-6">
                            <div class="flex items-center justify-between mb-4">
                                <h3 class="text-lg font-bold text-gray-900">아파트 검색</h3>
                                <button onclick="document.getElementById('apartmentSearchModal').remove()" class="text-gray-400 hover:text-gray-600">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                            
                            <div class="mb-4 space-y-3">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">검색할 주소</label>
                                    <input 
                                        type="text" 
                                        id="modalSearchAddress" 
                                        value="\${address}"
                                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="예) 서울특별시 강남구 또는 서초구"
                                    >
                                    <p class="text-xs text-gray-500 mt-1">💡 다른 지역을 검색하려면 주소를 직접 수정하세요</p>
                                </div>
                                <button onclick="searchApartmentsFromModal()" class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                                    <i class="fas fa-search mr-2"></i>아파트 검색
                                </button>
                            </div>
                            
                            <div id="apartmentSearchLoading" class="hidden text-center py-8">
                                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                                <p class="text-sm text-gray-600 mt-3">아파트 검색 중...</p>
                            </div>
                            
                            <div id="apartmentSearchResult" class="hidden">
                                <h4 class="text-sm font-bold text-gray-900 mb-3">검색 결과</h4>
                                <div id="apartmentList" class="space-y-2 max-h-96 overflow-y-auto"></div>
                            </div>
                            
                            <div id="apartmentSearchMessage" class="text-sm text-gray-500 mt-2"></div>
                        </div>
                    </div>
                \`;
                
                document.body.appendChild(modal);
            }
            
            // Search apartments from modal (using modal's address input)
            async function searchApartmentsFromModal() {
                const address = document.getElementById('modalSearchAddress').value;
                
                if (!address || address.trim() === '') {
                    alert('검색할 주소를 입력해주세요.');
                    return;
                }
                
                const loadingDiv = document.getElementById('apartmentSearchLoading');
                const resultDiv = document.getElementById('apartmentSearchResult');
                const messageDiv = document.getElementById('apartmentSearchMessage');
                
                loadingDiv.classList.remove('hidden');
                resultDiv.classList.add('hidden');
                messageDiv.classList.add('hidden');
                
                try {
                    const response = await axios.post('/api/admin/search-apartments', {
                        address: address
                    });
                    
                    if (response.data.success && response.data.apartments.length > 0) {
                        const apartments = response.data.apartments;
                        const listDiv = document.getElementById('apartmentList');
                        
                        listDiv.innerHTML = apartments.map(apt => \`
                            <button 
                                onclick="selectApartment('\${apt.name.replace(/'/g, "\\\\'")}', '\${apt.recentPrice}', '\${apt.recentDate}')"
                                class="w-full text-left px-4 py-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200 hover:border-blue-300"
                            >
                                <div class="flex items-center justify-between">
                                    <div class="flex-1">
                                        <div class="font-bold text-gray-900">\${apt.name}</div>
                                        <div class="text-xs text-gray-500 mt-1">거래 \${apt.count}건</div>
                                    </div>
                                    <div class="text-right ml-4">
                                        <div class="text-sm font-bold text-orange-600">\${apt.recentPrice}억</div>
                                        <div class="text-xs text-gray-500">\${apt.recentDate}</div>
                                    </div>
                                </div>
                            </button>
                        \`).join('');
                        
                        loadingDiv.classList.add('hidden');
                        resultDiv.classList.remove('hidden');
                        messageDiv.innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>' + apartments.length + '개의 아파트를 찾았습니다.</span>';
                        messageDiv.classList.remove('hidden');
                    } else {
                        loadingDiv.classList.add('hidden');
                        messageDiv.innerHTML = '<span class="text-yellow-600"><i class="fas fa-info-circle mr-1"></i>해당 지역에서 아파트를 찾을 수 없습니다.</span>';
                        messageDiv.classList.remove('hidden');
                    }
                } catch (error) {
                    console.error('아파트 검색 오류:', error);
                    loadingDiv.classList.add('hidden');
                    messageDiv.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>오류: ' + (error.response?.data?.error || error.message) + '</span>';
                    messageDiv.classList.remove('hidden');
                }
            }
            
            // Select apartment from search result
            async function selectApartment(name, price, date) {
                // Update UI fields
                document.getElementById('apartmentName').value = name;
                document.getElementById('recentTradePrice').value = price;
                document.getElementById('recentTradeDate').value = date;
                document.getElementById('apartmentSearchModal').remove();
                
                // Show trade price result section
                document.getElementById('tradePriceResult').classList.remove('hidden');
                document.getElementById('tradePriceMessage').innerHTML = '<span class="text-blue-600"><i class="fas fa-spinner fa-spin mr-1"></i>아파트 정보를 저장하는 중...</span>';
                
                // Auto-save apartment name to database
                const propertyId = document.getElementById('propertyId').value;
                if (propertyId) {
                    try {
                        // Get current property data
                        const response = await axios.get(\`/api/properties?type=all\`);
                        const property = response.data.find(p => p.id === parseInt(propertyId));
                        
                        if (!property) {
                            document.getElementById('tradePriceMessage').innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>매물 데이터를 찾을 수 없습니다.</span>';
                            return;
                        }
                        
                        // Update apartment_name field
                        const updateResponse = await axios.put(\`/api/properties/\${propertyId}\`, {
                            ...property,
                            apartment_name: name,
                            recent_trade_price: price,
                            recent_trade_date: date
                        });
                        
                        if (updateResponse.data.success) {
                            document.getElementById('tradePriceMessage').innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>아파트 정보가 자동 저장되었습니다!</span>';
                        } else {
                            document.getElementById('tradePriceMessage').innerHTML = '<span class="text-yellow-600"><i class="fas fa-exclamation-triangle mr-1"></i>저장에 실패했습니다. 수동으로 저장해주세요.</span>';
                        }
                    } catch (error) {
                        console.error('Auto-save error:', error);
                        document.getElementById('tradePriceMessage').innerHTML = '<span class="text-yellow-600"><i class="fas fa-exclamation-triangle mr-1"></i>자동 저장 실패. 수동으로 저장해주세요.</span>';
                    }
                } else {
                    // New property (not saved yet)
                    document.getElementById('tradePriceMessage').innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>아파트가 선택되었습니다. 전체 저장 시 함께 저장됩니다.</span>';
                }
            }

            // Fetch trade price from MOLIT API
            async function fetchTradePrice() {
                const address = document.getElementById('fullAddress').value;
                const exclusiveArea = document.getElementById('detail_exclusiveArea')?.value;
                const apartmentName = document.getElementById('apartmentName')?.value;
                
                if (!address) {
                    alert('주소를 먼저 입력해주세요.');
                    return;
                }

                const loadingDiv = document.getElementById('tradePriceLoading');
                const resultDiv = document.getElementById('tradePriceResult');
                const messageDiv = document.getElementById('tradePriceMessage');
                const btn = document.getElementById('fetchTradePriceBtn');

                // Prevent duplicate calls
                if (btn.disabled) {
                    return;
                }

                // Show loading
                loadingDiv.classList.remove('hidden');
                resultDiv.classList.add('hidden');
                messageDiv.classList.add('hidden');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 조회 중...';

                try {
                    const response = await axios.post('/api/admin/fetch-trade-price', {
                        address: address,
                        exclusiveArea: exclusiveArea ? parseFloat(exclusiveArea) : null,
                        apartmentName: apartmentName || null
                    });

                    if (response.data.success && response.data.data.found) {
                        const data = response.data.data;
                        
                        // Fill form fields
                        document.getElementById('recentTradePrice').value = data.recentTradePrice.toFixed(2);
                        document.getElementById('recentTradeDate').value = data.recentTradeDate;
                        
                        // Show result
                        resultDiv.classList.remove('hidden');
                        messageDiv.innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>실거래가 정보를 가져왔습니다. (총 ' + data.totalResults + '건 중 최신)</span>';
                        messageDiv.classList.remove('hidden');
                    } else {
                        const message = response.data.data?.message || '실거래가 정보를 찾을 수 없습니다.';
                        messageDiv.innerHTML = '<span class="text-yellow-600"><i class="fas fa-info-circle mr-1"></i>' + message + '</span>';
                        messageDiv.classList.remove('hidden');
                    }
                } catch (error) {
                    console.error('실거래가 조회 오류:', error);
                    messageDiv.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>오류: ' + (error.response?.data?.error || error.message) + '</span>';
                    messageDiv.classList.remove('hidden');
                } finally {
                    loadingDiv.classList.add('hidden');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> 실거래가 조회';
                }
            }

            // Logout function
            function logout() {
                if (confirm('로그아웃하시겠습니까?')) {
                    localStorage.removeItem('adminToken');
                    window.location.href = '/admin/login';
                }
            }

            // Handle PDF file selection
            function handlePdfSelect(event) {
                const file = event.target.files[0];
                if (file) {
                    if (file.type !== 'application/pdf') {
                        alert('PDF 파일만 업로드 가능합니다.');
                        return;
                    }
                    if (file.size > 10 * 1024 * 1024) {
                        alert('파일 크기는 10MB를 초과할 수 없습니다.');
                        return;
                    }
                    
                    selectedPdfFile = file;
                    document.getElementById('pdfFileName').textContent = file.name;
                    document.getElementById('parsePdfBtn').disabled = false;
                }
            }

            // Parse PDF with Claude
            async function parsePdf() {
                if (!selectedPdfFile) {
                    alert('PDF 파일을 먼저 선택해주세요.');
                    return;
                }

                const statusDiv = document.getElementById('pdfParsingStatus');
                const statusText = document.getElementById('parsingStatusText');
                const parseBtn = document.getElementById('parsePdfBtn');
                
                statusDiv.classList.remove('hidden');
                parseBtn.disabled = true;
                statusText.textContent = 'PDF 업로드 중...';

                try {
                    // Convert PDF to base64
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const base64 = e.target.result.split(',')[1];
                        
                        statusText.textContent = 'AI가 PDF 내용을 분석하고 있습니다... (최대 30초 소요)';
                        
                        try {
                            const response = await axios.post('/api/admin/parse-pdf', {
                                pdfBase64: base64,
                                filename: selectedPdfFile.name
                            }, {
                                timeout: 120000 // 120 seconds timeout (2 minutes)
                            });
                            
                            if (response.data.success) {
                                statusText.textContent = '✅ 파싱 완료! 폼을 채우고 있습니다...';
                                
                                // Fill form with parsed data
                                fillFormWithParsedData(response.data.data);
                                
                                setTimeout(() => {
                                    statusDiv.classList.add('hidden');
                                    alert('PDF 파싱이 완료되었습니다! 내용을 확인하고 필요시 수정해주세요.');
                                }, 1500);
                            } else {
                                throw new Error(response.data.error || 'Parsing failed');
                            }
                        } catch (error) {
                            console.error('PDF parsing error:', error);
                            statusDiv.classList.add('hidden');
                            alert('PDF 파싱 중 오류가 발생했습니다: ' + (error.response?.data?.error || error.message));
                        } finally {
                            parseBtn.disabled = false;
                        }
                    };
                    
                    reader.readAsDataURL(selectedPdfFile);
                } catch (error) {
                    console.error('File reading error:', error);
                    statusDiv.classList.add('hidden');
                    parseBtn.disabled = false;
                    alert('파일 읽기 중 오류가 발생했습니다.');
                }
            }

            // Fill form with parsed PDF data
            function fillFormWithParsedData(data) {
                // Main fields
                if (data.projectName) document.getElementById('projectName').value = data.projectName;
                if (data.saleType) document.getElementById('saleType').value = data.saleType;
                if (data.supplyType) document.getElementById('supplyType').value = data.supplyType;
                if (data.region) document.getElementById('region').value = data.region;
                if (data.fullAddress) document.getElementById('fullAddress').value = data.fullAddress;
                if (data.constructor) document.getElementById('constructor').value = data.constructor;
                if (data.mainImage) document.getElementById('mainImage').value = data.mainImage;
                if (data.hashtags) document.getElementById('hashtags').value = data.hashtags;
                if (data.price) document.getElementById('mainPrice').value = data.price;
                if (data.price_label) document.getElementById('priceLabel').value = data.price_label;
                
                // Target Audience Lines (김제지평선 구조)
                if (data.targetAudienceLines && Array.isArray(data.targetAudienceLines)) {
                    if (data.targetAudienceLines[0]) document.getElementById('targetAudience1').value = data.targetAudienceLines[0];
                    if (data.targetAudienceLines[1]) document.getElementById('targetAudience2').value = data.targetAudienceLines[1];
                    if (data.targetAudienceLines[2]) document.getElementById('targetAudience3').value = data.targetAudienceLines[2];
                }

                // Steps
                if (data.steps && Array.isArray(data.steps)) {
                    document.getElementById('stepsContainer').innerHTML = '';
                    data.steps.forEach(step => {
                        // 날짜 범위 파싱 (2025-01-01~2025-01-03 형식)
                        let startDate = '';
                        let endDate = '';
                        if (step.date) {
                            const dateParts = step.date.split('~');
                            startDate = dateParts[0].trim();
                            endDate = dateParts[1] ? dateParts[1].trim() : '';
                        }
                        
                        const div = document.createElement('div');
                        div.className = 'flex gap-2 items-center';
                        div.innerHTML = \`
                            <div class="flex-1 space-y-2">
                                <div class="flex gap-2">
                                    <input type="text" value="\${step.title || ''}" placeholder="스텝 제목 (예: 청약신청)" class="step-title flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div class="flex gap-2 items-center">
                                    <input type="date" value="\${startDate}" class="step-date-start flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="시작일">
                                    <span class="text-gray-500 text-sm">~</span>
                                    <input type="date" value="\${endDate}" class="step-date-end flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="종료일 (선택)">
                                </div>
                                <input type="text" value="\${step.details || ''}" placeholder="상세 설명 (예: 현장·인터넷·모바일)" class="step-details w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                            <button type="button" onclick="removeStep(this)" class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm self-start">
                                <i class="fas fa-times"></i>
                            </button>
                        \`;
                        document.getElementById('stepsContainer').appendChild(div);
                    });
                }

                // Supply info
                if (data.supplyInfo && Array.isArray(data.supplyInfo)) {
                    document.getElementById('supplyRowsContainer').innerHTML = '';
                    data.supplyInfo.forEach(row => {
                        const div = document.createElement('div');
                        div.className = 'flex gap-2 items-center p-3 bg-gray-50 rounded';
                        div.innerHTML = \`
                            <input type="text" value="\${row.type || ''}" class="supply-type px-2 py-1 border border-gray-300 rounded text-sm" style="width: 80px">
                            <input type="text" value="\${row.area || ''}" class="supply-area px-2 py-1 border border-gray-300 rounded text-sm" style="width: 100px">
                            <input type="text" value="\${row.households || ''}" class="supply-households px-2 py-1 border border-gray-300 rounded text-sm" style="width: 80px">
                            <input type="text" value="\${row.price || ''}" class="supply-price flex-1 px-2 py-1 border border-gray-300 rounded text-sm">
                            <button type="button" onclick="removeSupplyRow(this)" class="px-2 py-1 bg-red-500 text-white rounded text-sm">
                                <i class="fas fa-times"></i>
                            </button>
                        \`;
                        document.getElementById('supplyRowsContainer').appendChild(div);
                    });
                }

                // Detail fields
                const details = data.details || {};
                if (details.location) document.getElementById('detail_location').value = details.location;
                if (details.landArea) document.getElementById('detail_landArea').value = details.landArea;
                if (details.totalHouseholds) document.getElementById('detail_totalHouseholds').value = details.totalHouseholds;
                if (details.parking) document.getElementById('detail_parking').value = details.parking;
                if (details.parkingRatio) document.getElementById('detail_parkingRatio').value = details.parkingRatio;
                if (details.architect) document.getElementById('detail_architect').value = details.architect;
                if (details.constructor) document.getElementById('detail_constructor').value = details.constructor;
                if (details.website) document.getElementById('detail_website').value = details.website;
                
                if (details.targetTypes) document.getElementById('detail_targetTypes').value = details.targetTypes;
                if (details.incomeLimit) document.getElementById('detail_incomeLimit').value = details.incomeLimit;
                if (details.assetLimit) document.getElementById('detail_assetLimit').value = details.assetLimit;
                if (details.homelessPeriod) document.getElementById('detail_homelessPeriod').value = details.homelessPeriod;
                if (details.savingsAccount) document.getElementById('detail_savingsAccount').value = details.savingsAccount;
                
                if (details.selectionMethod) document.getElementById('detail_selectionMethod').value = details.selectionMethod;
                if (details.scoringCriteria) document.getElementById('detail_scoringCriteria').value = details.scoringCriteria;
                if (details.notices) document.getElementById('detail_notices').value = details.notices;
                
                if (details.applicationMethod) document.getElementById('detail_applicationMethod').value = details.applicationMethod;
                if (details.applicationUrl) document.getElementById('detail_applicationUrl').value = details.applicationUrl;
                if (details.requiredDocs) document.getElementById('detail_requiredDocs').value = details.requiredDocs;
                
                if (details.contactDept) document.getElementById('detail_contactDept').value = details.contactDept;
                if (details.contactPhone) document.getElementById('detail_contactPhone').value = details.contactPhone;
                if (details.contactEmail) document.getElementById('detail_contactEmail').value = details.contactEmail;
                if (details.contactAddress) document.getElementById('detail_contactAddress').value = details.contactAddress;
                
                if (details.features) document.getElementById('detail_features').value = details.features;
                if (details.surroundings) document.getElementById('detail_surroundings').value = details.surroundings;
                if (details.transportation) document.getElementById('detail_transportation').value = details.transportation;
                if (details.education) document.getElementById('detail_education').value = details.education;
            }

            // Tab switching
            function switchTab(tab) {
                currentTab = tab;
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('tab-active');
                });
                document.querySelector(\`[data-tab="\${tab}"]\`).classList.add('tab-active');
                
                // Hide all sections
                document.querySelectorAll('.section-content').forEach(section => {
                    section.classList.add('hidden');
                });
                
                // Show selected section
                if (tab === 'ad-inquiries') {
                    document.getElementById('ad-inquiriesSection').classList.remove('hidden');
                    loadAdInquiries();
                } else {
                    document.getElementById('propertiesSection').classList.remove('hidden');
                    loadProperties();
                }
            }

            // Toggle accordion section
            function toggleSection(sectionId) {
                const section = document.getElementById(sectionId);
                const button = section.previousElementSibling;
                const icon = button.querySelector('i');
                
                if (section.classList.contains('hidden')) {
                    section.classList.remove('hidden');
                    icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
                } else {
                    section.classList.add('hidden');
                    icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
                }
            }

            // Add step
            function addStep() {
                stepCounter++;
                const container = document.getElementById('stepsContainer');
                const div = document.createElement('div');
                div.className = 'flex gap-2 items-center';
                // 오늘 날짜를 YYYY-MM-DD 형식으로 가져오기
                const today = new Date().toISOString().split('T')[0];
                div.innerHTML = \`
                    <div class="flex-1 space-y-2">
                        <div class="flex gap-2">
                            <input type="text" placeholder="스텝 제목 (예: 청약신청)" class="step-title flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        </div>
                        <div class="flex gap-2 items-center">
                            <input type="date" class="step-date-start flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="시작일">
                            <span class="text-gray-500 text-sm">~</span>
                            <input type="date" class="step-date-end flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="종료일 (선택)">
                        </div>
                        <input type="text" placeholder="상세 설명 (예: 현장·인터넷·모바일)" class="step-details w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    </div>
                    <button type="button" onclick="removeStep(this)" class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm self-start">
                        <i class="fas fa-times"></i>
                    </button>
                \`;
                container.appendChild(div);
            }

            // Remove step
            function removeStep(btn) {
                btn.parentElement.remove();
            }

            // Add supply row
            function addSupplyRow() {
                supplyCounter++;
                const container = document.getElementById('supplyRowsContainer');
                const div = document.createElement('div');
                div.className = 'flex gap-2 items-center p-3 bg-gray-50 rounded';
                div.innerHTML = \`
                    <input type="text" placeholder="타입" class="supply-type px-2 py-1 border border-gray-300 rounded text-sm" style="width: 80px">
                    <input type="text" placeholder="면적" class="supply-area px-2 py-1 border border-gray-300 rounded text-sm" style="width: 100px">
                    <input type="text" placeholder="세대수" class="supply-households px-2 py-1 border border-gray-300 rounded text-sm" style="width: 80px">
                    <input type="text" placeholder="가격" class="supply-price flex-1 px-2 py-1 border border-gray-300 rounded text-sm">
                    <button type="button" onclick="removeSupplyRow(this)" class="px-2 py-1 bg-red-500 text-white rounded text-sm">
                        <i class="fas fa-times"></i>
                    </button>
                \`;
                container.appendChild(div);
            }

            // Remove supply row
            function removeSupplyRow(btn) {
                btn.parentElement.remove();
            }

            // Load properties
            async function loadProperties() {
                try {
                    let url;
                    if (currentTab === 'deleted') {
                        url = '/api/properties/deleted';
                        if (currentSearchQuery) {
                            url += \`?search=\${encodeURIComponent(currentSearchQuery)}\`;
                        }
                    } else if (currentTab === 'all') {
                        url = '/api/properties?includeAll=true';
                        if (currentSearchQuery) {
                            url += \`&search=\${encodeURIComponent(currentSearchQuery)}\`;
                        }
                    } else {
                        url = \`/api/properties?type=\${currentTab}&includeAll=true\`;
                        if (currentSearchQuery) {
                            url += \`&search=\${encodeURIComponent(currentSearchQuery)}\`;
                        }
                    }
                    const response = await axios.get(url);
                    const properties = response.data;
                    
                    // 검색 결과 카운트 업데이트 (전체 개수는 별도 API 호출 없이 현재 탭의 전체 개수로 표시)
                    updateSearchResultCount(properties.length, properties.length);
                    
                    const tbody = document.getElementById('propertiesTable');
                    
                    // 삭제된 매물 탭인 경우
                    if (currentTab === 'deleted') {
                        tbody.innerHTML = properties.map(p => \`
                            <tr class="hover:bg-gray-50 bg-red-50">
                                <td class="px-6 py-4 text-sm text-gray-900">\${p.id}</td>
                                <td class="px-6 py-4 text-sm font-medium text-gray-900">\${p.title}</td>
                                <td class="px-6 py-4 text-sm text-gray-600 hidden sm:table-cell">\${p.location || '-'}</td>
                                <td class="px-6 py-4 text-sm">
                                    <span class="px-2 py-1 text-xs font-medium rounded \${
                                        p.type === 'rental' ? 'bg-blue-100 text-blue-700' :
                                        p.type === 'unsold' ? 'bg-orange-100 text-orange-700' :
                                        'bg-green-100 text-green-700'
                                    }">\${
                                        p.type === 'rental' ? '임대' : p.type === 'unsold' ? '줍줍' : '청약'
                                    }</span>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600 hidden md:table-cell">\${p.deadline || '-'}</td>
                                <td class="px-6 py-4 text-sm text-gray-600 hidden lg:table-cell">\${
                                    p.deleted_at ? new Date(p.deleted_at).toLocaleDateString('ko-KR', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\\. /g, '-').replace('.', '') : '-'
                                }</td>
                                <td class="px-6 py-4 text-sm text-gray-600 hidden lg:table-cell">삭제됨</td>
                                <td class="px-6 py-4 text-sm">
                                    <button onclick="restoreProperty(\${p.id})" class="text-green-600 hover:text-green-800">
                                        <i class="fas fa-undo"></i> 복원
                                    </button>
                                </td>
                            </tr>
                        \`).join('');
                    } else {
                        // 일반 매물 탭
                        tbody.innerHTML = properties.map(p => \`
                            <tr class="hover:bg-gray-50 \${p.status === 'draft' ? 'bg-yellow-50' : ''}">
                                <td class="px-6 py-4 text-sm text-gray-900">\${p.id}</td>
                                <td class="px-6 py-4 text-sm font-medium text-gray-900">
                                    \${p.title}
                                    \${p.status === 'draft' ? '<span class="ml-2 px-2 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-700">임시저장</span>' : ''}
                                    \${p.source === 'applyhome' ? '<span class="ml-2 px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-700">청약홈</span>' : ''}
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600 hidden sm:table-cell">\${p.location || '-'}</td>
                                <td class="px-6 py-4 text-sm">
                                    <span class="px-2 py-1 text-xs font-medium rounded \${
                                        p.type === 'rental' ? 'bg-blue-100 text-blue-700' :
                                        p.type === 'unsold' ? 'bg-orange-100 text-orange-700' :
                                        'bg-green-100 text-green-700'
                                    }">\${
                                        p.type === 'rental' ? '임대' : p.type === 'unsold' ? '줍줍' : '청약'
                                    }</span>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-600 hidden md:table-cell">\${p.deadline || '-'}</td>
                                <td class="px-6 py-4 text-sm text-gray-600 hidden lg:table-cell">\${
                                    p.created_at ? new Date(p.created_at).toLocaleString('ko-KR', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).replace(/\\. /g, '-').replace('.', '').replace(', ', ' ') : '-'
                                }</td>
                                <td class="px-6 py-4 text-sm text-gray-600 hidden lg:table-cell">\${
                                    p.updated_at ? new Date(p.updated_at).toLocaleString('ko-KR', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).replace(/\\. /g, '-').replace('.', '').replace(', ', ' ') : '-'
                                }</td>
                                <td class="px-6 py-4 text-sm">
                                    <button onclick="editProperty(\${p.id})" class="text-blue-600 hover:text-blue-800 mr-3">
                                        <i class="fas fa-edit"></i> 수정
                                    </button>
                                    <button onclick="deleteProperty(\${p.id})" class="text-red-600 hover:text-red-800">
                                        <i class="fas fa-trash"></i> 삭제
                                    </button>
                                </td>
                            </tr>
                        \`).join('');
                    }
                } catch (error) {
                    console.error('Failed to load properties:', error);
                    alert('데이터 로드 실패');
                }
            }

            // Open add modal
            function openAddModal() {
                document.getElementById('modalTitle').textContent = '신규 등록';
                document.getElementById('propertyForm').reset();
                document.getElementById('propertyId').value = '';
                document.getElementById('stepsContainer').innerHTML = '';
                document.getElementById('supplyRowsContainer').innerHTML = '';
                stepCounter = 0;
                supplyCounter = 0;
                
                // Reset detail images
                detailImagesArray = [];
                updateDetailImagesPreview();
                
                document.getElementById('editModal').classList.add('active');
            }

            // Edit property
            async function editProperty(id) {
                try {
                    const response = await axios.get(\`/api/properties?type=all&includeAll=true\`);
                    const property = response.data.find(p => p.id === id);
                    
                    if (!property) {
                        alert('데이터를 찾을 수 없습니다');
                        return;
                    }

                    // Parse extended_data JSON
                    let extData = {};
                    try {
                        if (property.extended_data) {
                            extData = typeof property.extended_data === 'string' 
                                ? JSON.parse(property.extended_data) 
                                : property.extended_data;
                        }
                    } catch (e) {
                        console.warn('Failed to parse extended_data:', e);
                    }

                    // Safe value setter helper (정의를 먼저)
                    const safeSetValue = (id, value) => {
                        const el = document.getElementById(id);
                        if (el) el.value = value || '';
                    };
                    
                    document.getElementById('modalTitle').textContent = '수정';
                    document.getElementById('propertyId').value = property.id;
                    
                    // Main fields
                    safeSetValue('projectName', property.title);
                    safeSetValue('saleType', property.type || 'rental');
                    
                    // Show/hide trade price section based on type
                    const tradePriceSection = document.getElementById('tradePriceSection');
                    if (property.type === 'unsold' && tradePriceSection) {
                        tradePriceSection.style.display = 'block';
                        
                        // Fill trade price fields
                        safeSetValue('originalPrice', property.original_price);
                        safeSetValue('recentTradePrice', property.recent_trade_price);
                        safeSetValue('salePriceDate', property.sale_price_date);
                        safeSetValue('recentTradeDate', property.recent_trade_date);
                    } else if (tradePriceSection) {
                        tradePriceSection.style.display = 'none';
                    }
                    
                    safeSetValue('supplyType', extData.supplyType || property.announcement_type);
                    safeSetValue('region', property.location || property.region);
                    safeSetValue('fullAddress', property.full_address);
                    safeSetValue('constructor', property.constructor || property.builder);
                    safeSetValue('announcementDate', property.announcement_date);
                    safeSetValue('moveInDate', property.move_in_date);
                    safeSetValue('mainImage', extData.mainImage);
                    safeSetValue('mainPrice', property.price);
                    safeSetValue('priceLabel', property.price_label || '분양가격');
                    safeSetValue('supplyInfoImage', extData.supplyInfoImage);
                    
                    // Load supply info image preview if exists
                    const supplyInfoImagePreview = document.getElementById('supplyInfoImagePreview');
                    const supplyInfoImagePreviewArea = document.getElementById('supplyInfoImagePreviewArea');
                    if (extData.supplyInfoImage && supplyInfoImagePreview && supplyInfoImagePreviewArea) {
                        uploadedSupplyInfoImageUrl = extData.supplyInfoImage;
                        supplyInfoImagePreview.src = extData.supplyInfoImage;
                        supplyInfoImagePreviewArea.classList.remove('hidden');
                    } else if (supplyInfoImagePreview && supplyInfoImagePreviewArea) {
                        supplyInfoImagePreview.src = '';
                        supplyInfoImagePreviewArea.classList.add('hidden');
                    }
                    
                    // 해시태그 처리 - 배열/문자열/JSON 모두 처리
                    let hashtagsValue = '';
                    if (property.tags) {
                        if (Array.isArray(property.tags)) {
                            hashtagsValue = property.tags.join(', ');
                        } else if (typeof property.tags === 'string') {
                            try {
                                const parsed = JSON.parse(property.tags);
                                hashtagsValue = Array.isArray(parsed) ? parsed.join(', ') : property.tags;
                            } catch {
                                hashtagsValue = property.tags;
                            }
                        }
                    }
                    safeSetValue('hashtags', hashtagsValue);
                    
                    // Target audience lines
                    if (extData.targetAudienceLines && Array.isArray(extData.targetAudienceLines)) {
                        safeSetValue('targetAudience1', extData.targetAudienceLines[0]);
                        safeSetValue('targetAudience2', extData.targetAudienceLines[1]);
                        safeSetValue('targetAudience3', extData.targetAudienceLines[2]);
                    } else {
                        safeSetValue('targetAudience1', '');
                        safeSetValue('targetAudience2', '');
                        safeSetValue('targetAudience3', '');
                    }

                    // Steps
                    document.getElementById('stepsContainer').innerHTML = '';
                    stepCounter = 0;
                    
                    if (extData.steps && Array.isArray(extData.steps) && extData.steps.length > 0) {
                        // 기존 steps 데이터가 있는 경우
                        extData.steps.forEach(step => {
                            // 날짜 범위 파싱 (2025-01-01~2025-01-03 형식)
                            let startDate = '';
                            let endDate = '';
                            if (step.date) {
                                const dateParts = step.date.split('~');
                                startDate = dateParts[0].trim();
                                endDate = dateParts[1] ? dateParts[1].trim() : '';
                            }
                            
                            const div = document.createElement('div');
                            div.className = 'flex gap-2 items-center';
                            div.innerHTML = \`
                                <div class="flex-1 space-y-2">
                                    <div class="flex gap-2">
                                        <input type="text" value="\${step.title || ''}" placeholder="스텝 제목 (예: 청약신청)" class="step-title flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                    </div>
                                    <div class="flex gap-2 items-center">
                                        <input type="date" value="\${startDate}" class="step-date-start flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="시작일">
                                        <span class="text-gray-500 text-sm">~</span>
                                        <input type="date" value="\${endDate}" class="step-date-end flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="종료일 (선택)">
                                    </div>
                                    <input type="text" value="\${step.details || ''}" placeholder="상세 설명 (예: 현장·인터넷·모바일)" class="step-details w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <button type="button" onclick="removeStep(this)" class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm self-start">
                                    <i class="fas fa-times"></i>
                                </button>
                            \`;
                            document.getElementById('stepsContainer').appendChild(div);
                            stepCounter++;
                        });
                    } else if (property.source === 'applyhome' && property.deadline) {
                        // 크롤링 데이터인 경우 deadline을 기반으로 기본 step 생성
                        const div = document.createElement('div');
                        div.className = 'flex gap-2 items-center';
                        div.innerHTML = \`
                            <div class="flex-1 space-y-2">
                                <div class="flex gap-2">
                                    <input type="text" value="청약접수" placeholder="스텝 제목 (예: 청약신청)" class="step-title flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                </div>
                                <div class="flex gap-2 items-center">
                                    <input type="date" value="\${property.deadline}" class="step-date-start flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="시작일">
                                    <span class="text-gray-500 text-sm">~</span>
                                    <input type="date" value="\${property.deadline}" class="step-date-end flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="종료일 (선택)">
                                </div>
                                <input type="text" value="청약홈에서 크롤링된 데이터입니다. 상세 일정을 입력해주세요." placeholder="상세 설명 (예: 현장·인터넷·모바일)" class="step-details w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            </div>
                            <button type="button" onclick="removeStep(this)" class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm self-start">
                                <i class="fas fa-times"></i>
                            </button>
                        \`;
                        document.getElementById('stepsContainer').appendChild(div);
                        stepCounter++;
                    }

                    // Supply rows
                    document.getElementById('supplyRowsContainer').innerHTML = '';
                    if (extData.supplyInfo && Array.isArray(extData.supplyInfo)) {
                        extData.supplyInfo.forEach(row => {
                            const div = document.createElement('div');
                            div.className = 'flex gap-2 items-center p-3 bg-gray-50 rounded';
                            div.innerHTML = \`
                                <input type="text" value="\${row.type || ''}" class="supply-type px-2 py-1 border border-gray-300 rounded text-sm" style="width: 80px">
                                <input type="text" value="\${row.area || ''}" class="supply-area px-2 py-1 border border-gray-300 rounded text-sm" style="width: 100px">
                                <input type="text" value="\${row.households || ''}" class="supply-households px-2 py-1 border border-gray-300 rounded text-sm" style="width: 80px">
                                <input type="text" value="\${row.price || ''}" class="supply-price flex-1 px-2 py-1 border border-gray-300 rounded text-sm">
                                <button type="button" onclick="removeSupplyRow(this)" class="px-2 py-1 bg-red-500 text-white rounded text-sm">
                                    <i class="fas fa-times"></i>
                                </button>
                            \`;
                            document.getElementById('supplyRowsContainer').appendChild(div);
                        });
                    }

                    // Detail fields
                    const details = extData.details || {};
                    safeSetValue('detail_location', details.location);
                    safeSetValue('detail_landArea', details.landArea);
                    safeSetValue('detail_totalHouseholds', details.totalHouseholds);
                    safeSetValue('detail_parking', details.parking);
                    safeSetValue('detail_parkingRatio', details.parkingRatio);
                    safeSetValue('detail_architect', details.architect);
                    safeSetValue('detail_constructor', details.constructor);
                    safeSetValue('detail_website', details.website);
                    
                    safeSetValue('detail_targetTypes', details.targetTypes);
                    safeSetValue('detail_incomeLimit', details.incomeLimit);
                    safeSetValue('detail_assetLimit', details.assetLimit);
                    safeSetValue('detail_homelessPeriod', details.homelessPeriod);
                    safeSetValue('detail_savingsAccount', details.savingsAccount);
                    
                    safeSetValue('detail_selectionMethod', details.selectionMethod);
                    safeSetValue('detail_scoringCriteria', details.scoringCriteria);
                    safeSetValue('detail_notices', details.notices);
                    
                    safeSetValue('detail_applicationMethod', details.applicationMethod);
                    safeSetValue('detail_applicationUrl', details.applicationUrl);
                    safeSetValue('detail_requiredDocs', details.requiredDocs);
                    
                    safeSetValue('detail_contactDept', details.contactDept);
                    safeSetValue('detail_contactPhone', details.contactPhone);
                    safeSetValue('detail_contactEmail', details.contactEmail);
                    safeSetValue('detail_contactAddress', details.contactAddress);
                    
                    safeSetValue('detail_features', details.features);
                    safeSetValue('detail_surroundings', details.surroundings);
                    safeSetValue('detail_transportation', details.transportation);
                    safeSetValue('detail_education', details.education);
                    
                    // Auto-resize textareas after loading content
                    ['detail_features', 'detail_surroundings', 'detail_transportation', 'detail_education'].forEach(id => {
                        const textarea = document.getElementById(id);
                        if (textarea) autoResize(textarea);
                    });
                    
                    // Load detail images
                    if (details.detailImages && Array.isArray(details.detailImages)) {
                        detailImagesArray = details.detailImages;
                        updateDetailImagesPreview();
                    } else {
                        detailImagesArray = [];
                        updateDetailImagesPreview();
                    }

                    document.getElementById('editModal').classList.add('active');
                } catch (error) {
                    console.error('Failed to load property:', error);
                    alert('데이터 로드 실패');
                }
            }

            // Close edit modal
            function closeEditModal() {
                document.getElementById('editModal').classList.remove('active');
            }

            // Delete property
            function deleteProperty(id) {
                deleteTargetId = id;
                document.getElementById('deleteModal').classList.add('active');
            }

            // Close delete modal
            function closeDeleteModal() {
                document.getElementById('deleteModal').classList.remove('active');
                deleteTargetId = null;
            }

            // Confirm delete
            async function confirmDelete() {
                if (!deleteTargetId) return;
                
                try {
                    await axios.delete(\`/api/properties/\${deleteTargetId}\`);
                    alert('삭제되었습니다');
                    closeDeleteModal();
                    loadProperties();
                } catch (error) {
                    console.error('Failed to delete:', error);
                    alert('삭제 실패');
                }
            }

            // Restore deleted property
            async function restoreProperty(id) {
                if (!confirm('이 매물을 복원하시겠습니까?')) return;
                
                try {
                    await axios.post(\`/api/properties/\${id}/restore\`);
                    alert('복원되었습니다');
                    loadProperties();
                } catch (error) {
                    console.error('Failed to restore:', error);
                    alert('복원 실패');
                }
            }

            // Search properties
            // 검색어 저장 변수
            let currentSearchQuery = '';

            // Enter 키 입력 시 검색
            function handleSearchKeyup(event) {
                if (event.key === 'Enter') {
                    searchProperties();
                }
            }

            // 검색 실행
            async function searchProperties() {
                currentSearchQuery = document.getElementById('searchInput').value.trim();
                await loadProperties();
            }

            // 검색 초기화
            async function clearSearch() {
                currentSearchQuery = '';
                document.getElementById('searchInput').value = '';
                await loadProperties();
            }

            // 검색 결과 카운트 표시
            function updateSearchResultCount(count, total) {
                const countElement = document.getElementById('searchResultCount');
                const textElement = document.getElementById('searchResultText');
                
                if (currentSearchQuery) {
                    countElement.classList.remove('hidden');
                    textElement.textContent = \`검색결과: \${count}개 매물 (전체 \${total}개 중)\`;
                } else {
                    countElement.classList.add('hidden');
                }
            }

            // Collect form data
            function collectFormData(statusValue = 'active') {
                // Collect steps
                const stepElements = document.querySelectorAll('#stepsContainer > div');
                const steps = Array.from(stepElements).map(el => {
                    const startDate = el.querySelector('.step-date-start').value;
                    const endDate = el.querySelector('.step-date-end').value;
                    let dateStr = startDate;
                    if (endDate && endDate !== startDate) {
                        dateStr = startDate + '~' + endDate;
                    }
                    return {
                        date: dateStr,
                        title: el.querySelector('.step-title').value,
                        details: el.querySelector('.step-details').value
                    };
                }).filter(s => s.date || s.title);

                // Collect supply info
                const supplyElements = document.querySelectorAll('#supplyRowsContainer > div');
                const supplyInfo = Array.from(supplyElements).map(el => ({
                    type: el.querySelector('.supply-type').value,
                    area: el.querySelector('.supply-area').value,
                    households: el.querySelector('.supply-households').value,
                    price: el.querySelector('.supply-price').value
                })).filter(s => s.type || s.area);

                // Collect all detail fields (with null safety)
                const details = {
                    location: document.getElementById('detail_location')?.value || '',
                    landArea: document.getElementById('detail_landArea')?.value || '',
                    totalHouseholds: document.getElementById('detail_totalHouseholds')?.value || '',
                    parking: document.getElementById('detail_parking')?.value || '',
                    parkingRatio: document.getElementById('detail_parkingRatio')?.value || '',
                    architect: document.getElementById('detail_architect')?.value || '',
                    constructor: document.getElementById('detail_constructor')?.value || '',
                    website: document.getElementById('detail_website')?.value || '',
                    
                    targetTypes: document.getElementById('detail_targetTypes')?.value || '',
                    incomeLimit: document.getElementById('detail_incomeLimit')?.value || '',
                    assetLimit: document.getElementById('detail_assetLimit')?.value || '',
                    homelessPeriod: document.getElementById('detail_homelessPeriod')?.value || '',
                    savingsAccount: document.getElementById('detail_savingsAccount')?.value || '',
                    
                    selectionMethod: document.getElementById('detail_selectionMethod')?.value || '',
                    scoringCriteria: document.getElementById('detail_scoringCriteria')?.value || '',
                    notices: document.getElementById('detail_notices')?.value || '',
                    
                    applicationMethod: document.getElementById('detail_applicationMethod')?.value || '',
                    applicationUrl: document.getElementById('detail_applicationUrl')?.value || '',
                    requiredDocs: document.getElementById('detail_requiredDocs')?.value || '',
                    
                    contactDept: document.getElementById('detail_contactDept')?.value || '',
                    contactPhone: document.getElementById('detail_contactPhone')?.value || '',
                    contactEmail: document.getElementById('detail_contactEmail')?.value || '',
                    contactAddress: document.getElementById('detail_contactAddress')?.value || '',
                    
                    features: document.getElementById('detail_features')?.value || '',
                    surroundings: document.getElementById('detail_surroundings')?.value || '',
                    transportation: document.getElementById('detail_transportation')?.value || '',
                    education: document.getElementById('detail_education')?.value || '',
                    
                    detailImages: detailImagesArray || []
                };

                // Collect target audience lines (with null safety)
                const targetAudienceLines = [
                    document.getElementById('targetAudience1')?.value || '',
                    document.getElementById('targetAudience2')?.value || '',
                    document.getElementById('targetAudience3')?.value || ''
                ].filter(line => line.trim());

                // Extended data object
                const supplyInfoImageValue = document.getElementById('supplyInfoImage')?.value || uploadedSupplyInfoImageUrl || '';
                const extendedData = {
                    supplyType: document.getElementById('supplyType')?.value || '',
                    mainImage: document.getElementById('mainImage')?.value || '',
                    subscriptionStartDate: document.getElementById('subscriptionStartDate')?.value || '',
                    subscriptionEndDate: document.getElementById('subscriptionEndDate')?.value || '',
                    targetAudienceLines: targetAudienceLines,
                    steps: steps,
                    supplyInfo: supplyInfo,
                    supplyInfoImage: supplyInfoImageValue && supplyInfoImageValue !== 'undefined' ? supplyInfoImageValue : '',
                    details: details
                };

                const tags = (document.getElementById('hashtags')?.value || '').split(',').map(t => t.trim()).filter(t => t);
                
                // Calculate deadline: "청약접수", "접수", "신청"이 포함된 step의 마지막 날짜
                let calculatedDeadline = document.getElementById('announcementDate')?.value || new Date().toISOString().split('T')[0];
                
                // steps 배열에서 청약접수/접수/신청 관련 step 찾기
                if (steps.length > 0) {
                    // "청약접수", "접수", "신청" 키워드가 포함된 step 찾기
                    const applicationStep = steps.find(step => 
                        step.title && (
                            step.title.includes('청약접수') || 
                            step.title.includes('청약 접수') ||
                            step.title.includes('접수') || 
                            step.title.includes('신청')
                        )
                    );
                    
                    if (applicationStep && applicationStep.date) {
                        // date 형식: "2025-11-14" 또는 "2025-11-14~2025-11-17"
                        const dateParts = applicationStep.date.split('~');
                        
                        if (dateParts.length === 2) {
                            // 범위가 있으면 끝 날짜 사용 (예: 2025-11-17)
                            calculatedDeadline = dateParts[1].trim();
                        } else {
                            // 범위가 없으면 해당 날짜 사용
                            calculatedDeadline = dateParts[0].trim();
                        }
                    } else {
                        // 청약접수 관련 step이 없으면 마지막 step 사용
                        const lastStep = steps[steps.length - 1];
                        if (lastStep && lastStep.date) {
                            const dateParts = lastStep.date.split('~');
                            if (dateParts.length === 2) {
                                calculatedDeadline = dateParts[1].trim();
                            } else {
                                calculatedDeadline = dateParts[0].trim();
                            }
                        }
                    }
                }
                
                console.log('📅 Calculated deadline:', {
                    stepsCount: steps.length,
                    applicationStep: steps.find(s => s.title?.includes('청약접수') || s.title?.includes('접수') || s.title?.includes('신청')),
                    calculatedDeadline: calculatedDeadline
                });

                // Collect trade price data for unsold type
                const saleType = document.getElementById('saleType')?.value || 'rental';
                let tradePriceData = {};
                
                if (saleType === 'unsold') {
                    const recentTradePrice = document.getElementById('recentTradePrice')?.value;
                    const recentTradeDate = document.getElementById('recentTradeDate')?.value;
                    const originalPrice = document.getElementById('originalPrice')?.value;
                    const salePriceDate = document.getElementById('salePriceDate')?.value;
                    
                    if (recentTradePrice) tradePriceData.recent_trade_price = parseFloat(recentTradePrice);
                    if (recentTradeDate) tradePriceData.recent_trade_date = recentTradeDate;
                    if (originalPrice) tradePriceData.original_price = parseFloat(originalPrice);
                    if (salePriceDate) tradePriceData.sale_price_date = salePriceDate;
                }

                // Parse price to extract min/max values
                const priceText = document.getElementById('mainPrice')?.value || '';
                let salePriceMin = 0;
                let salePriceMax = 0;
                
                // Extract numbers from price string
                // Examples: "2억 6,127만 원 ~ 2억 7,795만 원" or "2억6,127만원 ~ 2억7795만원"
                const priceMatches = priceText.match(/([0-9]+)억\s*([0-9,]+)?만/g);
                if (priceMatches && priceMatches.length > 0) {
                    // First price (min)
                    const minMatch = priceMatches[0].match(/([0-9]+)억(?:\s*([0-9,]+)만)?/);
                    if (minMatch) {
                        const eok = parseFloat(minMatch[1]);
                        const man = minMatch[2] ? parseFloat(minMatch[2].replace(/,/g, '')) / 10000 : 0;
                        salePriceMin = eok + man;
                    }
                    
                    // Second price (max) if exists
                    if (priceMatches.length > 1) {
                        const maxMatch = priceMatches[1].match(/([0-9]+)억(?:\s*([0-9,]+)만)?/);
                        if (maxMatch) {
                            const eok = parseFloat(maxMatch[1]);
                            const man = maxMatch[2] ? parseFloat(maxMatch[2].replace(/,/g, '')) / 10000 : 0;
                            salePriceMax = eok + man;
                        }
                    } else {
                        salePriceMax = salePriceMin;
                    }
                }
                
                console.log('💰 Price parsing:', {
                    input: priceText,
                    matches: priceMatches,
                    salePriceMin: salePriceMin,
                    salePriceMax: salePriceMax
                });

                return {
                    title: document.getElementById('projectName')?.value || '',
                    type: saleType,
                    location: document.getElementById('region')?.value || '',
                    full_address: document.getElementById('fullAddress')?.value || '',
                    announcement_date: document.getElementById('announcementDate')?.value || '',
                    move_in_date: document.getElementById('moveInDate')?.value || '',
                    constructor: document.getElementById('constructor')?.value || '',
                    deadline: calculatedDeadline,
                    households: supplyInfo.reduce((sum, s) => sum + (parseInt(s.households) || 0), 0).toString() || '0',
                    area_type: supplyInfo.map(s => s.type).join(', ') || '',
                    price: priceText,
                    price_label: document.getElementById('priceLabel')?.value || '분양가격',
                    sale_price_min: salePriceMin,
                    sale_price_max: salePriceMax,
                    description: details.features || '',
                    tags: tags.join(', '),
                    extended_data: JSON.stringify(extendedData),
                    status: statusValue,
                    ...tradePriceData
                };
            }

            // Save as draft
            async function saveDraft() {
                const id = document.getElementById('propertyId')?.value;
                const data = collectFormData('draft'); // draft 상태로 저장

                try {
                    if (id && id !== '') {
                        // Update
                        const response = await axios.post(\`/api/properties/\${id}/update-parsed\`, { updates: data });
                        alert('임시저장되었습니다');
                    } else {
                        // Create
                        const response = await axios.post('/api/properties/create', data);
                        alert('임시저장되었습니다');
                    }
                    
                    closeEditModal();
                    loadProperties();
                } catch (error) {
                    console.error('❌ Failed to save draft:', error);
                    alert('임시저장 실패: ' + (error.response?.data?.error || error.message || '알 수 없는 오류'));
                }
            }

            // Form submit
            document.getElementById('propertyForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const id = document.getElementById('propertyId')?.value;
                const data = collectFormData('active'); // active 상태로 저장

                try {
                    console.log('💾 Saving data...', {
                        id: id,
                        idType: typeof id,
                        isEmpty: !id || id === '',
                        mode: (id && id !== '') ? 'UPDATE' : 'CREATE',
                        dataKeys: Object.keys(data),
                        dataSize: JSON.stringify(data).length,
                        extendedDataSize: data.extended_data ? data.extended_data.length : 0
                    });
                    
                    if (id && id !== '') {
                        // Update
                        const response = await axios.post(\`/api/properties/\${id}/update-parsed\`, { updates: data });
                        console.log('✅ Update success:', response.data);
                        alert('수정되었습니다');
                    } else {
                        // Create
                        const response = await axios.post('/api/properties/create', data);
                        console.log('✅ Create success:', response.data);
                        alert('등록되었습니다');
                    }
                    
                    closeEditModal();
                    loadProperties();
                } catch (error) {
                    console.error('❌ Failed to save:', error);
                    console.error('Error response:', error.response);
                    console.error('Error data:', error.response?.data);
                    console.error('Form data size:', JSON.stringify(data).length, 'bytes');
                    console.error('Extended data size:', data.extended_data ? data.extended_data.length : 0, 'bytes');
                    console.error('Data keys:', Object.keys(data));
                    
                    let errorMsg = '저장 실패: ';
                    if (error.response?.data?.error) {
                        errorMsg += error.response.data.error;
                    } else if (error.message) {
                        errorMsg += error.message;
                    } else {
                        errorMsg += '알 수 없는 오류';
                    }
                    
                    // Check if data is too large
                    const dataSize = JSON.stringify(data).length;
                    if (dataSize > 100000) {
                        const sizeKB = Math.round(dataSize/1024);
                        errorMsg += '\\n\\n데이터 크기가 너무 큽니다 (' + sizeKB + 'KB). 이미지 개수를 줄여주세요.';
                    }
                    
                    alert(errorMsg);
                }
            });

            // Initial load
            loadProperties();
        </script>
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
        <title>똑똑한한채 - 전국 부동산 분양 정보 | 줍줍분양 실시간 업데이트</title>
        
        <!-- SEO Meta Tags -->
        <meta name="description" content="전국 부동산 분양 정보를 한눈에! 줍줍분양(미분양), 조합원 모집, LH 청약, 신규분양 실시간 마감임박 정보. 똑똑한한채에서 확인하세요.">
        <meta name="keywords" content="부동산분양,줍줍분양,미분양,조합원모집,아파트분양,신규분양,분양정보,부동산,아파트,청약,분양가,부동산정보,LH분양,LH청약,공공분양,민간분양,마감임박,실시간분양,분양단지,아파트청약,똑똑한한채,한채365,청약홈,청약정보,청약일정,분양일정,분양가격,분양조건,입주시기,분양상담,청약상담">
        <meta name="author" content="똑똑한한채">
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
        <meta name="googlebot" content="index, follow">
        <meta name="bingbot" content="index, follow">
        <meta name="navbot" content="index, follow">
        <link rel="canonical" href="https://hanchae365.com/">
        
        <!-- Open Graph Meta Tags (Facebook, KakaoTalk) -->
        <meta property="og:type" content="website">
        <meta property="og:title" content="똑똑한한채 - 전국 부동산 분양 정보">
        <meta property="og:description" content="전국 부동산 분양 정보를 한눈에! 줍줍분양, LH청약, 조합원 모집, 실시간 마감임박 정보">
        <meta property="og:url" content="https://hanchae365.com/">
        <meta property="og:site_name" content="똑똑한한채">
        <meta property="og:locale" content="ko_KR">
        <meta property="og:image" content="https://hanchae365.com/og-image.jpg">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:image:alt" content="똑똑한한채 - 부동산 분양 정보">
        
        <!-- Twitter Card Meta Tags -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="똑똑한한채 - 전국 부동산 분양 정보">
        <meta name="twitter:description" content="전국 부동산 분양 정보를 한눈에! 줍줍분양, LH청약, 조합원 모집, 실시간 마감임박 정보">
        <meta name="twitter:image" content="https://hanchae365.com/og-image.jpg">
        
        <!-- Google Search Console Verification -->
        <meta name="google-site-verification" content="WtjDvsKm64cdN8DHVNo95tjn1iQf2EEodfquYzSCcdE" />
        
        <!-- Naver Search Advisor Verification -->
        <meta name="naver-site-verification" content="84b2705d1e232018634d573e94e05c4e910baa96" />
        
        <!-- Favicon -->
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
        
        <!-- Theme Color -->
        <meta name="theme-color" content="#3182F6">
        <meta name="msapplication-TileColor" content="#3182F6">
        
        <!-- Cache Control -->
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
        
        <!-- JSON-LD 구조화된 데이터 -->
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "똑똑한한채",
          "alternateName": "한채365",
          "url": "https://hanchae365.com/",
          "description": "전국 부동산 분양 정보를 한눈에! 줍줍분양, LH청약, 조합원 모집, 실시간 마감임박 정보",
          "inLanguage": "ko-KR",
          "publisher": {
            "@type": "Organization",
            "name": "똑똑한한채",
            "url": "https://hanchae365.com/"
          },
          "potentialAction": {
            "@type": "SearchAction",
            "target": "https://hanchae365.com/?search={search_term_string}",
            "query-input": "required name=search_term_string"
          }
        }
        </script>
        
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "RealEstateAgent",
          "name": "똑똑한한채",
          "url": "https://hanchae365.com/",
          "description": "전국 부동산 분양 정보 제공 플랫폼",
          "serviceType": "부동산 분양 정보",
          "areaServed": "대한민국"
        }
        </script>
        
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
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
          
          /* ===== 모바일 터치 개선 CSS ===== */
          
          /* 터치 타겟 최소 크기 보장 (44x44px) */
          .touch-target {
            min-width: 44px;
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          
          /* 터치 피드백 효과 */
          .touch-feedback {
            position: relative;
            overflow: hidden;
          }
          
          .touch-feedback::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.1);
            transform: translate(-50%, -50%);
            transition: width 0.6s, height 0.6s;
          }
          
          .touch-feedback:active::after {
            width: 200px;
            height: 200px;
          }
          
          /* 스크롤 영역 부드러운 터치 */
          .smooth-scroll {
            -webkit-overflow-scrolling: touch;
            scroll-behavior: smooth;
          }
          
          /* 버튼 터치 반응성 */
          button, a, .clickable {
            -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
            touch-action: manipulation;
          }
          
          /* 모바일에서 호버 효과 비활성화, 터치 효과로 대체 */
          @media (hover: none) {
            .toss-card:hover {
              transform: none;
            }
            
            .toss-card:active {
              transform: scale(0.98);
              transition: transform 0.1s;
            }
            
            .stat-card:hover {
              transform: none;
            }
            
            .stat-card:active {
              transform: scale(0.95);
              transition: transform 0.1s;
            }
          }
          
          /* 스와이프 제스처 지원 준비 */
          .swipeable {
            touch-action: pan-y;
            user-select: none;
          }
          
          /* 풀다운 새로고침 방지 (필요시) */
          body {
            overscroll-behavior-y: contain;
          }
          
          /* 입력 필드 줌 방지 (16px 이상) */
          input[type="text"],
          input[type="email"],
          input[type="password"],
          input[type="tel"],
          input[type="number"],
          textarea,
          select {
            font-size: 16px;
          }
          
          @media (min-width: 640px) {
            input[type="text"],
            input[type="email"],
            input[type="password"],
            input[type="tel"],
            input[type="number"],
            textarea,
            select {
              font-size: 14px;
            }
          }
          
          /* 모바일 모달 개선 */
          @media (max-width: 640px) {
            .modal {
              padding: 0.5rem;
            }
            
            .modal > div {
              max-height: 95vh;
              border-radius: 1rem;
            }
          }
          
          /* 가로 스크롤 영역 스크롤바 숨기기 (모바일) */
          .overflow-x-auto::-webkit-scrollbar {
            display: none;
          }
          
          .overflow-x-auto {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          
          /* 텍스트 선택 방지 (필요한 곳에만) */
          .no-select {
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
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
        
        <!-- Mobile Menu Sidebar -->
        <div id="mobileMenu" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden">
            <div class="fixed left-0 top-0 bottom-0 w-72 bg-white transform transition-transform duration-300 -translate-x-full" id="mobileMenuPanel">
                <!-- Menu Header -->
                <div class="flex items-center justify-between p-4 border-b">
                    <h2 class="text-lg font-bold text-gray-900">메뉴</h2>
                    <button onclick="closeMobileMenu()" class="text-gray-600 hover:text-gray-900 p-2">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                
                <!-- Menu Items -->
                <nav class="p-4 space-y-1">
                    <!-- 홈 버튼 제거 (로고 클릭으로 대체)
                    <a href="/" class="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        <i class="fas fa-home text-lg"></i>
                        <span>홈</span>
                    </a>
                    -->
                    <!-- 찜한 매물 (임시 비활성화)
                    <a href="#" class="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        <i class="fas fa-heart text-lg"></i>
                        <span>찜한 매물</span>
                    </a>
                    -->
                    <a href="#" class="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                        <i class="fas fa-bell text-lg"></i>
                        <span>알림 설정</span>
                    </a>
                </nav>
                
                <!-- Menu Footer -->
                <div class="absolute bottom-0 left-0 right-0 p-4 border-t bg-gray-50">
                    <p class="text-xs text-gray-500 text-center">똑똑한한채 v1.0</p>
                </div>
            </div>
        </div>

        <!-- Header -->
        <header class="bg-white sticky top-0 z-50 shadow-sm border-b border-gray-200">
            <div class="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5 sm:gap-3">
                        <!-- Hamburger Menu Button (Mobile Only) -->
                        <button onclick="openMobileMenu()" class="lg:hidden text-gray-600 hover:text-gray-900 px-2 py-2 rounded-lg hover:bg-gray-100 transition-all active:bg-gray-200">
                            <i class="fas fa-bars text-lg"></i>
                        </button>
                        <a href="/" class="text-lg sm:text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer">똑똑한한채</a>
                        <span class="text-xs text-gray-500 hidden md:inline">스마트 부동산 분양 정보</span>
                    </div>
                    
                    <!-- Desktop Navigation (홈/찜한매물 모두 비활성화 - 로고로 홈 이동) -->
                    <!--
                    <nav class="hidden lg:flex items-center gap-1">
                        <a href="/" class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">홈</a>
                        <a href="#" class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">찜한 매물</a>
                    </nav>
                    -->
                    
                    <div class="flex items-center gap-1 sm:gap-2">
                        <button class="text-gray-600 hover:text-gray-900 px-2 sm:px-3 py-2 rounded-lg hover:bg-gray-100 transition-all active:bg-gray-200">
                            <i class="fas fa-bell text-base sm:text-lg"></i>
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <!-- Stats Cards -->
        <section class="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3" id="statsContainer">
                <!-- Stats will be loaded here -->
            </div>
        </section>

        <!-- Main Content -->
        <main class="max-w-6xl mx-auto px-3 sm:px-4 pb-8 sm:pb-12">
            
            <!-- 검색창 -->
            <div class="bg-white px-4 py-3 mb-2">
                <div class="relative max-w-2xl mx-auto">
                    <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input 
                        type="text" 
                        id="mainSearchInput" 
                        placeholder="지역, 단지명으로 검색"
                        class="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        onkeyup="mainSearchOnType(event)"
                    >
                </div>
                
                <!-- 검색 결과 카운트 -->
                <div id="searchResultCount" class="text-center py-2 text-sm text-gray-600 hidden">
                    <span id="searchResultText"></span>
                </div>
            </div>

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

            <!-- Properties Grid (PC: 2줄, Mobile: 1줄) -->
            <div id="propertiesContainer" class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                <!-- Properties will be loaded here -->
            </div>

            <!-- Loading State -->
            <div id="loadingState" class="hidden text-center py-12">
                <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p class="text-gray-600 mt-4">로딩 중...</p>
            </div>
        </main>

        <!-- Event Banner -->
        <section class="max-w-6xl mx-auto px-3 sm:px-4 pb-8 sm:pb-12">
            <div class="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl sm:rounded-2xl shadow-xl p-5 sm:p-8 text-white fade-in">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h3 class="text-xl sm:text-2xl font-bold mb-2">🎉 1월 관심등록 이벤트</h3>
                        <p class="text-sm sm:text-base text-purple-100">시흥센트럴 푸르지오 관심등록하고 상품권 받아가세요!</p>
                    </div>
                    <button class="bg-white text-purple-600 px-6 sm:px-8 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-bold hover:bg-purple-50 transition-all text-sm sm:text-base w-full sm:w-auto">
                        자세히 보기
                    </button>
                </div>
            </div>
        </section>

        <!-- Notice Section -->
        <section class="max-w-6xl mx-auto px-3 sm:px-4 pb-8 sm:pb-12">
            <div class="bg-gray-100 border-l-4 border-gray-400 p-4 sm:p-6 rounded-lg sm:rounded-xl">
                <div class="flex items-start gap-2 sm:gap-3">
                    <i class="fas fa-info-circle text-gray-500 text-base sm:text-lg mt-1 flex-shrink-0"></i>
                    <div>
                        <h3 class="font-bold text-gray-900 mb-2 sm:mb-3 text-sm sm:text-base">공지사항</h3>
                        <ul class="text-xs sm:text-sm text-gray-600 space-y-1.5 sm:space-y-2">
                            <li>• 줍줍분양에 게시된 분양공고 내용을 외부에 등록 할 경우 반드시 출처에 "줍줍분양"를 표시하셔야 합니다.</li>
                            <li>• 분양공고 상세문의는 각 공고처(LH공사, SH공사)로 연락하세요.</li>
                            <li>• LH주택공사 고객센터: <strong>1600-1004</strong></li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- Footer -->
        <footer class="bg-gray-900 text-gray-400 py-8 sm:py-12">
            <div class="max-w-6xl mx-auto px-3 sm:px-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                    <div>
                        <h4 class="text-white font-bold mb-3 sm:mb-4 text-sm sm:text-base">똑똑한한채</h4>
                        <p class="text-xs sm:text-sm">실전 투자 정보를 한눈에</p>
                    </div>
                    <div>
                        <h4 class="text-white font-bold mb-3 sm:mb-4 text-sm sm:text-base">고객센터</h4>
                        <p class="text-xs sm:text-sm">0505-321-8000</p>
                        <p class="text-xs sm:text-sm">평일 09:00 - 18:00</p>
                    </div>
                    <div class="sm:col-span-2 lg:col-span-1">
                        <h4 class="text-white font-bold mb-3 sm:mb-4 text-sm sm:text-base">협력사</h4>
                        <p class="text-xs sm:text-sm">LH주택공사: 1600-1004</p>
                        <p class="text-xs sm:text-sm">SH공사: 1600-3456</p>
                    </div>
                </div>
                <div class="border-t border-gray-800 mt-6 sm:mt-8 pt-6 sm:pt-8 text-center text-xs sm:text-sm">
                    <!-- 광고 문의 버튼 -->
                    <div class="mb-6">
                        <button 
                            onclick="openAdInquiry()" 
                            class="px-6 py-3 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl transition-all active:scale-[0.98] shadow-lg"
                        >
                            광고 문의하기
                        </button>
                    </div>
                    
                    <div class="flex flex-wrap justify-center gap-4 sm:gap-6 mb-3 sm:mb-4">
                        <a href="/terms" class="hover:text-white transition-colors">이용약관</a>
                        <a href="/privacy" class="hover:text-white transition-colors">개인정보처리방침</a>
                        <a href="/admin" class="hover:text-white transition-colors text-gray-500">Admin</a>
                    </div>
                    <p class="text-xs sm:text-sm">© 2025 똑똑한한채. All rights reserved.</p>
                </div>
            </div>
        </footer>

        <!-- Detail Modal -->
        <div id="detailModal" class="modal fixed inset-0 bg-black bg-opacity-50 z-50 items-center justify-center p-2 sm:p-4">
            <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto relative">
                <button id="closeDetailModal" class="sticky top-2 sm:top-4 right-2 sm:right-4 float-right text-gray-400 hover:text-gray-600 text-2xl z-10 bg-white rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center shadow-lg">
                    <i class="fas fa-times"></i>
                </button>
                
                <div id="modalContent" class="p-4 sm:p-6 md:p-8">
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

        <!-- 광고 문의 모달 (토스 스타일) -->
        <div id="adInquiryModal" class="fixed inset-0 z-[100] hidden">
            <!-- 백드롭 -->
            <div class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300" onclick="closeAdInquiry()"></div>
            
            <!-- 입력 시트 -->
            <div id="adInquirySheet" class="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl transform translate-y-full transition-transform duration-300 ease-out">
                <div class="max-w-2xl mx-auto px-6 py-8">
                    <!-- 핸들 바 -->
                    <div class="flex justify-center mb-6">
                        <div class="w-10 h-1 bg-gray-300 rounded-full"></div>
                    </div>
                    
                    <!-- 제목 -->
                    <h2 class="text-2xl font-bold text-gray-900 mb-2">광고 문의를 남겨주세요</h2>
                    <p class="text-sm text-gray-500 mb-8">입력해주신 내용은 담당자에게 안전하게 전달돼요.</p>
                    
                    <!-- 입력 폼 -->
                    <form id="adInquiryForm" class="space-y-5">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">이름</label>
                            <input 
                                type="text" 
                                id="adName" 
                                required
                                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="이름을 입력해주세요"
                            >
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">연락처 또는 이메일</label>
                            <input 
                                type="text" 
                                id="adContact" 
                                required
                                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                placeholder="연락 가능한 정보를 입력해주세요"
                            >
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">문의 내용</label>
                            <textarea 
                                id="adMessage" 
                                required
                                rows="4"
                                class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                                placeholder="문의하실 내용을 자유롭게 작성해주세요"
                            ></textarea>
                        </div>
                        
                        <button 
                            type="submit"
                            class="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all active:scale-[0.98] disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            <span id="adSubmitText">보내기</span>
                            <span id="adSubmitLoading" class="hidden">
                                <i class="fas fa-spinner fa-spin mr-2"></i>빠르게 처리 중…
                            </span>
                        </button>
                    </form>
                </div>
            </div>
            
            <!-- 완료 시트 -->
            <div id="adSuccessSheet" class="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl transform translate-y-full transition-transform duration-300 ease-out hidden">
                <div class="max-w-2xl mx-auto px-6 py-12 text-center">
                    <!-- 핸들 바 -->
                    <div class="flex justify-center mb-6">
                        <div class="w-10 h-1 bg-gray-300 rounded-full"></div>
                    </div>
                    
                    <!-- 성공 아이콘 -->
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-check text-3xl text-blue-500"></i>
                    </div>
                    
                    <!-- 제목 -->
                    <h2 class="text-2xl font-bold text-gray-900 mb-3">문의가 접수됐어요</h2>
                    <p class="text-gray-600 mb-8">빠르게 회신드릴게요.</p>
                    
                    <button 
                        onclick="closeAdInquiry()"
                        class="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all active:scale-[0.98]"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js?v=${Date.now()}"></script>
        <script>
          // Mobile Menu Functions
          function openMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const panel = document.getElementById('mobileMenuPanel');
            menu.classList.remove('hidden');
            setTimeout(() => {
              panel.classList.remove('-translate-x-full');
            }, 10);
          }
          
          function closeMobileMenu() {
            const menu = document.getElementById('mobileMenu');
            const panel = document.getElementById('mobileMenuPanel');
            panel.classList.add('-translate-x-full');
            setTimeout(() => {
              menu.classList.add('hidden');
            }, 300);
          }
          
          // Close menu when clicking backdrop
          document.getElementById('mobileMenu')?.addEventListener('click', function(e) {
            if (e.target === this) {
              closeMobileMenu();
            }
          });

          // Filter state
          const filters = {
            region: 'all',
            type: 'all',
            household: 'all',
            area: 'all',
            sort: 'deadline'
          };
          
          // Search state
          let searchQuery = '';

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

          // Format price to Korean format (숫자 + 만원)
          function formatPrice(priceStr) {
            if (!priceStr || priceStr === '-') return '-';
            
            // 이미 올바른 형식이면 그대로 반환
            if (priceStr.match(/^\d+~\d+만원$/) || priceStr.match(/^\d+만원$/)) {
              return priceStr;
            }
            
            // "보증금", "분양가" 등 불필요한 단어 제거
            let cleaned = priceStr.replace(/(보증금|분양가|임대료|월세)/g, '').trim();
            
            // 쉼표 제거
            cleaned = cleaned.replace(/,/g, '');
            
            // 구간 처리 (물결 ~)
            if (cleaned.includes('~')) {
              const parts = cleaned.split('~');
              const min = formatSinglePrice(parts[0].trim());
              const max = formatSinglePrice(parts[1].trim());
              return \`\${min}~\${max}\`;
            }
            
            return formatSinglePrice(cleaned);
          }
          
          function formatSinglePrice(priceStr) {
            // 숫자만 추출
            const numStr = priceStr.replace(/[^0-9.]/g, '');
            const num = parseFloat(numStr);
            
            if (isNaN(num)) return priceStr;
            
            // 이미 올바른 형식이면 그대로 (예: 6억230만원)
            if (priceStr.match(/\d+억\d+만원/)) {
              return priceStr;
            }
            
            // 원 단위인 경우 (예: 602300000)
            if (num >= 100000000) {
              // 억 단위로 변환
              const eok = Math.floor(num / 100000000);
              const man = Math.round((num % 100000000) / 10000);
              
              if (man === 0) {
                return eok + '억';
              } else {
                return eok + '억' + man + '만원';
              }
            }
            
            // 만원 단위 (10000 이상 1억 미만)
            if (num >= 10000) {
              return Math.round(num / 10000) + '만원';
            }
            
            // 이미 만원 단위
            return Math.round(num) + '만원';
          }

          // Calculate subscription status (진행예정/진행중/마감)
          function calculateSubscriptionStatus(startDateStr, endDateStr) {
            if (!startDateStr && !endDateStr) {
              return { text: '진행중', class: 'bg-blue-500' };
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (startDateStr) {
              const startDate = new Date(startDateStr);
              startDate.setHours(0, 0, 0, 0);
              
              if (today < startDate) {
                return { text: '진행예정', class: 'bg-gray-500' };
              }
            }

            if (endDateStr) {
              const endDate = new Date(endDateStr);
              endDate.setHours(0, 0, 0, 0);
              
              if (today > endDate) {
                return { text: '마감', class: 'bg-gray-400' };
              }
            }

            return { text: '진행중', class: 'bg-blue-500' };
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
              
              // Parse extended_data
              let extendedData = {};
              try {
                if (property.extended_data && property.extended_data !== '{}') {
                  extendedData = JSON.parse(property.extended_data);
                }
              } catch (e) {
                console.warn('Failed to parse extended_data:', e);
              }
              
              // Debug: Log supplyInfoImage
              console.log('🖼️ Supply Info Image URL:', extendedData.supplyInfoImage);
              console.log('📊 Supply Info Data:', extendedData.supplyInfo);
              
              const dday = calculateDDay(property.deadline);
              const margin = formatMargin(property.expected_margin, property.margin_rate);
              
              const modalContent = document.getElementById('modalContent');
              modalContent.innerHTML = \`
                <div class="space-y-4 sm:space-y-6">
                  <!-- Header -->
                  <div>
                    <div class="flex items-start justify-between mb-2 gap-3">
                      <h2 class="text-xl sm:text-2xl font-bold text-gray-900 flex-1 min-w-0 break-words leading-tight">\${property.title}</h2>
                      \${property.badge ? \`
                        <span class="badge-\${property.badge.toLowerCase()} text-white text-xs font-bold px-3 py-1 rounded-full">
                          \${property.badge}
                        </span>
                      \` : ''}
                    </div>
                    
                    <div class="flex flex-col sm:flex-row sm:items-center gap-2 text-gray-600 mb-2">
                      <div class="flex items-center gap-2 min-w-0 flex-1">
                        <i class="fas fa-map-marker-alt text-primary flex-shrink-0"></i>
                        <span class="text-xs sm:text-sm truncate">\${property.full_address || property.location}</span>
                      </div>
                      <button onclick="openMap('\${property.full_address || property.location}', \${property.lat}, \${property.lng})" 
                              class="text-primary text-xs sm:text-sm font-medium hover:underline active:text-primary-dark flex items-center gap-1 whitespace-nowrap">
                        <i class="fas fa-map-marked-alt"></i><span>지도에서 보기</span>
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
                  <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                    <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">단지 정보</h3>
                    <div class="space-y-2 sm:space-y-3">
                      \${property.exclusive_area_range || property.area_type ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200 gap-3">
                          <span class="text-xs sm:text-sm text-gray-600 flex-shrink-0">전용면적</span>
                          <span class="text-xs sm:text-sm font-semibold text-gray-900 text-right">\${property.exclusive_area_range || property.area_type}</span>
                        </div>
                      \` : ''}
                      <div class="flex justify-between items-center py-2 border-b border-gray-200 gap-3">
                        <span class="text-xs sm:text-sm text-gray-600 flex-shrink-0">\${
                          property.title && (property.title.includes('행복주택') || property.title.includes('희망타운') || property.title.includes('임대'))
                            ? '임대보증금'
                            : '분양가'
                        }</span>
                        <span class="text-xs sm:text-sm font-semibold text-gray-900 text-right">\${
                          (() => {
                            // 메인 카드에 입력된 rental_deposit 값 사용 (extended_data.rentalDeposit)
                            if (property.title && (property.title.includes('행복주택') || property.title.includes('희망타운') || property.title.includes('임대'))) {
                              if (extendedData.rentalDeposit) return extendedData.rentalDeposit;
                              if (property.rental_deposit_range) return property.rental_deposit_range;
                              if (property.rental_deposit_min && property.rental_deposit_max) {
                                return property.rental_deposit_min.toFixed(1) + '억~' + property.rental_deposit_max.toFixed(1) + '억';
                              }
                            }
                            return property.price;
                          })()
                        }</span>
                      </div>
                      <div class="flex justify-between items-center py-2 border-b border-gray-200 gap-3">
                        <span class="text-xs sm:text-sm text-gray-600 flex-shrink-0">모집세대</span>
                        <span class="text-xs sm:text-sm font-semibold text-gray-900 text-right">\${
                          property.households 
                            ? (property.households.toString().includes('세대') ? property.households : property.households + '세대')
                            : '-'
                        }</span>
                      </div>
                      \${property.move_in_date ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">입주예정</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.move_in_date}</span>
                        </div>
                      \` : ''}
                      \${property.parking || extendedData.details?.parking ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">주차</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.parking || extendedData.details.parking}</span>
                        </div>
                      \` : ''}
                      \${property.heating ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">난방</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.heating}</span>
                        </div>
                      \` : ''}
                      \${property.builder || extendedData.details?.constructor ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">시공사</span>
                          <span class="text-sm font-semibold text-gray-900">\${property.builder || extendedData.details.constructor}</span>
                        </div>
                      \` : ''}
                      \${extendedData.details?.landArea ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">대지면적</span>
                          <span class="text-sm font-semibold text-gray-900">\${extendedData.details.landArea}</span>
                        </div>
                      \` : ''}
                      \${extendedData.details?.totalHouseholds ? \`
                        <div class="flex justify-between items-center py-2 border-b border-gray-200">
                          <span class="text-sm text-gray-600">총 세대수</span>
                          <span class="text-sm font-semibold text-gray-900">\${extendedData.details.totalHouseholds}</span>
                        </div>
                      \` : ''}
                      \${extendedData.details?.website ? \`
                        <div class="flex justify-between items-center py-2">
                          <span class="text-sm text-gray-600">홈페이지</span>
                          <a href="\${extendedData.details.website}" target="_blank" class="text-sm font-semibold text-primary hover:underline">\${extendedData.details.website}</a>
                        </div>
                      \` : ''}
                    </div>
                  </div>
                  
                  
                  <!-- Supply Info from extended_data -->
                  \${extendedData.supplyInfo && extendedData.supplyInfo.length > 0 ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">공급 세대 정보</h3>
                      \${extendedData.supplyInfoImage && extendedData.supplyInfoImage !== 'undefined' && extendedData.supplyInfoImage !== '' ? \`
                        <div class="mb-4 bg-white p-2 rounded-lg border border-gray-200">
                          <img 
                            src="\${extendedData.supplyInfoImage}" 
                            alt="공급 세대 정보" 
                            class="w-full rounded-lg shadow-sm" 
                            style="max-height: 600px; object-fit: contain;"
                            onerror="console.error('Image load failed:', this.src); this.parentElement.innerHTML='<p class=\\'text-sm text-red-600 p-2\\'>이미지를 불러올 수 없습니다.</p>';"
                            onload="console.log('✅ Image loaded successfully:', this.src)">
                        </div>
                      \` : ''}
                      <div class="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                        <table class="w-full text-xs sm:text-sm">
                          <thead class="bg-white">
                            <tr>
                              <th class="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border-b whitespace-nowrap">타입</th>
                              <th class="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border-b whitespace-nowrap">면적</th>
                              <th class="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border-b whitespace-nowrap">세대수</th>
                              <th class="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border-b whitespace-nowrap">가격</th>
                            </tr>
                          </thead>
                          <tbody>
                            \${extendedData.supplyInfo.map(info => \`
                              <tr class="border-b border-gray-200">
                                <td class="px-2 sm:px-3 py-2 text-gray-900 whitespace-nowrap">\${
                                  info.type ? (info.type.includes('m') || info.type.includes('㎡') || info.type.includes('평') ? info.type : info.type + 'm²') : '-'
                                }</td>
                                <td class="px-2 sm:px-3 py-2 text-gray-900 whitespace-nowrap">\${
                                  info.area ? (info.area.includes('평') || info.area.includes('m') || info.area.includes('㎡') ? info.area : info.area + '평') : '-'
                                }</td>
                                <td class="px-2 sm:px-3 py-2 text-gray-900 whitespace-nowrap">\${
                                  info.households ? (info.households.includes('세대') ? info.households : info.households + '세대') : '-'
                                }</td>
                                <td class="px-2 sm:px-3 py-2 text-gray-900">\${info.price || '-'}</td>
                              </tr>
                            \`).join('')}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  \` : ''}

                  <!-- Selection Timeline (6 Steps) - Only show if extendedData.steps doesn't exist -->
                  \${(!extendedData.steps || extendedData.steps.length === 0) && (property.application_start_date || property.no_rank_date || property.first_rank_date || property.special_subscription_date) ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">📅 입주자 선정 일정</h3>
                      
                      <!-- Timeline Container -->
                      <div class="relative">
                        <!-- Vertical Line -->
                        <div class="absolute left-4 top-3 bottom-3 w-0.5 bg-gray-300"></div>
                        
                        <!-- Timeline Steps -->
                        <div class="space-y-3 sm:space-y-4">
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
                                <div class="relative pl-8 sm:pl-10">
                                  <div class="absolute left-2 sm:left-2.5 top-1.5 w-2.5 sm:w-3 h-2.5 sm:h-3 \${dotColor} rounded-full border-2 border-white"></div>
                                  <div class="bg-white rounded-lg p-2.5 sm:p-3 shadow-sm">
                                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-1">
                                      <div class="flex-1 min-w-0">
                                        <span class="text-xs \${labelColor}">STEP \${s.step}</span>
                                        <h4 class="text-xs sm:text-sm \${titleColor} break-words">\${s.title}</h4>
                                        \${s.subtitle ? \`<p class="text-xs text-gray-500 mt-0.5 sm:mt-1">\${s.subtitle}</p>\` : ''}
                                      </div>
                                      <span class="text-xs \${dateColor} whitespace-nowrap flex-shrink-0">\${s.dateDisplay}</span>
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
                  
                  <!-- Steps from extended_data (입주자 선정 일정으로 표시) -->
                  \${extendedData.steps && extendedData.steps.length > 0 ? \`
                  <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                    <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">📅 입주자 선정 일정</h3>
                      <!-- Timeline Container -->
                      <div class="relative pl-8">
                        <!-- Vertical Line (centered) -->
                        <div class="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-300"></div>
                        
                        <!-- Timeline Steps -->
                        <div class="space-y-4">
                          \${(() => {
                            // 오늘 날짜 기준 가장 가까운 미래 스텝 찾기
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            let activeStepIdx = -1;
                            for (let i = 0; i < extendedData.steps.length; i++) {
                              const step = extendedData.steps[i];
                              try {
                                const stepDateStr = step.date.split('~')[0].split(' ')[0].trim();
                                const stepDate = new Date(stepDateStr);
                                stepDate.setHours(0, 0, 0, 0);
                                
                                if (stepDate >= today) {
                                  activeStepIdx = i;
                                  break;
                                }
                              } catch (e) {
                                // 날짜 파싱 실패
                              }
                            }
                            
                            // 모든 날짜가 지났으면 마지막 스텝 활성화
                            if (activeStepIdx === -1 && extendedData.steps.length > 0) {
                              activeStepIdx = extendedData.steps.length - 1;
                            }
                            
                            return extendedData.steps.map((step, idx) => {
                              const isActive = idx === activeStepIdx;
                              return \`
                                <div class="relative">
                                  <!-- Timeline Dot (centered on line) -->
                                  <div class="absolute -left-7.5 top-1/2 -translate-y-1/2 w-3 h-3 \${isActive ? 'bg-blue-500' : 'bg-gray-400'} rounded-full border-2 border-white z-10" style="left: -1.625rem;"></div>
                                  
                                  <!-- White Box Container -->
                                  <div class="bg-white rounded-lg p-3 shadow-sm">
                                    <div class="text-xs \${isActive ? 'text-gray-600' : 'text-gray-400'} mb-1">STEP \${idx + 1}</div>
                                    <h4 class="text-sm font-bold \${isActive ? 'text-blue-600' : 'text-gray-400'} mb-1 break-words">\${step.title}</h4>
                                    \${step.details ? \`<p class="text-xs \${isActive ? 'text-gray-600' : 'text-gray-400'} mb-2">\${step.details}</p>\` : ''}
                                    <p class="text-xs \${isActive ? 'text-gray-900' : 'text-gray-400'} font-medium">\${step.date}</p>
                                  </div>
                                </div>
                              \`;
                            }).join('');
                          })()}
                        </div>
                      </div>
                    </div>
                  \` : ''}

                  <!-- Toggle Button for Additional Details -->
                  <div class="text-center my-5 sm:my-6">
                    <button id="toggleDetailsBtn" onclick="toggleAdditionalDetails()" 
                            class="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900 active:text-gray-900 transition-colors group p-2 -m-2">
                      <span id="toggleDetailsText" class="text-xs sm:text-sm font-medium border-b-2 border-gray-700 pb-0.5">더보기</span>
                      <i id="toggleDetailsIcon" class="fas fa-chevron-down text-xs group-hover:translate-y-0.5 group-active:translate-y-0.5 transition-transform"></i>
                    </button>
                  </div>

                  <!-- Additional Details Container (Hidden by default) -->
                  <div id="additionalDetailsContainer" class="space-y-4" style="display: none;">
                  
                  <!-- 신청자격 (targetAudienceLines가 있는 경우) -->
                  \${extendedData.targetAudienceLines && extendedData.targetAudienceLines.length > 0 ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">🎯 신청자격</h3>
                      <div class="text-xs sm:text-sm text-gray-700 space-y-1.5 sm:space-y-2 leading-relaxed">
                        \${extendedData.targetAudienceLines.map(line => \`
                          <p>• \${line}</p>
                        \`).join('')}
                      </div>
                    </div>
                  \` : ''}
                  
                  <!-- 신청자격 from extended_data (기존 방식 - targetAudienceLines 없을 때만) -->
                  \${!extendedData.targetAudienceLines && (extendedData.details?.targetTypes || extendedData.details?.incomeLimit || extendedData.details?.assetLimit) ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">🎯 신청자격</h3>
                      <div class="text-xs sm:text-sm text-gray-700 space-y-1.5 sm:space-y-2">
                        \${extendedData.details.targetTypes ? \`<p><strong>대상:</strong> \${extendedData.details.targetTypes}</p>\` : ''}
                        \${extendedData.details.incomeLimit ? \`<p><strong>소득기준:</strong> \${extendedData.details.incomeLimit}</p>\` : ''}
                        \${extendedData.details.assetLimit ? \`<p><strong>자산기준:</strong> \${extendedData.details.assetLimit}</p>\` : ''}
                        \${extendedData.details.homelessPeriod ? \`<p><strong>무주택기간:</strong> \${extendedData.details.homelessPeriod}</p>\` : ''}
                        \${extendedData.details.savingsAccount ? \`<p><strong>청약통장:</strong> \${extendedData.details.savingsAccount}</p>\` : ''}
                      </div>
                    </div>
                  \` : ''}
                  
                  <!-- 입주자 선정 기준 -->
                  \${extendedData.details?.selectionMethod || extendedData.details?.scoringCriteria ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">📊 입주자 선정 기준</h3>
                      <div class="text-xs sm:text-sm text-gray-700 space-y-1.5 sm:space-y-2">
                        \${extendedData.details.selectionMethod ? \`<p><strong>선정방식:</strong> \${extendedData.details.selectionMethod}</p>\` : ''}
                        \${extendedData.details.scoringCriteria ? \`<p><strong>가점항목:</strong> \${extendedData.details.scoringCriteria}</p>\` : ''}
                      </div>
                    </div>
                  \` : ''}
                  
                  <!-- 주의사항 -->
                  \${extendedData.details?.notices ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">⚠️ 주의사항</h3>
                      <div class="text-xs sm:text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">\${extendedData.details.notices}</div>
                    </div>
                  \` : ''}
                  
                  <!-- 온라인 신청 -->
                  \${extendedData.details?.applicationMethod || extendedData.details?.applicationUrl ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">💻 온라인 신청</h3>
                      <div class="text-xs sm:text-sm text-gray-700 space-y-1.5 sm:space-y-2 break-words">
                        \${extendedData.details.applicationMethod ? \`<p><strong>신청방법:</strong> \${extendedData.details.applicationMethod}</p>\` : ''}
                        \${extendedData.details.applicationUrl ? \`<p><strong>신청URL:</strong> <a href="\${extendedData.details.applicationUrl}" target="_blank" class="text-primary hover:underline">\${extendedData.details.applicationUrl}</a></p>\` : ''}
                        \${extendedData.details.requiredDocs ? \`<p><strong>필요서류:</strong> \${extendedData.details.requiredDocs}</p>\` : ''}
                      </div>
                    </div>
                  \` : ''}
                  
                  <!-- 문의처 -->
                  \${extendedData.details?.contactDept || extendedData.details?.contactPhone ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">📞 문의처</h3>
                      <div class="text-xs sm:text-sm text-gray-700 space-y-1.5 sm:space-y-2">
                        \${extendedData.details.contactDept ? \`<p><strong>담당부서:</strong> \${extendedData.details.contactDept}</p>\` : ''}
                        \${extendedData.details.contactPhone ? \`<p><strong>전화번호:</strong> <a href="tel:\${extendedData.details.contactPhone}" class="text-primary hover:underline">\${extendedData.details.contactPhone}</a></p>\` : ''}
                        \${extendedData.details.contactEmail ? \`<p><strong>이메일:</strong> <a href="mailto:\${extendedData.details.contactEmail}" class="text-primary hover:underline">\${extendedData.details.contactEmail}</a></p>\` : ''}
                        \${extendedData.details.contactAddress ? \`<p><strong>주소:</strong> \${extendedData.details.contactAddress}</p>\` : ''}
                      </div>
                    </div>
                  \` : ''}
                  
                  <!-- 단지 개요 -->
                  \${extendedData.details?.features || extendedData.details?.surroundings || extendedData.details?.transportation ? \`
                    <div class="bg-gray-50 rounded-lg p-4 sm:p-5">
                      <h3 class="text-sm sm:text-base font-bold text-gray-900 mb-3 sm:mb-4">🏢 단지 개요</h3>
                      <div class="text-xs sm:text-sm text-gray-700 space-y-1.5 sm:space-y-2">
                        \${extendedData.details.features ? \`<p><strong>단지특징:</strong> \${extendedData.details.features}</p>\` : ''}
                        \${extendedData.details.surroundings ? \`<p><strong>주변환경:</strong> \${extendedData.details.surroundings}</p>\` : ''}
                        \${extendedData.details.transportation ? \`<p><strong>교통여건:</strong> \${extendedData.details.transportation}</p>\` : ''}
                        \${extendedData.details.education ? \`<p><strong>교육시설:</strong> \${extendedData.details.education}</p>\` : ''}
                      </div>
                    </div>
                  \` : ''}
                  
                  </div>
                  <!-- End of Additional Details Container -->

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
                        const rentalMatch = desc.match(/💰 임대 조건([\\s\\S]*?)(?=🎯|📐|🏡|✨|📞|⚠️|💻|🔗|👍|$)/);
                        if (rentalMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">💰 임대 조건</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${rentalMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 신청자격 추출
                        const qualificationMatch = desc.match(/🎯 신청자격([\\s\\S]*?)(?=📐|🏡|⚠️|💻|📞|🔗|👍|$)/);
                        if (qualificationMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">🎯 신청자격</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${qualificationMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 공급 세대수 및 면적 추출
                        const supplyMatch = desc.match(/📐 공급 세대수 및 면적([\\s\\S]*?)(?=🏡|⚠️|💻|📞|🔗|👍|$)/);
                        if (supplyMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">📐 공급 세대수 및 면적</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${supplyMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 입주자 선정 기준 추출
                        const selectionMatch = desc.match(/🏡 입주자 선정 기준([\\s\\S]*?)(?=⚠️|💻|📞|🔗|👍|$)/);
                        if (selectionMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">🏡 입주자 선정 기준</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${selectionMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 주의사항 추출
                        const warningMatch = desc.match(/⚠️ 주의사항([\\s\\S]*?)(?=💻|📞|🔗|👍|$)/);
                        if (warningMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">⚠️ 주의사항</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${warningMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 온라인 신청 추출
                        const onlineMatch = desc.match(/💻 온라인 신청([\\s\\S]*?)(?=📞|🔗|👍|$)/);
                        if (onlineMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">💻 온라인 신청</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${onlineMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 문의처 추출
                        const contactMatch = desc.match(/📞 문의처([\\s\\S]*?)(?=🔗|👍|$)/);
                        if (contactMatch) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">📞 문의처</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${contactMatch[1].trim()}</div>
                            </div>
                          \`);
                        }
                        
                        // 특정 섹션이 없으면 전체 description을 그대로 표시 (PDF 파싱된 내용)
                        if (sections.length === 0) {
                          sections.push(\`
                            <div class="bg-gray-50 rounded-lg p-5">
                              <h3 class="text-base font-bold text-gray-900 mb-3">상세 정보</h3>
                              <div class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">\${desc}</div>
                            </div>
                          \`);
                        }
                        
                        return sections.join('');
                      })()}
                    </div>
                  \` : ''}

                  <!-- Brochure/Pamphlet Section (Images) -->
                  \${property.brochure_images ? \`
                    <div class="bg-gray-50 rounded-lg p-5">
                      <h3 class="text-base font-bold text-gray-900 mb-4 flex items-center">
                        <i class="fas fa-book-open text-primary mr-2"></i>
                        단지 팸플릿
                      </h3>
                      <div class="space-y-4">
                        <p class="text-sm text-gray-600">단지의 상세 정보를 확인하세요 (총 \${JSON.parse(property.brochure_images).length}페이지)</p>
                        \${(() => {
                          try {
                            const images = JSON.parse(property.brochure_images);
                            return images.map((imgUrl, index) => \`
                              <div class="bg-white rounded-lg p-2 shadow-sm">
                                <div class="text-xs text-gray-500 mb-2 font-medium">페이지 \${index + 1}</div>
                                <img src="\${imgUrl}" 
                                     alt="팸플릿 페이지 \${index + 1}"
                                     class="w-full rounded border border-gray-200"
                                     loading="lazy" />
                              </div>
                            \`).join('');
                          } catch (e) {
                            return '<p class="text-sm text-gray-500">이미지를 불러올 수 없습니다.</p>';
                          }
                        })()}
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
                  
                  <!-- Detail Images Gallery -->
                  \${extendedData.details && extendedData.details.detailImages && extendedData.details.detailImages.length > 0 ? \`
                    <div class="mt-4 sm:mt-6">
                      <div class="grid grid-cols-1 gap-0">
                        \${extendedData.details.detailImages.map((imageUrl, index) => \`
                          <div class="relative">
                            <img 
                              src="\${imageUrl}" 
                              alt="상세 이미지 \${index + 1}" 
                              class="w-full h-auto cursor-pointer"
                              onclick="openImageModal('\${imageUrl}')"
                              onerror="this.parentElement.style.display='none'"
                            >
                          </div>
                        \`).join('')}
                      </div>
                    </div>
                  \` : ''}
                </div>
              \`;
              
              document.getElementById('detailModal').classList.add('show');
              
              // 줍줍분양인 경우 실거래가 자동 로드
              if (property.type === 'unsold' && property.apartment_name) {
                loadTradePriceAuto(property.id, property.apartment_name, property.full_address || property.location);
              }
            } catch (error) {
              console.error('Failed to load detail:', error);
              alert('상세 정보를 불러올 수 없습니다.');
            }
          }

          // Open image in modal (for detail images)
          function openImageModal(imageUrl) {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-90 z-[9999] flex items-center justify-center p-4';
            modal.onclick = (e) => {
              if (e.target === modal) modal.remove();
            };
            
            modal.innerHTML = \`
              <div class="relative max-w-6xl w-full">
                <button onclick="this.closest('.fixed').remove()" class="absolute top-4 right-4 bg-white text-gray-900 rounded-full w-10 h-10 flex items-center justify-center hover:bg-gray-100 z-10">
                  <i class="fas fa-times"></i>
                </button>
                <img src="\${imageUrl}" alt="상세 이미지" class="w-full h-auto rounded-lg shadow-2xl">
              </div>
            \`;
            
            document.body.appendChild(modal);
          }

          // Toggle additional details
          function toggleAdditionalDetails() {
            const container = document.getElementById('additionalDetailsContainer');
            const btn = document.getElementById('toggleDetailsBtn');
            const text = document.getElementById('toggleDetailsText');
            const icon = document.getElementById('toggleDetailsIcon');
            
            if (container.style.display === 'none') {
              container.style.display = 'block';
              text.textContent = '접기';
              icon.classList.remove('fa-chevron-down');
              icon.classList.add('fa-chevron-up');
            } else {
              container.style.display = 'none';
              text.textContent = '더보기';
              icon.classList.remove('fa-chevron-up');
              icon.classList.add('fa-chevron-down');
            }
          }

          // Fetch trade price for detail modal
          async function fetchDetailTradePrice(propertyId, address) {
            const loadingDiv = document.getElementById('detailTradePriceLoading');
            const resultDiv = document.getElementById('detailTradePriceResult');
            const messageDiv = document.getElementById('detailTradePriceMessage');
            const btn = document.getElementById('fetchDetailTradePriceBtn');

            if (!address) {
              messageDiv.innerHTML = '<span class="text-yellow-600"><i class="fas fa-exclamation-circle mr-1"></i>주소 정보가 없습니다.</span>';
              return;
            }

            // Show loading
            loadingDiv.classList.remove('hidden');
            resultDiv.classList.add('hidden');
            messageDiv.classList.add('hidden');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 조회 중...';

            try {
              const response = await axios.post('/api/admin/fetch-trade-price', {
                address: address,
                exclusiveArea: null
              });

              if (response.data.success && response.data.data.found) {
                const data = response.data.data;
                
                // Update summary stats
                document.getElementById('detailAptName').textContent = data.apartmentName;
                document.getElementById('detailArea').textContent = data.exclusiveArea.toFixed(2) + '㎡';
                document.getElementById('detailPrice').textContent = data.recentTradePrice.toFixed(1) + '억원';
                document.getElementById('detailTotal').textContent = data.totalResults + '건';
                
                // Update table with 10 transactions
                const tableBody = document.getElementById('detailTradeTableBody');
                tableBody.innerHTML = data.trades.map(trade => \`
                  <tr class="hover:bg-gray-50">
                    <td class="px-2 py-2 text-gray-900 whitespace-nowrap">\${trade.dealYear}.\${String(trade.dealMonth).padStart(2, '0')}.\${String(trade.dealDay).padStart(2, '0')}</td>
                    <td class="px-2 py-2 text-gray-900 text-xs">\${trade.apartmentName}</td>
                    <td class="px-2 py-2 text-gray-900 whitespace-nowrap">\${trade.exclusiveArea.toFixed(2)}㎡</td>
                    <td class="px-2 py-2 text-orange-600 font-semibold whitespace-nowrap">\${trade.dealAmount.toFixed(1)}억</td>
                    <td class="px-2 py-2 text-gray-900 whitespace-nowrap">\${trade.floor || '-'}층</td>
                    <td class="px-2 py-2 text-gray-900 text-xs">\${trade.location}</td>
                  </tr>
                \`).join('');
                
                // Show result
                resultDiv.classList.remove('hidden');
                messageDiv.innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>실거래가 정보를 가져왔습니다. (총 ' + data.totalResults + '건)</span>';
                messageDiv.classList.remove('hidden');
              } else {
                const message = response.data.data?.message || '실거래가 정보를 찾을 수 없습니다.';
                messageDiv.innerHTML = '<span class="text-yellow-600"><i class="fas fa-info-circle mr-1"></i>' + message + '</span>';
                messageDiv.classList.remove('hidden');
              }
            } catch (error) {
              console.error('실거래가 조회 오류:', error);
              messageDiv.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>오류: ' + (error.response?.data?.error || error.message) + '</span>';
              messageDiv.classList.remove('hidden');
            } finally {
              loadingDiv.classList.add('hidden');
              btn.disabled = false;
              btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> 실거래가 조회';
            }
          }

          // Auto load trade price data with graph (for detail modal)
          async function loadTradePriceAuto(propertyId, apartmentName, address) {
            const loadingDiv = document.getElementById(\`detailTradePriceLoading-\${propertyId}\`);
            const resultDiv = document.getElementById(\`detailTradePriceResult-\${propertyId}\`);
            const messageDiv = document.getElementById(\`detailTradePriceMessage-\${propertyId}\`);

            if (!address || !apartmentName) {
              loadingDiv.classList.add('hidden');
              messageDiv.innerHTML = '<span class="text-yellow-600"><i class="fas fa-exclamation-circle mr-1"></i>주소 또는 아파트명 정보가 없습니다.</span>';
              messageDiv.classList.remove('hidden');
              return;
            }

            try {
              const response = await axios.post('/api/admin/fetch-trade-price', {
                address: address,
                apartmentName: apartmentName,
                exclusiveArea: null
              });

              if (response.data.success && response.data.data.found) {
                const data = response.data.data;
                
                // Calculate statistics
                const prices = data.trades.map(t => t.dealAmount);
                const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(1);
                const maxPrice = Math.max(...prices).toFixed(1);
                const minPrice = Math.min(...prices).toFixed(1);
                
                // Update summary stats
                document.getElementById(\`detailAvgPrice-\${propertyId}\`).textContent = avgPrice + '억원';
                document.getElementById(\`detailMaxPrice-\${propertyId}\`).textContent = maxPrice + '억원';
                document.getElementById(\`detailMinPrice-\${propertyId}\`).textContent = minPrice + '억원';
                document.getElementById(\`detailTotal-\${propertyId}\`).textContent = data.totalResults + '건';
                
                // Prepare chart data (group by month)
                const monthlyData = {};
                data.trades.forEach(trade => {
                  const month = \`\${trade.dealYear}.\${String(trade.dealMonth).padStart(2, '0')}\`;
                  if (!monthlyData[month]) {
                    monthlyData[month] = [];
                  }
                  monthlyData[month].push(trade.dealAmount);
                });
                
                // Calculate average for each month
                const chartLabels = Object.keys(monthlyData).sort().slice(-12); // Last 12 months
                const chartData = chartLabels.map(month => {
                  const values = monthlyData[month];
                  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
                });
                
                // Create chart
                const ctx = document.getElementById(\`tradePriceChart-\${propertyId}\`);
                new Chart(ctx, {
                  type: 'line',
                  data: {
                    labels: chartLabels,
                    datasets: [{
                      label: '평균 실거래가 (억원)',
                      data: chartData,
                      borderColor: '#F97316',
                      backgroundColor: 'rgba(249, 115, 22, 0.1)',
                      tension: 0.4,
                      fill: true
                    }]
                  },
                  options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                      legend: {
                        display: true,
                        position: 'top'
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y + '억원';
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: false,
                        ticks: {
                          callback: function(value) {
                            return value + '억';
                          }
                        }
                      }
                    }
                  }
                });
                
                // Show result
                loadingDiv.classList.add('hidden');
                resultDiv.classList.remove('hidden');
                messageDiv.innerHTML = '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>실거래가 정보를 가져왔습니다. (총 ' + data.totalResults + '건)</span>';
                messageDiv.classList.remove('hidden');
              } else {
                loadingDiv.classList.add('hidden');
                const message = response.data.data?.message || '실거래가 정보를 찾을 수 없습니다.';
                messageDiv.innerHTML = '<span class="text-yellow-600"><i class="fas fa-info-circle mr-1"></i>' + message + '</span>';
                messageDiv.classList.remove('hidden');
              }
            } catch (error) {
              console.error('실거래가 조회 오류:', error);
              loadingDiv.classList.add('hidden');
              messageDiv.innerHTML = '<span class="text-red-600"><i class="fas fa-exclamation-circle mr-1"></i>오류: ' + (error.response?.data?.error || error.message) + '</span>';
              messageDiv.classList.remove('hidden');
            }
          }

          // Load statistics
          async function loadStats() {
            try {
              const response = await axios.get('/api/stats');
              const stats = response.data;
              
              const statsContainer = document.getElementById('statsContainer');
              statsContainer.innerHTML = \`
                <div class="stat-card bg-white rounded-xl shadow-sm p-4 sm:p-5 active cursor-pointer hover:shadow-md transition-shadow" data-type="all">
                  <div class="text-xs text-gray-500 mb-1.5 sm:mb-2 font-medium">전체분양</div>
                  <div class="text-2xl sm:text-3xl font-bold text-gray-900">\${stats.rental + stats.general + stats.unsold}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-4 sm:p-5 cursor-pointer hover:shadow-md transition-shadow" data-type="rental">
                  <div class="text-xs text-gray-500 mb-1.5 sm:mb-2 font-medium">임대분양</div>
                  <div class="text-2xl sm:text-3xl font-bold text-gray-900">\${stats.rental || 0}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-4 sm:p-5 cursor-pointer hover:shadow-md transition-shadow" data-type="general">
                  <div class="text-xs text-gray-500 mb-1.5 sm:mb-2 font-medium">청약분양</div>
                  <div class="text-2xl sm:text-3xl font-bold text-gray-900">\${stats.general || 0}</div>
                </div>
                <div class="stat-card bg-white rounded-xl shadow-sm p-4 sm:p-5 cursor-pointer hover:shadow-md transition-shadow" data-type="unsold">
                  <div class="text-xs text-gray-500 mb-1.5 sm:mb-2 font-medium">줍줍분양</div>
                  <div class="text-2xl sm:text-3xl font-bold text-gray-900">\${stats.unsold}</div>
                </div>
              \`;
              
              // Add click handlers
              document.querySelectorAll('.stat-card').forEach(card => {
                const type = card.dataset.type;
                card.addEventListener('click', () => {
                  filters.type = type;
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
            console.time('⏱️ Total Load Time');
            const container = document.getElementById('propertiesContainer');
            container.classList.add('loading');
            
            try {
              console.time('⏱️ API Request');
              const params = new URLSearchParams(filters);
              console.log('🔍 Filters:', filters);
              console.log('🔍 URL:', '/api/properties?' + params);
              const response = await axios.get(\`/api/properties?\${params}\`);
              let properties = response.data;
              console.timeEnd('⏱️ API Request');
              console.log('✅ Loaded', properties.length, 'properties (before filtering)');
              console.log('📋 Properties:', properties.map(p => ({ id: p.id, title: p.title, type: p.type, deadline: p.deadline })));
              
              // 카드 자동 제거: deadline + 1일이 지난 매물 필터링
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              properties = properties.filter(property => {
                if (!property.deadline) return true; // deadline이 없으면 표시
                
                try {
                  const deadline = new Date(property.deadline);
                  deadline.setHours(0, 0, 0, 0);
                  
                  // deadline + 1일 계산
                  const deadlinePlusOne = new Date(deadline);
                  deadlinePlusOne.setDate(deadlinePlusOne.getDate() + 1);
                  
                  // today가 deadline + 1일 이전이면 표시
                  const shouldShow = today < deadlinePlusOne;
                  
                  if (!shouldShow) {
                    console.log('🗑️ Hiding expired property:', property.title, 'deadline:', property.deadline);
                  }
                  
                  return shouldShow;
                } catch (e) {
                  console.warn('Failed to parse deadline for property', property.id, ':', e);
                  return true; // 파싱 실패하면 표시
                }
              });
              
              console.log('✅ Showing', properties.length, 'properties (after filtering expired)');
              
              // 검색 결과 카운트 업데이트
              const countDiv = document.getElementById('searchResultCount');
              const countText = document.getElementById('searchResultText');
              if (searchQuery) {
                countDiv.classList.remove('hidden');
                countText.textContent = '"' + searchQuery + '" 검색 결과: ' + properties.length + '건';
              } else {
                countDiv.classList.add('hidden');
              }
              
              if (properties.length === 0) {
                container.innerHTML = \`
                  <div class="col-span-2 text-center py-12">
                    <div class="text-6xl mb-4">🏠</div>
                    <h3 class="text-xl font-bold text-gray-900 mb-2">분양 정보가 없습니다</h3>
                    <p class="text-gray-600">필터를 조정해보세요!</p>
                  </div>
                \`;
              } else {
                console.time('⏱️ Render Cards');
                container.innerHTML = properties.map(property => {
                  // Parse extended_data
                  let extendedData = {};
                  try {
                    if (property.extended_data && property.extended_data !== '{}') {
                      extendedData = JSON.parse(property.extended_data);
                    }
                  } catch (e) {
                    console.warn('Failed to parse extended_data for property', property.id);
                  }

                  // Calculate subscription status if dates are available
                  const subscriptionStatus = extendedData.subscriptionStartDate || extendedData.subscriptionEndDate
                    ? calculateSubscriptionStatus(extendedData.subscriptionStartDate, extendedData.subscriptionEndDate)
                    : null;

                  // D-Day 계산: steps가 있으면 가장 가까운 미래 스텝, 없으면 deadline 사용
                  const ddayDate = (() => {
                    if (extendedData.steps && Array.isArray(extendedData.steps) && extendedData.steps.length > 0) {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      
                      // 미래 스텝들만 필터링
                      const futureSteps = extendedData.steps
                        .filter(step => {
                          if (!step.date) return false;
                          const stepDate = new Date(step.date);
                          stepDate.setHours(0, 0, 0, 0);
                          return stepDate >= today;
                        })
                        .sort((a, b) => new Date(a.date) - new Date(b.date));
                      
                      // 가장 가까운 미래 스텝 날짜 반환
                      if (futureSteps.length > 0) {
                        return futureSteps[0].date;
                      }
                    }
                    // steps가 없거나 미래 스텝이 없으면 deadline 사용
                    return property.deadline;
                  })();
                  
                  const dday = calculateDDay(ddayDate);
                  const margin = formatMargin(property.expected_margin, property.margin_rate);
                  
                  return \`
                  <div class="toss-card bg-white rounded-xl shadow-sm overflow-hidden fade-in">
                    <div class="p-4 sm:p-5">
                      <!-- Header -->
                      <div class="flex items-start justify-between mb-2.5 sm:mb-3 gap-2">
                        <div class="flex-1 min-w-0">
                          <div class="flex flex-col gap-1.5 mb-1.5 sm:mb-2">
                            <div class="flex items-center gap-2">
                              \${(() => {
                                const typeConfig = {
                                  'rental': { label: '임대분양', color: 'bg-blue-100 text-blue-700' },
                                  'general': { label: '청약분양', color: 'bg-green-100 text-green-700' },
                                  'unsold': { label: '줍줍분양', color: 'bg-orange-100 text-orange-700' },
                                  'johab': { label: '조합원모집', color: 'bg-purple-100 text-purple-700' }
                                };
                                const config = typeConfig[property.type] || { label: property.type, color: 'bg-gray-100 text-gray-700' };
                                return \`<span class="\${config.color} text-xs font-bold px-2 py-1 rounded whitespace-nowrap">\${config.label}</span>\`;
                              })()}
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-gray-900 break-words leading-tight">\${property.title}</h3>
                          </div>
                        </div>
                        <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                          \${subscriptionStatus ? \`
                            <span class="\${subscriptionStatus.class} text-white text-xs font-bold px-2 py-0.5 sm:py-1 rounded whitespace-nowrap">
                              \${subscriptionStatus.text}
                            </span>
                          \` : ''}
                          <span class="\${dday.class} text-white text-xs font-bold px-2 py-0.5 sm:py-1 rounded whitespace-nowrap">
                            \${dday.text}
                          </span>
                        </div>
                      </div>
                      
                      <!-- Location & Map Button -->
                      <div class="mb-2.5 sm:mb-3 flex items-center justify-between gap-2">
                        <div class="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 min-w-0 flex-1">
                          <i class="fas fa-map-marker-alt text-gray-400 text-xs flex-shrink-0"></i>
                          <span class="truncate">\${property.full_address || property.location}</span>
                        </div>
                        \${property.full_address && property.lat && property.lng ? \`
                          <button onclick="openMap('\${property.full_address.replace(/'/g, "\\\\'")}', \${property.lat}, \${property.lng})" 
                                  class="text-gray-400 hover:text-gray-600 active:text-gray-800 transition-colors p-2 -m-2 flex-shrink-0"
                                  title="지도에서 보기">
                            <i class="fas fa-map-marker-alt text-base sm:text-lg"></i>
                          </button>
                        \` : ''}
                      </div>
                      
                      <!-- Key Info Grid -->
                      <div class="bg-gray-50 rounded-lg p-3 sm:p-4 mb-2.5 sm:mb-3">
                        <div class="grid grid-cols-2 gap-2.5 sm:gap-3 text-xs sm:text-sm">
                          <div>
                            <div class="text-xs text-gray-500 mb-1">\${
                              (() => {
                                switch(property.type) {
                                  case 'unsold': return '📅 줍줍일';
                                  case 'general': return '📅 청약일';
                                  case 'rental': return '📅 신청마감';
                                  case 'johab': return '📅 모집마감';
                                  default: return '📅 마감일';
                                }
                              })()
                            }</div>
                            <div class="font-bold text-gray-900">\${ddayDate}</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">\${
                              (() => {
                                switch(property.type) {
                                  case 'unsold': return '🏠 매물세대';
                                  case 'general': return '🏠 분양세대';
                                  case 'rental': return '🏠 모집세대';
                                  case 'johab': return '🏠 조합세대';
                                  default: return '🏠 세대수';
                                }
                              })()
                            }</div>
                            <div class="font-bold text-gray-900">\${(() => {
                              const households = property.household_count || property.households || '-';
                              if (households === '-') return households;
                              // 이미 '세대'가 붙어있으면 그대로, 없으면 추가
                              return households.toString().includes('세대') ? households : households + '세대';
                            })()}</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">📏 전용면적</div>
                            <div class="font-bold text-gray-900">\${(() => {
                              const area = property.area_type || property.exclusive_area_range || property.exclusive_area || '-';
                              if (area === '-') return area;
                              // 이미 '㎡'가 붙어있으면 그대로, 없으면 추가
                              return area.toString().includes('㎡') ? area : area + '㎡';
                            })()}</div>
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
                                const area = property.supply_area || '-';
                                if (area === '-') return area;
                                // 이미 '㎡'가 붙어있으면 그대로, 없으면 추가
                                return area.toString().includes('㎡') ? area : area + '㎡';
                              })()
                            }</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">\${
                              property.price_label 
                                ? '💰 ' + property.price_label
                                : (property.type === 'rental'
                                  ? '💰 임대보증금'
                                  : property.type === 'johab'
                                  ? '💰 조합가격'
                                  : '💰 분양가격')
                            }</div>
                            <div class="font-bold text-gray-900 text-xs">\${property.price || '-'}</div>
                          </div>
                          <div>
                            <div class="text-xs text-gray-500 mb-1">🏗️ 시공사</div>
                            <div class="font-bold text-gray-900 text-xs">\${property.builder || extendedData.details?.constructor || '-'}</div>
                          </div>
                        </div>
                      </div>

                      <!-- Investment Info for Unsold (줍줍분양) -->
                      \${property.type === 'unsold' && property.original_price > 0 && property.recent_trade_price > 0 ? \`
                        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-3">
                          <div class="text-xs font-bold text-gray-700 mb-3">
                            <i class="fas fa-chart-line text-blue-600 mr-2"></i>
                            투자 정보
                          </div>
                          \${true ? \`
                            <div class="grid grid-cols-3 gap-3 text-center">
                              <div>
                                <div class="text-xs text-gray-500 mb-1">원분양가</div>
                                <div class="font-bold text-gray-900 text-sm">\${(() => {
                                  const price = property.original_price;
                                  return price % 1 === 0 ? price.toFixed(0) : price.toFixed(2).replace(/\\.?0+$/, '');
                                })()}억</div>
                                <div class="text-xs text-gray-400 mt-1">(\${property.sale_price_date ? (() => {
                                  const dateStr = String(property.sale_price_date).replace('-', '.');
                                  const parts = dateStr.split('.');
                                  const year = parts[0];
                                  const month = parts[1] ? String(parseInt(parts[1])).padStart(2, '0') : '01';
                                  return year + '. ' + month;
                                })() : '-'})</div>
                              </div>
                              <div>
                                <div class="text-xs text-gray-500 mb-1">최근 실거래가</div>
                                <div class="font-bold text-blue-600 text-sm">\${(() => {
                                  const price = property.recent_trade_price;
                                  return price % 1 === 0 ? price.toFixed(0) : price.toFixed(2).replace(/\\.?0+$/, '');
                                })()}억</div>
                                <div class="text-xs text-gray-400 mt-1">(\${property.recent_trade_date ? (() => {
                                  const dateStr = String(property.recent_trade_date).replace('-', '.');
                                  const parts = dateStr.split('.');
                                  const year = parts[0];
                                  const month = parts[1] ? String(parseInt(parts[1])).padStart(2, '0') : '01';
                                  return year + '. ' + month;
                                })() : '-'})</div>
                              </div>
                              <div>
                                <div class="text-xs text-gray-500 mb-1">분양가 대비</div>
                                \${(() => {
                                  const priceIncrease = property.recent_trade_price - property.original_price;
                                  const increaseRate = (priceIncrease / property.original_price) * 100;
                                  const formattedIncrease = priceIncrease % 1 === 0 ? priceIncrease.toFixed(0) : priceIncrease.toFixed(2).replace(/\\.?0+$/, '');
                                  return \`
                                    <div class="font-bold \${increaseRate >= 0 ? 'text-red-600' : 'text-blue-600'} text-sm">
                                      \${increaseRate >= 0 ? '+' : ''}\${increaseRate.toFixed(1)}%
                                    </div>
                                    <div class="text-xs text-gray-400 mt-1">(\${priceIncrease >= 0 ? '+' : ''}\${formattedIncrease}억)</div>
                                  \`;
                                })()}
                              </div>
                            </div>
                          \` : ''}
                        </div>
                      \` : ''}

                      <!-- Timeline Section -->
                      <div>
                        <div class="bg-gray-50 rounded-lg p-4">
                          \${(() => {
                            // 현재 날짜와 가장 가까운 다음 단계만 표시
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            
                            // 타입별 첫 단계 라벨 결정
                            const getFirstStepLabel = () => {
                              switch(property.type) {
                                case 'unsold': return '줍줍일정';
                                case 'general': return '청약일정';
                                case 'rental': return '신청일정';
                                case 'johab': return '모집일정';
                                default: return '접수일정';
                              }
                            };
                            
                            // 5단계 타임라인: 공고 → 접수 → 당첨자발표 → 서류제출 → 계약
                            const steps = [
                              { 
                                date: property.announcement_date,
                                icon: '📢',
                                label: '공고',
                                subtitle: '',
                                dateDisplay: property.announcement_date
                              },
                              { 
                                date: property.application_end_date || property.application_start_date,
                                icon: '📝',
                                label: '접수',
                                subtitle: '현장·인터넷·모바일',
                                dateDisplay: property.application_start_date + (property.application_end_date && property.application_end_date !== property.application_start_date ? ' ~ ' + property.application_end_date : '')
                              },
                              { 
                                date: property.winner_announcement,
                                icon: '🎉',
                                label: '당첨자발표',
                                subtitle: '',
                                dateDisplay: property.winner_announcement
                              },
                              { 
                                date: property.document_submission_date,
                                icon: '📄',
                                label: '당첨자(예비입주자) 서류제출',
                                subtitle: '',
                                dateDisplay: property.document_submission_date
                              },
                              { 
                                date: property.contract_date,
                                icon: '✍️',
                                label: '계약',
                                subtitle: '',
                                dateDisplay: property.contract_date
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
                            
                            // extendedData.steps가 있으면 오늘 이후 가장 가까운 1개만 표시
                            if (extendedData.steps && extendedData.steps.length > 0) {
                              // 오늘 날짜 이후 가장 가까운 스텝 찾기
                              let nextStep = null;
                              let nextStepIdx = -1;
                              
                              for (let i = 0; i < extendedData.steps.length; i++) {
                                const step = extendedData.steps[i];
                                try {
                                  const stepDateStr = step.date.split('~')[0].split(' ')[0].trim();
                                  const stepDate = new Date(stepDateStr);
                                  stepDate.setHours(0, 0, 0, 0);
                                  
                                  if (stepDate >= today) {
                                    nextStep = step;
                                    nextStepIdx = i;
                                    break;
                                  }
                                } catch (e) {
                                  // 날짜 파싱 실패 시 계속
                                }
                              }
                              
                              // 모든 날짜가 지났으면 마지막 스텝 표시
                              if (!nextStep && extendedData.steps.length > 0) {
                                nextStep = extendedData.steps[extendedData.steps.length - 1];
                                nextStepIdx = extendedData.steps.length - 1;
                              }
                              
                              if (nextStep) {
                                return \`
                                <div class="col-span-2">
                                  <div class="bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200 rounded-xl p-3 shadow-sm">
                                    <div class="flex items-center gap-1.5 mb-1">
                                      <span class="text-sm">📝</span>
                                      <h4 class="text-xs font-bold text-blue-600">\${nextStep.title}</h4>
                                    </div>
                                    \${nextStep.details ? \`<p class="text-xs text-gray-600 mb-1">\${nextStep.details}</p>\` : ''}
                                    <p class="text-xs font-bold text-blue-600">\${nextStep.date}</p>
                                  </div>
                                </div>
                              \`;
                              }
                              
                              return '';
                            }
                            
                            // extendedData.steps가 없으면 기존 방식 (현재 단계 하나만)
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
                        \${(extendedData.targetAudienceLines && extendedData.targetAudienceLines.length > 0) || property.description ? \`
                          <div class="mt-3 pt-3 border-t border-gray-200">
                            <div class="text-xs font-medium text-gray-500 mb-1">👍 추천 대상</div>
                            <div class="text-xs text-gray-600 leading-relaxed">\${
                              (() => {
                                // extended_data에서 먼저 확인
                                if (extendedData.targetAudienceLines && extendedData.targetAudienceLines.length > 0) {
                                  return extendedData.targetAudienceLines
                                    .slice(0, 3)
                                    .map(line => '- ' + line.trim())
                                    .join('<br>');
                                }
                                
                                // description에서 추출 (기존 방식)
                                const match = property.description.match(/👍 추천 대상[:\\s]*([^📢🏢📐💰🏡🎯✨📞⚠️💻🔗]*)/);
                                if (match && match[1]) {
                                  const lines = match[1].trim().split('\\n')
                                    .filter(line => line.trim() && line.trim() !== '👍 추천 대상')
                                    .slice(0, 3);
                                  
                                  return lines.map(line => line.trim()).join('<br>');
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
                                class="w-full bg-white border border-gray-200 text-gray-600 font-medium py-3 sm:py-2.5 rounded-lg hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 transition-all text-sm touch-manipulation">
                          상세정보 보기
                        </button>
                      </div>
                    </div>
                  </div>
                \`;
                }).join('');
                console.timeEnd('⏱️ Render Cards');
              }
            } catch (error) {
              console.error('❌ Failed to load properties:', error);
              container.innerHTML = \`
                <div class="col-span-2 text-center py-12">
                  <div class="text-6xl mb-4">😢</div>
                  <h3 class="text-xl font-bold text-gray-900 mb-2">정보를 불러올 수 없습니다</h3>
                  <p class="text-gray-600">잠시 후 다시 시도해주세요.</p>
                </div>
              \`;
            } finally {
              container.classList.remove('loading');
              console.timeEnd('⏱️ Total Load Time');
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

          // Login modal handlers - 로그인 기능 임시 비활성화
          // const loginModal = document.getElementById('loginModal');
          // const loginBtn = document.getElementById('loginBtn');
          // const closeLoginModal = document.getElementById('closeLoginModal');
          // const signupBtn = document.getElementById('signupBtn');

          // loginBtn.addEventListener('click', () => {
          //   loginModal.classList.add('show');
          // });

          // closeLoginModal.addEventListener('click', () => {
          //   loginModal.classList.remove('show');
          // });

          // loginModal.addEventListener('click', (e) => {
          //   if (e.target === loginModal) {
          //     loginModal.classList.remove('show');
          //   }
          // });

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
            // ⚠️ TEST MODE: 로그인 체크 완전 비활성화
            const loginBtn = document.getElementById('loginBtn');
            
            // 테스트 사용자로 자동 로그인 처리
            const testUser = {
              id: 999,
              nickname: '테스트사용자',
              email: 'test@test.com',
              profileImage: 'https://via.placeholder.com/32',
              provider: 'email'
            };
            
            // 테스트 사용자를 localStorage에 저장
            localStorage.setItem('user', JSON.stringify(testUser));
            
            // 로그인 상태로 UI 표시
            loginBtn.innerHTML = \`
              <div class="flex items-center gap-2">
                <img src="\${testUser.profileImage}" 
                     class="w-8 h-8 rounded-full" 
                     onerror="this.src='https://via.placeholder.com/32'">
                <span class="hidden sm:inline">\${testUser.nickname}</span>
                <i class="fas fa-chevron-down text-xs"></i>
              </div>
            \`;
            loginBtn.onclick = showUserMenu;
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

          // 실거래가 업데이트 버튼 핸들러
          document.addEventListener('click', async function(e) {
            const target = e.target.closest('.update-trade-price-btn');
            if (!target) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const propertyId = target.dataset.propertyId;
            const propertyTitle = target.dataset.propertyTitle;
            
            if (!confirm(\`"\${propertyTitle}"의 실거래가를 조회하시겠습니까?\\n\\n국토교통부 API를 통해 최근 3개월 실거래가를 조회합니다.\`)) {
              return;
            }
            
            // 버튼 비활성화 및 로딩 표시
            const originalHtml = target.innerHTML;
            target.disabled = true;
            target.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 조회중...';
            
            try {
              const response = await fetch(\`/api/properties/\${propertyId}/update-trade-price\`, {
                method: 'POST'
              });
              
              const data = await response.json();
              
              if (data.success) {
                const message = '✅ 실거래가 조회 완료!\\n\\n' +
                  '입력한 이름: ' + data.userInputName + '\\n' +
                  '매칭된 아파트: ' + data.matchedApartmentName + '\\n' +
                  '매칭 점수: ' + Math.round(data.matchScore) + '점\\n\\n' +
                  '최근 실거래가: ' + data.analysis.recentPrice + '억원\\n' +
                  '거래일: ' + data.analysis.recentDate + '\\n' +
                  '조회된 거래: ' + data.tradesFound + '건\\n\\n' +
                  '페이지를 새로고침합니다.';
                alert(message);
                window.location.reload();
              } else {
                let errorMsg = '❌ 실거래가 조회 실패\\n\\n' + (data.message || data.error);
                if (data.availableApartments && data.availableApartments.length > 0) {
                  errorMsg += '\\n\\n📋 해당 지역의 아파트 목록 (일부):\\n' + 
                    data.availableApartments.slice(0, 5).join('\\n');
                }
                alert(errorMsg);
                target.disabled = false;
                target.innerHTML = originalHtml;
              }
            } catch (error) {
              console.error('Trade price update error:', error);
              alert('실거래가 조회 중 오류가 발생했습니다.');
              target.disabled = false;
              target.innerHTML = originalHtml;
            }
          });

          // 메인 페이지 검색 함수 (타이핑 시 자동 검색)
          let searchTimeout;
          function mainSearchOnType(event) {
            clearTimeout(searchTimeout);
            
            // Enter 키면 즉시 검색
            if (event.key === 'Enter') {
              mainSearch();
              return;
            }
            
            // 타이핑 후 500ms 대기 후 검색
            searchTimeout = setTimeout(() => {
              mainSearch();
            }, 500);
          }
          
          function mainSearch() {
            const input = document.getElementById('mainSearchInput');
            searchQuery = input.value.trim();
            
            // 검색 시 filters에 추가
            if (searchQuery) {
              filters.search = searchQuery;
              console.log('🔍 Searching:', searchQuery);
            } else {
              delete filters.search;
            }
            
            loadProperties();
          }

          // 광고 문의 모달 함수들
          function openAdInquiry() {
            const modal = document.getElementById('adInquiryModal');
            const sheet = document.getElementById('adInquirySheet');
            
            modal.classList.remove('hidden');
            setTimeout(() => {
              sheet.style.transform = 'translateY(0)';
            }, 10);
          }
          
          function closeAdInquiry() {
            const modal = document.getElementById('adInquiryModal');
            const inputSheet = document.getElementById('adInquirySheet');
            const successSheet = document.getElementById('adSuccessSheet');
            
            inputSheet.style.transform = 'translateY(100%)';
            successSheet.style.transform = 'translateY(100%)';
            
            setTimeout(() => {
              modal.classList.add('hidden');
              inputSheet.classList.remove('hidden');
              successSheet.classList.add('hidden');
              document.getElementById('adInquiryForm').reset();
            }, 300);
          }
          
          // 광고 문의 폼 제출
          document.getElementById('adInquiryForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('adName').value;
            const contact = document.getElementById('adContact').value;
            const message = document.getElementById('adMessage').value;
            
            // 버튼 로딩 상태
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const submitText = document.getElementById('adSubmitText');
            const submitLoading = document.getElementById('adSubmitLoading');
            
            submitBtn.disabled = true;
            submitText.classList.add('hidden');
            submitLoading.classList.remove('hidden');
            
            try {
              // 이메일 전송 API 호출
              const response = await axios.post('/api/contact/inquiry', {
                name,
                contact,
                message,
                type: 'ad_inquiry'
              });
              
              if (response.data.success) {
                // 입력 시트 숨기고 완료 시트 표시
                const inputSheet = document.getElementById('adInquirySheet');
                const successSheet = document.getElementById('adSuccessSheet');
                
                inputSheet.style.transform = 'translateY(100%)';
                setTimeout(() => {
                  inputSheet.classList.add('hidden');
                  successSheet.classList.remove('hidden');
                  successSheet.style.transform = 'translateY(0)';
                }, 300);
              } else {
                alert('문의 전송에 실패했습니다. 다시 시도해주세요.');
              }
            } catch (error) {
              console.error('Ad inquiry error:', error);
              alert('문의 전송 중 오류가 발생했습니다.');
            } finally {
              submitBtn.disabled = false;
              submitText.classList.remove('hidden');
              submitLoading.classList.add('hidden');
            }
          });

          // Initialize
          // checkLoginStatus(); // 로그인 기능 임시 비활성화
          loadStats();
          loadProperties();
          setupNewFilters();
        </script>
    </body>
    </html>
  `)
})

// Favicon route
app.get('/favicon.ico', (c) => {
  return c.text('', 204)
})

// Favicon route
app.get('/favicon.ico', (c) => {
  return c.text('', 204)
})

export default app
