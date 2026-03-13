-- Create Notifications Tables for SenteLoans
-- Run this in Supabase SQL Editor

-- 1. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS senteloans_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE CASCADE,
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

-- 2. NOTIFICATION PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS senteloans_notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE CASCADE,
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

-- 3. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON senteloans_notifications(recipient_id, recipient_type, read);
CREATE INDEX IF NOT EXISTS idx_notifications_institution ON senteloans_notifications(institution_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON senteloans_notifications(created_at DESC);

-- 4. ENABLE RLS
ALTER TABLE senteloans_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE senteloans_notification_preferences ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES FOR NOTIFICATIONS

-- Members can read their own notifications
DROP POLICY IF EXISTS notifications_member_select ON senteloans_notifications;
CREATE POLICY notifications_member_select ON senteloans_notifications
  FOR SELECT
  USING (
    recipient_type = 'member'
    AND EXISTS (
      SELECT 1 FROM senteloans_members c
      WHERE c.id = recipient_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Institution users can read their own notifications
DROP POLICY IF EXISTS notifications_user_select ON senteloans_notifications;
CREATE POLICY notifications_user_select ON senteloans_notifications
  FOR SELECT
  USING (
    recipient_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM senteloans_users u
      WHERE u.id = recipient_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );

-- Members can update (mark as read) their own notifications
DROP POLICY IF EXISTS notifications_member_update ON senteloans_notifications;
CREATE POLICY notifications_member_update ON senteloans_notifications
  FOR UPDATE
  USING (
    recipient_type = 'member'
    AND EXISTS (
      SELECT 1 FROM senteloans_members c
      WHERE c.id = recipient_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  )
  WITH CHECK (
    recipient_type = 'member'
    AND EXISTS (
      SELECT 1 FROM senteloans_members c
      WHERE c.id = recipient_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Institution users can update (mark as read) their own notifications
DROP POLICY IF EXISTS notifications_user_update ON senteloans_notifications;
CREATE POLICY notifications_user_update ON senteloans_notifications
  FOR UPDATE
  USING (
    recipient_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM senteloans_users u
      WHERE u.id = recipient_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  )
  WITH CHECK (
    recipient_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM senteloans_users u
      WHERE u.id = recipient_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );

-- Service role (backend) can insert notifications for any user
DROP POLICY IF EXISTS notifications_service_insert ON senteloans_notifications;
CREATE POLICY notifications_service_insert ON senteloans_notifications
  FOR INSERT
  WITH CHECK (true);

-- 6. RLS POLICIES FOR NOTIFICATION PREFERENCES

-- Members can read and update their own preferences
DROP POLICY IF EXISTS notification_prefs_member_select ON senteloans_notification_preferences;
CREATE POLICY notification_prefs_member_select ON senteloans_notification_preferences
  FOR SELECT
  USING (
    user_type = 'member'
    AND EXISTS (
      SELECT 1 FROM senteloans_members c
      WHERE c.id = user_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS notification_prefs_member_insert ON senteloans_notification_preferences;
CREATE POLICY notification_prefs_member_insert ON senteloans_notification_preferences
  FOR INSERT
  WITH CHECK (
    user_type = 'member'
    AND EXISTS (
      SELECT 1 FROM senteloans_members c
      WHERE c.id = user_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS notification_prefs_member_update ON senteloans_notification_preferences;
CREATE POLICY notification_prefs_member_update ON senteloans_notification_preferences
  FOR UPDATE
  USING (
    user_type = 'member'
    AND EXISTS (
      SELECT 1 FROM senteloans_members c
      WHERE c.id = user_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  )
  WITH CHECK (
    user_type = 'member'
    AND EXISTS (
      SELECT 1 FROM senteloans_members c
      WHERE c.id = user_id
        AND c.supabase_user_id = auth.uid()
        AND c.institution_id = institution_id
    )
  );

-- Institution users can read and update their own preferences
DROP POLICY IF EXISTS notification_prefs_user_select ON senteloans_notification_preferences;
CREATE POLICY notification_prefs_user_select ON senteloans_notification_preferences
  FOR SELECT
  USING (
    user_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM senteloans_users u
      WHERE u.id = user_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS notification_prefs_user_insert ON senteloans_notification_preferences;
CREATE POLICY notification_prefs_user_insert ON senteloans_notification_preferences
  FOR INSERT
  WITH CHECK (
    user_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM senteloans_users u
      WHERE u.id = user_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS notification_prefs_user_update ON senteloans_notification_preferences;
CREATE POLICY notification_prefs_user_update ON senteloans_notification_preferences
  FOR UPDATE
  USING (
    user_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM senteloans_users u
      WHERE u.id = user_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  )
  WITH CHECK (
    user_type = 'institution_user'
    AND EXISTS (
      SELECT 1 FROM senteloans_users u
      WHERE u.id = user_id
        AND u.supabase_user_id = auth.uid()
        AND u.institution_id = institution_id
    )
  );
