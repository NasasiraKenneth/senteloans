-- Support ticket model: message visibility, ticket status, manage_support_chat_participants.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_visibility') THEN
    CREATE TYPE message_visibility AS ENUM ('PUBLIC', 'INTERNAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_status') THEN
    CREATE TYPE support_ticket_status AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Messages: public vs internal notes
-- ---------------------------------------------------------------------------

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS visibility message_visibility NOT NULL DEFAULT 'PUBLIC';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_visibility_created
  ON messages(conversation_id, visibility, created_at DESC)
  WHERE is_deleted = FALSE;

-- ---------------------------------------------------------------------------
-- Conversations: support ticket fields
-- ---------------------------------------------------------------------------

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS support_status support_ticket_status;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS assignee_chat_identity_id UUID
    REFERENCES chat_identities(id) ON DELETE SET NULL;

UPDATE conversations
   SET support_status = 'OPEN'
 WHERE type = 'SUPPORT'
   AND support_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_support_queue
  ON conversations(institution_id, branch_id, support_status, last_message_at DESC NULLS LAST)
  WHERE type = 'SUPPORT';

-- ---------------------------------------------------------------------------
-- Permission: manage support agents (not general group participants)
-- ---------------------------------------------------------------------------

INSERT INTO permissions (name, module)
VALUES ('manage_support_chat_participants', 'chats')
ON CONFLICT (name) DO NOTHING;

WITH role_permission_map(role_name, permission_name) AS (
  VALUES
    ('Manager', 'manage_support_chat_participants'),
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
