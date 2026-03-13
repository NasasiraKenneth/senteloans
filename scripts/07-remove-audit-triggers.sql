-- Remove the problematic database triggers and use application-based audit logging instead

-- Drop all audit triggers
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_institutions;
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_users;
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_members;
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_loans;
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_savings_accounts;
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_transactions;
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_loan_products;
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_member_shares;
DROP TRIGGER IF EXISTS audit_trigger ON senteloans_loan_repayments;

-- Drop the audit trigger function
DROP FUNCTION IF EXISTS audit_trigger();

-- Keep the audit_logs table as it will be used by the application
-- The table structure remains the same, just populated by application code instead of triggers

SELECT 'Database audit triggers removed - switching to application-based audit logging' as status;
