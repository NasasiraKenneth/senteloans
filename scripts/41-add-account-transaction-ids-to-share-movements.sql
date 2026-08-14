-- Migration 41: Ensure seller_account_transaction_id and buyer_account_transaction_id columns exist on share_movements

CREATE TABLE IF NOT EXISTS share_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_member_shares_id UUID NOT NULL REFERENCES member_shares(id) ON DELETE CASCADE,
    to_member_shares_id UUID NOT NULL REFERENCES member_shares(id) ON DELETE CASCADE,
    move_type VARCHAR(30) CHECK (move_type IN ('transfer', 'buy_out')),
    seller_account_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    buyer_account_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE share_movements 
    ADD COLUMN IF NOT EXISTS seller_account_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS buyer_account_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
