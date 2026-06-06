-- Optional: Allow clients to INSERT their own loan applications (member_id must match their client record).
-- This uses auth.uid() which exists only in Supabase. On plain Postgres, client self-service is enforced
-- by the API (app/api/client/loans/route.ts); run this script only when using Supabase.
-- Safe to run on plain Postgres: does nothing if loans is missing or auth.uid() is not available.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'loans') THEN
    RAISE NOTICE 'loans does not exist; skipping client loan insert policy.';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    RAISE NOTICE 'auth.uid() not found (plain Postgres). Client self-service is enforced by the API; skipping RLS policy.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS client_loans_self_insert_policy ON loans;
  CREATE POLICY client_loans_self_insert_policy ON loans
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM members c
        WHERE c.id = member_id
          AND c.supabase_user_id = auth.uid()
          AND c.institution_id = institution_id
      )
    );
  RAISE NOTICE 'Created client_loans_self_insert_policy on loans.';
END $$;
