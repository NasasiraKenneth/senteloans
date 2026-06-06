-- Add "Shares Purchase" transaction type and allow null account/loan refs for it
-- This supports member share purchases recorded from the member edit flow.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'Shares Purchase'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
  ) THEN
    ALTER TYPE transaction_type ADD VALUE 'Shares Purchase';
  END IF;
END $$;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_reference;

ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_reference CHECK (
    type::text IN ('Fee Payment', 'Shares Purchase') OR
    (
      account_id IS NOT NULL OR
      loan_id IS NOT NULL OR
      sacco_loan_id IS NOT NULL OR
      member_id IS NOT NULL OR
      third_party_agent_id IS NOT NULL
    )
  );
