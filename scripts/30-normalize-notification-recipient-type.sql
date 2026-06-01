-- Normalize notifications.recipient_type to 'member' | 'institution_user'.
-- Requires: scripts/29-create-notifications-tables.sql (or full 01-create-schema.sql).
-- Safe to re-run.

DO $migrate$
BEGIN
  IF to_regclass('public.senteloans_notifications') IS NULL THEN
    RAISE EXCEPTION
      'Table senteloans_notifications does not exist. Run first: psql "$DATABASE_URL" -f scripts/29-create-notifications-tables.sql';
  END IF;

  UPDATE senteloans_notifications
     SET recipient_type = 'member'
   WHERE recipient_type = 'client';

  IF to_regclass('public.senteloans_notification_preferences') IS NOT NULL THEN
    UPDATE senteloans_notification_preferences
       SET user_type = 'member'
     WHERE user_type = 'client';
  END IF;
END $migrate$;

DO $$
DECLARE
    cons_name text;
BEGIN
  IF to_regclass('public.senteloans_notifications') IS NULL THEN
    RETURN;
  END IF;

  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'senteloans_notifications'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%recipient_type%';
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE senteloans_notifications DROP CONSTRAINT %I', cons_name);
  END IF;

  ALTER TABLE senteloans_notifications
    ADD CONSTRAINT senteloans_notifications_recipient_type_check
    CHECK (recipient_type IN ('member', 'institution_user'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE
    cons_name text;
BEGIN
  IF to_regclass('public.senteloans_notification_preferences') IS NULL THEN
    RETURN;
  END IF;

  SELECT conname INTO cons_name
    FROM pg_constraint
   WHERE conrelid = 'senteloans_notification_preferences'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%user_type%';
  IF cons_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE senteloans_notification_preferences DROP CONSTRAINT %I',
      cons_name
    );
  END IF;

  ALTER TABLE senteloans_notification_preferences
    ADD CONSTRAINT senteloans_notification_preferences_user_type_check
    CHECK (user_type IN ('member', 'institution_user'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
