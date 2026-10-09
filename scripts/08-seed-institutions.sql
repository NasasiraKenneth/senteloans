-- Phase 3: Institution Seed Data Script
-- Creates sample institutions matching the exact schema structure.
-- Idempotent: skips rows that already exist (safe to re-run migrations).

INSERT INTO institutions (
    id,
    name,
    type,
    registration_number,
    license_number,
    logo,
    website,
    status
) VALUES 
(
    uuid_generate_v4(),
    'SenteLoans Platform',
    'MFI',
    'PLAT-REG-000',
    NULL,
    NULL,
    'https://senteloans.com',
    'Active'
),
(
    uuid_generate_v4(),
    'Kampala Central SACCO',
    'SACCO',
    'SACCO-REG-001-2020',
    'SACCO-LIC-KMP-001',
    NULL,
    'https://kampalacentralsacco.ug',
    'Active'
),
(
    uuid_generate_v4(),
    'Quick Cash Uganda',
    'Money Lender',
    'ML-REG-002-2021',
    'ML-LIC-UGA-002',
    NULL,
    'https://quickcashug.com',
    'Active'
),
(
    uuid_generate_v4(),
    'Opportunity Microfinance Uganda',
    'MFI',
    'MFI-REG-003-2019',
    'MFI-LIC-UGA-003',
    NULL,
    'https://opportunityug.org',
    'Active'
)
ON CONFLICT (registration_number) DO NOTHING;

-- Seed branch types
INSERT INTO branch_types (name, description)
VALUES
  ('Head Office', 'Main institution headquarters'),
  ('Regional Office', 'Regional management office'),
  ('Branch', 'Standard service branch'),
  ('Agent', 'Agent outlet or partner')
ON CONFLICT (name) DO NOTHING;

-- Seed one primary branch per institution so downstream seeds can reference branch_id.
DO $$
DECLARE
    head_office_type_id UUID;
    platform_id UUID;
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
BEGIN
    SELECT id INTO head_office_type_id
    FROM branch_types
    WHERE name = 'Head Office'
    LIMIT 1;

    SELECT id INTO platform_id FROM institutions WHERE name = 'SenteLoans Platform';
    SELECT id INTO kampala_sacco_id FROM institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM institutions WHERE name = 'Opportunity Microfinance Uganda';

    INSERT INTO branches (
        institution_id,
        branch_type_id,
        branch_code,
        name,
        address,
        phone_number,
        email,
        status,
        established_date
    ) VALUES
    (
        platform_id,
        head_office_type_id,
        'PLAT-001',
        'Platform Main Branch',
        'SenteLoans HQ, Kampala, Uganda',
        '+256000000000',
        'admin@senteloans.com',
        'Active',
        '2024-01-01'
    ),
    (
        kampala_sacco_id,
        head_office_type_id,
        'KCS-001',
        'Kampala Main Branch',
        'Plot 15, Kampala Road, Kampala, Uganda',
        '+256414123456',
        'info@kampalacentralsacco.ug',
        'Active',
        '2020-01-15'
    ),
    (
        quick_cash_id,
        head_office_type_id,
        'QCU-001',
        'Central Main Branch',
        'Shop 45, Owino Market, Kampala, Uganda',
        '+256701987654',
        'loans@quickcashug.com',
        'Active',
        '2021-03-10'
    ),
    (
        opportunity_mfi_id,
        head_office_type_id,
        'OMU-001',
        'Kampala Main Branch',
        'Microfinance House, Jinja Road, Kampala, Uganda',
        '+256312456789',
        'info@opportunityug.org',
        'Active',
        '2019-06-20'
    )
    ON CONFLICT (institution_id, branch_code) DO NOTHING;
END $$;

-- Seed branch-level settings in config only (fields from config table).
INSERT INTO config (
    branch_id,
    loans,
    shares,
    savings,
    mobile_money,
    auto_invoices,
    chats,
    currency,
    currency_inwords,
    membership_fee,
    membership_fee_payment,
    share_value,
    minimum_shares,
    maximum_shares,
    maximum_parallel_loans,
    loan_overdue_period,
    loan_overdue_interest,
    loan_overdue_interest_per,
    loan_default_period,
    invoice_overdue_period,
    savings_overdue_period,
    membership_overdue_period,
    membership_overdue_interest,
    membership_overdue_interest_per
)
SELECT
    b.id AS branch_id,
    CASE WHEN i.name = 'SenteLoans Platform' THEN 'false' ELSE 'true' END AS loans,
    CASE WHEN i.type IN ('SACCO', 'MFI') THEN 'true' ELSE 'false' END AS shares,
    CASE WHEN i.type IN ('SACCO', 'MFI') THEN 'true' ELSE 'false' END AS savings,
    CASE WHEN i.name = 'SenteLoans Platform' THEN 'false' ELSE 'true' END AS mobile_money,
    'false' AS auto_invoices,
    CASE WHEN i.name = 'SenteLoans Platform' THEN 'false' ELSE 'true' END AS chats,
    'UGX' AS currency,
    'Ugandan shillings only' AS currency_inwords,
    50000::numeric(18,2) AS membership_fee,
    'annual' AS membership_fee_payment,
    CASE WHEN i.type IN ('SACCO', 'MFI') THEN 50000::numeric(18,2) ELSE 0::numeric(18,2) END AS share_value,
    CASE WHEN i.type IN ('SACCO', 'MFI') THEN 5 ELSE 0 END AS minimum_shares,
    CASE WHEN i.type IN ('SACCO', 'MFI') THEN 100 ELSE NULL END AS maximum_shares,
    1 AS maximum_parallel_loans,
    30 AS loan_overdue_period,
    10::numeric(18,2) AS loan_overdue_interest,
    'day' AS loan_overdue_interest_per,
    90 AS loan_default_period,
    30 AS invoice_overdue_period,
    NULL AS savings_overdue_period,
    30 AS membership_overdue_period,
    0::numeric(18,2) AS membership_overdue_interest,
    'day' AS membership_overdue_interest_per
FROM branches b
JOIN institutions i ON i.id = b.institution_id
WHERE b.branch_code IN ('PLAT-001', 'KCS-001', 'QCU-001', 'OMU-001')
ON CONFLICT (branch_id) DO NOTHING;

-- Inactive email delivery defaults (staff enables + configures in Settings).
INSERT INTO email_settings (
    institution_id,
    branch_id,
    provider,
    is_active
)
SELECT
    b.institution_id,
    b.id,
    'mailgun',
    false
FROM branches b
JOIN institutions i ON i.id = b.institution_id
WHERE b.branch_code IN ('PLAT-001', 'KCS-001', 'QCU-001', 'OMU-001')
ON CONFLICT (branch_id) DO NOTHING;

-- Seed default account types per branch
INSERT INTO account_type (
    id,
    institution_id,
    branch_id,
    account_name,
    status
)
SELECT 
    uuid_generate_v4(),
    b.institution_id,
    b.id,
    t.account_name,
    'Active'::status_type
FROM branches b
JOIN institutions i ON i.id = b.institution_id
CROSS JOIN (
    VALUES 
        ('Voluntary'),
        ('Fixed'),
        ('Shares'),
        ('Group'),
        ('Current')
) AS t(account_name)
WHERE b.branch_code IN ('PLAT-001', 'KCS-001', 'QCU-001', 'OMU-001')
  AND NOT EXISTS (
    SELECT 1 FROM account_type at
    WHERE at.branch_id = b.id AND at.account_name = t.account_name
  );

-- Display results for verification
SELECT 
    'Institution Seed Data Created' as status,
    COUNT(*) as institutions_created
FROM institutions;

-- Show created institutions with their details
SELECT 
    id,
    name,
    type,
    registration_number,
    license_number,
    status
FROM institutions
ORDER BY name;
