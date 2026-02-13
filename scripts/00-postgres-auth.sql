-- SenteLoans PostgreSQL-native auth (run this before 01-create-schema.sql when using plain Postgres)
-- Replaces Supabase auth.users: app_auth_users + auth.uid() for RLS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Auth users table (replaces Supabase auth.users for app-backed auth)
CREATE TABLE IF NOT EXISTS public.app_auth_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

COMMENT ON TABLE public.app_auth_users IS 'App-backed auth users (replaces Supabase auth.users). Link via senteloans_users.supabase_user_id / senteloans_clients.supabase_user_id';
