-- Add "Opening Balance" to the transaction_type enum
-- This allows recording opening balances for members migrating from another system

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Opening Balance'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
  ) THEN
    ALTER TYPE transaction_type ADD VALUE 'Opening Balance';
  END IF;
END $$;

-- Update the transactions constraint to allow Opening Balance transactions
-- Opening Balance transactions for savings have account_id set, for loans have loan_id set
-- No special exemption needed since they follow the normal pattern

-- Add an opening_balance_recorded flag to clients to track if opening balances have been set
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS opening_balance_recorded BOOLEAN NOT NULL DEFAULT FALSE;
