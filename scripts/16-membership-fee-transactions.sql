-- Allow "Fee Payment" transactions to have both account_id and loan_id as NULL
-- This is needed for membership fee payments which aren't tied to a savings account or loan

SET search_path = public;

-- 1. Drop the existing constraint
ALTER TABLE senteloans_transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_reference;

-- 2. Re-create with an exception for Fee Payment type
ALTER TABLE senteloans_transactions
  ADD CONSTRAINT chk_transactions_reference CHECK (
    type = 'Fee Payment' OR
    (account_id IS NOT NULL OR loan_id IS NOT NULL)
  );
