-- Phase 4: Audit Logs Migration Script
-- Idempotent: skip if seed audit logs already exist for these institutions.

DO $$
DECLARE
    seed_count INT;
    -- Institution IDs
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
    kampala_sacco_branch_id UUID;
    quick_cash_branch_id UUID;
    opportunity_mfi_branch_id UUID;
    
    -- Member IDs
    sarah_id UUID;
    david_id UUID;
    grace_id UUID;
    patricia_id UUID;
    moses_id UUID;
    betty_id UUID;
    james_id UUID;
    agnes_id UUID;
    
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
    SELECT id INTO kampala_sacco_branch_id FROM senteloans_branches WHERE institution_id = kampala_sacco_id ORDER BY created_at LIMIT 1;
    SELECT id INTO quick_cash_branch_id FROM senteloans_branches WHERE institution_id = quick_cash_id ORDER BY created_at LIMIT 1;
    SELECT id INTO opportunity_mfi_branch_id FROM senteloans_branches WHERE institution_id = opportunity_mfi_id ORDER BY created_at LIMIT 1;

    -- Get a staff user per institution for user_id
    SELECT id INTO kampala_staff_id FROM senteloans_users WHERE institution_id = kampala_sacco_id LIMIT 1;
    SELECT id INTO quick_cash_staff_id FROM senteloans_users WHERE institution_id = quick_cash_id LIMIT 1;
    SELECT id INTO opportunity_staff_id FROM senteloans_users WHERE institution_id = opportunity_mfi_id LIMIT 1;

    -- Get member IDs
    SELECT id INTO sarah_id FROM senteloans_members WHERE member_number = 'SL001';
    SELECT id INTO david_id FROM senteloans_members WHERE member_number = 'SL002';
    SELECT id INTO grace_id FROM senteloans_members WHERE member_number = 'SL003';
    SELECT id INTO patricia_id FROM senteloans_members WHERE member_number = 'SL004';
    SELECT id INTO moses_id FROM senteloans_members WHERE member_number = 'QC001';
    SELECT id INTO betty_id FROM senteloans_members WHERE member_number = 'QC002';
    SELECT id INTO james_id FROM senteloans_members WHERE member_number = 'QC003';
    SELECT id INTO agnes_id FROM senteloans_members WHERE member_number = 'OM001';

    -- Member registration audit logs
    INSERT INTO senteloans_audit_logs (
        id,
        institution_id,
        branch_id,
        user_id,
        operation,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    ) VALUES 
    -- SACCO member registrations
    (uuid_generate_v4(), kampala_sacco_id, kampala_sacco_branch_id, kampala_staff_id, 'INSERT', 'senteloans_members', sarah_id, '{}'::jsonb, '{"member_number": "SL001", "full_name": "Sarah Nakamya", "status": "Active"}'::jsonb, '192.168.1.10', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_sacco_branch_id, kampala_staff_id, 'INSERT', 'senteloans_members', david_id, '{}'::jsonb, '{"member_number": "SL002", "full_name": "David Ssemakula", "status": "Active"}'::jsonb, '192.168.1.11', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_sacco_branch_id, kampala_staff_id, 'INSERT', 'senteloans_members', grace_id, '{}'::jsonb, '{"member_number": "SL003", "full_name": "Grace Namugga", "status": "Active"}'::jsonb, '192.168.1.12', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    (uuid_generate_v4(), kampala_sacco_id, kampala_sacco_branch_id, kampala_staff_id, 'INSERT', 'senteloans_members', patricia_id, '{}'::jsonb, '{"member_number": "SL004", "full_name": "Patricia Nabirye", "status": "Active"}'::jsonb, '192.168.1.13', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
    
    -- Money lender member registrations
    (uuid_generate_v4(), quick_cash_id, quick_cash_branch_id, quick_cash_staff_id, 'INSERT', 'senteloans_members', moses_id, '{}'::jsonb, '{"member_number": "QC001", "full_name": "Moses Kiprotich", "status": "Active"}'::jsonb, '192.168.1.20', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_branch_id, quick_cash_staff_id, 'INSERT', 'senteloans_members', betty_id, '{}'::jsonb, '{"member_number": "QC002", "full_name": "Betty Nakato", "status": "Active"}'::jsonb, '192.168.1.21', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    (uuid_generate_v4(), quick_cash_id, quick_cash_branch_id, quick_cash_staff_id, 'INSERT', 'senteloans_members', james_id, '{}'::jsonb, '{"member_number": "QC003", "full_name": "James Okello", "status": "Active"}'::jsonb, '192.168.1.22', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
    
    -- MFI member registration
    (uuid_generate_v4(), opportunity_mfi_id, opportunity_mfi_branch_id, opportunity_staff_id, 'INSERT', 'senteloans_members', agnes_id, '{}'::jsonb, '{"member_number": "OM001", "full_name": "Agnes Namutebi", "status": "Active"}'::jsonb, '192.168.1.30', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');

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
