-- Expense Payment ledger rows: require exactly one of staff_id or third_party_agent_id (matches expense cashflow assignee).

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS chk_expense_payment_staff_or_third_party_agent;

ALTER TABLE transactions
  ADD CONSTRAINT chk_expense_payment_staff_or_third_party_agent CHECK (
    type != 'Expense Payment'::transaction_type
    OR (
      (staff_id IS NOT NULL AND third_party_agent_id IS NULL)
      OR (staff_id IS NULL AND third_party_agent_id IS NOT NULL)
    )
  );
