-- SenteLoans PostgreSQL-native auth (run this before 01-create-schema.sql when using plain Postgres)
-- Replaces Supabase auth.users: app_auth_users + auth.uid() for RLS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Auth users table (replaces Supabase auth.users for app-backed auth)
-- Acts as a unified credential identity store.
-- An identity can link to a Staff profile (users.auth_id) AND/OR a Member profile (members.auth_id).
CREATE TABLE IF NOT EXISTS public.app_auth_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_type VARCHAR(155) DEFAULT 'user',
    username VARCHAR(155) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure column allows default 'user' if already created with NOT NULL without default
DO $$
BEGIN
    ALTER TABLE public.app_auth_users ALTER COLUMN user_type SET DEFAULT 'user';
    ALTER TABLE public.app_auth_users ALTER COLUMN user_type DROP NOT NULL;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_auth_users_email ON public.app_auth_users(email);

-- Schema and function so existing RLS policies that use auth.uid() keep working.
-- The app must SET app.current_user_id = '<uuid>' on each connection before queries.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(trim(current_setting('app.current_user_id', true)), '')::uuid;
$$;

COMMENT ON TABLE public.app_auth_users IS 'Unified auth users identity store. Link via users.auth_id (staff) and/or members.auth_id (member/client) for single or dual-role accounts.';

CREATE INDEX IF NOT EXISTS idx_app_auth_users_username ON public.app_auth_users(username);
