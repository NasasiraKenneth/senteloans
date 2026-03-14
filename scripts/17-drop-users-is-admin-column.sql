-- Migration: remove legacy senteloans_users.is_admin column.
-- Role authority should be derived from role_id -> senteloans_roles only.

ALTER TABLE senteloans_users
  DROP COLUMN IF EXISTS is_admin;
