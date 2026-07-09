-- Preserve original tenure_months; track remaining separately (aligned with member loans).
ALTER TABLE institution_loans
  ADD COLUMN IF NOT EXISTS remaining_tenure_months INTEGER;

UPDATE institution_loans
   SET remaining_tenure_months = GREATEST(tenure_months, 0)
 WHERE remaining_tenure_months IS NULL;

ALTER TABLE institution_loans
  ALTER COLUMN remaining_tenure_months SET DEFAULT 0;

ALTER TABLE institution_loans
  DROP CONSTRAINT IF EXISTS institution_loans_remaining_tenure_months_check;

ALTER TABLE institution_loans
  ADD CONSTRAINT institution_loans_remaining_tenure_months_check
  CHECK (remaining_tenure_months IS NULL OR remaining_tenure_months >= 0);

COMMENT ON COLUMN institution_loans.remaining_tenure_months IS
  'Installments remaining; tenure_months holds the original term.';
