-- Links payments (transactions or membership-fee rows) to invoices.
-- Paid/outstanding amounts are computed from SUM(amount) on read.

CREATE TABLE IF NOT EXISTS senteloans_invoice_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES senteloans_invoices(id) ON DELETE RESTRICT,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_id UUID REFERENCES senteloans_transactions(id) ON DELETE SET NULL,
    membership_fee_id UUID REFERENCES senteloans_membership_fees(id) ON DELETE SET NULL,
    processed_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_invoice_payment_source
      CHECK (
        (transaction_id IS NOT NULL AND membership_fee_id IS NULL) OR
        (transaction_id IS NULL AND membership_fee_id IS NOT NULL)
      )
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id
  ON senteloans_invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_transaction_id
  ON senteloans_invoice_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_membership_fee_id
  ON senteloans_invoice_payments(membership_fee_id);
