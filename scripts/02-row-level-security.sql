-- SenteLoans Row-Level Security (RLS) Policies
-- Multi-Tenant Data Isolation and Access Control

-- Enable RLS on all tables
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_guarantors ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_kyc_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- =============================
-- Auth-driven helpers (preferred in production)
-- =============================
CREATE SCHEMA IF NOT EXISTS app;

-- Map auth.uid() -> institution_id
CREATE OR REPLACE FUNCTION app.current_institution_id()
RETURNS UUID AS $$
  SELECT u.institution_id
  FROM users u
  WHERE u.supabase_user_id = auth.uid()
  LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Map auth.uid() -> branch_id
CREATE OR REPLACE FUNCTION app.current_branch_id()
RETURNS UUID AS $$
  SELECT u.branch_id
  FROM users u
  WHERE u.supabase_user_id = auth.uid()
  LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Map auth.uid() -> users_role
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS TEXT AS $$
  SELECT CASE
    -- Role mapping:
    -- - System Admin: platform/global admin.
    -- - Super Admin: institution-wide admin (all branches in own institution).
    WHEN r.name = 'System Admin' THEN 'system_admin'
    WHEN r.name = 'Super Admin' THEN 'super_admin'
    WHEN r.name = 'Admin' THEN 'institution_admin'
    -- Future-proof: convert role label to snake_case (e.g. Loan Officer -> loan_officer).
    WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
    ELSE NULL
  END
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
  WHERE u.supabase_user_id = auth.uid()
  LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Helpful index for the helpers above
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id ON users(supabase_user_id);

-- Create function to get current user's institution ID
-- Fix get_current_institution_id() to delegate to auth-based helper and fallback to direct mapping
-- Idempotent: CREATE OR REPLACE

-- Ensure search path includes the app schema where helpers live
-- (adjust if your 'app' schema name differs)
SET search_path = public, app, extensions;

CREATE OR REPLACE FUNCTION public.get_current_institution_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Prefer auth-based helper; fallback to direct lookup via auth.uid()
  SELECT COALESCE(
    app.current_institution_id(),
    (
      SELECT u.institution_id
      FROM public.users u
      WHERE u.supabase_user_id = auth.uid()
      LIMIT 1
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.get_current_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    app.current_branch_id(),
    (
      SELECT u.branch_id
      FROM public.users u
      WHERE u.supabase_user_id = auth.uid()
      LIMIT 1
    )
  )
$$;

-- Optional: align role helper as well (if you have public.get_current_role())
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    app.current_role(),
    (
      SELECT CASE
        WHEN r.name = 'System Admin' THEN 'system_admin'
        WHEN r.name = 'Super Admin' THEN 'super_admin'
        WHEN r.name = 'Admin' THEN 'institution_admin'
        WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
        ELSE NULL
      END
      FROM public.users u
      LEFT JOIN public.roles r ON r.id = u.role_id
      WHERE u.supabase_user_id = auth.uid()
      LIMIT 1
    )
  )
$$;

-- Execution rights: migration runs as DATABASE_URL user, which can execute these functions.
-- (Supabase roles anon/authenticated/service_role do not exist in plain Postgres.)

-- Auth-based: current user id (no GUCs)
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.supabase_user_id = auth.uid()
  LIMIT 1
$$;

-- Auth-based: is system admin (no GUCs)
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT COALESCE(app.current_role(), '') = 'system_admin'
$$;

-- Branch-first multi-tenant access model:
-- - System admin: platform/global access (all institutions and branches).
-- - Super admin: all branches within own institution.
-- - All other institution users (including institution admin): only their own branch.
CREATE OR REPLACE FUNCTION public.can_access_row(
  p_institution_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT
    COALESCE(app.current_role(), '') = 'system_admin'
    OR (
      p_institution_id = COALESCE(app.current_institution_id(), public.get_current_institution_id())
      AND (
        COALESCE(app.current_role(), '') = 'super_admin'
        OR (
          p_branch_id IS NOT NULL
          AND COALESCE(app.current_branch_id(), public.get_current_branch_id()) IS NOT NULL
          AND p_branch_id = COALESCE(app.current_branch_id(), public.get_current_branch_id())
        )
      )
    )
$$;

-- INSTITUTIONS TABLE POLICIES
-- System admins can access all institutions, others can only see their own
DROP POLICY IF EXISTS institutions_access_policy ON institutions;
DROP POLICY IF EXISTS institutions_select_policy ON institutions;
DROP POLICY IF EXISTS institutions_update_policy ON institutions;
CREATE POLICY institutions_select_policy ON institutions
  FOR SELECT
  USING (
    is_system_admin() OR id = get_current_institution_id()
  );

-- Clients can read their own institution
DROP POLICY IF EXISTS institutions_client_self_access ON institutions;
CREATE POLICY institutions_client_self_access ON institutions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM members c
      WHERE c.institution_id = institutions.id
        AND c.supabase_user_id = auth.uid()
    )
  );

CREATE POLICY institutions_update_policy ON institutions
  FOR UPDATE
  USING (
    is_system_admin() OR id = get_current_institution_id()
  )
  WITH CHECK (
    is_system_admin() OR id = get_current_institution_id()
  );

-- USERS TABLE POLICIES
-- Users can only access users from their own institution
-- System admins can access all users
DROP POLICY IF EXISTS users_access_policy ON users;
CREATE POLICY users_access_policy ON users
    FOR ALL
    USING (
        -- Self-access by Supabase auth UID (prevents recursion)
        supabase_user_id = auth.uid()
        OR can_access_row(institution_id, branch_id)
    );

-- Users can update their own profile
DROP POLICY IF EXISTS users_self_update_policy ON users;
CREATE POLICY users_self_update_policy ON users
  FOR UPDATE
  USING (
    id = get_current_user_id()
  )
  WITH CHECK (
    id = get_current_user_id()
  );

-- CLIENTS TABLE POLICIES
-- Explicit per-action policies with WITH CHECK to prevent tenant flips
-- Prefer auth-based helpers; fallback to session helper for tests
DROP POLICY IF EXISTS clients_access_policy ON members;

DROP POLICY IF EXISTS clients_select_same_institution ON members;
CREATE POLICY clients_select_same_institution ON members
    FOR SELECT
    USING (
        can_access_row(institution_id, branch_id)
    );

DROP POLICY IF EXISTS clients_insert_same_institution ON members;
CREATE POLICY clients_insert_same_institution ON members
    FOR INSERT
    WITH CHECK (
        can_access_row(institution_id, branch_id)
    );

DROP POLICY IF EXISTS clients_update_same_institution ON members;
CREATE POLICY clients_update_same_institution ON members
    FOR UPDATE
    USING (
        can_access_row(institution_id, branch_id)
    )
    WITH CHECK (
        can_access_row(institution_id, branch_id)
    );

-- Allow authenticated clients to update their own profile row
DROP POLICY IF EXISTS client_profile_self_update ON members;
CREATE POLICY client_profile_self_update ON members
  FOR UPDATE
  USING (
    supabase_user_id = auth.uid()
  )
  WITH CHECK (
    supabase_user_id = auth.uid()
  );

DROP POLICY IF EXISTS clients_delete_same_institution ON members;
CREATE POLICY clients_delete_same_institution ON members
    FOR DELETE
    USING (
        can_access_row(institution_id, branch_id)
    );

-- CLIENT KYC DOCS TABLE POLICIES
-- Clients can only read their own KYC doc rows
DROP POLICY IF EXISTS client_kyc_docs_select_self ON member_kyc_docs;
CREATE POLICY client_kyc_docs_select_self ON member_kyc_docs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = member_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Clients can insert new KYC doc rows for themselves
DROP POLICY IF EXISTS client_kyc_docs_insert_self ON member_kyc_docs;
CREATE POLICY client_kyc_docs_insert_self ON member_kyc_docs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = member_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Institution staff/admins can update (approval/rejection)
DROP POLICY IF EXISTS client_kyc_docs_update_admin ON member_kyc_docs;
CREATE POLICY client_kyc_docs_update_admin ON member_kyc_docs
  FOR UPDATE
  USING (
    (coalesce(app.current_role(), '') IN ('system_admin','super_admin','institution_admin','manager','loan_officer'))
    AND can_access_row(institution_id, branch_id)
  )
  WITH CHECK (
    (coalesce(app.current_role(), '') IN ('system_admin','super_admin','institution_admin','manager','loan_officer'))
    AND can_access_row(institution_id, branch_id)
  );

-- Institution staff/admins can delete (cleanup)
DROP POLICY IF EXISTS client_kyc_docs_delete_admin ON member_kyc_docs;
CREATE POLICY client_kyc_docs_delete_admin ON member_kyc_docs
  FOR DELETE
  USING (
    (coalesce(app.current_role(), '') IN ('system_admin','super_admin','institution_admin','manager','loan_officer'))
    AND can_access_row(institution_id, branch_id)
  );

-- CLIENT SHARES TABLE POLICIES
-- Access through client relationship (inherits institution isolation)
DROP POLICY IF EXISTS client_shares_access_policy ON member_shares;
CREATE POLICY client_shares_access_policy ON member_shares
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM members c
      WHERE c.id = member_id
        AND can_access_row(c.institution_id, c.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM members c
      WHERE c.id = member_id
        AND can_access_row(c.institution_id, c.branch_id)
    )
  );
-- LOAN PRODUCTS TABLE POLICIES
-- Users can only access loan products from their own institution
DROP POLICY IF EXISTS loan_products_access_policy ON loan_products;
CREATE POLICY loan_products_access_policy ON loan_products
    FOR ALL
    USING (
        can_access_row(institution_id, branch_id)
    )
    WITH CHECK (
        can_access_row(institution_id, branch_id)
    );

-- Allow clients to SELECT loan products within their institution
DROP POLICY IF EXISTS client_loan_products_self_access_policy ON loan_products;
CREATE POLICY client_loan_products_self_access_policy ON loan_products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM members c
      WHERE c.supabase_user_id = auth.uid()
        AND c.institution_id = loan_products.institution_id
    )
  );

-- LOANS TABLE POLICIES
-- Users can only access loans from their own institution
DROP POLICY IF EXISTS loans_access_policy ON loans;
CREATE POLICY loans_access_policy ON loans
    FOR ALL
    USING (
        can_access_row(institution_id, branch_id)
    )
    WITH CHECK (
        can_access_row(institution_id, branch_id)
    );

-- SAVINGS ACCOUNTS TABLE POLICIES
-- Users can only access savings accounts from their own institution
DROP POLICY IF EXISTS savings_accounts_access_policy ON savings_accounts;
CREATE POLICY savings_accounts_access_policy ON savings_accounts
    FOR ALL
    USING (
        can_access_row(institution_id, branch_id)
    )
    WITH CHECK (
        can_access_row(institution_id, branch_id)
    );

-- TRANSACTIONS TABLE POLICIES
-- Users can only access transactions from their own institution
DROP POLICY IF EXISTS transactions_access_policy ON transactions;
CREATE POLICY transactions_access_policy ON transactions
    FOR ALL
    USING (
        can_access_row(institution_id, branch_id)
    )
    WITH CHECK (
        can_access_row(institution_id, branch_id)
    );

-- LOAN REPAYMENTS TABLE POLICIES
-- Access through loan relationship (inherits institution isolation)
DROP POLICY IF EXISTS loan_repayments_access_policy ON loan_repayments;
CREATE POLICY loan_repayments_access_policy ON loan_repayments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM loans l 
            WHERE l.id = loan_id 
            AND can_access_row(l.institution_id, l.branch_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM loans l 
            WHERE l.id = loan_id 
            AND can_access_row(l.institution_id, l.branch_id)
        )
    );

-- LOAN GUARANTORS TABLE POLICIES
-- Access through loan relationship (inherits institution isolation)
DROP POLICY IF EXISTS loan_guarantors_access_policy ON loan_guarantors;
CREATE POLICY loan_guarantors_access_policy ON loan_guarantors
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM loans l 
            WHERE l.id = loan_id 
            AND can_access_row(l.institution_id, l.branch_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM loans l 
            WHERE l.id = loan_id 
            AND can_access_row(l.institution_id, l.branch_id)
        )
    );

-- AUDIT LOGS TABLE POLICIES
-- Users can only access audit logs from their own institution
-- System admins can access all audit logs
DROP POLICY IF EXISTS audit_logs_access_policy ON audit_logs;
CREATE POLICY audit_logs_access_policy ON audit_logs
    FOR ALL
    USING (
        can_access_row(institution_id, branch_id)
    )
    WITH CHECK (
        can_access_row(institution_id, branch_id)
    );

-- Create role-based access policies for specific operations
-- These will be used in conjunction with application-level permission checks

-- CLIENT ACCESS POLICIES (for client portal users)
-- Clients can only see their own data using Supabase Auth mapping
DROP POLICY IF EXISTS clients_self_access_policy ON members;
CREATE POLICY clients_self_access_policy ON members
  FOR SELECT
  USING (
    supabase_user_id = auth.uid()
  );

DROP POLICY IF EXISTS client_loans_self_access_policy ON loans;
CREATE POLICY client_loans_self_access_policy ON loans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM members c
      WHERE c.id = member_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS client_accounts_self_access_policy ON savings_accounts;
CREATE POLICY client_accounts_self_access_policy ON savings_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM members c
      WHERE c.id = member_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS client_transactions_self_access_policy ON transactions;
CREATE POLICY client_transactions_self_access_policy ON transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM members c
      WHERE c.id = member_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Client shares: allow clients to read their own share records
DROP POLICY IF EXISTS client_shares_self_access_policy ON member_shares;
CREATE POLICY client_shares_self_access_policy ON member_shares
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM members c
      WHERE c.id = member_id
        AND c.supabase_user_id = auth.uid()
    )
  );

-- Loan repayments: allow clients to read repayments for their loans
DROP POLICY IF EXISTS client_loan_repayments_self_access_policy ON loan_repayments;
CREATE POLICY client_loan_repayments_self_access_policy ON loan_repayments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM loans l
      JOIN members c ON c.id = l.member_id AND c.institution_id = l.institution_id
      WHERE l.id = loan_id
        AND c.supabase_user_id = auth.uid()
    )
  );

-- Create function to set session variables (to be called by application)
CREATE OR REPLACE FUNCTION set_session_context(
    p_user_id UUID,
    p_institution_id UUID,
    p_is_system_admin BOOLEAN DEFAULT FALSE,
    p_client_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Set session variables for RLS policies
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, false);
    PERFORM set_config('app.current_institution_id', p_institution_id::TEXT, false);
    PERFORM set_config('app.is_system_admin', p_is_system_admin::TEXT, false);
    
    IF p_client_id IS NOT NULL THEN
        PERFORM set_config('app.current_member_id', p_client_id::TEXT, false);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clear session context
CREATE OR REPLACE FUNCTION clear_session_context()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', '', false);
    PERFORM set_config('app.current_institution_id', '', false);
    PERFORM set_config('app.is_system_admin', '', false);
    PERFORM set_config('app.current_member_id', '', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTIFICATIONS TABLE POLICIES
-- Clients can only read their own notifications
DROP POLICY IF EXISTS notifications_member_select ON notifications;
CREATE POLICY notifications_member_select ON notifications
  FOR SELECT
  USING (
    recipient_type = 'member'
    AND EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = recipient_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Institution users can read their own notifications
DROP POLICY IF EXISTS notifications_user_select ON notifications;
CREATE POLICY notifications_user_select ON notifications
  FOR SELECT
  USING (
    recipient_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = recipient_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );

-- Members can update (mark as read) their own notifications
DROP POLICY IF EXISTS notifications_member_update ON notifications;
CREATE POLICY notifications_member_update ON notifications
  FOR UPDATE
  USING (
    recipient_type = 'member'
    AND EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = recipient_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  )
  WITH CHECK (
    recipient_type = 'member'
    AND EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = recipient_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Institution users can update (mark as read) their own notifications
DROP POLICY IF EXISTS notifications_user_update ON notifications;
CREATE POLICY notifications_user_update ON notifications
  FOR UPDATE
  USING (
    recipient_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = recipient_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  )
  WITH CHECK (
    recipient_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = recipient_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );

-- Service role (backend) can insert notifications for any user
DROP POLICY IF EXISTS notifications_service_insert ON notifications;
CREATE POLICY notifications_service_insert ON notifications
  FOR INSERT
  WITH CHECK (true); -- Service role bypass via application logic

-- NOTIFICATION PREFERENCES TABLE POLICIES
-- Members can read and update their own preferences
DROP POLICY IF EXISTS notification_prefs_member_select ON notification_preferences;
CREATE POLICY notification_prefs_member_select ON notification_preferences
  FOR SELECT
  USING (
    user_type = 'member'
    AND EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = user_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS notification_prefs_member_insert ON notification_preferences;
CREATE POLICY notification_prefs_member_insert ON notification_preferences
  FOR INSERT
  WITH CHECK (
    user_type = 'member'
    AND EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = user_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS notification_prefs_member_update ON notification_preferences;
CREATE POLICY notification_prefs_member_update ON notification_preferences
  FOR UPDATE
  USING (
    user_type = 'member'
    AND EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = user_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  )
  WITH CHECK (
    user_type = 'member'
    AND EXISTS (
      SELECT 1 FROM members c
      WHERE c.id = user_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Institution users can read and update their own preferences
DROP POLICY IF EXISTS notification_prefs_user_select ON notification_preferences;
CREATE POLICY notification_prefs_user_select ON notification_preferences
  FOR SELECT
  USING (
    user_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS notification_prefs_user_insert ON notification_preferences;
CREATE POLICY notification_prefs_user_insert ON notification_preferences
  FOR INSERT
  WITH CHECK (
    user_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS notification_prefs_user_update ON notification_preferences;
CREATE POLICY notification_prefs_user_update ON notification_preferences
  FOR UPDATE
  USING (
    user_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  )
  WITH CHECK (
    user_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );
