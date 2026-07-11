-- Enable chats for seeded institution branches and (when auth already linked)
-- create SUPPORT tickets for portal-authenticated members.
-- Safe to re-run.
--
-- Note: on a fresh `npm run db:migrate`, member auth_id is linked AFTER all
-- numbered SQL migrations. Support threads for those members are also seeded
-- from scripts/seed-member-support-conversations.sql (called by run-migrations.ts
-- after auth linking).

-- Ensure config.chats exists on older databases.
ALTER TABLE config
  ADD COLUMN IF NOT EXISTS chats VARCHAR(10) NOT NULL DEFAULT 'false';

-- Turn chats on for seeded operational branches (not the platform branch).
UPDATE config c
   SET chats = 'true',
       updated_at = NOW()
  FROM branches b
  JOIN institutions i ON i.id = b.institution_id
 WHERE c.branch_id = b.id
   AND b.branch_code IN ('KCS-001', 'QCU-001', 'OMU-001')
   AND i.name <> 'SenteLoans Platform';

-- Keep platform chats off.
UPDATE config c
   SET chats = 'false',
       updated_at = NOW()
  FROM branches b
  JOIN institutions i ON i.id = b.institution_id
 WHERE c.branch_id = b.id
   AND (b.branch_code = 'PLAT-001' OR i.name = 'SenteLoans Platform');
