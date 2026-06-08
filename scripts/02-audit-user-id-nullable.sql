-- Allow NULL user_id for member self-service audit entries (members are not in users)
-- Run after 01-create-schema; before or after RLS is fine.
ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
