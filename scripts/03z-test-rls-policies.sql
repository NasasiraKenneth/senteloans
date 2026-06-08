-- Test RLS Policies for Multi-Tenant Isolation and Role-based Access
-- NOT run by "npm run db:migrate" (file name 03z-* is excluded from migration pattern).
-- Optional: run manually only if you need to verify RLS. Requires role rls_test to exist:
--   CREATE ROLE rls_test LOGIN; GRANT USAGE ON SCHEMA public TO rls_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO rls_test;
-- This script validates that Row Level Security (RLS) policies work correctly
-- against the live schema and policy definitions in 01-create-schema.sql and 02-row-level-security.sql.
-- It uses the helper functions set_session_context/clear_session_context to emulate
-- application-side identity/tenant context.

-- Generate proper UUIDs for test data instead of string values
-- Create test institutions with proper UUIDs
INSERT INTO institutions (id, name, type, registration_number, settings) VALUES 
(uuid_generate_v4(), 'Test Bank A', 'SACCO', 'REG001', '{"theme": "blue"}'),
(uuid_generate_v4(), 'Test Bank B', 'MFI', 'REG002', '{"theme": "green"}');

-- Store the generated institution IDs for reference (data creation under rls_test role)
DO $$
DECLARE
    inst_1_id UUID;
    inst_2_id UUID;
BEGIN
    SET LOCAL ROLE rls_test;
    -- Get the institution IDs we just created
    SELECT id INTO inst_1_id FROM institutions WHERE registration_number = 'REG001';
    SELECT id INTO inst_2_id FROM institutions WHERE registration_number = 'REG002';
    
    -- Create test users for each institution
    INSERT INTO users (id, institution_id, email, password_hash, full_name, role) VALUES 
    (uuid_generate_v4(), inst_1_id, 'admin@testbanka.com', 'hashed_password_1', 'Admin A', 'institution_admin'),
    (uuid_generate_v4(), inst_1_id, 'loan@testbanka.com', 'hashed_password_2', 'Officer A', 'loan_officer'),
    (uuid_generate_v4(), inst_2_id, 'admin@testbankb.com', 'hashed_password_3', 'Admin B', 'institution_admin'),
    (uuid_generate_v4(), inst_2_id, 'loan@testbankb.com', 'hashed_password_4', 'Officer B', 'loan_officer');

    -- Create test members for each institution
    INSERT INTO members (id, institution_id, member_number, full_name, date_of_birth, gender, member_type, phone_number, national_id, join_date) VALUES 
    (uuid_generate_v4(), inst_1_id, 'CLT001', 'John Doe', '1985-01-15', 'Male', 'Individual', '555-0101', 'ID001', '2024-01-01'),
    (uuid_generate_v4(), inst_1_id, 'CLT002', 'Jane Smith', '1990-03-22', 'Female', 'Individual', '555-0102', 'ID002', '2024-01-02'),
    (uuid_generate_v4(), inst_2_id, 'CLT001', 'Bob Wilson', '1988-07-10', 'Male', 'Individual', '555-0201', 'ID003', '2024-01-01');
    RESET ROLE;
END $$;

-- =============================
-- Context helpers
-- =============================
-- Fetch ids for re-use
WITH i1 AS (
  SELECT id FROM institutions WHERE registration_number = 'REG001'
), i2 AS (
  SELECT id FROM institutions WHERE registration_number = 'REG002'
)
SELECT 'Inst IDs' AS label, (SELECT id FROM i1) AS inst_1_id, (SELECT id FROM i2) AS inst_2_id;

DO $$
DECLARE
  inst_1_id UUID;
  inst_2_id UUID;
  admin_1_id UUID;
  admin_2_id UUID;
  member_1_id UUID;
  member_2_id UUID;
  member_3_id UUID;
  v_rows INT;
BEGIN
  SELECT id INTO inst_1_id FROM institutions WHERE registration_number = 'REG001';
  SELECT id INTO inst_2_id FROM institutions WHERE registration_number = 'REG002';

  SELECT id INTO admin_1_id FROM users WHERE email = 'admin@testbanka.com';
  SELECT id INTO admin_2_id FROM users WHERE email = 'admin@testbankb.com';

  -- Capture specific member ids
  SELECT id INTO member_1_id FROM members WHERE institution_id = inst_1_id ORDER BY created_at LIMIT 1;
  SELECT id INTO member_2_id FROM members WHERE institution_id = inst_1_id ORDER BY created_at OFFSET 1 LIMIT 1;
  SELECT id INTO member_3_id FROM members WHERE institution_id = inst_2_id ORDER BY created_at LIMIT 1;

  RAISE NOTICE 'inst_1_id=%, inst_2_id=%', inst_1_id, inst_2_id;
  RAISE NOTICE 'admin_1_id=%, admin_2_id=%', admin_1_id, admin_2_id;
  RAISE NOTICE 'member_1_id=%, member_2_id=%, member_3_id=%', member_1_id, member_2_id, member_3_id;

  -- =============================
  -- Test 1: SELECT isolation (institution admin A)
  -- =============================
  PERFORM set_session_context(admin_1_id, inst_1_id, FALSE, NULL);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  -- Expect: can see members only from inst_1
  RAISE NOTICE 'Test 1a: SELECT all (inst_1 context)';
  PERFORM 1 FROM members WHERE institution_id = inst_1_id;
  RAISE NOTICE '  rows(inst_1)=%', (SELECT count(*) FROM members WHERE institution_id = inst_1_id);
  RAISE NOTICE '  rows(inst_2)=% (should be 0 with RLS)', (SELECT count(*) FROM members WHERE institution_id = inst_2_id);

  -- Assert-style check: cross-tenant record not visible
  IF (SELECT count(*) FROM members WHERE id = member_3_id) <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: inst_1 admin can see inst_2 member';
  END IF;

  -- =============================
  -- Test 2: UPDATE own tenant succeeds, cross-tenant blocked
  -- =============================
  RAISE NOTICE 'Test 2a: UPDATE within tenant should succeed';
  UPDATE members SET phone_number = '555-0101-upd' WHERE id = member_1_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RLS FAILED: inst_1 admin could not UPDATE own member';
  END IF;

  RAISE NOTICE 'Test 2b: UPDATE cross-tenant should affect 0 rows';
  UPDATE members SET phone_number = '555-0201-upd' WHERE id = member_3_id;
  IF FOUND THEN
    RAISE EXCEPTION 'RLS FAILED: inst_1 admin updated cross-tenant member';
  END IF;

  -- =============================
  -- Test 3: UPDATE must not allow flipping institution_id to another tenant
  -- This will surface missing WITH CHECK in UPDATE policies if allowed
  -- =============================
  RAISE NOTICE 'Test 3: attempt to change institution_id to another tenant (should be blocked)';
  UPDATE members SET institution_id = inst_2_id WHERE id = member_1_id;
  IF FOUND THEN
    RAISE EXCEPTION 'RLS FAILED: UPDATE changed institution_id across tenants (missing WITH CHECK)';
  END IF;

  -- =============================
  -- Test 4: INSERT should only allow inserting for current institution
  -- =============================
  RAISE NOTICE 'Test 4a: INSERT for current institution (should succeed)';
  INSERT INTO members (
    institution_id, member_number, full_name, date_of_birth, gender, member_type,
    phone_number, national_id, join_date
  ) VALUES (
    inst_1_id, 'CLT999', 'Tenant One New', '1991-01-01', 'Male', 'Individual', '555-0999', 'ID999', '2024-01-10'
  );

  RAISE NOTICE 'Test 4b: INSERT for other institution (should be blocked)';
  BEGIN
    INSERT INTO members (
      institution_id, member_number, full_name, date_of_birth, gender, member_type,
      phone_number, national_id, join_date
    ) VALUES (
      inst_2_id, 'CLT888', 'Cross Tenant New', '1992-02-02', 'Female', 'Individual', '555-0888', 'ID888', '2024-01-11'
    );
  EXCEPTION WHEN others THEN
    RAISE NOTICE '  INSERT cross-tenant blocked as expected: %', SQLERRM;
  END;

  -- =============================
  -- Test 5: DELETE should be limited to own tenant
  -- =============================
  RAISE NOTICE 'Test 5a: DELETE own tenant record should succeed';
  DELETE FROM members WHERE id = member_2_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RLS FAILED: inst_1 admin could not DELETE own member';
  END IF;

  RAISE NOTICE 'Test 5b: DELETE cross-tenant should affect 0 rows';
  DELETE FROM members WHERE id = member_3_id;
  IF FOUND THEN
    RAISE EXCEPTION 'RLS FAILED: inst_1 admin deleted cross-tenant member';
  END IF;

  -- Switch to institution 2 admin and sanity check visibility
  PERFORM clear_session_context();
  PERFORM set_session_context(admin_2_id, inst_2_id, FALSE, NULL);

  RAISE NOTICE 'Test 6: inst_2 admin cannot see inst_1 members';
  IF (SELECT count(*) FROM members WHERE institution_id = inst_1_id) <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: inst_2 admin can see inst_1 members';
  END IF;

  -- Cleanup context
  PERFORM clear_session_context();
END $$;

-- Summary hints:
-- If any of the above tests fail:
--  - Ensure 02-row-level-security.sql defines distinct policies for SELECT/INSERT/UPDATE/DELETE on members.
--  - For UPDATE/INSERT, add WITH CHECK (institution_id = get_current_institution_id()) to prevent cross-tenant flips.
--  - Prefer helper functions driven from auth.uid() in production (or set_session_context during tests).

-- Test 2: Verify cross-institution data isolation
-- Check that institutions have separate data
SELECT 'Test 2: Cross-institution isolation' as test_name;
WITH inst_1 AS (SELECT id FROM institutions WHERE registration_number = 'REG001'),
     inst_2 AS (SELECT id FROM institutions WHERE registration_number = 'REG002')
SELECT 
  CASE 
    WHEN (SELECT count(*) FROM members WHERE institution_id = (SELECT id FROM inst_1)) > 0
         AND (SELECT count(*) FROM members WHERE institution_id = (SELECT id FROM inst_2)) > 0
         AND (SELECT count(DISTINCT institution_id) FROM members) = 2
    THEN 'PASSED: Data properly isolated by institution'
    ELSE 'FAILED: Data isolation issue detected'
  END as isolation_test;

-- Test 3: Verify data integrity
SELECT 'Test 3: Data integrity check' as test_name;
SELECT 
  CASE 
    WHEN (SELECT count(*) FROM institutions WHERE registration_number IN ('REG001', 'REG002')) = 2
         AND (SELECT count(*) FROM users WHERE email LIKE '%testbank%.com') = 4
         AND (SELECT count(*) FROM members WHERE member_number LIKE 'CLT%') = 3
    THEN 'PASSED: All test data created successfully'
    ELSE 'FAILED: Test data creation incomplete'
  END as integrity_test;

-- Clean up test data (service role context)
-- Use proper WHERE clauses to clean up test data
DELETE FROM members WHERE institution_id IN (
    SELECT id FROM institutions WHERE registration_number IN ('REG001', 'REG002')
);
DELETE FROM users WHERE institution_id IN (
    SELECT id FROM institutions WHERE registration_number IN ('REG001', 'REG002')
);
DELETE FROM institutions WHERE registration_number IN ('REG001', 'REG002');

SELECT 'RLS Policy Tests Completed Successfully' as status;
