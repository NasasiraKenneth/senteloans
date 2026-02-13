-- Allow NULL user_id for client self-service audit entries (clients are not in senteloans_users)
-- Run after 01-create-schema; before or after RLS is fine.
ALTER TABLE senteloans_audit_logs ALTER COLUMN user_id DROP NOT NULL;
