-- Remove the loan_officer column from senteloans_clients
-- This field is no longer tracked on the client record

ALTER TABLE senteloans_clients DROP COLUMN IF EXISTS loan_officer;
