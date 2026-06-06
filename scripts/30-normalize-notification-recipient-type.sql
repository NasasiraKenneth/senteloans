-- Normalize notifications.recipient_type to 'member' | 'institution_user'.
-- Requires: scripts/01-create-schema.sql (notifications tables, sections 17–18).
-- Safe to re-run.

DO $migrate$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION
      'Table notifications does not exist. Run first: npm run db:migrate (or scripts/01-create-schema.sql)';
  END IF;

  UPDATE notifications
     SET recipient_type = 'member'
   WHERE recipient_type = 'client';

  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    UPDATE notification_preferences
       SET user_type = 'member'
     WHERE user_type = 'client';
  END IF;
END $migrate$;

DO $$
DECLARE
    cons_name text;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN;
  END IF;

  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'notifications'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%recipient_type%';
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notifications DROP CONSTRAINT %I', cons_name);
  END IF;

  ALTER TABLE notifications
    ADD CONSTRAINT notifications_recipient_type_check
    CHECK (recipient_type IN ('member', 'institution_user'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE
    cons_name text;
BEGIN
  IF to_regclass('public.notification_preferences') IS NULL THEN
    RETURN;
  END IF;

  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'notification_preferences'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%user_type%';
  IF cons_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE notification_preferences DROP CONSTRAINT %I',
      cons_name
    );
  END IF;

  ALTER TABLE notification_preferences
    ADD CONSTRAINT notification_preferences_user_type_check
    CHECK (user_type IN ('member', 'institution_user'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
