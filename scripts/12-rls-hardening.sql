-- Consolidated RLS hardening for senteloans_members
-- Mirrors the currently applied database state
-- Safe to run multiple times (idempotent constructs where possible)

-- Ensure helper schema exists
CREATE SCHEMA IF NOT EXISTS app;

-- Auth-driven helper: current institution derived from auth.uid()
CREATE OR REPLACE FUNCTION app.current_institution_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.institution_id
  FROM senteloans_users u
  WHERE u.supabase_user_id = auth.uid()
  LIMIT 1
$$;

-- Auth-driven helper: current role derived from auth.uid()
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN r.name = 'System Admin' THEN 'system_admin'
    WHEN r.name = 'Super Admin' THEN 'super_admin'
    WHEN r.name = 'Admin' THEN 'institution_admin'
    WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
    ELSE NULL
  END
  FROM senteloans_users u
  LEFT JOIN senteloans_roles r ON r.id = u.role_id
  WHERE u.supabase_user_id = auth.uid()
  LIMIT 1
$$;

-- Ensure supporting index for auth helper lookups
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id ON senteloans_users(supabase_user_id);

-- Ensure RLS is enabled on clients
ALTER TABLE senteloans_members ENABLE ROW LEVEL SECURITY;

-- Drop any legacy catch-all policy (if present)
DROP POLICY IF EXISTS clients_access_policy ON senteloans_members;

-- Drop and recreate explicit per-action policies to avoid duplicates
DROP POLICY IF EXISTS clients_select_same_institution ON senteloans_members;
DROP POLICY IF EXISTS clients_insert_same_institution ON senteloans_members;
DROP POLICY IF EXISTS clients_update_same_institution ON senteloans_members;
DROP POLICY IF EXISTS clients_delete_same_institution ON senteloans_members;

-- SELECT: allow system_admins or same institution
CREATE POLICY clients_select_same_institution
ON senteloans_members
FOR SELECT
USING (
  (
    COALESCE(app.current_role(), '') = 'system_admin'
    OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
  )
);

-- INSERT: row must belong to caller's institution (or system_admin)
CREATE POLICY clients_insert_same_institution
ON senteloans_members
FOR INSERT
WITH CHECK (
  COALESCE(app.current_role(), '') = 'system_admin'
  OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
);

-- UPDATE: only within institution (or system_admin) and cannot flip institution_id
CREATE POLICY clients_update_same_institution
ON senteloans_members
FOR UPDATE
USING (
  COALESCE(app.current_role(), '') = 'system_admin'
  OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
)
WITH CHECK (
  COALESCE(app.current_role(), '') = 'system_admin'
  OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
);

-- DELETE: only within institution (or system_admin)
CREATE POLICY clients_delete_same_institution
ON senteloans_members
FOR DELETE
USING (
  COALESCE(app.current_role(), '') = 'system_admin'
  OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
);

-- Notes:
-- - Policies prefer auth-based helpers (app.current_*). For compatibility with existing scripts/tests
--   that call set_session_context(...), they fall back to get_current_institution_id().
-- - Consider applying the same pattern to other tenant tables (loans, savings, transactions) for consistency.
