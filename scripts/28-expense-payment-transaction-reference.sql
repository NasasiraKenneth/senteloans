-- Expense Payment transactions use staff_id or third_party_agent_id (not account/loan/member).
-- Extend chk_transactions_reference so completing an expense cashflow can post to the ledger.

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_reference;

ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_reference CHECK (
    type::text IN ('Fee Payment', 'Shares Purchase', 'Expense Payment') OR
    (
      account_id IS NOT NULL OR
      loan_id IS NOT NULL OR
      sacco_loan_id IS NOT NULL OR
      member_id IS NOT NULL OR
      third_party_agent_id IS NOT NULL OR
      staff_id IS NOT NULL
    )
  );
