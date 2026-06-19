-- Align legacy databases with app_auth_users.user_type + users/members.auth_id naming.

-- Rename supabase_user_id -> auth_id when upgrading older databases.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'supabase_user_id'
  ) THEN
    ALTER TABLE users RENAME COLUMN supabase_user_id TO auth_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members' AND column_name = 'supabase_user_id'
  ) THEN
    ALTER TABLE members RENAME COLUMN supabase_user_id TO auth_id;
  END IF;
END $$;

-- Drop legacy password column from users if it still exists.
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- Ensure app_auth_users has user_type + username (fresh 00-postgres-auth.sql already defines them).
ALTER TABLE app_auth_users
  ADD COLUMN IF NOT EXISTS user_type VARCHAR(155),
  ADD COLUMN IF NOT EXISTS username VARCHAR(155);

-- Backfill user_type from linked profile tables.
UPDATE app_auth_users a
   SET user_type = 'institution_staff'
 WHERE a.user_type IS NULL
   AND EXISTS (SELECT 1 FROM users u WHERE u.auth_id = a.id);

UPDATE app_auth_users a
   SET user_type = 'member'
 WHERE a.user_type IS NULL
   AND EXISTS (SELECT 1 FROM members m WHERE m.auth_id = a.id);

UPDATE app_auth_users
   SET user_type = 'institution_staff'
 WHERE user_type IS NULL;

-- Rename legacy app_auth_users.user_type value (distinct from notifications.recipient_type).
UPDATE app_auth_users
   SET user_type = 'institution_staff'
 WHERE user_type = 'institution_user';

-- Backfill username from email local-part when missing.
DO $$
DECLARE
  r RECORD;
  base_name TEXT;
  final_name TEXT;
  suffix INT;
BEGIN
  FOR r IN SELECT id, email FROM app_auth_users WHERE username IS NULL OR btrim(username) = ''
  LOOP
    base_name := lower(regexp_replace(split_part(r.email, '@', 1), '[^a-z0-9._-]', '', 'g'));
    IF base_name IS NULL OR base_name = '' THEN
      base_name := 'user';
    END IF;
    final_name := base_name;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM app_auth_users WHERE username = final_name AND id != r.id) LOOP
      final_name := base_name || suffix::text;
      suffix := suffix + 1;
    END LOOP;
    UPDATE app_auth_users SET username = final_name WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_app_auth_users_username ON app_auth_users(username);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_members_auth_id ON members(auth_id);

DROP INDEX IF EXISTS idx_users_supabase_user_id;
