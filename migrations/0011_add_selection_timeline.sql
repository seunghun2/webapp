-- Add selection timeline fields for detailed application process
-- 선정 절차 타임라인 필드 추가

-- 1단계: 청약신청 (현장/인터넷/모바일)
ALTER TABLE properties ADD COLUMN application_start_date TEXT;
ALTER TABLE properties ADD COLUMN application_end_date TEXT;

-- 2단계: 서류제출 대상자 발표 (인터넷/모바일 신청자 한함)
ALTER TABLE properties ADD COLUMN document_submission_date TEXT;

-- 3단계: 사업주체 대상자 서류접수 (인터넷 신청자)
ALTER TABLE properties ADD COLUMN document_acceptance_start_date TEXT;
ALTER TABLE properties ADD COLUMN document_acceptance_end_date TEXT;

-- 4단계: 입주자격 검증 및 부적격자 소명
ALTER TABLE properties ADD COLUMN qualification_verification_date TEXT;

-- 5단계: 소명 절차 및 심사
ALTER TABLE properties ADD COLUMN appeal_review_date TEXT;

-- 6단계: 예비입주자 당첨자 발표
ALTER TABLE properties ADD COLUMN final_announcement_date TEXT;
