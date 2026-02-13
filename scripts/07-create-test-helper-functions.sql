-- Helper functions for database testing
-- These functions support the connection and validation tests

-- Function to test enum values
CREATE OR REPLACE FUNCTION test_enum_values(enum_name text, test_values text[])
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    enum_values text[];
    test_value text;
BEGIN
    -- Get all enum values for the specified enum type
    SELECT array_agg(enumlabel ORDER BY enumsortorder)
    INTO enum_values
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = enum_name;
    
    -- Check if all test values exist in the enum
    FOREACH test_value IN ARRAY test_values
    LOOP
        IF NOT (test_value = ANY(enum_values)) THEN
            RETURN false;
        END IF;
    END LOOP;
    
    RETURN true;
END;
$$;

-- Function to get table information
CREATE OR REPLACE FUNCTION get_table_info(schema_name text DEFAULT 'public')
RETURNS TABLE(
    table_name text,
    column_name text,
    data_type text,
    is_nullable text,
    column_default text
)
LANGUAGE sql
AS $$
    SELECT 
        t.table_name::text,
        c.column_name::text,
        c.data_type::text,
        c.is_nullable::text,
        c.column_default::text
    FROM information_schema.tables t
    JOIN information_schema.columns c ON t.table_name = c.table_name
    WHERE t.table_schema = schema_name
    AND t.table_name LIKE 'senteloans_%'
    ORDER BY t.table_name, c.ordinal_position;
$$;

-- Function to check RLS policies
CREATE OR REPLACE FUNCTION check_rls_policies()
RETURNS TABLE(
    table_name text,
    policy_name text,
    policy_cmd text,
    policy_roles text[]
)
LANGUAGE sql
AS $$
    SELECT 
        schemaname || '.' || tablename as table_name,
        policyname as policy_name,
        cmd as policy_cmd,
        roles as policy_roles
    FROM pg_policies
    WHERE tablename LIKE 'senteloans_%'
    ORDER BY tablename, policyname;
$$;

SELECT 'Test helper functions created successfully' as status;
