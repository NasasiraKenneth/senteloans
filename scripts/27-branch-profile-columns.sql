-- Ensure senteloans_branches has contact / profile columns (no-op if 01-create-schema already applied).
-- Matches scripts/01-create-schema.sql senteloans_branches definition.

ALTER TABLE senteloans_branches ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE senteloans_branches ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE senteloans_branches ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE senteloans_branches ADD COLUMN IF NOT EXISTS established_date DATE;
