-- Add membership fee tracking
-- The fee amount itself is stored in senteloans_institutions.settings JSONB as "membershipFee"
-- Only the amount paid by each client is stored per-client

-- 1. Add membership_fee_paid column to senteloans_clients
ALTER TABLE senteloans_clients
  ADD COLUMN IF NOT EXISTS membership_fee_paid DECIMAL(15,2) DEFAULT 0 CHECK (membership_fee_paid >= 0);

-- 2. Set membership fee in institution settings (stored as "membershipFee" in JSONB)
UPDATE senteloans_institutions
  SET settings = settings || '{"membershipFee": 50000}'::jsonb
  WHERE name = 'Kampala Central SACCO';

UPDATE senteloans_institutions
  SET settings = settings || '{"membershipFee": 30000}'::jsonb
  WHERE name = 'Quick Cash Uganda';

UPDATE senteloans_institutions
  SET settings = settings || '{"membershipFee": 40000}'::jsonb
  WHERE name = 'Opportunity Microfinance Uganda';

-- 3. Seed some payment data for existing demo clients
UPDATE senteloans_clients SET membership_fee_paid = 50000 WHERE client_number = 'SL001';
UPDATE senteloans_clients SET membership_fee_paid = 30000 WHERE client_number = 'SL002';
UPDATE senteloans_clients SET membership_fee_paid = 50000 WHERE client_number = 'SL003';
UPDATE senteloans_clients SET membership_fee_paid = 10000 WHERE client_number = 'SL004';
UPDATE senteloans_clients SET membership_fee_paid = 30000 WHERE client_number = 'QC001';
UPDATE senteloans_clients SET membership_fee_paid = 15000 WHERE client_number = 'QC002';
UPDATE senteloans_clients SET membership_fee_paid = 30000 WHERE client_number = 'QC003';
UPDATE senteloans_clients SET membership_fee_paid = 40000 WHERE client_number = 'OM001';
UPDATE senteloans_clients SET membership_fee_paid = 25000 WHERE client_number = 'OM002';
UPDATE senteloans_clients SET membership_fee_paid = 0    WHERE client_number = 'OM003';
