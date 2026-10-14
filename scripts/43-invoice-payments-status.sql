-- 43-invoice-payments-status.sql
-- Ensure invoice_payments has the status column (Completed, Cancelled, Reversed)

ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS status VARCHAR(15) DEFAULT 'Completed';
