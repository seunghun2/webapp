#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KB부동산 시세 조회 테스트 스크립트
"""

import sys
from PublicDataReader import Kbland

# KB부동산 API 초기화 (인증키 불필요)
api = Kbland()

try:
    print("=" * 60)
    print("KB부동산 시세 조회 테스트")
    print("=" * 60)
    
    # 테스트 1: 월간 아파트 매매가격 평균 조회 (세종시)
    print("\n[테스트 1] 세종시 아파트 평균 매매가격 조회")
    params = {
        "매물종별구분": "01",  # 01: 아파트
        "매매전세코드": "01",  # 01: 매매
        "지역코드": "36",      # 36: 세종특별자치시
        "기간": "1"            # 최근 1년
    }
    
    try:
        df = api.get_average_price(**params)
        if df is not None and not df.empty:
            print(f"✓ 조회 성공: {len(df)}건의 데이터")
            print("\n컬럼명:")
            print(df.columns.tolist())
            print("\n최근 데이터:")
            print(df.tail(3))
            
            # 세종시 데이터만 필터링
            sejong_df = df[df['지역코드'].astype(str).str.startswith('36')]
            if not sejong_df.empty:
                latest = sejong_df.iloc[-1]
                print(f"\n세종시 최신 데이터:")
                print(latest)
        else:
            print("✗ 데이터 없음")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 테스트 2: 면적별 아파트 평균가격 조회
    print("\n" + "=" * 60)
    print("[테스트 2] 세종시 면적별 아파트 평균가격 조회")
    print("=" * 60)
    
    params2 = {
        "매물종별구분": "01",  # 아파트
        "매매전세코드": "01",  # 매매
        "면적별코드": "02",    # 02: 중소형 (전용 60㎡ 이하)
        "지역코드": "36",      # 세종
        "기간": "1"
    }
    
    try:
        df2 = api.get_average_price_by_area(**params2)
        if df2 is not None and not df2.empty:
            print(f"✓ 조회 성공: {len(df2)}건")
            print("\n컬럼명:")
            print(df2.columns.tolist())
            print("\n최근 데이터 (중소형 아파트):")
            print(df2.tail(3))
            
            # 세종시 데이터만 필터링
            sejong_df2 = df2[df2['지역코드'].astype(str).str.startswith('36')]
            if not sejong_df2.empty:
                latest2 = sejong_df2.iloc[-1]
                print(f"\n세종시 중소형 아파트 최신 가격: {latest2['중소형']}만원")
        else:
            print("✗ 데이터 없음")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    # 테스트 3: ㎡당 평균가격 조회
    print("\n" + "=" * 60)
    print("[테스트 3] 세종시 ㎡당 평균가격 조회")
    print("=" * 60)
    
    params3 = {
        "매물종별구분": "01",  # 아파트
        "매매전세코드": "01",  # 매매
        "지역코드": "36",      # 세종
        "기간": "1"
    }
    
    try:
        df3 = api.get_average_price_per_squaremeter(**params3)
        if df3 is not None and not df3.empty:
            print(f"✓ 조회 성공: {len(df3)}건")
            print("\n컬럼명:")
            print(df3.columns.tolist())
            print("\n최근 데이터 (㎡당 가격):")
            print(df3.tail(3))
            
            # 세종시 데이터만 필터링
            sejong_df3 = df3[df3['지역코드'].astype(str).str.startswith('36')]
            if not sejong_df3.empty:
                latest3 = sejong_df3.iloc[-1]
                price_col = '㎡당 평균가격' if '㎡당 평균가격' in latest3 else '㎡당평균가격'
                price_per_sqm = float(latest3[price_col])
                print(f"\n세종시 최신 ㎡당 평균가격: {price_per_sqm:.2f}만원")
                
                # 55㎡(약 17평) 기준 가격 계산
                price_55sqm = (price_per_sqm * 55) / 10000  # 억 단위로 변환
                print(f"예상 55㎡ 아파트 가격: {price_55sqm:.2f}억원")
        else:
            print("✗ 데이터 없음")
    except Exception as e:
        print(f"✗ 오류: {e}")
    
    print("\n" + "=" * 60)
    print("테스트 완료")
    print("=" * 60)
    
except Exception as e:
    print(f"\n✗ 예외 발생: {type(e).__name__}")
    print(f"  메시지: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
