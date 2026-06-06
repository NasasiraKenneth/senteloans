-- Migration: remove legacy users.role enum column and rely on role_id
-- Safe to run multiple times.

ALTER TABLE users
  DROP COLUMN IF EXISTS role;

-- Drop enum type only if no remaining columns depend on it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'users_role'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE t.typname = 'users_role'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) THEN
    DROP TYPE users_role;
  END IF;
END $$;
