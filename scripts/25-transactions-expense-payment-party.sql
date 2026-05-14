-- Expense Payment ledger rows: require exactly one of staff_id or client_id (matches expense cashflow assignee).

ALTER TABLE senteloans_transactions
  DROP CONSTRAINT IF EXISTS chk_expense_payment_staff_or_client;

ALTER TABLE senteloans_transactions
  ADD CONSTRAINT chk_expense_payment_staff_or_client CHECK (
    type != 'Expense Payment'::transaction_type
    OR (
      (staff_id IS NOT NULL AND client_id IS NULL)
      OR (staff_id IS NULL AND client_id IS NOT NULL)
    )
  );
