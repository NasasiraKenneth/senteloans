-- Chat schema for institution-scoped messaging (staff + members).
-- Runtime: PostgreSQL (source of truth), Redis (cache/presence), Socket.IO (realtime).
-- Requires: scripts/01-create-schema.sql (institutions, branches, users, members).
-- Safe to re-run.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

DO $chat_enums$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_type') THEN
    CREATE TYPE conversation_type AS ENUM (
      'DIRECT',
      'GROUP',
      'COMMITTEE',
      'LOAN',
      'BRANCH',
      'SUPPORT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE message_type AS ENUM (
      'TEXT',
      'IMAGE',
      'FILE',
      'AUDIO',
      'VIDEO',
      'SYSTEM'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_participant_role') THEN
    CREATE TYPE conversation_participant_role AS ENUM (
      'OWNER',
      'ADMIN',
      'MEMBER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_reference_type') THEN
    CREATE TYPE conversation_reference_type AS ENUM (
      'LOAN',
      'BRANCH',
      'MEMBER',
      'INSTITUTION'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_visibility') THEN
    CREATE TYPE message_visibility AS ENUM ('PUBLIC', 'INTERNAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_status') THEN
    CREATE TYPE support_ticket_status AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');
  END IF;
END $chat_enums$;

-- ---------------------------------------------------------------------------
-- Chat identities (one row per staff user OR member who can participate)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id UUID
    REFERENCES branches(id) ON DELETE SET NULL,
  user_id UUID UNIQUE
    REFERENCES users(id) ON DELETE CASCADE,
  member_id UUID UNIQUE
    REFERENCES members(id) ON DELETE CASCADE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_identities_actor_xor CHECK (
    (
      is_system = TRUE
      AND user_id IS NULL
      AND member_id IS NULL
    )
    OR (
      is_system = FALSE
      AND (
        (user_id IS NOT NULL AND member_id IS NULL)
        OR (user_id IS NULL AND member_id IS NOT NULL)
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_chat_identities_institution
  ON chat_identities(institution_id);

CREATE INDEX IF NOT EXISTS idx_chat_identities_branch
  ON chat_identities(branch_id)
  WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_identities_institution_user
  ON chat_identities(institution_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_identities_institution_member
  ON chat_identities(institution_id, member_id)
  WHERE member_id IS NOT NULL;

-- One synthetic "system" identity per institution for in-thread SYSTEM messages
-- (group created, participant added, loan thread opened — not push notifications).
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_identities_institution_system
  ON chat_identities(institution_id)
  WHERE is_system = TRUE;

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,
  branch_id UUID
    REFERENCES branches(id) ON DELETE SET NULL,
  type conversation_type NOT NULL,
  title VARCHAR(255),
  description TEXT,
  created_by UUID
    REFERENCES chat_identities(id) ON DELETE SET NULL,
  last_message_id UUID,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  -- Denormalized MAX(pinned_messages.pinned_at) for inbox pinned-section sort.
  latest_pinned_at TIMESTAMPTZ,
  -- SUPPORT ticket fields (null for non-support conversations)
  support_status support_ticket_status,
  assignee_chat_identity_id UUID
    REFERENCES chat_identities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_institution_updated
  ON conversations(institution_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_institution_type
  ON conversations(institution_id, type);

CREATE INDEX IF NOT EXISTS idx_conversations_branch
  ON conversations(branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON conversations(institution_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_institution_latest_pinned
  ON conversations(institution_id, latest_pinned_at DESC NULLS LAST)
  WHERE latest_pinned_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Direct conversation dedupe (one thread per identity pair per institution)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversation_direct_keys (
  institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,
  identity_a UUID NOT NULL
    REFERENCES chat_identities(id) ON DELETE CASCADE,
  identity_b UUID NOT NULL
    REFERENCES chat_identities(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (institution_id, identity_a, identity_b),
  CONSTRAINT conversation_direct_keys_ordered CHECK (identity_a < identity_b),
  CONSTRAINT conversation_direct_keys_distinct CHECK (identity_a <> identity_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_direct_keys_conversation
  ON conversation_direct_keys(conversation_id);

-- ---------------------------------------------------------------------------
-- Participants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  chat_identity_id UUID NOT NULL
    REFERENCES chat_identities(id) ON DELETE CASCADE,
  role conversation_participant_role NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  last_read_message_id UUID,
  last_read_at TIMESTAMPTZ,
  muted_until TIMESTAMPTZ,
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (conversation_id, chat_identity_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_identity
  ON conversation_participants(chat_identity_id);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_active
  ON conversation_participants(conversation_id)
  WHERE left_at IS NULL;

-- ---------------------------------------------------------------------------
-- Domain references (loan thread, branch channel, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversation_references (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,
  reference_type conversation_reference_type NOT NULL,
  reference_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_conversation_reference UNIQUE (
    institution_id,
    reference_type,
    reference_id
  )
);

CREATE INDEX IF NOT EXISTS idx_conversation_references_conversation
  ON conversation_references(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_references_lookup
  ON conversation_references(reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL
    REFERENCES chat_identities(id) ON DELETE RESTRICT,
  message_type message_type NOT NULL DEFAULT 'TEXT',
  visibility message_visibility NOT NULL DEFAULT 'PUBLIC',
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_message_id VARCHAR(64),
  reply_to_message_id UUID
    REFERENCES messages(id) ON DELETE SET NULL,
  forwarded_from_message_id UUID,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_institution_created
  ON messages(institution_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_client_idempotency
  ON messages(conversation_id, sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_active
  ON messages(conversation_id, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_messages_forwarded_from
  ON messages(forwarded_from_message_id)
  WHERE forwarded_from_message_id IS NOT NULL;

-- Wire conversations.last_message_id after messages exists.
DO $chat_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_last_message'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT fk_conversations_last_message
      FOREIGN KEY (last_message_id)
      REFERENCES messages(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_participants_last_read_message'
  ) THEN
    ALTER TABLE conversation_participants
      ADD CONSTRAINT fk_participants_last_read_message
      FOREIGN KEY (last_read_message_id)
      REFERENCES messages(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_forwarded_from'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT fk_messages_forwarded_from
      FOREIGN KEY (forwarded_from_message_id)
      REFERENCES messages(id)
      ON DELETE SET NULL;
  END IF;
END $chat_fk$;

-- ---------------------------------------------------------------------------
-- Attachments, read receipts, pins
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL
    REFERENCES messages(id) ON DELETE CASCADE,
  file_name VARCHAR(255),
  file_url TEXT NOT NULL,
  mime_type VARCHAR(100),
  file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
  storage_key TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message
  ON message_attachments(message_id);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id UUID NOT NULL
    REFERENCES messages(id) ON DELETE CASCADE,
  chat_identity_id UUID NOT NULL
    REFERENCES chat_identities(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, chat_identity_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_identity
  ON message_reads(chat_identity_id, read_at DESC);

CREATE TABLE IF NOT EXISTS pinned_messages (
  conversation_id UUID NOT NULL
    REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL
    REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by UUID
    REFERENCES chat_identities(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_messages_conversation
  ON pinned_messages(conversation_id, pinned_at DESC);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- Inbox "pinned" section: conversations WHERE latest_pinned_at IS NOT NULL,
-- ordered by latest_pinned_at DESC. Maintain latest_pinned_at when pinning/unpinning.
--
-- SYSTEM messages are in-thread timeline events (not the notifications table).
-- Insert with sender_id = institution system chat_identity (is_system = TRUE).
-- Bootstrap once per institution:
--   INSERT INTO chat_identities (institution_id, is_system)
--   VALUES ($1, TRUE) ON CONFLICT DO NOTHING;
--
-- Forwarded messages: body = optional caption; forwarded_from_message_id points at
-- the source message. If the source is deleted, keep a snapshot in metadata, e.g.:
--   { "forwardSnapshot": { "senderName", "body", "messageType", "attachmentName" } }
