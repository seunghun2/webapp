#!/usr/bin/env python3
import os
import fitz  # PyMuPDF
from PIL import Image

# PDF 파일 경로
pdf_path = "brochure.pdf"
output_dir = "images"

# 출력 디렉토리 생성
os.makedirs(output_dir, exist_ok=True)

print("PDF를 이미지로 변환 중...")

# PDF 열기
pdf_document = fitz.open(pdf_path)
page_count = pdf_document.page_count

print(f"총 {page_count}개 페이지 발견")

image_paths = []

# 각 페이지를 이미지로 변환
for page_num in range(page_count):
    page = pdf_document[page_num]
    
    # 고해상도로 렌더링 (zoom=2 -> 2배 확대)
    mat = fitz.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat)
    
    # PNG로 저장
    output_path = f"{output_dir}/page_{page_num + 1:02d}.png"
    pix.save(output_path)
    
    # 파일 크기 확인
    size = os.path.getsize(output_path) / 1024 / 1024  # MB
    
    # 너무 크면 최적화
    if size > 1.0:  # 1MB 이상이면
        img = Image.open(output_path)
        # 너비 최대 1200px로 리사이즈
        if img.width > 1200:
            ratio = 1200 / img.width
            new_height = int(img.height * ratio)
            img = img.resize((1200, new_height), Image.Resampling.LANCZOS)
            img.save(output_path, "PNG", optimize=True)
            size = os.path.getsize(output_path) / 1024 / 1024
    
    image_paths.append(output_path)
    print(f"페이지 {page_num + 1} 저장 완료: {output_path} ({size:.2f} MB)")

pdf_document.close()

print(f"\n변환 완료! 총 {len(image_paths)}개 이미지 생성")
print("\n생성된 파일 목록:")
for path in image_paths:
    print(f"  - {path}")
