-- 23-create-invoices.sql
-- Adds invoices and invoice items tables

CREATE TABLE IF NOT EXISTS senteloans_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    member_id UUID REFERENCES senteloans_members(id) ON DELETE RESTRICT,
    client_id UUID REFERENCES senteloans_clients(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    invoice_date DATE NOT NULL,
    invoice_due DATE,
    subtotal DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    vat DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (vat >= 0),
    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    inwords TEXT,
    invoice_type VARCHAR(10) NOT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'Draft',
    created_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ,
    CONSTRAINT chk_invoice_target_exactly_one
      CHECK (
        (member_id IS NOT NULL AND client_id IS NULL) OR
        (member_id IS NULL AND client_id IS NOT NULL)
      )
);

CREATE TABLE IF NOT EXISTS senteloans_invoice_items (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES senteloans_invoices(id) ON DELETE CASCADE,
    unit VARCHAR(15),
    description VARCHAR(120) NOT NULL,
    quantity DECIMAL(15,2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(15,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(15,2) NOT NULL CHECK (total_price >= 0),
    vatinclusive BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_invoices_institution_id ON senteloans_invoices(institution_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_id ON senteloans_invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_member_id ON senteloans_invoices(member_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON senteloans_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON senteloans_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON senteloans_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON senteloans_invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON senteloans_invoice_items(invoice_id);

-- Payment allocations (see also scripts/31-create-invoice-payments.sql for incremental deploys)
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

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON senteloans_invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_transaction_id ON senteloans_invoice_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_membership_fee_id ON senteloans_invoice_payments(membership_fee_id);
