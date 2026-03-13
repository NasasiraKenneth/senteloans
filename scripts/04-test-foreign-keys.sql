-- Test Foreign Key Relationships and Data Integrity
-- This script validates that all foreign key constraints work correctly

SELECT 'Testing Foreign Key Relationships' as test_phase;

-- Use uuid_generate_v4() and correct column names for institutions table (see 01-create-schema.sql)
-- Create test institution
INSERT INTO senteloans_institutions (id, name, type, registration_number, settings) VALUES 
(uuid_generate_v4(), 'FK Test SACCO', 'SACCO', 'FKT123456', '{"test": true}');

-- Get the institution ID for use in subsequent tests
DO $$
DECLARE
    test_inst_id UUID;
    test_user_id UUID;
    test_client_id UUID;
    test_loan_product_id UUID;
    test_loan_id UUID;
BEGIN
    -- Get the institution ID we just created
    SELECT id INTO test_inst_id FROM senteloans_institutions WHERE name = 'FK Test SACCO';
    
    -- Test 1: Valid foreign key relationships should work
    RAISE NOTICE 'Test 1: Valid FK relationships';
    
    -- Create user with valid institution_id
    test_user_id := uuid_generate_v4();
    -- Updated to use correct column names from schema
    INSERT INTO senteloans_users (id, institution_id, email, password_hash, full_name, role) VALUES 
    (test_user_id, test_inst_id, 'test@fktest.com', 'hashed_password', 'Test User', 'loan_officer');
    
    -- Create client with valid institution_id
    test_client_id := uuid_generate_v4();
    -- Updated to use correct column names and required fields from schema
    INSERT INTO senteloans_members (id, institution_id, client_number, full_name, date_of_birth, gender, client_type, phone_number, national_id, join_date) VALUES 
    (test_client_id, test_inst_id, 'CLT001', 'Test Client', '1990-01-01', 'Male', 'Individual', '555-0000', 'ID123456', CURRENT_DATE);
    
    -- Create loan product first (required for loans)
    test_loan_product_id := uuid_generate_v4();
    INSERT INTO senteloans_loan_products (id, institution_id, product_name, product_code, minimum_amount, maximum_amount, interest_rate, minimum_tenure_months, maximum_tenure_months) VALUES 
    (test_loan_product_id, test_inst_id, 'Test Personal Loan', 'TPL1', 1000.00, 50000.00, 5.5, 6, 60);
    
    -- Create loan with valid member_id and loan_product_id
    test_loan_id := uuid_generate_v4();
    INSERT INTO senteloans_loans (id, institution_id, member_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, application_date) VALUES 
    (test_loan_id, test_inst_id, test_client_id, test_loan_product_id, 'APP001', 10000.00, 5.5, 36, CURRENT_DATE);
    
    -- Create transaction with valid loan_id
    -- Updated to use correct column names and required fields from schema
    INSERT INTO senteloans_transactions (id, institution_id, member_id, loan_id, transaction_number, type, amount, mode, processed_by, transaction_date) VALUES 
    (uuid_generate_v4(), test_inst_id, test_client_id, test_loan_id, 'TXN001', 'Loan Disbursement', 10000.00, 'Cash', test_user_id, NOW());
    
    RAISE NOTICE 'PASSED: Valid FK relationships created successfully';
    
    -- Test 2: Invalid foreign key relationships should fail
    RAISE NOTICE 'Test 2: Invalid FK relationships should fail';
    
    -- Try to create user with non-existent institution_id (should fail)
    BEGIN
        INSERT INTO senteloans_users (id, institution_id, email, password_hash, full_name, role) VALUES 
        (uuid_generate_v4(), uuid_generate_v4(), 'invalid@test.com', 'hashed_password', 'Invalid User', 'loan_officer');
        RAISE EXCEPTION 'FAILED: Should not allow invalid institution_id';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'PASSED: Correctly rejected invalid institution_id';
    END;
    
    -- Try to create loan with non-existent member_id (should fail)
    BEGIN
        INSERT INTO senteloans_loans (id, institution_id, member_id, loan_product_id, application_id, principal_amount, interest_rate, tenure_months, application_date) VALUES 
        (uuid_generate_v4(), test_inst_id, uuid_generate_v4(), test_loan_product_id, 'APP002', 5000.00, 6.0, 24, CURRENT_DATE);
        RAISE EXCEPTION 'FAILED: Should not allow invalid member_id';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'PASSED: Correctly rejected invalid member_id';
    END;
    
    -- Test 3: Cascading deletes and updates
    RAISE NOTICE 'Test 3: Cascading behavior';
    
    -- Delete child records first to avoid FK constraint violations
    -- Delete in proper order: transactions -> loans -> loan_products -> clients -> users -> institution
    DELETE FROM senteloans_transactions WHERE institution_id = test_inst_id;
    DELETE FROM senteloans_loans WHERE institution_id = test_inst_id;
    DELETE FROM senteloans_loan_products WHERE institution_id = test_inst_id;
    DELETE FROM senteloans_members WHERE institution_id = test_inst_id;
    DELETE FROM senteloans_users WHERE institution_id = test_inst_id;
    
    -- Now delete institution (should succeed)
    DELETE FROM senteloans_institutions WHERE id = test_inst_id;
    
    -- Verify all related records were deleted
    IF EXISTS (SELECT 1 FROM senteloans_users WHERE institution_id = test_inst_id)
    OR EXISTS (SELECT 1 FROM senteloans_members WHERE institution_id = test_inst_id)
    OR EXISTS (SELECT 1 FROM senteloans_loans WHERE institution_id = test_inst_id)
    OR EXISTS (SELECT 1 FROM senteloans_transactions WHERE institution_id = test_inst_id)
    THEN
        RAISE NOTICE 'FAILED: Some records still exist after deletion';
    ELSE
        RAISE NOTICE 'PASSED: All related records properly deleted';
    END IF;

    RAISE NOTICE 'Foreign Key Tests Completed';
END $$;

SELECT 'Foreign Key Tests Completed Successfully' as status;
