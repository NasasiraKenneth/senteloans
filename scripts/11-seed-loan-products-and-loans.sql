-- Phase 3: Loan Products and Loan Data Migration Script
-- Idempotent: ON CONFLICT DO NOTHING on unique keys so safe to re-run.

DO $$
DECLARE
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
    kampala_sacco_branch_id UUID;
    quick_cash_branch_id UUID;
    opportunity_mfi_branch_id UUID;
BEGIN
    -- Get institution IDs
    SELECT id INTO kampala_sacco_id FROM institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM institutions WHERE name = 'Opportunity Microfinance Uganda';
    SELECT id INTO kampala_sacco_branch_id FROM branches WHERE institution_id = kampala_sacco_id ORDER BY created_at LIMIT 1;
    SELECT id INTO quick_cash_branch_id FROM branches WHERE institution_id = quick_cash_id ORDER BY created_at LIMIT 1;
    SELECT id INTO opportunity_mfi_branch_id FROM branches WHERE institution_id = opportunity_mfi_id ORDER BY created_at LIMIT 1;
    -- Create loan products for Kampala Central SACCO
    INSERT INTO loan_products (
        id,
        institution_id,
        branch_id,
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
        status
    ) VALUES
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        kampala_sacco_branch_id,
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
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;
    INSERT INTO loan_products (
        id,
        institution_id,
        branch_id,
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
        status
    ) VALUES
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        kampala_sacco_branch_id,
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
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;
    INSERT INTO loan_products (
        id,
        institution_id,
        branch_id,
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
        status
    ) VALUES
    (
        uuid_generate_v4(),
        kampala_sacco_id,
        kampala_sacco_branch_id,
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
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;

    -- Create loan products for Quick Cash Uganda (Money Lender)
    INSERT INTO loan_products (
        id,
        institution_id,
        branch_id,
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
        status
    ) VALUES
    (
        uuid_generate_v4(),
        quick_cash_id,
        quick_cash_branch_id,
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
        'Active'
    ),
    (
        uuid_generate_v4(),
        quick_cash_id,
        quick_cash_branch_id,
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
        'Active'
    ),
    (
        uuid_generate_v4(),
        quick_cash_id,
        quick_cash_branch_id,
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
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;

    -- Create loan products for Opportunity Microfinance Uganda (MFI)
    INSERT INTO loan_products (
        id,
        institution_id,
        branch_id,
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
        status
    ) VALUES
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        opportunity_mfi_branch_id,
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
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;
    INSERT INTO loan_products (
        id,
        institution_id,
        branch_id,
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
        status
    ) VALUES
    (
        uuid_generate_v4(),
        opportunity_mfi_id,
        opportunity_mfi_branch_id,
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
        'Active'
    )
    ON CONFLICT (institution_id, product_code) DO NOTHING;

    -- Seed product eligibility statements in normalized table
    INSERT INTO loan_product_eligibilities (loan_product_id, eligibility, status)
    SELECT lp.id, e.eligibility, 'Active'
    FROM loan_products lp
    JOIN (
      VALUES
        ('KCS-PL-001', 'minimum of 5 shares'),
        ('KCS-PL-001', 'minimum of 6 membership months'),
        ('KCS-PL-001', 'minimum savings balance of 100000'),
        ('KCS-PL-001', 'maximum loan to share ratio of 3'),

        ('KCS-AG-001', '10 minimum shares'),
        ('KCS-AG-001', 'minimum of 12 membership months'),
        ('KCS-AG-001', 'Proof of land ownership'),
        ('KCS-AG-001', '2 and more farming experience years'),

        ('KCS-EM-001', 'minimum of 3 shares'),
        ('KCS-EM-001', 'minimum of 3 membership months'),
        ('KCS-EM-001', 'Emergency documentation required'),

        ('QCU-QC-001', 'minimum age 18 years'),
        ('QCU-QC-001', 'maximum age 65 years'),
        ('QCU-QC-001', 'collateral value ratio 1.5'),
        ('QCU-QC-001', 'income verification required'),

        ('QCU-BL-001', 'business registration required'),
        ('QCU-BL-001', 'minimum 6 months business experience'),
        ('QCU-BL-001', 'collateral value ratio 1.2'),

        ('QCU-EM-001', 'minimum age 18 years'),
        ('QCU-EM-001', 'collateral required'),
        ('QCU-EM-001', 'emergency documentation required'),

        ('OMU-MB-001', 'minimum age 18 years'),
        ('OMU-MB-001', 'business plan required'),
        ('OMU-MB-001', 'group membership preferred'),
        ('OMU-MB-001', 'women entrepreneur priority'),

        ('OMU-GL-001', 'group registration required'),
        ('OMU-GL-001', 'group savings history minimum 6 months'),
        ('OMU-GL-001', 'group size minimum 5'),
        ('OMU-GL-001', 'group size maximum 30')
    ) AS e(product_code, eligibility)
      ON lp.product_code = e.product_code
    ON CONFLICT (loan_product_id, eligibility) DO NOTHING;

END $$;

-- Loan data seeding intentionally removed (applications, repayments, guarantors).
-- This script now seeds only loan products and normalized product eligibilities.

-- Display results for verification
SELECT 
    'Loan Products Migration Completed' as status,
    (SELECT COUNT(*) FROM loan_products) as loan_products_created,
    (SELECT COUNT(*) FROM loan_product_eligibilities) as eligibilities_created;

-- Show loan products by institution
SELECT 
    i.name as institution_name,
    COUNT(lp.id) as loan_products_count,
    STRING_AGG(lp.product_name, ', ') as products
FROM institutions i
LEFT JOIN loan_products lp ON i.id = lp.institution_id
GROUP BY i.id, i.name
ORDER BY i.name;

-- Show eligibilities summary by product
SELECT 
    lp.product_code,
    lp.product_name,
    COUNT(e.id) as eligibility_count
FROM loan_products lp
LEFT JOIN loan_product_eligibilities e
  ON e.loan_product_id = lp.id
GROUP BY lp.product_code, lp.product_name
ORDER BY lp.product_code;
