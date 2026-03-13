-- Test Audit Triggers and Logging
-- This script validates that audit trails are properly captured

SELECT 'Testing Audit Triggers' as test_phase;

-- Using DO block with proper UUIDs and correct column names
DO $$
DECLARE
    test_institution_id UUID;
    test_user_id UUID;
    test_client_id UUID;
    test_client_id_2 UUID;
    test_loan_id UUID;
BEGIN
    -- Generate UUIDs for test data
    test_institution_id := uuid_generate_v4();
    test_user_id := uuid_generate_v4();
    test_client_id := uuid_generate_v4();
    test_client_id_2 := uuid_generate_v4();
    test_loan_id := uuid_generate_v4();

    -- Create test institution with correct columns (see 01-create-schema.sql)
    INSERT INTO senteloans_institutions (id, name, type, registration_number, settings) VALUES 
    (test_institution_id, 'Audit Test SACCO', 'SACCO', 'REG-AUDIT-001', '{"audit": true}');

    -- Create test user with correct columns
    -- Updated phone column to match schema (no phone column exists in users table)
    INSERT INTO senteloans_users (id, institution_id, email, role, full_name, password_hash) VALUES 
    (test_user_id, test_institution_id, 'audit@test.com', 'institution_admin', 'Audit User', 'hashed_password');

    -- Store IDs for use in tests
    PERFORM set_config('test.institution_id', test_institution_id::text, true);
    PERFORM set_config('test.user_id', test_user_id::text, true);
    PERFORM set_config('test.member_id', test_client_id::text, true);
    PERFORM set_config('test.client_id_2', test_client_id_2::text, true);
    PERFORM set_config('test.loan_id', test_loan_id::text, true);
END $$;

-- Test 1: Verify audit logs are created on INSERT
SELECT 'Test 1: INSERT audit logging' as test_name;

-- Get initial audit log count
SELECT COUNT(*) as initial_count FROM senteloans_audit_logs WHERE table_name = 'senteloans_members';

-- Removed created_by column that doesn't exist in schema
-- Insert a new client with correct required columns only
INSERT INTO senteloans_members (
    id, 
    institution_id, 
    full_name, 
    client_number, 
    email, 
    phone_number, 
    date_of_birth, 
    gender,
    client_type,
    national_id,
    join_date
) VALUES (
    current_setting('test.member_id')::uuid,
    current_setting('test.institution_id')::uuid,
    'Audit Test Client',
    'CLI-AUDIT-001',
    'audit.client@test.com',
    '+254700000002',
    '1990-01-01',
    'Male',
    'Individual',
    'ID123456789',
    CURRENT_DATE
);

-- Check if audit log was created
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASSED: INSERT audit log created'
        ELSE 'FAILED: INSERT audit log not created'
    END as insert_audit_test
FROM senteloans_audit_logs 
WHERE table_name = 'senteloans_members' 
AND operation = 'INSERT' 
AND record_id = current_setting('test.member_id')::uuid;

-- Test 2: Verify audit logs are created on UPDATE
SELECT 'Test 2: UPDATE audit logging' as test_name;

-- Update the client
-- Updated to use a valid column for testing
UPDATE senteloans_members 
SET occupation = 'Updated Manager'
WHERE id = current_setting('test.member_id')::uuid;

-- Check if audit log was created for update
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASSED: UPDATE audit log created'
        ELSE 'FAILED: UPDATE audit log not created'
    END as update_audit_test
FROM senteloans_audit_logs 
WHERE table_name = 'senteloans_members' 
AND operation = 'UPDATE' 
AND record_id = current_setting('test.member_id')::uuid;

-- Test 3: Verify audit logs capture old and new values
SELECT 'Test 3: Audit log data integrity' as test_name;

-- Check that old and new values are properly captured
SELECT 
    CASE 
        WHEN old_values->>'occupation' != new_values->>'occupation'
        AND new_values->>'occupation' LIKE '%Updated Manager%'
        THEN 'PASSED: Old and new values correctly captured'
        ELSE 'FAILED: Old and new values not properly captured'
    END as data_integrity_test
FROM senteloans_audit_logs 
WHERE table_name = 'senteloans_members' 
AND operation = 'UPDATE' 
AND record_id = current_setting('test.member_id')::uuid
ORDER BY created_at DESC 
LIMIT 1;

-- Test 4: Verify audit logs are created on DELETE
SELECT 'Test 4: DELETE audit logging' as test_name;

-- Delete the client
DELETE FROM senteloans_members WHERE id = current_setting('test.member_id')::uuid;

-- Check if audit log was created for delete
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASSED: DELETE audit log created'
        ELSE 'FAILED: DELETE audit log not created'
    END as delete_audit_test
FROM senteloans_audit_logs 
WHERE table_name = 'senteloans_members' 
AND operation = 'DELETE' 
AND record_id = current_setting('test.member_id')::uuid;

-- Test 5: Verify audit logs for loan operations
SELECT 'Test 5: Loan audit logging' as test_name;

-- Removed created_by column from second client insert as well
-- Create client for loan testing
INSERT INTO senteloans_members (
    id, 
    institution_id, 
    full_name, 
    client_number, 
    email, 
    phone_number, 
    date_of_birth, 
    gender,
    client_type,
    national_id,
    join_date
) VALUES (
    current_setting('test.client_id_2')::uuid,
    current_setting('test.institution_id')::uuid,
    'Loan Test Client',
    'CLI-LOAN-001',
    'loan.client@test.com',
    '+254700000003',
    '1985-05-15',
    'Female',
    'Individual',
    'ID987654321',
    CURRENT_DATE
);

-- Create loan product first (required for loans)
INSERT INTO senteloans_loan_products (
    id,
    institution_id,
    product_name,
    product_code,
    minimum_amount,
    maximum_amount,
    interest_rate,
    minimum_tenure_months,
    maximum_tenure_months
) VALUES (
    uuid_generate_v4(),
    current_setting('test.institution_id')::uuid,
    'Audit Test Product',
    'AUDIT-TP-001',
    1000.00,
    50000.00,
    6.0,
    6,
    60
);

-- Create loan
INSERT INTO senteloans_loans (
    id, 
    institution_id, 
    member_id, 
    loan_product_id,
    application_id,
    principal_amount, 
    interest_rate, 
    tenure_months, 
    status,
    application_date
) VALUES (
    current_setting('test.loan_id')::uuid,
    current_setting('test.institution_id')::uuid,
    current_setting('test.client_id_2')::uuid,
    (SELECT id FROM senteloans_loan_products WHERE institution_id = current_setting('test.institution_id')::uuid LIMIT 1),
    'APP-AUDIT-001',
    15000.00,
    6.0,
    48,
    'Applied',
    CURRENT_DATE
);

-- Update loan status
-- Updated status to match enum values from schema
UPDATE senteloans_loans SET status = 'Approved' WHERE id = current_setting('test.loan_id')::uuid;

-- Check loan audit logs
SELECT 
    CASE 
        WHEN COUNT(*) >= 2 THEN 'PASSED: Loan operations properly audited'
        ELSE 'FAILED: Loan operations not properly audited'
    END as loan_audit_test
FROM senteloans_audit_logs 
WHERE table_name = 'senteloans_loans' 
AND record_id = current_setting('test.loan_id')::uuid;

-- Test 6: Verify audit log performance and indexing
SELECT 'Test 6: Audit log performance' as test_name;

-- Check if indexes exist for efficient querying
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'PASSED: Audit log indexes exist'
        ELSE 'WARNING: Consider adding indexes for audit log performance'
    END as index_test
FROM pg_indexes 
WHERE tablename = 'senteloans_audit_logs';

-- Display audit log summary
SELECT 
    table_name,
    operation,
    COUNT(*) as log_count
FROM senteloans_audit_logs 
WHERE institution_id = current_setting('test.institution_id')::uuid
GROUP BY table_name, operation
ORDER BY table_name, operation;

-- Clean up test data in proper order
DELETE FROM senteloans_loans WHERE institution_id = current_setting('test.institution_id')::uuid;
DELETE FROM senteloans_loan_products WHERE institution_id = current_setting('test.institution_id')::uuid;
DELETE FROM senteloans_members WHERE institution_id = current_setting('test.institution_id')::uuid;
DELETE FROM senteloans_users WHERE institution_id = current_setting('test.institution_id')::uuid;
DELETE FROM senteloans_institutions WHERE id = current_setting('test.institution_id')::uuid;
DELETE FROM senteloans_audit_logs WHERE institution_id = current_setting('test.institution_id')::uuid;

SELECT 'Audit Trigger Tests Completed' as status;
