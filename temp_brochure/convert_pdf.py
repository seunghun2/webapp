#!/usr/bin/env python3
import os
from pdf2image import convert_from_path
from PIL import Image

# PDF 파일 경로
pdf_path = "brochure.pdf"
output_dir = "images"

# 출력 디렉토리 생성
os.makedirs(output_dir, exist_ok=True)

print("PDF를 이미지로 변환 중...")

# PDF를 이미지로 변환 (DPI 150으로 적당한 품질)
images = convert_from_path(pdf_path, dpi=150)

print(f"총 {len(images)}개 페이지 발견")

# 각 페이지를 PNG로 저장
image_paths = []
for i, image in enumerate(images, start=1):
    # 최적화를 위해 약간 리사이즈 (너비 최대 1200px)
    if image.width > 1200:
        ratio = 1200 / image.width
        new_height = int(image.height * ratio)
        image = image.resize((1200, new_height), Image.Resampling.LANCZOS)
    
    output_path = f"{output_dir}/page_{i:02d}.png"
    image.save(output_path, "PNG", optimize=True)
    image_paths.append(output_path)
    print(f"페이지 {i} 저장 완료: {output_path}")

print(f"\n변환 완료! 총 {len(image_paths)}개 이미지 생성")
print("\n생성된 파일:")
for path in image_paths:
    size = os.path.getsize(path) / 1024 / 1024  # MB
    print(f"  - {path} ({size:.2f} MB)")
