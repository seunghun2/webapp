#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
자동 실거래가 업데이트 스크립트
국토교통부 API를 사용하여 매일 실거래가를 자동으로 수집하고 DB에 업데이트합니다.
"""

import os
import sys
import json
import sqlite3
from datetime import datetime, timedelta
from PublicDataReader import TransactionPrice

# 환경 변수에서 서비스 키 가져오기
SERVICE_KEY = os.getenv('MOLIT_API_KEY', '')

# 시군구 코드 매핑
REGION_CODE_MAP = {
    '서울': {
        '강남구': '11680', '강동구': '11740', '강북구': '11305', '강서구': '11500',
        '관악구': '11620', '광진구': '11215', '구로구': '11530', '금천구': '11545',
        '노원구': '11350', '도봉구': '11320', '동대문구': '11230', '동작구': '11590',
        '마포구': '11440', '서대문구': '11410', '서초구': '11650', '성동구': '11200',
        '성북구': '11290', '송파구': '11710', '양천구': '11470', '영등포구': '11560',
        '용산구': '11170', '은평구': '11380', '종로구': '11110', '중구': '11140', '중랑구': '11260'
    },
    '인천': {
        '계양구': '28245', '남동구': '28200', '동구': '28110', '미추홀구': '28177',
        '부평구': '28237', '서구': '28260', '연수구': '28185', '중구': '28140',
        '강화군': '28710', '옹진군': '28720'
    },
    '경기': {
        '고양시': '41281', '과천시': '41290', '광명시': '41210', '광주시': '41610',
        '구리시': '41310', '군포시': '41410', '김포시': '41570', '남양주시': '41360',
        '동두천시': '41250', '부천시': '41190', '성남시': '41130', '수원시': '41110',
        '시흥시': '41390', '안산시': '41270', '안성시': '41550', '안양시': '41170',
        '양주시': '41630', '여주시': '41670', '오산시': '41370', '용인시': '41460',
        '의왕시': '41430', '의정부시': '41150', '이천시': '41500', '파주시': '41480',
        '평택시': '41220', '포천시': '41650', '하남시': '41450', '화성시': '41590'
    },
    '세종': {
        '세종시': '36110'
    }
}

def get_sigungu_code(location):
    """
    지역명으로부터 시군구 코드 추출
    예: "경기 시흥시" -> "41390"
    """
    for sido, districts in REGION_CODE_MAP.items():
        if sido in location:
            for district, code in districts.items():
                if district in location:
                    return code
    return None

def fetch_recent_trades(sigungu_code, apartment_name, months=6):
    """
    국토교통부 API로 최근 실거래가 조회
    
    Args:
        sigungu_code: 시군구 코드
        apartment_name: 아파트명
        months: 조회 개월 수
    
    Returns:
        list: 실거래가 데이터 리스트
    """
    if not SERVICE_KEY:
        print("⚠️  환경 변수 MOLIT_API_KEY가 설정되지 않았습니다.")
        print("📝 공공데이터포털(data.go.kr)에서 서비스키를 발급받으세요:")
        print("   https://www.data.go.kr/data/15057511/openapi.do")
        return []
    
    try:
        api = TransactionPrice(SERVICE_KEY)
        
        # 최근 N개월 데이터 조회
        end_date = datetime.now()
        start_date = end_date - timedelta(days=months * 30)
        
        df = api.get_data(
            property_type="아파트",
            trade_type="매매",
            sigungu_code=sigungu_code,
            start_year_month=start_date.strftime("%Y%m"),
            end_year_month=end_date.strftime("%Y%m"),
            verbose=False
        )
        
        if df is None or df.empty:
            return []
        
        # 아파트명으로 필터링
        if '아파트' in df.columns:
            filtered = df[df['아파트'].str.contains(apartment_name, na=False)]
            
            if not filtered.empty:
                # 최근 거래부터 정렬
                filtered = filtered.sort_values(by=['년', '월', '일'], ascending=False)
                
                results = []
                for _, row in filtered.head(5).iterrows():  # 최근 5건
                    results.append({
                        'apartment': row['아파트'],
                        'area': row['전용면적'],
                        'price': int(row['거래금액'].replace(',', '')) / 10000,  # 억 단위
                        'date': f"{row['년']}-{str(row['월']).zfill(2)}-{str(row['일']).zfill(2)}",
                        'floor': row.get('층', '-'),
                        'dong': row.get('법정동', '')
                    })
                
                return results
        
        return []
        
    except Exception as e:
        print(f"❌ 실거래가 조회 실패: {e}")
        return []

def update_property_price(property_id, recent_trades, conn):
    """
    DB에 실거래가 업데이트
    
    Args:
        property_id: 물건 ID
        recent_trades: 실거래가 데이터 리스트
        conn: SQLite connection
    """
    if not recent_trades:
        return False
    
    try:
        cursor = conn.cursor()
        
        # 가장 최근 거래 사용
        latest = recent_trades[0]
        
        # 기존 분양가 조회
        cursor.execute("SELECT original_price, sale_price_date FROM properties WHERE id = ?", (property_id,))
        row = cursor.fetchone()
        
        if not row:
            return False
        
        original_price = row[0] or 0
        recent_price = latest['price']
        recent_date = latest['date']
        
        # 가격 상승률 계산
        if original_price > 0:
            increase_amount = recent_price - original_price
            increase_rate = (increase_amount / original_price) * 100
        else:
            increase_amount = 0
            increase_rate = 0
        
        # DB 업데이트
        cursor.execute("""
            UPDATE properties
            SET recent_trade_price = ?,
                recent_trade_date = ?,
                expected_margin = ?,
                margin_rate = ?,
                price_increase_amount = ?,
                price_increase_rate = ?,
                last_price_update = datetime('now')
            WHERE id = ?
        """, (
            recent_price,
            recent_date,
            increase_amount,
            increase_rate,
            increase_amount,
            increase_rate,
            property_id
        ))
        
        conn.commit()
        
        print(f"✅ 물건 ID {property_id}: {latest['apartment']} - {recent_price}억원 ({recent_date})")
        print(f"   상승률: {increase_amount:+.1f}억 ({increase_rate:+.1f}%)")
        
        return True
        
    except Exception as e:
        print(f"❌ DB 업데이트 실패 (물건 ID {property_id}): {e}")
        conn.rollback()
        return False

def main():
    """
    메인 실행 함수
    """
    print("=" * 60)
    print("🔄 자동 실거래가 업데이트 시작")
    print("=" * 60)
    print(f"⏰ 실행 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # DB 연결
    db_path = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/2c616317d3e744ba9d1fbb307452dada.sqlite'
    
    if not os.path.exists(db_path):
        print(f"❌ DB 파일을 찾을 수 없습니다: {db_path}")
        sys.exit(1)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 업데이트가 필요한 물건 조회 (시군구 코드와 아파트명이 있는 것)
    cursor.execute("""
        SELECT id, title, location, sigungu_code, apartment_name, original_price
        FROM properties
        WHERE sigungu_code != '' AND apartment_name != ''
        ORDER BY id
    """)
    
    properties = cursor.fetchall()
    
    if not properties:
        print("ℹ️  업데이트할 물건이 없습니다.")
        print("   (시군구 코드와 아파트명이 설정된 물건만 자동 업데이트됩니다)")
        conn.close()
        return
    
    print(f"📊 업데이트 대상: {len(properties)}건")
    print()
    
    success_count = 0
    fail_count = 0
    
    for prop in properties:
        prop_id, title, location, sigungu_code, apt_name, orig_price = prop
        
        print(f"🔍 [{prop_id}] {title} ({location})")
        print(f"   아파트명: {apt_name}, 시군구 코드: {sigungu_code}")
        
        # 실거래가 조회
        trades = fetch_recent_trades(sigungu_code, apt_name, months=6)
        
        if trades:
            if update_property_price(prop_id, trades, conn):
                success_count += 1
            else:
                fail_count += 1
        else:
            print(f"   ⚠️  실거래가 데이터 없음")
            fail_count += 1
        
        print()
    
    conn.close()
    
    print("=" * 60)
    print("✅ 자동 업데이트 완료")
    print(f"   성공: {success_count}건")
    print(f"   실패: {fail_count}건")
    print("=" * 60)

if __name__ == '__main__':
    main()
