-- Migration script to create the savings_plan table if it does not exist.
CREATE TABLE IF NOT EXISTS savings_plan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID NOT NULL
        REFERENCES branches(id) ON DELETE CASCADE,
    auto_savings_day VARCHAR(30), -- monday to sunday for weekly and eg 2 or 2nd for monthly or qua (NEXT IS 2ND FOR NEXT MONTH EASY) FIXED DAY THAT IS SUNDAY OR 2ND
    frequency_unit VARCHAR(15), -- MONTH, WEEK, DAY, YEAR
    frequency_value VARCHAR(15), -- 4, 1, 2 etc
    use_account_saving_day VARCHAR(10) DEFAULT 'false',
    start_date DATE,
    next_billing_date DATE,
    last_billing_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uk_savings_plan_branch UNIQUE (branch_id)
);

ALTER TABLE savings_plan ADD COLUMN IF NOT EXISTS use_account_saving_day VARCHAR(10) DEFAULT 'false';

