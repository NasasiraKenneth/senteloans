-- Fix Audit Trigger Function
-- This script fixes the audit trigger function to properly handle tables without institution_id

-- Drop existing audit triggers first
DROP TRIGGER IF EXISTS audit_institutions_trigger ON institutions;
DROP TRIGGER IF EXISTS audit_users_trigger ON users;
DROP TRIGGER IF EXISTS audit_clients_trigger ON members;
DROP TRIGGER IF EXISTS audit_loans_trigger ON loans;
DROP TRIGGER IF EXISTS audit_loan_products_trigger ON loan_products;
DROP TRIGGER IF EXISTS audit_savings_accounts_trigger ON savings_accounts;
DROP TRIGGER IF EXISTS audit_transactions_trigger ON transactions;
DROP TRIGGER IF EXISTS audit_loan_repayments_trigger ON loan_repayments;
DROP TRIGGER IF EXISTS audit_client_shares_trigger ON member_shares;

-- Drop and recreate the audit trigger function with better error handling
DROP FUNCTION IF EXISTS audit_trigger_function();

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    audit_user_id UUID;
    audit_institution_id UUID;
    record_id_value UUID;
BEGIN
    -- Get current user context
    audit_user_id := COALESCE(
        NULLIF(current_setting('audit.user_id', true), '')::UUID,
        '00000000-0000-0000-0000-000000000001'::UUID
    );
    
    -- Get record ID first
    IF TG_OP = 'DELETE' THEN
        record_id_value := OLD.id;
    ELSE
        record_id_value := NEW.id;
    END IF;
    
    -- Get institution_id based on table structure
    CASE TG_TABLE_NAME
        WHEN 'member_shares' THEN
            -- Get institution_id through client relationship
            IF TG_OP = 'DELETE' THEN
                SELECT c.institution_id INTO audit_institution_id 
                FROM members c WHERE c.id = OLD.member_id;
            ELSE
                SELECT c.institution_id INTO audit_institution_id 
                FROM members c WHERE c.id = NEW.member_id;
            END IF;
            
        WHEN 'loan_repayments' THEN
            -- Get institution_id through loan relationship
            IF TG_OP = 'DELETE' THEN
                SELECT l.institution_id INTO audit_institution_id 
                FROM loans l WHERE l.id = OLD.loan_id;
            ELSE
                SELECT l.institution_id INTO audit_institution_id 
                FROM loans l WHERE l.id = NEW.loan_id;
            END IF;
            
        ELSE
            -- Tables with direct institution_id column
            IF TG_OP = 'DELETE' THEN
                -- Use dynamic SQL to safely access institution_id
                EXECUTE format('SELECT ($1).institution_id') 
                USING OLD INTO audit_institution_id;
            ELSE
                -- Use dynamic SQL to safely access institution_id
                EXECUTE format('SELECT ($1).institution_id') 
                USING NEW INTO audit_institution_id;
            END IF;
    END CASE;
    
    -- Only proceed if we successfully got an institution_id
    IF audit_institution_id IS NOT NULL THEN
        -- Insert audit log record
        INSERT INTO audit_logs (
            institution_id,
            user_id,
            table_name,
            operation,
            record_id,
            old_values,
            new_values,
            created_at
        ) VALUES (
            audit_institution_id,
            audit_user_id,
            TG_TABLE_NAME,
            TG_OP,
            record_id_value,
            CASE 
                WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
                WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)
                ELSE NULL
            END,
            CASE 
                WHEN TG_OP = 'INSERT' THEN row_to_json(NEW)
                WHEN TG_OP = 'UPDATE' THEN row_to_json(NEW)
                ELSE NULL
            END,
            NOW()
        );
    END IF;
    
    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the original operation
        RAISE WARNING 'Audit trigger failed for table %: %', TG_TABLE_NAME, SQLERRM;
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate audit triggers for all main tables
CREATE TRIGGER audit_institutions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON institutions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_clients_trigger
    AFTER INSERT OR UPDATE OR DELETE ON members
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_loans_trigger
    AFTER INSERT OR UPDATE OR DELETE ON loans
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_loan_products_trigger
    AFTER INSERT OR UPDATE OR DELETE ON loan_products
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_savings_accounts_trigger
    AFTER INSERT OR UPDATE OR DELETE ON savings_accounts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_transactions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_loan_repayments_trigger
    AFTER INSERT OR UPDATE OR DELETE ON loan_repayments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_client_shares_trigger
    AFTER INSERT OR UPDATE OR DELETE ON member_shares
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

SELECT 'Audit triggers fixed and recreated successfully' as status;
