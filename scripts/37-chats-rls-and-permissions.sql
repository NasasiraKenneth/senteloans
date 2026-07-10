-- Chat RLS policies + permission catalog for messaging.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

INSERT INTO permissions (name, module)
VALUES
  ('view_chats', 'chats'),
  ('send_chat_messages', 'chats'),
  ('create_chat_group', 'chats'),
  ('create_chat_domain_thread', 'chats'),
  ('manage_chat_participants', 'chats'),
  ('manage_support_chat_participants', 'chats')
ON CONFLICT (name) DO NOTHING;

WITH role_permission_map(role_name, permission_name) AS (
  VALUES
    ('Loan Officer', 'view_chats'),
    ('Loan Officer', 'send_chat_messages'),
    ('Loan Officer', 'create_chat_domain_thread'),
    ('Credit Officer', 'view_chats'),
    ('Credit Officer', 'send_chat_messages'),
    ('Credit Officer', 'create_chat_domain_thread'),
    ('Teller', 'view_chats'),
    ('Teller', 'send_chat_messages'),
    ('Consultant', 'view_chats'),
    ('Consultant', 'send_chat_messages'),
    ('Treasurer', 'view_chats'),
    ('Treasurer', 'send_chat_messages'),
    ('Accountant', 'view_chats'),
    ('Accountant', 'send_chat_messages'),
    ('Manager', 'view_chats'),
    ('Manager', 'send_chat_messages'),
    ('Manager', 'create_chat_group'),
    ('Manager', 'create_chat_domain_thread'),
    ('Manager', 'manage_chat_participants'),
    ('Manager', 'manage_support_chat_participants'),
    ('Admin', 'view_chats'),
    ('Admin', 'send_chat_messages'),
    ('Admin', 'create_chat_group'),
    ('Admin', 'create_chat_domain_thread'),
    ('Admin', 'manage_chat_participants'),
    ('Admin', 'manage_support_chat_participants')
)
INSERT INTO role_permissions (branch_id, role_id, permission_id)
SELECT
  b.id,
  r.id,
  p.id
FROM branches b
JOIN role_permission_map rpm ON TRUE
JOIN roles r ON r.name = rpm.role_name
JOIN permissions p ON p.name = rpm.permission_name
ON CONFLICT (branch_id, role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_chat_identity_ids()
RETURNS SETOF UUID AS $$
  SELECT ci.id
    FROM chat_identities ci
   WHERE (
     EXISTS (
       SELECT 1 FROM users u
        WHERE u.id = ci.user_id
          AND u.auth_id = auth.uid()
     )
     OR EXISTS (
       SELECT 1 FROM members m
        WHERE m.id = ci.member_id
          AND m.auth_id = auth.uid()
     )
   )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION app.is_chat_participant(p_conversation_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
      FROM conversation_participants cp
     WHERE cp.conversation_id = p_conversation_id
       AND cp.left_at IS NULL
       AND cp.chat_identity_id IN (SELECT app.current_chat_identity_ids())
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE chat_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_direct_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- chat_identities
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS chat_identities_select ON chat_identities;
CREATE POLICY chat_identities_select ON chat_identities
  FOR SELECT USING (
    can_access_row(institution_id, branch_id)
    OR id IN (SELECT app.current_chat_identity_ids())
    OR (
      is_system = TRUE
      AND institution_id = COALESCE(
        app.current_institution_id(),
        (SELECT m.institution_id FROM members m WHERE m.auth_id = auth.uid() LIMIT 1)
      )
    )
  );

DROP POLICY IF EXISTS chat_identities_insert ON chat_identities;
CREATE POLICY chat_identities_insert ON chat_identities
  FOR INSERT WITH CHECK (
    can_access_row(institution_id, branch_id)
    OR EXISTS (
      SELECT 1 FROM members m
       WHERE m.id = member_id
         AND m.auth_id = auth.uid()
         AND m.institution_id = institution_id
    )
  );

DROP POLICY IF EXISTS chat_identities_update ON chat_identities;
CREATE POLICY chat_identities_update ON chat_identities
  FOR UPDATE USING (
    can_access_row(institution_id, branch_id)
    OR id IN (SELECT app.current_chat_identity_ids())
  );

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations
  FOR SELECT USING (
    can_access_row(institution_id, branch_id)
    OR app.is_chat_participant(id)
  );

DROP POLICY IF EXISTS conversations_insert ON conversations;
CREATE POLICY conversations_insert ON conversations
  FOR INSERT WITH CHECK (
    can_access_row(institution_id, branch_id)
    OR created_by IN (SELECT app.current_chat_identity_ids())
  );

DROP POLICY IF EXISTS conversations_update ON conversations;
CREATE POLICY conversations_update ON conversations
  FOR UPDATE USING (
    can_access_row(institution_id, branch_id)
    OR app.is_chat_participant(id)
  );

-- ---------------------------------------------------------------------------
-- conversation_direct_keys
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS conversation_direct_keys_select ON conversation_direct_keys;
CREATE POLICY conversation_direct_keys_select ON conversation_direct_keys
  FOR SELECT USING (
    institution_id = COALESCE(
      app.current_institution_id(),
      (SELECT m.institution_id FROM members m WHERE m.auth_id = auth.uid() LIMIT 1)
    )
    OR app.is_chat_participant(conversation_id)
  );

DROP POLICY IF EXISTS conversation_direct_keys_insert ON conversation_direct_keys;
CREATE POLICY conversation_direct_keys_insert ON conversation_direct_keys
  FOR INSERT WITH CHECK (
    identity_a IN (SELECT app.current_chat_identity_ids())
    OR identity_b IN (SELECT app.current_chat_identity_ids())
    OR can_access_row(institution_id, NULL)
  );

-- ---------------------------------------------------------------------------
-- conversation_participants
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS conversation_participants_select ON conversation_participants;
CREATE POLICY conversation_participants_select ON conversation_participants
  FOR SELECT USING (
    app.is_chat_participant(conversation_id)
    OR chat_identity_id IN (SELECT app.current_chat_identity_ids())
    OR EXISTS (
      SELECT 1 FROM conversations c
       WHERE c.id = conversation_id
         AND can_access_row(c.institution_id, c.branch_id)
    )
  );

DROP POLICY IF EXISTS conversation_participants_insert ON conversation_participants;
CREATE POLICY conversation_participants_insert ON conversation_participants
  FOR INSERT WITH CHECK (
    app.is_chat_participant(conversation_id)
    OR chat_identity_id IN (SELECT app.current_chat_identity_ids())
    OR EXISTS (
      SELECT 1 FROM conversations c
       WHERE c.id = conversation_id
         AND can_access_row(c.institution_id, c.branch_id)
    )
  );

DROP POLICY IF EXISTS conversation_participants_update ON conversation_participants;
CREATE POLICY conversation_participants_update ON conversation_participants
  FOR UPDATE USING (
    chat_identity_id IN (SELECT app.current_chat_identity_ids())
    OR app.is_chat_participant(conversation_id)
    OR EXISTS (
      SELECT 1 FROM conversations c
       WHERE c.id = conversation_id
         AND can_access_row(c.institution_id, c.branch_id)
    )
  );

-- ---------------------------------------------------------------------------
-- conversation_references
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS conversation_references_select ON conversation_references;
CREATE POLICY conversation_references_select ON conversation_references
  FOR SELECT USING (
    can_access_row(institution_id, NULL)
    OR app.is_chat_participant(conversation_id)
  );

DROP POLICY IF EXISTS conversation_references_insert ON conversation_references;
CREATE POLICY conversation_references_insert ON conversation_references
  FOR INSERT WITH CHECK (
    can_access_row(institution_id, NULL)
    OR app.is_chat_participant(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT USING (
    can_access_row(institution_id, NULL)
    OR app.is_chat_participant(conversation_id)
  );

DROP POLICY IF EXISTS messages_insert ON messages;
CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (
    sender_id IN (SELECT app.current_chat_identity_ids())
    OR (
      can_access_row(institution_id, NULL)
      AND app.is_chat_participant(conversation_id)
    )
    OR (
      -- system identity inserts for SYSTEM messages
      EXISTS (
        SELECT 1 FROM chat_identities ci
         WHERE ci.id = sender_id
           AND ci.is_system = TRUE
           AND ci.institution_id = institution_id
      )
      AND app.is_chat_participant(conversation_id)
    )
  );

DROP POLICY IF EXISTS messages_update ON messages;
CREATE POLICY messages_update ON messages
  FOR UPDATE USING (
    sender_id IN (SELECT app.current_chat_identity_ids())
    OR app.is_chat_participant(conversation_id)
    OR can_access_row(institution_id, NULL)
  );

-- ---------------------------------------------------------------------------
-- message_attachments / message_reads / pinned_messages
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS message_attachments_select ON message_attachments;
CREATE POLICY message_attachments_select ON message_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m
       WHERE m.id = message_id
         AND (
           can_access_row(m.institution_id, NULL)
           OR app.is_chat_participant(m.conversation_id)
         )
    )
  );

DROP POLICY IF EXISTS message_attachments_insert ON message_attachments;
CREATE POLICY message_attachments_insert ON message_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM messages m
       WHERE m.id = message_id
         AND (
           m.sender_id IN (SELECT app.current_chat_identity_ids())
           OR app.is_chat_participant(m.conversation_id)
         )
    )
  );

DROP POLICY IF EXISTS message_reads_all ON message_reads;
CREATE POLICY message_reads_all ON message_reads
  FOR ALL USING (
    chat_identity_id IN (SELECT app.current_chat_identity_ids())
    OR EXISTS (
      SELECT 1 FROM messages m
       WHERE m.id = message_id
         AND app.is_chat_participant(m.conversation_id)
    )
  )
  WITH CHECK (
    chat_identity_id IN (SELECT app.current_chat_identity_ids())
  );

DROP POLICY IF EXISTS pinned_messages_select ON pinned_messages;
CREATE POLICY pinned_messages_select ON pinned_messages
  FOR SELECT USING (app.is_chat_participant(conversation_id));

DROP POLICY IF EXISTS pinned_messages_write ON pinned_messages;
CREATE POLICY pinned_messages_write ON pinned_messages
  FOR ALL USING (app.is_chat_participant(conversation_id))
  WITH CHECK (app.is_chat_participant(conversation_id));
