-- In Sacco Transfer treasury postings are keyed by bank_account_id (or cash/mobile
-- float only) and do not require member/account/loan/staff links.

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_reference;

ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_reference CHECK (
    type::text IN (
      'Fee Payment',
      'Shares Purchase',
      'Expense Payment',
      'In Sacco Transfer'
    ) OR
    (
      account_id IS NOT NULL OR
      loan_id IS NOT NULL OR
      sacco_loan_id IS NOT NULL OR
      member_id IS NOT NULL OR
      third_party_agent_id IS NOT NULL OR
      staff_id IS NOT NULL OR
      bank_account_id IS NOT NULL
    )
  );
