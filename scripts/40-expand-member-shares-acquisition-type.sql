-- Migration 40: Expand member_shares acquisition_type CHECK constraint to include 'buy' and 'sell'

ALTER TABLE member_shares 
    DROP CONSTRAINT IF EXISTS member_shares_acquisition_type_check;

ALTER TABLE member_shares 
    ADD CONSTRAINT member_shares_acquisition_type_check 
    CHECK (
        acquisition_type IN (
            'purchase',
            'transfer_in',
            'transfer_out',
            'redemption',
            'buy',
            'sell'
        )
    );
