-- Phase 3: User Accounts Migration Script
-- Creates user accounts based on loan officers and admin users referenced in mock data.
-- Idempotent: ON CONFLICT (email) DO NOTHING so safe to re-run.

DO $$
DECLARE
    platform_id UUID;
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
BEGIN
    -- Get institution IDs
    SELECT id INTO platform_id FROM senteloans_institutions WHERE name = 'SenteLoans Platform';
    SELECT id INTO kampala_sacco_id FROM senteloans_institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM senteloans_institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM senteloans_institutions WHERE name = 'Opportunity Microfinance Uganda';

    -- Create System Admin (Tier 1) for platform
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES (
        uuid_generate_v4(),
        NULL::uuid, -- set later to real Supabase auth user id
        platform_id,
        'admin@senteloans.com',
        'SenteLoans System Admin',
        '+256000000000',
        'system_admin',
        'Active',
        '{"system": {"all": true}}'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Create admin users for each institution
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES 
    -- Kampala Central SACCO Admin
    (
        uuid_generate_v4(),
        NULL::uuid,
        kampala_sacco_id,
        'admin@kampalacentralsacco.ug',
        'John Ssebunya',
        '+256414123456',
        'institution_admin', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": true},
            "loans": {"create": true, "read": true, "update": true, "delete": true, "approve": true, "disburse": true},
            "savings": {"create": true, "read": true, "update": true, "delete": true},
            "transactions": {"create": true, "read": true, "update": true, "delete": true},
            "reports": {"create": true, "read": true, "update": true, "delete": true},
            "users": {"create": true, "read": true, "update": true, "delete": true},
            "settings": {"create": true, "read": true, "update": true, "delete": true}
        }'
    ),
    -- Quick Cash Uganda Admin
    (
        uuid_generate_v4(),
        NULL::uuid,
        quick_cash_id,
        'admin@quickcashug.com',
        'Moses Lubega',
        '+256701987654',
        'institution_admin', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": true},
            "loans": {"create": true, "read": true, "update": true, "delete": true, "approve": true, "disburse": true},
            "transactions": {"create": true, "read": true, "update": true, "delete": true},
            "reports": {"create": true, "read": true, "update": true, "delete": true},
            "users": {"create": true, "read": true, "update": true, "delete": true},
            "settings": {"create": true, "read": true, "update": true, "delete": true}
        }'
    ),
    -- Opportunity MFI Admin
    (
        uuid_generate_v4(),
        NULL::uuid,
        opportunity_mfi_id,
        'admin@opportunityug.org',
        'Sarah Namukasa',
        '+256312456789',
        'institution_admin', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": true},
            "loans": {"create": true, "read": true, "update": true, "delete": true, "approve": true, "disburse": true},
            "savings": {"create": true, "read": true, "update": true, "delete": true},
            "transactions": {"create": true, "read": true, "update": true, "delete": true},
            "reports": {"create": true, "read": true, "update": true, "delete": true},
            "users": {"create": true, "read": true, "update": true, "delete": true},
            "settings": {"create": true, "read": true, "update": true, "delete": true}
        }'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Create loan officers for Kampala Central SACCO
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES 
    (
        uuid_generate_v4(),
        NULL::uuid,
        kampala_sacco_id,
        'annet.mukasa@kampalacentralsacco.ug',
        'Annet Mukasa',
        '+256701111111',
        'loan_officer', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": false},
            "loans": {"create": true, "read": true, "update": true, "delete": false, "approve": false, "disburse": false},
            "savings": {"create": true, "read": true, "update": true, "delete": false},
            "transactions": {"create": true, "read": true, "update": false, "delete": false},
            "reports": {"create": false, "read": true, "update": false, "delete": false}
        }'
    )
    ON CONFLICT (email) DO NOTHING;
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES 
    (
        uuid_generate_v4(),
        NULL::uuid,
        kampala_sacco_id,
        'samuel.kato@kampalacentralsacco.ug',
        'Samuel Kato',
        '+256702222222',
        'loan_officer', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": false},
            "loans": {"create": true, "read": true, "update": true, "delete": false, "approve": false, "disburse": false},
            "savings": {"create": true, "read": true, "update": true, "delete": false},
            "transactions": {"create": true, "read": true, "update": false, "delete": false},
            "reports": {"create": false, "read": true, "update": false, "delete": false}
        }'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Create loan officer for Quick Cash Uganda
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES 
    (
        uuid_generate_v4(),
        NULL::uuid,
        quick_cash_id,
        'peter.ssali@quickcashug.com',
        'Peter Ssali',
        '+256703333333',
        'loan_officer', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": false},
            "loans": {"create": true, "read": true, "update": true, "delete": false, "approve": false, "disburse": false},
            "transactions": {"create": true, "read": true, "update": false, "delete": false},
            "reports": {"create": false, "read": true, "update": false, "delete": false}
        }'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Create loan officer for Opportunity MFI
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES 
    (
        uuid_generate_v4(),
        NULL::uuid,
        opportunity_mfi_id,
        'grace.nakato@opportunityug.org',
        'Grace Nakato',
        '+256704444444',
        'loan_officer', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": false},
            "loans": {"create": true, "read": true, "update": true, "delete": false, "approve": false, "disburse": false},
            "savings": {"create": true, "read": true, "update": true, "delete": false},
            "transactions": {"create": true, "read": true, "update": false, "delete": false},
            "reports": {"create": false, "read": true, "update": false, "delete": false}
        }'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Create additional staff members for each institution
    -- Kampala Central SACCO - Teller
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES 
    (
        uuid_generate_v4(),
        NULL::uuid,
        kampala_sacco_id,
        'mary.nakato@kampalacentralsacco.ug',
        'Mary Nakato',
        '+256705555555',
        'teller', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": false, "read": true, "update": false, "delete": false},
            "loans": {"create": false, "read": true, "update": false, "delete": false, "approve": false, "disburse": false},
            "savings": {"create": false, "read": true, "update": false, "delete": false},
            "transactions": {"create": true, "read": true, "update": false, "delete": false},
            "reports": {"create": false, "read": false, "update": false, "delete": false}
        }'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Quick Cash Uganda - Manager
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES 
    (
        uuid_generate_v4(),
        NULL::uuid,
        quick_cash_id,
        'james.mukasa@quickcashug.com',
        'James Mukasa',
        '+256706666666',
        'manager', -- Updated role to match schema ENUM
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": false},
            "loans": {"create": true, "read": true, "update": true, "delete": false, "approve": true, "disburse": true},
            "transactions": {"create": true, "read": true, "update": true, "delete": false},
            "reports": {"create": true, "read": true, "update": false, "delete": false},
            "users": {"create": false, "read": true, "update": false, "delete": false}
        }'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Opportunity MFI - Field Officer (using loan_officer role as closest match)
    INSERT INTO senteloans_users (
        id,
        supabase_user_id,
        institution_id,
        email,
        full_name,
        phone_number,
        role,
        status,
        permissions
    ) VALUES 
    (
        uuid_generate_v4(),
        NULL::uuid,
        opportunity_mfi_id,
        'patricia.nambi@opportunityug.org',
        'Patricia Nambi',
        '+256707777777',
        'loan_officer', -- Using loan_officer as closest match to Field Officer
        'Active',
        '{
            "clients": {"create": true, "read": true, "update": true, "delete": false},
            "loans": {"create": true, "read": true, "update": true, "delete": false, "approve": false, "disburse": false},
            "savings": {"create": true, "read": true, "update": true, "delete": false},
            "transactions": {"create": false, "read": true, "update": false, "delete": false},
            "reports": {"create": false, "read": true, "update": false, "delete": false}
        }'
    )
    ON CONFLICT (email) DO NOTHING;

END $$;

-- Display results for verification
SELECT 
    'User Accounts Created Successfully' as status,
    COUNT(*) as total_users_created
FROM senteloans_users;

-- Show created users by institution
SELECT 
    i.name as institution_name,
    u.full_name,
    u.email,
    u.role,
    u.status
FROM senteloans_users u
JOIN senteloans_institutions i ON u.institution_id = i.id
ORDER BY i.name, u.role, u.full_name;
