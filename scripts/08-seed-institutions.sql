-- Phase 3: Institution Seed Data Script
-- Creates sample institutions matching the exact schema structure.
-- Idempotent: skips rows that already exist (safe to re-run migrations).

INSERT INTO senteloans_institutions (
    id,
    name,
    type,
    registration_number,
    license_number,
    address,
    phone_number,
    email,
    website,
    established_date,
    status,
    settings
) VALUES 
(
    uuid_generate_v4(),
    'SenteLoans Platform',
    'MFI',
    'PLAT-REG-000',
    NULL,
    'SenteLoans HQ, Kampala, Uganda',
    '+256000000000',
    'admin@senteloans.com',
    'https://senteloans.com',
    '2024-01-01',
    'Active',
    '{
        "purpose": "platform",
        "modules": {"savings": false, "loans": false, "shares": false}
    }'
),
(
    uuid_generate_v4(),
    'Kampala Central SACCO',
    'SACCO',
    'SACCO-REG-001-2020',
    'SACCO-LIC-KMP-001',
    'Plot 15, Kampala Road, Kampala, Uganda',
    '+256414123456',
    'info@kampalacentralsacco.ug',
    'https://kampalacentralsacco.ug',
    '2020-01-15',
    'Active',
    '{
        "currency": "UGX",
        "share_value": 50000,
        "minimum_shares": 5,
        "maximum_shares": 100,
        "loan_to_share_ratio": 3,
        "interest_calculation": "reducing_balance",
        "default_savings_interest": 8.0,
        "modules": {
            "savings": true,
            "loans": true,
            "shares": true,
            "mobile_money": true
        },
        "business_hours": {
            "monday": "08:00-17:00",
            "tuesday": "08:00-17:00",
            "wednesday": "08:00-17:00",
            "thursday": "08:00-17:00",
            "friday": "08:00-17:00",
            "saturday": "08:00-13:00",
            "sunday": "closed"
        }
    }'
),
(
    uuid_generate_v4(),
    'Quick Cash Uganda',
    'Money Lender',
    'ML-REG-002-2021',
    'ML-LIC-UGA-002',
    'Shop 45, Owino Market, Kampala, Uganda',
    '+256701987654',
    'loans@quickcashug.com',
    'https://quickcashug.com',
    '2021-03-10',
    'Active',
    '{
        "currency": "UGX",
        "collateral_required": true,
        "maximum_loan_amount": 5000000,
        "minimum_loan_amount": 100000,
        "interest_calculation": "flat_rate",
        "default_interest_rate": 25.0,
        "modules": {
            "savings": false,
            "loans": true,
            "shares": false,
            "mobile_money": true
        },
        "business_hours": {
            "monday": "08:00-18:00",
            "tuesday": "08:00-18:00",
            "wednesday": "08:00-18:00",
            "thursday": "08:00-18:00",
            "friday": "08:00-18:00",
            "saturday": "08:00-16:00",
            "sunday": "10:00-14:00"
        }
    }'
),
(
    uuid_generate_v4(),
    'Opportunity Microfinance Uganda',
    'MFI',
    'MFI-REG-003-2019',
    'MFI-LIC-UGA-003',
    'Microfinance House, Jinja Road, Kampala, Uganda',
    '+256312456789',
    'info@opportunityug.org',
    'https://opportunityug.org',
    '2019-06-20',
    'Active',
    '{
        "currency": "UGX",
        "focus_group": "women_entrepreneurs",
        "maximum_loan_amount": 2000000,
        "minimum_loan_amount": 50000,
        "interest_calculation": "reducing_balance",
        "default_interest_rate": 18.0,
        "group_lending": true,
        "modules": {
            "savings": true,
            "loans": true,
            "shares": false,
            "mobile_money": true,
            "group_management": true
        },
        "business_hours": {
            "monday": "08:00-17:00",
            "tuesday": "08:00-17:00",
            "wednesday": "08:00-17:00",
            "thursday": "08:00-17:00",
            "friday": "08:00-17:00",
            "saturday": "closed",
            "sunday": "closed"
        }
    }'
)
ON CONFLICT (registration_number) DO NOTHING;

-- Display results for verification
SELECT 
    'Institution Seed Data Created' as status,
    COUNT(*) as institutions_created
FROM senteloans_institutions;

-- Show created institutions with their details
SELECT 
    id,
    name,
    type,
    registration_number,
    license_number,
    status,
    established_date
FROM senteloans_institutions
ORDER BY established_date;
