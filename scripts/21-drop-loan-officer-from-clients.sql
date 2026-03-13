-- Remove the loan_officer column from senteloans_members
-- This field is no longer tracked on the client record

ALTER TABLE senteloans_members DROP COLUMN IF EXISTS loan_officer;
