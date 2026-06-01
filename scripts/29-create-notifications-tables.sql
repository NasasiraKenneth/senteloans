-- Create notifications tables (required before 30-normalize-notification-recipient-type.sql).
-- Safe to re-run (IF NOT EXISTS). Matches scripts/01-create-schema.sql sections 17–18.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS senteloans_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('member', 'institution_user')),
    recipient_id UUID NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE TABLE IF NOT EXISTS senteloans_notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    user_type TEXT NOT NULL CHECK (user_type IN ('member', 'institution_user')),
    user_id UUID NOT NULL,
    notification_type TEXT NOT NULL,
    in_app_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    email_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uk_notification_prefs UNIQUE(user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON senteloans_notifications(recipient_id, recipient_type, read);
CREATE INDEX IF NOT EXISTS idx_notifications_institution
  ON senteloans_notifications(institution_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON senteloans_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON senteloans_notifications(type);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
  ON senteloans_notification_preferences(user_id, user_type);
