-- Remove the problematic database triggers and use application-based audit logging instead

-- Drop all audit triggers
DROP TRIGGER IF EXISTS audit_trigger ON institutions;
DROP TRIGGER IF EXISTS audit_trigger ON users;
DROP TRIGGER IF EXISTS audit_trigger ON members;
DROP TRIGGER IF EXISTS audit_trigger ON loans;
DROP TRIGGER IF EXISTS audit_trigger ON savings_accounts;
DROP TRIGGER IF EXISTS audit_trigger ON transactions;
DROP TRIGGER IF EXISTS audit_trigger ON loan_products;
DROP TRIGGER IF EXISTS audit_trigger ON member_shares;
DROP TRIGGER IF EXISTS audit_trigger ON loan_repayments;

-- Drop the audit trigger function
DROP FUNCTION IF EXISTS audit_trigger();

-- Keep the audit_logs table as it will be used by the application
-- The table structure remains the same, just populated by application code instead of triggers

SELECT 'Database audit triggers removed - switching to application-based audit logging' as status;
