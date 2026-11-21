-- 44-password-reset-tokens.sql
-- Self-service password reset tokens for unified app_auth_users accounts (staff, members, system admins).
-- Raw tokens are never stored; only SHA-256 hex digests are persisted.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID NOT NULL REFERENCES public.app_auth_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    requested_ip VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_auth_user
    ON public.password_reset_tokens(auth_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
    ON public.password_reset_tokens(expires_at);

COMMENT ON TABLE public.password_reset_tokens IS 'Single-use, time-limited password reset tokens (SHA-256 hashed) for app_auth_users.';
