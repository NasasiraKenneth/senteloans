-- Phase 3: Loan Products and Loan Data Migration Script
-- Idempotent: ON CONFLICT DO NOTHING on unique keys so safe to re-run.

DO $$
DECLARE
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
BEGIN
    -- Get institution IDs
    SELECT id INTO kampala_sacco_id FROM senteloans_institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM senteloans_institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM senteloans_institutions WHERE name = 'Opportunity Microfinance Uganda';

    -- Create loan products for Kampala Central SACCO
    INSERT INTO senteloans_loan_products (
        id,
        institution_id,
        product_name,
        product_code,
        description,
        minimum_amount,
        maximum_amount,
        interest_rate,
        minimum_tenure_months,
        maximum_tenure_months,
        interest_calculation_method,
        collateral_required,
        guarantors_required,
        processing_fee_percentage,
        insurance_required,
        eligibility_criteria,
        status
    ) VALUES 
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        'Personal Loan',
        'KCS-PL-001',
        'Personal loans for SACCO members for various personal needs',
        100000,
        5000000,
        15.0,
        6,
        24,
        'reducing_balance',
        false,
        2,
        2.0,
        false,
        '{
            "minimum_shares": 5,
            "minimum_membership_months": 6,
            "minimum_savings_balance": 100000,
            "maximum_loan_to_share_ratio": 3
        }',
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;
    INSERT INTO senteloans_loan_products (
        id,
        institution_id,
        product_name,
        product_code,
        description,
        minimum_amount,
        maximum_amount,
        interest_rate,
        minimum_tenure_months,
        maximum_tenure_months,
        interest_calculation_method,
        collateral_required,
        guarantors_required,
        processing_fee_percentage,
        insurance_required,
        eligibility_criteria,
        status
    ) VALUES 
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        'Agricultural Loan',
        'KCS-AG-001',
        'Loans for agricultural activities and farm development',
        200000,
        10000000,
        12.0,
        12,
        36,
        'reducing_balance',
        true,
        1,
        1.5,
        true,
        '{
            "minimum_shares": 10,
            "minimum_membership_months": 12,
            "farming_experience_years": 2,
            "land_ownership_proof": true
        }',
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;
    INSERT INTO senteloans_loan_products (
        id,
        institution_id,
        product_name,
        product_code,
        description,
        minimum_amount,
        maximum_amount,
        interest_rate,
        minimum_tenure_months,
        maximum_tenure_months,
        interest_calculation_method,
        collateral_required,
        guarantors_required,
        processing_fee_percentage,
        insurance_required,
        eligibility_criteria,
        status
    ) VALUES 
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        'Emergency Loan',
        'KCS-EM-001',
        'Quick loans for emergency situations',
        50000,
        1000000,
        18.0,
        3,
        12,
        'reducing_balance',
        false,
        1,
        3.0,
        false,
        '{
            "minimum_shares": 3,
            "minimum_membership_months": 3,
            "emergency_documentation": true
        }',
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;

    -- Create loan products for Quick Cash Uganda (Money Lender)
    INSERT INTO senteloans_loan_products (
        id,
        institution_id,
        product_name,
        product_code,
        description,
        minimum_amount,
        maximum_amount,
        interest_rate,
        minimum_tenure_months,
        maximum_tenure_months,
        interest_calculation_method,
        collateral_required,
        guarantors_required,
        processing_fee_percentage,
        insurance_required,
        eligibility_criteria,
        status
    ) VALUES 
    (
        uuid_generate_v4(),
        quick_cash_id,
        'Quick Cash Loan',
        'QCU-QC-001',
        'Fast cash loans with collateral security',
        100000,
        2000000,
        25.0,
        1,
        6,
        'flat_rate',
        true,
        0,
        5.0,
        false,
        '{
            "minimum_age": 18,
            "maximum_age": 65,
            "collateral_value_ratio": 1.5,
            "income_verification": true
        }',
        'Active'
    ),
    (
        uuid_generate_v4(),
        quick_cash_id,
        'Business Loan',
        'QCU-BL-001',
        'Business loans for small enterprises',
        200000,
        5000000,
        22.0,
        3,
        12,
        'flat_rate',
        true,
        1,
        4.0,
        false,
        '{
            "business_registration": true,
            "business_experience_months": 6,
            "collateral_value_ratio": 1.2
        }',
        'Active'
    ),
    (
        uuid_generate_v4(),
        quick_cash_id,
        'Emergency Loan',
        'QCU-EM-001',
        'Emergency loans with high interest for urgent needs',
        50000,
        1000000,
        30.0,
        1,
        3,
        'flat_rate',
        true,
        0,
        6.0,
        false,
        '{
            "minimum_age": 18,
            "collateral_required": true,
            "emergency_documentation": true
        }',
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;

    -- Create loan products for Opportunity Microfinance Uganda (MFI)
    INSERT INTO senteloans_loan_products (
        id,
        institution_id,
        product_name,
        product_code,
        description,
        minimum_amount,
        maximum_amount,
        interest_rate,
        minimum_tenure_months,
        maximum_tenure_months,
        interest_calculation_method,
        collateral_required,
        guarantors_required,
        processing_fee_percentage,
        insurance_required,
        eligibility_criteria,
        status
    ) VALUES 
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        'Micro Business Loan',
        'OMU-MB-001',
        'Small loans for micro-enterprises and women entrepreneurs',
        50000,
        2000000,
        18.0,
        6,
        24,
        'reducing_balance',
        false,
        2,
        2.5,
        true,
        '{
            "minimum_age": 18,
            "business_plan_required": true,
            "group_membership_preferred": true,
            "women_entrepreneur_priority": true
        }',
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;
    INSERT INTO senteloans_loan_products (
        id,
        institution_id,
        product_name,
        product_code,
        description,
        minimum_amount,
        maximum_amount,
        interest_rate,
        minimum_tenure_months,
        maximum_tenure_months,
        interest_calculation_method,
        collateral_required,
        guarantors_required,
        processing_fee_percentage,
        insurance_required,
        eligibility_criteria,
        status
    ) VALUES 
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        'Group Loan',
        'OMU-GL-001',
        'Loans for registered groups and cooperatives',
        100000,
        10000000,
        16.0,
        12,
        36,
        'reducing_balance',
        false,
        0,
        1.5,
        true,
        '{
            "group_registration": true,
            "group_savings_history": 6,
            "group_size_minimum": 5,
            "group_size_maximum": 30
        }',
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;

END $$;

-- Now migrate the actual loan data
DO $$
DECLARE
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
    
    -- Client IDs
    sarah_id UUID;
    david_id UUID;
    grace_id UUID;
    moses_id UUID;
    betty_id UUID;
    james_id UUID;
    agnes_id UUID;
    
    -- Product IDs
    personal_loan_id UUID;
    agricultural_loan_id UUID;
    emergency_loan_kcs_id UUID;
    quick_cash_loan_id UUID;
    business_loan_id UUID;
    emergency_loan_qcu_id UUID;
    micro_business_loan_id UUID;
BEGIN
    -- Get institution IDs
    SELECT id INTO kampala_sacco_id FROM senteloans_institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM senteloans_institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM senteloans_institutions WHERE name = 'Opportunity Microfinance Uganda';

    -- Get client IDs
    SELECT id INTO sarah_id FROM senteloans_clients WHERE client_number = 'SL001';
    SELECT id INTO david_id FROM senteloans_clients WHERE client_number = 'SL002';
    SELECT id INTO grace_id FROM senteloans_clients WHERE client_number = 'SL003';
    SELECT id INTO moses_id FROM senteloans_clients WHERE client_number = 'QC001';
    SELECT id INTO betty_id FROM senteloans_clients WHERE client_number = 'QC002';
    SELECT id INTO james_id FROM senteloans_clients WHERE client_number = 'QC003';
    SELECT id INTO agnes_id FROM senteloans_clients WHERE client_number = 'OM001';

    -- Get product IDs
    SELECT id INTO personal_loan_id FROM senteloans_loan_products WHERE product_code = 'KCS-PL-001';
    SELECT id INTO agricultural_loan_id FROM senteloans_loan_products WHERE product_code = 'KCS-AG-001';
    SELECT id INTO emergency_loan_kcs_id FROM senteloans_loan_products WHERE product_code = 'KCS-EM-001';
    SELECT id INTO quick_cash_loan_id FROM senteloans_loan_products WHERE product_code = 'QCU-QC-001';
    SELECT id INTO business_loan_id FROM senteloans_loan_products WHERE product_code = 'QCU-BL-001';
    SELECT id INTO emergency_loan_qcu_id FROM senteloans_loan_products WHERE product_code = 'QCU-EM-001';
    SELECT id INTO micro_business_loan_id FROM senteloans_loan_products WHERE product_code = 'OMU-MB-001';

    -- Insert loans for Kampala Central SACCO
    INSERT INTO senteloans_loans (
        id,
        institution_id,
        client_id,
        loan_product_id,
        application_id,
        principal_amount,
        interest_rate,
        tenure_months,
        status,
        application_date,
        disbursement_date,
        outstanding_balance,
        next_payment_date,
        overdue_days,
        purpose,
        collateral_description
    ) VALUES 
    -- Sarah Nakamya - Personal Loan
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        sarah_id,
        personal_loan_id,
        'LA001',
        2000000,
        15.0,
        12,
        'Disbursed',
        '2023-06-01',
        '2023-06-05',
        1500000,
        '2024-01-05',
        0,
        'Business expansion',
        NULL
    ),
    -- David Ssemakula - Agricultural Loan
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        david_id,
        agricultural_loan_id,
        'LA002',
        1500000,
        12.0,
        18,
        'Applied',
        '2023-12-15',
        NULL,
        1500000,
        NULL,
        0,
        'Farm equipment purchase',
        NULL
    ),
    -- Grace Namugga - Emergency Loan
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        grace_id,
        emergency_loan_kcs_id,
        'LA003',
        500000,
        18.0,
        6,
        'Defaulted',
        '2023-08-01',
        '2023-08-03',
        450000,
        '2023-12-03',
        45,
        'Medical emergency',
        'Motorcycle - UBD 123A'
    )
    ON CONFLICT (institution_id, application_id) DO NOTHING;

    -- Insert loans for Quick Cash Uganda
    INSERT INTO senteloans_loans (
        id,
        institution_id,
        client_id,
        loan_product_id,
        application_id,
        principal_amount,
        interest_rate,
        tenure_months,
        status,
        application_date,
        disbursement_date,
        outstanding_balance,
        next_payment_date,
        overdue_days,
        purpose,
        collateral_description
    ) VALUES 
    -- Moses Kiprotich - Quick Cash Loan
    (
        uuid_generate_v4(),
        quick_cash_id,
        moses_id,
        quick_cash_loan_id,
        'QC001',
        800000,
        25.0,
        3,
        'Disbursed',
        '2023-11-01',
        '2023-11-02',
        600000,
        '2024-01-02',
        0,
        'Motorcycle repair',
        'Motorcycle - UBE 456B'
    ),
    -- Betty Nakato - Business Loan
    (
        uuid_generate_v4(),
        quick_cash_id,
        betty_id,
        business_loan_id,
        'QC002',
        1200000,
        22.0,
        6,
        'Disbursed',
        '2023-10-15',
        '2023-10-16',
        900000,
        '2024-01-16',
        0,
        'Salon equipment',
        'Shop inventory'
    ),
    -- James Okello - Emergency Loan
    (
        uuid_generate_v4(),
        quick_cash_id,
        james_id,
        emergency_loan_qcu_id,
        'QC003',
        500000,
        30.0,
        2,
        'Applied',
        '2023-12-20',
        NULL,
        500000,
        NULL,
        0,
        'Medical bills',
        'Garage tools'
    )
    ON CONFLICT (institution_id, application_id) DO NOTHING;

    -- Insert loans for Opportunity Microfinance Uganda
    INSERT INTO senteloans_loans (
        id,
        institution_id,
        client_id,
        loan_product_id,
        application_id,
        principal_amount,
        interest_rate,
        tenure_months,
        status,
        application_date,
        disbursement_date,
        outstanding_balance,
        next_payment_date,
        overdue_days,
        purpose,
        collateral_description
    ) VALUES 
    -- Agnes Namutebi - Micro Business Loan
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        agnes_id,
        micro_business_loan_id,
        'OM001',
        300000,
        18.0,
        12,
        'Disbursed',
        '2023-09-01',
        '2023-09-05',
        200000,
        '2024-01-05',
        0,
        'Market stall expansion',
        NULL
    )
    ON CONFLICT (institution_id, application_id) DO NOTHING;

END $$;

-- Create loan repayment schedules for disbursed loans
INSERT INTO senteloans_loan_repayments (
    id,
    loan_id,
    installment_number,
    due_date,
    principal_amount,
    interest_amount,
    status
)
SELECT 
    uuid_generate_v4(),
    l.id,
    installment_num,
    l.disbursement_date + (installment_num * INTERVAL '1 month'),
    l.principal_amount / l.tenure_months,
    (l.principal_amount * l.interest_rate / 100) / 12,
    -- Cast status values to repayment_status ENUM type
    CASE 
        WHEN l.disbursement_date + (installment_num * INTERVAL '1 month') < CURRENT_DATE 
        THEN 'Paid'::repayment_status
        ELSE 'Pending'::repayment_status
    END
FROM senteloans_loans l
CROSS JOIN generate_series(1, l.tenure_months) AS installment_num
WHERE l.status = 'Disbursed'
ON CONFLICT (loan_id, installment_number) DO NOTHING;

-- Add loan guarantors for SACCO loans that require them
DO $$
DECLARE
    sarah_loan_id UUID;
    grace_loan_id UUID;
    david_id UUID;
    grace_id UUID;
    patricia_id UUID;
BEGIN
    -- Get loan IDs for SACCO loans that need guarantors
    SELECT l.id INTO sarah_loan_id 
    FROM senteloans_loans l 
    JOIN senteloans_clients c ON l.client_id = c.id 
    WHERE c.client_number = 'SL001' AND l.application_id = 'LA001';
    
    SELECT l.id INTO grace_loan_id 
    FROM senteloans_loans l 
    JOIN senteloans_clients c ON l.client_id = c.id 
    WHERE c.client_number = 'SL003' AND l.application_id = 'LA003';

    -- Get client IDs for guarantors (other SACCO members)
    SELECT id INTO david_id FROM senteloans_clients WHERE client_number = 'SL002';
    SELECT id INTO grace_id FROM senteloans_clients WHERE client_number = 'SL003';
    SELECT id INTO patricia_id FROM senteloans_clients WHERE client_number = 'SL004';

    -- Insert guarantors for Sarah's Personal Loan (requires 2 guarantors)
    INSERT INTO senteloans_loan_guarantors (
        id,
        loan_id,
        guarantor_client_id,
        guaranteed_amount,
        status
    ) VALUES 
    (
        uuid_generate_v4(),
        sarah_loan_id,
        david_id,
        1000000, -- 50% of loan amount
        'Active'
    ),
    (
        uuid_generate_v4(),
        sarah_loan_id,
        patricia_id,
        1000000, -- 50% of loan amount
        'Active'
    )
    ON CONFLICT (loan_id, guarantor_client_id) DO NOTHING;

    -- Insert guarantor for Grace's Emergency Loan (requires 1 guarantor)
    INSERT INTO senteloans_loan_guarantors (
        id,
        loan_id,
        guarantor_client_id,
        guaranteed_amount,
        status
    ) VALUES 
    (
        uuid_generate_v4(),
        grace_loan_id,
        david_id,
        500000, -- Full loan amount
        'Active'
    )
    ON CONFLICT (loan_id, guarantor_client_id) DO NOTHING;

END $$;

-- Display results for verification
SELECT 
    'Loan Products and Loans Migration Completed' as status,
    (SELECT COUNT(*) FROM senteloans_loan_products) as loan_products_created,
    (SELECT COUNT(*) FROM senteloans_loans) as loans_created,
    (SELECT COUNT(*) FROM senteloans_loan_repayments) as repayment_schedules_created,
    (SELECT COUNT(*) FROM senteloans_loan_guarantors) as loan_guarantors_created;

-- Show loan products by institution
SELECT 
    i.name as institution_name,
    COUNT(lp.id) as loan_products_count,
    STRING_AGG(lp.product_name, ', ') as products
FROM senteloans_institutions i
LEFT JOIN senteloans_loan_products lp ON i.id = lp.institution_id
GROUP BY i.id, i.name
ORDER BY i.name;

-- Show loans summary by institution
SELECT 
    i.name as institution_name,
    COUNT(l.id) as total_loans,
    COUNT(CASE WHEN l.status = 'Disbursed' THEN 1 END) as disbursed_loans,
    COUNT(CASE WHEN l.status = 'Applied' THEN 1 END) as pending_loans,
    SUM(l.principal_amount) as total_loan_amount,
    SUM(l.outstanding_balance) as total_outstanding
FROM senteloans_institutions i
LEFT JOIN senteloans_loans l ON i.id = l.institution_id
GROUP BY i.id, i.name
ORDER BY i.name;

-- Show loan guarantors summary
SELECT 
    c1.full_name as borrower_name, -- Changed from c1.name to c1.full_name
    l.application_id,
    l.principal_amount,
    c2.full_name as guarantor_name, -- Changed from c2.name to c2.full_name
    lg.guaranteed_amount,
    lg.status as guarantor_status
FROM senteloans_loan_guarantors lg
JOIN senteloans_loans l ON lg.loan_id = l.id
JOIN senteloans_clients c1 ON l.client_id = c1.id
JOIN senteloans_clients c2 ON lg.guarantor_client_id = c2.id
ORDER BY l.application_id, lg.guaranteed_amount DESC;
