-- Add membership fee tracking
-- The fee amount is stored in senteloans_config.membership_fee (branch-level)
-- Only the amount paid by each member is stored per-member

-- 1. Add membership_fee_paid column to senteloans_members
ALTER TABLE senteloans_members
  ADD COLUMN IF NOT EXISTS membership_fee_paid DECIMAL(15,2) DEFAULT 0 CHECK (membership_fee_paid >= 0);

-- 2. Set membership fee in senteloans_config for each institution's branches
UPDATE senteloans_config c
SET membership_fee = 50000
FROM senteloans_branches b
JOIN senteloans_institutions i ON i.id = b.institution_id
WHERE c.branch_id = b.id
  AND i.name = 'Kampala Central SACCO';

UPDATE senteloans_config c
SET membership_fee = 30000
FROM senteloans_branches b
JOIN senteloans_institutions i ON i.id = b.institution_id
WHERE c.branch_id = b.id
  AND i.name = 'Quick Cash Uganda';

UPDATE senteloans_config c
SET membership_fee = 40000
FROM senteloans_branches b
JOIN senteloans_institutions i ON i.id = b.institution_id
WHERE c.branch_id = b.id
  AND i.name = 'Opportunity Microfinance Uganda';

-- 3. Seed some payment data for existing demo members
UPDATE senteloans_members SET membership_fee_paid = 50000 WHERE member_number = 'SL001';
UPDATE senteloans_members SET membership_fee_paid = 30000 WHERE member_number = 'SL002';
UPDATE senteloans_members SET membership_fee_paid = 50000 WHERE member_number = 'SL003';
UPDATE senteloans_members SET membership_fee_paid = 10000 WHERE member_number = 'SL004';
UPDATE senteloans_members SET membership_fee_paid = 30000 WHERE member_number = 'QC001';
UPDATE senteloans_members SET membership_fee_paid = 15000 WHERE member_number = 'QC002';
UPDATE senteloans_members SET membership_fee_paid = 30000 WHERE member_number = 'QC003';
UPDATE senteloans_members SET membership_fee_paid = 40000 WHERE member_number = 'OM001';
UPDATE senteloans_members SET membership_fee_paid = 25000 WHERE member_number = 'OM002';
UPDATE senteloans_members SET membership_fee_paid = 0    WHERE member_number = 'OM003';
