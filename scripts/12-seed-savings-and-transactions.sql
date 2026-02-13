-- Phase 3: Savings Accounts and Transaction Data Migration Script
-- Idempotent: ON CONFLICT DO NOTHING on unique keys so safe to re-run.

DO $$
DECLARE
    kampala_sacco_id UUID;
    opportunity_mfi_id UUID;
    
    -- Client IDs for Kampala Central SACCO
    sarah_id UUID;
    david_id UUID;
    grace_id UUID;
    robert_id UUID;
    
    -- Client IDs for Opportunity MFI
    agnes_id UUID;
    womens_group_id UUID;
    patricia_id UUID;
BEGIN
    -- Get institution IDs
    SELECT id INTO kampala_sacco_id FROM senteloans_institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO opportunity_mfi_id FROM senteloans_institutions WHERE name = 'Opportunity Microfinance Uganda';

    -- Get client IDs for Kampala Central SACCO
    SELECT id INTO sarah_id FROM senteloans_clients WHERE client_number = 'SL001';
    SELECT id INTO david_id FROM senteloans_clients WHERE client_number = 'SL002';
    SELECT id INTO grace_id FROM senteloans_clients WHERE client_number = 'SL003';
    SELECT id INTO robert_id FROM senteloans_clients WHERE client_number = 'SL004';

    -- Get client IDs for Opportunity MFI
    SELECT id INTO agnes_id FROM senteloans_clients WHERE client_number = 'OM001';
    SELECT id INTO womens_group_id FROM senteloans_clients WHERE client_number = 'OM002';
    SELECT id INTO patricia_id FROM senteloans_clients WHERE client_number = 'OM003';

    -- Create savings accounts for Kampala Central SACCO clients (no interest_rate in schema)
    INSERT INTO senteloans_savings_accounts (
        id,
        institution_id,
        client_id,
        account_number,
        account_type,
        available_balance,
        total_balance,
        status,
        open_date
    ) VALUES 
    -- Sarah Nakamya - Voluntary Savings
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        sarah_id,
        'SA001',
        'Voluntary',
        850000,
        850000,
        'Active',
        '2023-01-15'
    ),
    -- David Ssemakula - Fixed Deposit
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        david_id,
        'SA002',
        'Fixed',
        1200000,
        1200000,
        'Active',
        '2023-02-20'
    ),
    -- Grace Namugga - Shares Account
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        grace_id,
        'SA003',
        'Shares',
        300000,
        300000,
        'Active',
        '2023-03-10'
    ),
    -- Robert Kiwanuka - Voluntary Savings
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        robert_id,
        'SA004',
        'Voluntary',
        950000,
        950000,
        'Active',
        '2023-04-12'
    )
    ON CONFLICT (institution_id, account_number) DO NOTHING;

    -- Create savings accounts for Opportunity MFI clients
    INSERT INTO senteloans_savings_accounts (
        id,
        institution_id,
        client_id,
        account_number,
        account_type,
        available_balance,
        total_balance,
        status,
        open_date
    ) VALUES 
    -- Agnes Namutebi - Voluntary Savings
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        agnes_id,
        'OM-SA001',
        'Voluntary',
        150000,
        150000,
        'Active',
        '2023-07-10'
    ),
    -- Kampala Women's Group - Group Savings
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        womens_group_id,
        'OM-SA002',
        'Voluntary',
        500000,
        500000,
        'Active',
        '2023-05-20'
    ),
    -- Patricia Nabirye - Voluntary Savings (Inactive)
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        patricia_id,
        'OM-SA003',
        'Voluntary',
        75000,
        75000,
        'Inactive',
        '2023-06-08'
    )
    ON CONFLICT (institution_id, account_number) DO NOTHING;

END $$;

-- Now create transaction data (use fixed transaction numbers so ON CONFLICT works on re-run)
DO $$
DECLARE
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
    
    -- Savings account IDs
    sarah_savings_id UUID;
    david_savings_id UUID;
    grace_savings_id UUID;
    robert_savings_id UUID;
    agnes_savings_id UUID;
    womens_group_savings_id UUID;
    
    -- Client IDs
    sarah_id UUID;
    david_id UUID;
    grace_id UUID;
    robert_id UUID;
    moses_id UUID;
    betty_id UUID;
    james_id UUID;
    agnes_id UUID;
    womens_group_id UUID;
    patricia_id UUID;
    
    -- Loan IDs for loan-related transactions
    sarah_loan_id UUID;
    moses_loan_id UUID;
    betty_loan_id UUID;
    agnes_loan_id UUID;
    
    -- Staff user IDs for processed_by (must reference senteloans_users)
    kampala_staff_id UUID;
    quick_cash_staff_id UUID;
    opportunity_staff_id UUID;
BEGIN
    -- Get institution IDs
    SELECT id INTO kampala_sacco_id FROM senteloans_institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM senteloans_institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM senteloans_institutions WHERE name = 'Opportunity Microfinance Uganda';

    -- Get a staff user per institution for processed_by
    SELECT id INTO kampala_staff_id FROM senteloans_users WHERE institution_id = kampala_sacco_id LIMIT 1;
    SELECT id INTO quick_cash_staff_id FROM senteloans_users WHERE institution_id = quick_cash_id LIMIT 1;
    SELECT id INTO opportunity_staff_id FROM senteloans_users WHERE institution_id = opportunity_mfi_id LIMIT 1;

    -- Get savings account IDs
    SELECT sa.id INTO sarah_savings_id FROM senteloans_savings_accounts sa 
    JOIN senteloans_clients c ON sa.client_id = c.id WHERE c.client_number = 'SL001';
    
    SELECT sa.id INTO david_savings_id FROM senteloans_savings_accounts sa 
    JOIN senteloans_clients c ON sa.client_id = c.id WHERE c.client_number = 'SL002';
    
    SELECT sa.id INTO grace_savings_id FROM senteloans_savings_accounts sa 
    JOIN senteloans_clients c ON sa.client_id = c.id WHERE c.client_number = 'SL003';
    
    SELECT sa.id INTO robert_savings_id FROM senteloans_savings_accounts sa 
    JOIN senteloans_clients c ON sa.client_id = c.id WHERE c.client_number = 'SL004';
    
    SELECT sa.id INTO agnes_savings_id FROM senteloans_savings_accounts sa 
    JOIN senteloans_clients c ON sa.client_id = c.id WHERE c.client_number = 'OM001';
    
    SELECT sa.id INTO womens_group_savings_id FROM senteloans_savings_accounts sa 
    JOIN senteloans_clients c ON sa.client_id = c.id WHERE c.client_number = 'OM002';

    -- Get client IDs
    SELECT id INTO sarah_id FROM senteloans_clients WHERE client_number = 'SL001';
    SELECT id INTO david_id FROM senteloans_clients WHERE client_number = 'SL002';
    SELECT id INTO grace_id FROM senteloans_clients WHERE client_number = 'SL003';
    SELECT id INTO robert_id FROM senteloans_clients WHERE client_number = 'SL004';
    SELECT id INTO moses_id FROM senteloans_clients WHERE client_number = 'QC001';
    SELECT id INTO betty_id FROM senteloans_clients WHERE client_number = 'QC002';
    SELECT id INTO james_id FROM senteloans_clients WHERE client_number = 'QC003';
    SELECT id INTO agnes_id FROM senteloans_clients WHERE client_number = 'OM001';
    SELECT id INTO womens_group_id FROM senteloans_clients WHERE client_number = 'OM002';
    SELECT id INTO patricia_id FROM senteloans_clients WHERE client_number = 'OM003';

    -- Get loan IDs for loan-related transactions
    SELECT l.id INTO sarah_loan_id FROM senteloans_loans l WHERE l.application_id = 'LA001';
    SELECT l.id INTO moses_loan_id FROM senteloans_loans l WHERE l.application_id = 'QC001';
    SELECT l.id INTO betty_loan_id FROM senteloans_loans l WHERE l.application_id = 'QC002';
    SELECT l.id INTO agnes_loan_id FROM senteloans_loans l WHERE l.application_id = 'OM001';

    -- Insert transactions for Kampala Central SACCO
    INSERT INTO senteloans_transactions (
        id,
        institution_id,
        client_id,
        account_id,
        loan_id,
        transaction_number, -- Added missing transaction_number field
        type, -- Changed from transaction_type to type to match schema
        amount,
        mode, -- Changed from payment_mode to mode to match schema
        transaction_date,
        description,
        balance_after,
        reference_number,
        processed_by, -- Added required processed_by field
        status
    ) VALUES 
    -- Sarah Nakamya transactions
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        sarah_id,
        sarah_savings_id,
        NULL,
        'TXN-SEED-KCS-01',
        'Deposit',
        100000,
        'Mobile Money',
        '2023-12-20',
        'Monthly savings deposit',
        850000,
        'TXN-SEED-KCS-01',
        kampala_staff_id,
        'Completed'
    ),
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        sarah_id,
        NULL,
        sarah_loan_id,
        'TXN-SEED-KCS-02',
        'Loan Repayment',
        200000,
        'Cash',
        '2023-12-15',
        'Loan repayment - LA001',
        1500000,
        'TXN-SEED-KCS-02',
        kampala_staff_id,
        'Completed'
    ),
    -- David Ssemakula transactions
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        david_id,
        david_savings_id,
        NULL,
        'TXN-SEED-KCS-03',
        'Deposit',
        150000,
        'Bank Transfer',
        '2023-12-18',
        'Harvest proceeds deposit',
        1200000,
        'TXN-SEED-KCS-03',
        kampala_staff_id,
        'Completed'
    ),
    -- Grace Namugga transactions
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        grace_id,
        grace_savings_id,
        NULL,
        'TXN-SEED-KCS-04',
        'Deposit',
        50000,
        'Cash',
        '2023-11-15',
        'Monthly savings deposit',
        300000,
        'TXN-SEED-KCS-04',
        kampala_staff_id,
        'Completed'
    ),
    -- Robert Kiwanuka transactions
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        robert_id,
        robert_savings_id,
        NULL,
        'TXN-SEED-KCS-05',
        'Deposit',
        200000,
        'Mobile Money',
        '2023-12-10',
        'Salary savings deposit',
        950000,
        'TXN-SEED-KCS-05',
        kampala_staff_id,
        'Completed'
    )
    ON CONFLICT (institution_id, transaction_number) DO NOTHING;

    -- Insert transactions for Quick Cash Uganda (Money Lender - only loan transactions)
    INSERT INTO senteloans_transactions (
        id,
        institution_id,
        client_id,
        account_id,
        loan_id,
        transaction_number, -- Added missing transaction_number field
        type, -- Changed from transaction_type to type to match schema
        amount,
        mode, -- Changed from payment_mode to mode to match schema
        transaction_date,
        description,
        balance_after,
        reference_number,
        processed_by, -- Added required processed_by field
        status
    ) VALUES 
    -- Moses Kiprotich loan transactions
    (
        uuid_generate_v4(),
        quick_cash_id,
        moses_id,
        NULL,
        moses_loan_id,
        'TXN-SEED-QCU-01',
        'Loan Disbursement',
        800000,
        'Cash',
        '2023-11-02',
        'Quick Cash Loan disbursement - QC001',
        800000,
        'TXN-SEED-QCU-01',
        quick_cash_staff_id,
        'Completed'
    ),
    (
        uuid_generate_v4(),
        quick_cash_id,
        moses_id,
        NULL,
        moses_loan_id,
        'TXN-SEED-QCU-02',
        'Loan Repayment',
        200000,
        'Mobile Money',
        '2023-12-02',
        'Loan repayment - QC001',
        600000,
        'TXN-SEED-QCU-02',
        quick_cash_staff_id,
        'Completed'
    ),
    -- Betty Nakato loan transactions
    (
        uuid_generate_v4(),
        quick_cash_id,
        betty_id,
        NULL,
        betty_loan_id,
        'TXN-SEED-QCU-03',
        'Loan Disbursement',
        1200000,
        'Bank Transfer',
        '2023-10-16',
        'Business Loan disbursement - QC002',
        1200000,
        'TXN-SEED-QCU-03',
        quick_cash_staff_id,
        'Completed'
    ),
    (
        uuid_generate_v4(),
        quick_cash_id,
        betty_id,
        NULL,
        betty_loan_id,
        'TXN-SEED-QCU-04',
        'Loan Repayment',
        300000,
        'Cash',
        '2023-11-16',
        'Loan repayment - QC002',
        900000,
        'TXN-SEED-QCU-04',
        quick_cash_staff_id,
        'Completed'
    )
    ON CONFLICT (institution_id, transaction_number) DO NOTHING;

    -- Insert transactions for Opportunity Microfinance Uganda (MFI)
    INSERT INTO senteloans_transactions (
        id,
        institution_id,
        client_id,
        account_id,
        loan_id,
        transaction_number, -- Added missing transaction_number field
        type, -- Changed from transaction_type to type to match schema
        amount,
        mode, -- Changed from payment_mode to mode to match schema
        transaction_date,
        description,
        balance_after,
        reference_number,
        processed_by, -- Added required processed_by field
        status
    ) VALUES 
    -- Agnes Namutebi transactions
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        agnes_id,
        agnes_savings_id,
        NULL,
        'TXN-SEED-OM-01',
        'Deposit',
        50000,
        'Mobile Money',
        '2023-12-15',
        'Monthly savings deposit',
        150000,
        'TXN-SEED-OM-01',
        opportunity_staff_id,
        'Completed'
    ),
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        agnes_id,
        NULL,
        agnes_loan_id,
        'TXN-SEED-OM-02',
        'Loan Repayment',
        100000,
        'Cash',
        '2023-12-05',
        'Loan repayment - OM001',
        200000,
        'TXN-SEED-OM-02',
        opportunity_staff_id,
        'Completed'
    ),
    -- Kampala Women's Group transactions
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        womens_group_id,
        womens_group_savings_id,
        NULL,
        'TXN-SEED-OM-03',
        'Deposit',
        100000,
        'Bank Transfer',
        '2023-12-01',
        'Group monthly contribution',
        500000,
        'TXN-SEED-OM-03',
        opportunity_staff_id,
        'Completed'
    )
    ON CONFLICT (institution_id, transaction_number) DO NOTHING;

END $$;

-- Display results for verification
SELECT 
    'Savings and Transactions Migration Completed' as status,
    (SELECT COUNT(*) FROM senteloans_savings_accounts) as savings_accounts_created,
    (SELECT COUNT(*) FROM senteloans_transactions) as transactions_created;

-- Show savings accounts by institution
SELECT 
    i.name as institution_name,
    COUNT(sa.id) as savings_accounts_count,
    SUM(sa.available_balance) as total_savings_balance,
    COUNT(CASE WHEN sa.status = 'Active' THEN 1 END) as active_accounts
FROM senteloans_institutions i
LEFT JOIN senteloans_savings_accounts sa ON i.id = sa.institution_id
GROUP BY i.id, i.name
ORDER BY i.name;

-- Show transactions summary by institution and type
SELECT 
    i.name as institution_name,
    t.type, -- Changed from transaction_type to type to match schema
    COUNT(t.id) as transaction_count,
    SUM(t.amount) as total_amount
FROM senteloans_institutions i
LEFT JOIN senteloans_transactions t ON i.id = t.institution_id
WHERE t.id IS NOT NULL
GROUP BY i.id, i.name, t.type -- Changed from transaction_type to type
ORDER BY i.name, t.type; -- Changed from transaction_type to type

-- Show overall transaction summary
SELECT 
    type, -- Changed from transaction_type to type to match schema
    COUNT(*) as total_transactions,
    SUM(amount) as total_amount,
    AVG(amount) as average_amount
FROM senteloans_transactions
GROUP BY type -- Changed from transaction_type to type
ORDER BY type; -- Changed from transaction_type to type
