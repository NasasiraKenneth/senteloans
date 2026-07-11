-- Seed SUPPORT conversations for portal-authenticated members.
-- Also seed staff with manage_support_chat_participants as agents on those tickets.
-- Run AFTER app_auth_users linking (see run-migrations.ts). Safe to re-run.

-- 1) System chat identity per institution that has portal members
INSERT INTO chat_identities (institution_id, is_system)
SELECT DISTINCT m.institution_id, TRUE
FROM members m
WHERE m.auth_id IS NOT NULL
  AND m.status = 'Active'
  AND NOT EXISTS (
    SELECT 1
    FROM chat_identities ci
    WHERE ci.institution_id = m.institution_id
      AND ci.is_system = TRUE
  );

-- 2) Member chat identities for portal-authenticated members
INSERT INTO chat_identities (institution_id, branch_id, member_id)
SELECT m.institution_id, m.branch_id, m.id
FROM members m
WHERE m.auth_id IS NOT NULL
  AND m.status = 'Active'
  AND NOT EXISTS (
    SELECT 1
    FROM chat_identities ci
    WHERE ci.member_id = m.id
  );

-- 3) Staff chat identities for users with manage_support_chat_participants
INSERT INTO chat_identities (institution_id, branch_id, user_id)
SELECT DISTINCT u.institution_id, u.branch_id, u.id
FROM users u
WHERE u.status = 'Active'
  AND EXISTS (
    SELECT 1
      FROM role_permissions rp
      INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = u.role_id
       AND p.name = 'manage_support_chat_participants'
       AND (u.branch_id IS NULL OR rp.branch_id = u.branch_id)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM chat_identities ci
    WHERE ci.user_id = u.id
  );

-- 4) SUPPORT conversations (one per portal member via MEMBER reference)
WITH missing AS (
  SELECT
    m.id AS member_id,
    m.institution_id,
    m.branch_id,
    m.full_name,
    ci.id AS member_chat_identity_id
  FROM members m
  INNER JOIN chat_identities ci
    ON ci.member_id = m.id
   AND ci.is_active = TRUE
  WHERE m.auth_id IS NOT NULL
    AND m.status = 'Active'
    AND NOT EXISTS (
      SELECT 1
      FROM conversation_references cr
      WHERE cr.institution_id = m.institution_id
        AND cr.reference_type = 'MEMBER'
        AND cr.reference_id = m.id
    )
),
created AS (
  INSERT INTO conversations (
    institution_id,
    branch_id,
    type,
    title,
    created_by,
    support_status
  )
  SELECT
    institution_id,
    branch_id,
    'SUPPORT',
    'Support — ' || COALESCE(full_name, 'Member'),
    member_chat_identity_id,
    'OPEN'
  FROM missing
  RETURNING id, institution_id, branch_id, created_by
)
INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
SELECT c.id, c.created_by, 'OWNER'
FROM created c;

-- 5) MEMBER references for SUPPORT threads missing them
INSERT INTO conversation_references (
  conversation_id,
  institution_id,
  reference_type,
  reference_id
)
SELECT
  c.id,
  c.institution_id,
  'MEMBER',
  ci.member_id
FROM conversations c
INNER JOIN chat_identities ci ON ci.id = c.created_by
INNER JOIN members m ON m.id = ci.member_id
WHERE c.type = 'SUPPORT'
  AND ci.member_id IS NOT NULL
  AND m.auth_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM conversation_references cr
    WHERE cr.institution_id = c.institution_id
      AND cr.reference_type = 'MEMBER'
      AND cr.reference_id = ci.member_id
  );

-- 6) Add manage_support_chat_participants staff as agents on SUPPORT tickets
--    Same institution + matching branch (null branch matches any).
INSERT INTO conversation_participants (conversation_id, chat_identity_id, role)
SELECT DISTINCT
  c.id,
  sci.id,
  'MEMBER'
FROM conversations c
INNER JOIN conversation_references cr
  ON cr.conversation_id = c.id
 AND cr.reference_type = 'MEMBER'
INNER JOIN members m ON m.id = cr.reference_id
INNER JOIN chat_identities sci
  ON sci.user_id IS NOT NULL
 AND sci.institution_id = c.institution_id
 AND sci.is_active = TRUE
 AND sci.is_system = FALSE
INNER JOIN users u ON u.id = sci.user_id AND u.status = 'Active'
WHERE c.type = 'SUPPORT'
  AND m.auth_id IS NOT NULL
  AND EXISTS (
    SELECT 1
      FROM role_permissions rp
      INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = u.role_id
       AND p.name = 'manage_support_chat_participants'
       AND rp.branch_id = COALESCE(c.branch_id, u.branch_id, sci.branch_id)
  )
  AND (
    c.branch_id IS NULL
    OR u.branch_id IS NULL
    OR c.branch_id = u.branch_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM conversation_participants cp
    WHERE cp.conversation_id = c.id
      AND cp.chat_identity_id = sci.id
  );

-- Re-activate previously left staff agents who still have the permission
UPDATE conversation_participants cp
   SET left_at = NULL,
       joined_at = NOW()
  FROM conversations c
  INNER JOIN chat_identities sci ON sci.id = cp.chat_identity_id
  INNER JOIN users u ON u.id = sci.user_id AND u.status = 'Active'
 WHERE cp.conversation_id = c.id
   AND c.type = 'SUPPORT'
   AND cp.left_at IS NOT NULL
   AND sci.institution_id = c.institution_id
   AND sci.user_id IS NOT NULL
   AND (
     c.branch_id IS NULL
     OR u.branch_id IS NULL
     OR c.branch_id = u.branch_id
   )
   AND EXISTS (
     SELECT 1
       FROM role_permissions rp
       INNER JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = u.role_id
        AND p.name = 'manage_support_chat_participants'
        AND rp.branch_id = COALESCE(c.branch_id, u.branch_id, sci.branch_id)
   );

-- 7) Internal open system messages (staff-only)
INSERT INTO messages (
  conversation_id,
  institution_id,
  sender_id,
  message_type,
  visibility,
  body
)
SELECT
  c.id,
  c.institution_id,
  sys.id,
  'SYSTEM',
  'INTERNAL',
  'Support thread opened for ' || COALESCE(m.full_name, 'Member')
FROM conversations c
INNER JOIN conversation_references cr
  ON cr.conversation_id = c.id
 AND cr.reference_type = 'MEMBER'
INNER JOIN members m ON m.id = cr.reference_id
INNER JOIN chat_identities sys
  ON sys.institution_id = c.institution_id
 AND sys.is_system = TRUE
WHERE c.type = 'SUPPORT'
  AND m.auth_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM messages msg
    WHERE msg.conversation_id = c.id
      AND msg.message_type = 'SYSTEM'
      AND msg.body LIKE 'Support thread opened for %'
  );
