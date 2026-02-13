-- Phase 4: Audit Logs Migration Script
-- Idempotent: skip if seed audit logs already exist for these institutions.

DO $$
DECLARE
    seed_count INT;
    -- Institution IDs
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
    
    -- Client IDs
    sarah_id UUID;
    david_id UUID;
    grace_id UUID;
    patricia_id UUID;
    moses_id UUID;
    betty_id UUID;
    james_id UUID;
    agnes_id UUID;
    
    -- Loan IDs
    sarah_loan_id UUID;
    david_loan_id UUID;
    grace_loan_id UUID;
    moses_loan_id UUID;
    betty_loan_id UUID;
    james_loan_id UUID;
    agnes_loan_id UUID;
    
    -- Guarantor IDs
    sarah_guarantor1_id UUID;
    sarah_guarantor2_id UUID;
    grace_guarantor_id UUID;
    
    -- Staff user IDs for user_id (must reference senteloans_users)
    kampala_staff_id UUID;
    quick_cash_staff_id UUID;
    opportunity_staff_id UUID;
BEGIN
    -- Skip if we already have seed audit logs (idempotent re-run)
    SELECT COUNT(*) INTO seed_count FROM senteloans_audit_logs a
    JOIN senteloans_institutions i ON a.institution_id = i.id
    WHERE i.name IN ('Kampala Central SACCO', 'Quick Cash Uganda', 'Opportunity Microfinance Uganda');
    IF seed_count > 0 THEN
        RETURN;
    END IF;

    -- Get institution IDs
    SELECT id INTO kampala_sacco_id FROM senteloans_institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM senteloans_institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM senteloans_institutions WHERE name = 'Opportunity Microfinance Uganda';

    -- Get a staff user per institution for user_id
    SELECT id INTO kampala_staff_id FROM senteloans_users WHERE institution_id = kampala_sacco_id LIMIT 1;
    SELECT id INTO quick_cash_staff_id FROM senteloans_users WHERE institution_id = quick_cash_id LIMIT 1;
    SELECT id INTO opportunity_staff_id FROM senteloans_users WHERE institution_id = opportunity_mfi_id LIMIT 1;

    -- Get client IDs
    SELECT id INTO sarah_id FROM senteloans_clients WHERE client_number = 'SL001';
    SELECT id INTO david_id FROM senteloans_clients WHERE client_number = 'SL002';
    SELECT id INTO grace_id FROM senteloans_clients WHERE client_number = 'SL003';
    SELECT id INTO patricia_id FROM senteloans_clients WHERE client_number = 'SL004';
    SELECT id INTO moses_id FROM senteloans_clients WHERE client_number = 'QC001';
    SELECT id INTO betty_id FROM senteloans_clients WHERE client_number = 'QC002';
    SELECT id INTO james_id FROM senteloans_clients WHERE client_number = 'QC003';
    SELECT id INTO agnes_id FROM senteloans_clients WHERE client_number = 'OM001';

    -- Get loan IDs
    SELECT l.id INTO sarah_loan_id FROM senteloans_loans l JOIN senteloans_clients c ON l.client_id = c.id WHERE c.client_number = 'SL001';
    SELECT l.id INTO david_loan_id FROM senteloans_loans l JOIN senteloans_clients c ON l.client_id = c.id WHERE c.client_number = 'SL002';
    SELECT l.id INTO grace_loan_id FROM senteloans_loans l JOIN senteloans_clients c ON l.client_id = c.id WHERE c.client_number = 'SL003';
    SELECT l.id INTO moses_loan_id FROM senteloans_loans l JOIN senteloans_clients c ON l.client_id = c.id WHERE c.client_number = 'QC001';
    SELECT l.id INTO betty_loan_id FROM senteloans_loans l JOIN senteloans_clients c ON l.client_id = c.id WHERE c.client_number = 'QC002';
    SELECT l.id INTO james_loan_id FROM senteloans_loans l JOIN senteloans_clients c ON l.client_id = c.id WHERE c.client_number = 'QC003';
    SELECT l.id INTO agnes_loan_id FROM senteloans_loans l JOIN senteloans_clients c ON l.client_id = c.id WHERE c.client_number = 'OM001';

    -- Get guarantor record IDs
    SELECT id INTO sarah_guarantor1_id FROM senteloans_loan_guarantors WHERE loan_id = sarah_loan_id AND guarantor_client_id = david_id;
    SELECT id INTO sarah_guarantor2_id FROM senteloans_loan_guarantors WHERE loan_id = sarah_loan_id AND guarantor_client_id = patricia_id;
    SELECT id INTO grace_guarantor_id FROM senteloans_loan_guarantors WHERE loan_id = grace_loan_id AND guarantor_client_id = david_id;

    -- Client Registration Audit Logs
    INSERT INTO senteloans_audit_logs (
        id,
        institution_id,
        user_id,
        operation,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    ) VALUES 
    -- SACCO client registrations
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_clients', sarah_id, '{}'::jsonb, '{"client_number": "SL001", "full_name": "Sarah Nakamya", "status": "Active"}'::jsonb, '192.168.1.10', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_clients', david_id, '{}'::jsonb, '{"client_number": "SL002", "full_name": "David Ssemakula", "status": "Active"}'::jsonb, '192.168.1.11', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_clients', grace_id, '{}'::jsonb, '{"client_number": "SL003", "full_name": "Grace Namugga", "status": "Active"}'::jsonb, '192.168.1.12', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_clients', patricia_id, '{}'::jsonb, '{"client_number": "SL004", "full_name": "Patricia Nabirye", "status": "Active"}'::jsonb, '192.168.1.13', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    
    -- Money lender client registrations
    (uuid_generate_v4(), quick_cash_id, quick_cash_staff_id, 'INSERT', 'senteloans_clients', moses_id, '{}'::jsonb, '{"client_number": "QC001", "full_name": "Moses Kiprotich", "status": "Active"}'::jsonb, '192.168.1.20', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_staff_id, 'INSERT', 'senteloans_clients', betty_id, '{}'::jsonb, '{"client_number": "QC002", "full_name": "Betty Nakato", "status": "Active"}'::jsonb, '192.168.1.21', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_staff_id, 'INSERT', 'senteloans_clients', james_id, '{}'::jsonb, '{"client_number": "QC003", "full_name": "James Okello", "status": "Active"}'::jsonb, '192.168.1.22', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    
    -- MFI client registration
    (uuid_generate_v4(), opportunity_mfi_id, opportunity_staff_id, 'INSERT', 'senteloans_clients', agnes_id, '{}'::jsonb, '{"client_number": "OM001", "full_name": "Agnes Namutebi", "status": "Active"}'::jsonb, '192.168.1.30', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');

    -- Loan Application Audit Logs
    INSERT INTO senteloans_audit_logs (
        id,
        institution_id,
        user_id,
        operation,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    ) VALUES 
    -- Loan applications
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_loans', sarah_loan_id, '{}'::jsonb, '{"application_id": "LA001", "principal_amount": 2000000, "status": "Applied"}'::jsonb, '192.168.1.10', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_loans', david_loan_id, '{}'::jsonb, '{"application_id": "LA002", "principal_amount": 1500000, "status": "Applied"}'::jsonb, '192.168.1.11', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_loans', grace_loan_id, '{}'::jsonb, '{"application_id": "LA003", "principal_amount": 500000, "status": "Applied"}'::jsonb, '192.168.1.12', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_staff_id, 'INSERT', 'senteloans_loans', moses_loan_id, '{}'::jsonb, '{"application_id": "QC001", "principal_amount": 800000, "status": "Applied"}'::jsonb, '192.168.1.20', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_staff_id, 'INSERT', 'senteloans_loans', betty_loan_id, '{}'::jsonb, '{"application_id": "QC002", "principal_amount": 1200000, "status": "Applied"}'::jsonb, '192.168.1.21', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_staff_id, 'INSERT', 'senteloans_loans', james_loan_id, '{}'::jsonb, '{"application_id": "QC003", "principal_amount": 500000, "status": "Applied"}'::jsonb, '192.168.1.22', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    (uuid_generate_v4(), opportunity_mfi_id, opportunity_staff_id, 'INSERT', 'senteloans_loans', agnes_loan_id, '{}'::jsonb, '{"application_id": "OM001", "principal_amount": 300000, "status": "Applied"}'::jsonb, '192.168.1.30', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');

    -- Loan Disbursement Audit Logs
    INSERT INTO senteloans_audit_logs (
        id,
        institution_id,
        user_id,
        operation,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    ) VALUES 
    -- Loan disbursements
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'UPDATE', 'senteloans_loans', sarah_loan_id, '{"status": "Applied"}'::jsonb, '{"status": "Disbursed", "disbursement_date": "2023-06-05"}'::jsonb, '10.0.0.100', 'SenteLoan-Admin/1.0'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'UPDATE', 'senteloans_loans', grace_loan_id, '{"status": "Applied"}'::jsonb, '{"status": "Disbursed", "disbursement_date": "2023-08-03"}'::jsonb, '10.0.0.100', 'SenteLoan-Admin/1.0'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_staff_id, 'UPDATE', 'senteloans_loans', moses_loan_id, '{"status": "Applied"}'::jsonb, '{"status": "Disbursed", "disbursement_date": "2023-11-02"}'::jsonb, '10.0.0.101', 'SenteLoan-Admin/1.0'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_staff_id, 'UPDATE', 'senteloans_loans', betty_loan_id, '{"status": "Applied"}'::jsonb, '{"status": "Disbursed", "disbursement_date": "2023-10-16"}'::jsonb, '10.0.0.101', 'SenteLoan-Admin/1.0'),
    (uuid_generate_v4(), opportunity_mfi_id, opportunity_staff_id, 'UPDATE', 'senteloans_loans', agnes_loan_id, '{"status": "Applied"}'::jsonb, '{"status": "Disbursed", "disbursement_date": "2023-09-05"}'::jsonb, '10.0.0.102', 'SenteLoan-Admin/1.0');

    -- Loan Status Change Audit Logs
    INSERT INTO senteloans_audit_logs (
        id,
        institution_id,
        user_id,
        operation,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    ) VALUES 
    -- Grace's loan defaulted
    (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'UPDATE', 'senteloans_loans', grace_loan_id, '{"status": "Disbursed", "overdue_days": 0}'::jsonb, '{"status": "Defaulted", "overdue_days": 45}'::jsonb, '10.0.0.100', 'SenteLoan-System/1.0');

    -- Only add guarantor audit logs if the guarantor records exist
    -- Guarantor Assignment Audit Logs (only if guarantor records exist)
    IF sarah_guarantor1_id IS NOT NULL THEN
        INSERT INTO senteloans_audit_logs (
            id,
            institution_id,
            user_id,
            operation,
            table_name,
            record_id,
            old_values,
            new_values,
            ip_address,
            user_agent
        ) VALUES 
        (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_loan_guarantors', sarah_guarantor1_id, '{}'::jsonb, jsonb_build_object('guarantor_client_id', david_id, 'guaranteed_amount', 1000000, 'status', 'Active'), '192.168.1.10', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    END IF;

    IF sarah_guarantor2_id IS NOT NULL THEN
        INSERT INTO senteloans_audit_logs (
            id,
            institution_id,
            user_id,
            operation,
            table_name,
            record_id,
            old_values,
            new_values,
            ip_address,
            user_agent
        ) VALUES 
        (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_loan_guarantors', sarah_guarantor2_id, '{}'::jsonb, jsonb_build_object('guarantor_client_id', patricia_id, 'guaranteed_amount', 1000000, 'status', 'Active'), '192.168.1.10', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    END IF;

    IF grace_guarantor_id IS NOT NULL THEN
        INSERT INTO senteloans_audit_logs (
            id,
            institution_id,
            user_id,
            operation,
            table_name,
            record_id,
            old_values,
            new_values,
            ip_address,
            user_agent
        ) VALUES 
        (uuid_generate_v4(), kampala_sacco_id, kampala_staff_id, 'INSERT', 'senteloans_loan_guarantors', grace_guarantor_id, '{}'::jsonb, jsonb_build_object('guarantor_client_id', david_id, 'guaranteed_amount', 500000, 'status', 'Active'), '192.168.1.12', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    END IF;

END $$;

-- Display results for verification
SELECT 
    'Audit Logs Migration Completed' as status,
    (SELECT COUNT(*) FROM senteloans_audit_logs) as total_audit_logs_created;

-- Show audit logs summary by operation
SELECT 
    operation,
    table_name,
    COUNT(*) as log_count
FROM senteloans_audit_logs
GROUP BY operation, table_name
ORDER BY operation, table_name;

-- Show audit logs summary by institution
SELECT 
    i.name as institution_name,
    COUNT(al.id) as audit_logs_count
FROM senteloans_institutions i
LEFT JOIN senteloans_audit_logs al ON i.id = al.institution_id
GROUP BY i.id, i.name
ORDER BY i.name;
