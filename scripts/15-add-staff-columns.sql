-- Migration: Add joined_at, is_admin to senteloans_users; username to app_auth_users
-- Run this after existing migrations.

-- 1. Add joined_at and is_admin to senteloans_users
ALTER TABLE senteloans_users
  ADD COLUMN IF NOT EXISTS joined_at DATE,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add username to app_auth_users
ALTER TABLE app_auth_users
  ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;

-- 3. Backfill joined_at from created_at for existing users
UPDATE senteloans_users
  SET joined_at = created_at::date
  WHERE joined_at IS NULL;

-- 4. Backfill is_admin for existing institution_admin users
UPDATE senteloans_users
SET is_admin = TRUE
FROM senteloans_roles r
WHERE r.id = senteloans_users.role_id
  AND (
    r.name = 'Admin'
    OR regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g') = 'institution_admin'
  );

-- 5. Backfill username from email (use full email to avoid duplicates like multiple "admin" prefixes)
DO $$
DECLARE
  r RECORD;
  base_name TEXT;
  final_name TEXT;
  suffix INT;
BEGIN
  FOR r IN SELECT id, email FROM app_auth_users WHERE username IS NULL
  LOOP
    base_name := split_part(r.email, '@', 1);
    final_name := base_name;
    suffix := 1;
    -- If username already taken, append a number
    WHILE EXISTS (SELECT 1 FROM app_auth_users WHERE username = final_name AND id != r.id) LOOP
      final_name := base_name || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE app_auth_users SET username = final_name WHERE id = r.id;
  END LOOP;
END $$;

-- 6. Create index on username for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_auth_users_username ON app_auth_users(username);

-- Verify
SELECT 'senteloans_users columns' AS check_type, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'senteloans_users' AND column_name IN ('joined_at', 'is_admin')
UNION ALL
SELECT 'app_auth_users columns', column_name, data_type
FROM information_schema.columns
WHERE table_name = 'app_auth_users' AND column_name = 'username';
