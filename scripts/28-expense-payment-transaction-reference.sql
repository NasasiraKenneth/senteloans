-- Expense Payment transactions use staff_id or client_id (not account/loan/member).
-- Extend chk_transactions_reference so completing an expense cashflow can post to the ledger.

ALTER TABLE senteloans_transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_reference;

ALTER TABLE senteloans_transactions
  ADD CONSTRAINT chk_transactions_reference CHECK (
    type::text IN ('Fee Payment', 'Shares Purchase', 'Expense Payment') OR
    (
      account_id IS NOT NULL OR
      loan_id IS NOT NULL OR
      sacco_loan_id IS NOT NULL OR
      member_id IS NOT NULL OR
      client_id IS NOT NULL OR
      staff_id IS NOT NULL
    )
  );
