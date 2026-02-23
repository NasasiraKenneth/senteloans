-- Add monthly_savings column to senteloans_clients
-- Tracks the agreed monthly savings contribution for each member

ALTER TABLE senteloans_clients
  ADD COLUMN IF NOT EXISTS monthly_savings DECIMAL(15,2) DEFAULT 0 CHECK (monthly_savings >= 0);
