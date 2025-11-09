#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KB부동산 시세 조회 스크립트
지역코드와 면적을 입력받아 해당 지역의 KB시세를 반환합니다.
"""

import sys
import json
from PublicDataReader import Kbland

def get_region_code(location):
    """
    지역명으로부터 지역코드 매핑
    """
    region_map = {
        '서울': '11',
        '부산': '21',
        '대구': '22',
        '인천': '23',
        '광주': '24',
        '대전': '25',
        '울산': '26',
        '세종': '36',
        '경기': '31',
        '강원': '32',
        '충북': '33',
        '충남': '34',
        '전북': '35',
        '전남': '37',
        '경북': '38',
        '경남': '39',
        '제주': '50'
    }
    
    # 지역명에서 키워드 찾기
    for key, code in region_map.items():
        if key in location:
            return code
    
    return '11'  # 기본값: 서울

def get_area_code(area_sqm):
    """
    면적(㎡)으로부터 면적별코드 반환
    01: 전체
    02: 중소형 (전용 60㎡ 이하)
    03: 중형 (전용 60~85㎡)
    04: 중대형 (전용 85~135㎡)
    05: 대형 (전용 135㎡ 초과)
    """
    if area_sqm <= 60:
        return '02', '중소형'
    elif area_sqm <= 85:
        return '03', '중형'
    elif area_sqm <= 135:
        return '04', '중대형'
    else:
        return '05', '대형'

def check_kb_price(location, area_sqm=55):
    """
    KB부동산 시세 조회
    
    Args:
        location (str): 지역명 (예: '세종', '서울 강남구')
        area_sqm (float): 전용면적 (㎡)
    
    Returns:
        dict: KB시세 정보
    """
    try:
        api = Kbland()
        region_code = get_region_code(location)
        area_code, area_name = get_area_code(area_sqm)
        
        result = {
            'success': True,
            'location': location,
            'region_code': region_code,
            'area_sqm': area_sqm,
            'area_type': area_name,
            'data': {}
        }
        
        # 1. 면적별 평균가격 조회
        params_area = {
            "매물종별구분": "01",  # 아파트
            "매매전세코드": "01",  # 매매
            "면적별코드": area_code,
            "지역코드": region_code,
            "기간": "1"  # 최근 1년
        }
        
        df_area = api.get_average_price_by_area(**params_area)
        if df_area is not None and not df_area.empty:
            # 해당 지역 데이터 필터링
            region_df = df_area[df_area['지역코드'].astype(str).str.startswith(region_code)]
            if not region_df.empty:
                latest = region_df.iloc[-1]
                
                # 면적별 컬럼명 매핑
                area_col_map = {
                    '02': '중소형',
                    '03': '중형',
                    '04': '중대형',
                    '05': '대형'
                }
                
                col_name = area_col_map.get(area_code, '중소형')
                if col_name in latest:
                    avg_price_만원 = float(latest[col_name])
                    result['data']['average_price_by_area'] = {
                        'price_만원': avg_price_만원,
                        'price_억': round(avg_price_만원 / 10000, 2),
                        'date': str(latest['날짜'])
                    }
        
        # 2. ㎡당 평균가격 조회
        params_sqm = {
            "매물종별구분": "01",
            "매매전세코드": "01",
            "지역코드": region_code,
            "기간": "1"
        }
        
        df_sqm = api.get_average_price_per_squaremeter(**params_sqm)
        if df_sqm is not None and not df_sqm.empty:
            region_df_sqm = df_sqm[df_sqm['지역코드'].astype(str).str.startswith(region_code)]
            if not region_df_sqm.empty:
                latest_sqm = region_df_sqm.iloc[-1]
                price_per_sqm = float(latest_sqm['㎡당 평균가격'])
                estimated_price = (price_per_sqm * area_sqm) / 10000  # 억 단위
                
                result['data']['price_per_sqm'] = {
                    'price_per_sqm_만원': round(price_per_sqm, 2),
                    'estimated_total_억': round(estimated_price, 2),
                    'date': str(latest_sqm['날짜'])
                }
        
        # 3. 전체 평균가격 조회
        params_total = {
            "매물종별구분": "01",
            "매매전세코드": "01",
            "지역코드": region_code,
            "기간": "1"
        }
        
        df_total = api.get_average_price(**params_total)
        if df_total is not None and not df_total.empty:
            region_df_total = df_total[df_total['지역코드'].astype(str).str.startswith(region_code)]
            if not region_df_total.empty:
                latest_total = region_df_total.iloc[-1]
                avg_price = float(latest_total['평균가격'])
                
                result['data']['average_price_total'] = {
                    'price_만원': avg_price,
                    'price_억': round(avg_price / 10000, 2),
                    'date': str(latest_total['날짜'])
                }
        
        return result
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }

if __name__ == '__main__':
    # CLI 인자로 지역명과 면적 받기
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python3 kb_price_checker.py <location> [area_sqm]'
        }))
        sys.exit(1)
    
    location = sys.argv[1]
    area_sqm = float(sys.argv[2]) if len(sys.argv) > 2 else 55
    
    result = check_kb_price(location, area_sqm)
    print(json.dumps(result, ensure_ascii=False, indent=2))
