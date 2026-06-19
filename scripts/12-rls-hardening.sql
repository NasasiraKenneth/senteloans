-- Consolidated RLS hardening for members
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
  FROM users u
  WHERE u.auth_id = auth.uid()
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
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
  WHERE u.auth_id = auth.uid()
  LIMIT 1
$$;

-- Ensure supporting index for auth helper lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- Ensure RLS is enabled on members
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- Drop any legacy catch-all policy (if present)
DROP POLICY IF EXISTS members_access_policy ON members;

-- Drop and recreate explicit per-action policies to avoid duplicates
DROP POLICY IF EXISTS members_select_same_institution ON members;
DROP POLICY IF EXISTS members_insert_same_institution ON members;
DROP POLICY IF EXISTS members_update_same_institution ON members;
DROP POLICY IF EXISTS members_delete_same_institution ON members;

-- SELECT: allow system_admins or same institution
CREATE POLICY members_select_same_institution
ON members
FOR SELECT
USING (
  (
    COALESCE(app.current_role(), '') = 'system_admin'
    OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
  )
);

-- INSERT: row must belong to caller's institution (or system_admin)
CREATE POLICY members_insert_same_institution
ON members
FOR INSERT
WITH CHECK (
  COALESCE(app.current_role(), '') = 'system_admin'
  OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
);

-- UPDATE: only within institution (or system_admin) and cannot flip institution_id
CREATE POLICY members_update_same_institution
ON members
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
CREATE POLICY members_delete_same_institution
ON members
FOR DELETE
USING (
  COALESCE(app.current_role(), '') = 'system_admin'
  OR institution_id = COALESCE(app.current_institution_id(), get_current_institution_id())
);

-- Notes:
-- - Policies prefer auth-based helpers (app.current_*). For compatibility with existing scripts/tests
--   that call set_session_context(...), they fall back to get_current_institution_id().
-- - Consider applying the same pattern to other tenant tables (loans, savings, transactions) for consistency.
