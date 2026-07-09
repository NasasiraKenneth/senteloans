-- Adjustments for chat schema after 35-chats.sql (safe to re-run).
-- Apply if 35-chats.sql was already executed with the older definition.

-- ---------------------------------------------------------------------------
-- System chat identity (in-thread events, not push notifications)
-- ---------------------------------------------------------------------------

ALTER TABLE chat_identities
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE chat_identities
  DROP CONSTRAINT IF EXISTS chat_identities_actor_xor;

ALTER TABLE chat_identities
  ADD CONSTRAINT chat_identities_actor_xor CHECK (
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
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_identities_institution_system
  ON chat_identities(institution_id)
  WHERE is_system = TRUE;

-- ---------------------------------------------------------------------------
-- Inbox pinned section + remove archive
-- ---------------------------------------------------------------------------

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS latest_pinned_at TIMESTAMPTZ;

ALTER TABLE conversations
  DROP COLUMN IF EXISTS is_archived;

CREATE INDEX IF NOT EXISTS idx_conversations_institution_latest_pinned
  ON conversations(institution_id, latest_pinned_at DESC NULLS LAST)
  WHERE latest_pinned_at IS NOT NULL;

-- Backfill latest_pinned_at from existing pins.
UPDATE conversations c
SET latest_pinned_at = pin_stats.max_pinned_at
FROM (
  SELECT conversation_id, MAX(pinned_at) AS max_pinned_at
  FROM pinned_messages
  GROUP BY conversation_id
) AS pin_stats
WHERE c.id = pin_stats.conversation_id
  AND c.latest_pinned_at IS DISTINCT FROM pin_stats.max_pinned_at;

-- ---------------------------------------------------------------------------
-- Forwarded messages
-- ---------------------------------------------------------------------------

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID;

DO $chat_forward_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_forwarded_from'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT fk_messages_forwarded_from
      FOREIGN KEY (forwarded_from_message_id)
      REFERENCES messages(id)
      ON DELETE SET NULL;
  END IF;
END $chat_forward_fk$;

CREATE INDEX IF NOT EXISTS idx_messages_forwarded_from
  ON messages(forwarded_from_message_id)
  WHERE forwarded_from_message_id IS NOT NULL;
