-- Add audit tracking columns to senteloans_members
-- Tracks who created, last modified, and approved KYC for each member

ALTER TABLE senteloans_members
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kyc_approved_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kyc_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clients_created_by ON senteloans_members(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_modified_by ON senteloans_members(modified_by);
CREATE INDEX IF NOT EXISTS idx_clients_kyc_approved_by ON senteloans_members(kyc_approved_by);
