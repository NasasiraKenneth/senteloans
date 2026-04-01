-- SenteLoans Database Schema Creation Script
-- Phase 1: Core Tables with Multi-Tenant Architecture
-- All tables prefixed with 'senteloans_' for proper namespacing

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom ENUM types
DO $$
DECLARE
    enum_record RECORD;
    enum_definitions JSONB := '[
        {"name": "institution_type", "values": ["SACCO", "MFI", "Money Lender"]},
        {"name": "users_role", "values": ["system_admin", "institution_admin", "manager", "loan_officer", "teller", "member"]},
        {"name": "status_type", "values": ["Active", "Inactive", "Suspended", "Closed"]},
        {"name": "gender_type", "values": ["Male", "Female", "Other"]},
        {"name": "marital_status_type", "values": ["Single", "Married", "Divorced", "Widowed"]},
        {"name": "member_type", "values": ["Individual", "Group", "Corporate"]},
        {"name": "kyc_status_type", "values": ["Pending", "Verified", "Rejected"]},
        {"name": "loan_status_type", "values": ["Applied", "Under Review", "Reviewed", "Approved", "Partially Disbursed", "Fully Disbursed", "Active", "Closed", "Defaulted", "Rejected"]},
        {"name": "account_type", "values": ["Voluntary", "Fixed", "Shares", "Current"]},
        {"name": "transaction_type", "values": ["Deposit", "Withdrawal", "Transfer", "Loan Disbursement", "Loan Repayment", "Interest Payment", "Fee Payment", "Shares Purchase"]},
        {"name": "payment_mode", "values": ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]},
        {"name": "transaction_status", "values": ["Pending", "Completed", "Failed", "Reversed"]},
        {"name": "settlement_status", "values": ["Pending", "Completed", "Failed", "Reversed"]},
        {"name": "repayment_status", "values": ["Pending", "Paid", "Overdue", "Partial"]},
        {"name": "interest_calculation_method", "values": ["reducing_balance", "flat_rate", "compound"]}
    ]';
BEGIN
    FOR enum_record IN
        SELECT elem->>'name' AS enum_name,
               elem->'values' AS enum_values
        FROM jsonb_array_elements(enum_definitions) AS arr(elem)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = enum_record.enum_name) THEN
            EXECUTE format(
                'CREATE TYPE %I AS ENUM (%s)',
                enum_record.enum_name,
                array_to_string(ARRAY(SELECT quote_literal(value::text) FROM jsonb_array_elements_text(enum_record.enum_values)), ', ')
            );
        END IF;
    END LOOP;
END$$;

-- 1. INSTITUTIONS TABLE (Multi-tenant root)
CREATE TABLE IF NOT EXISTS senteloans_institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type institution_type NOT NULL,
    registration_number VARCHAR(100) UNIQUE NOT NULL,
    license_number VARCHAR(100),
    website VARCHAR(255),
    settings JSONB DEFAULT '{}'::jsonb,
    status status_type DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BRANCH TYPES TABLE (Keeps system flexible if new branch types are introduced later)
CREATE TABLE IF NOT EXISTS senteloans_branch_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BRANCH TYPES TABLE (Keeps system flexible if new branches are introduced later)
CREATE TABLE IF NOT EXISTS senteloans_branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    institution_id UUID NOT NULL
    REFERENCES senteloans_institutions(id) ON DELETE CASCADE,

    branch_type_id UUID
    REFERENCES senteloans_branch_types(id) ON DELETE SET NULL,

    branch_code VARCHAR(50),
    name VARCHAR(255) NOT NULL,

    address TEXT,
    phone_number VARCHAR(20),
    email VARCHAR(255),

    status status_type DEFAULT 'Active',

    established_date DATE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uk_branch_code UNIQUE (institution_id, branch_code)
);

-- 24-create-roles.sql
-- Adds permissions and role permissions tables

CREATE TABLE IF NOT EXISTS senteloans_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS senteloans_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL UNIQUE,
    module VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS senteloans_role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    UNIQUE(branch_id,role_id, permission_id),

    FOREIGN KEY (role_id) REFERENCES senteloans_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES senteloans_permissions(id) ON DELETE CASCADE
);

-- 4. USERS TABLE (Authentication & Authorization)
CREATE TABLE IF NOT EXISTS senteloans_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supabase_user_id UUID UNIQUE REFERENCES app_auth_users(id) ON DELETE SET NULL,
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL REFERENCES senteloans_roles(id) ON DELETE RESTRICT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL DEFAULT 'temp_hash',
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    status status_type DEFAULT 'Active',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4b. CLIENTS DIRECTORY TABLE (Institution-level client organizations/contacts)
CREATE TABLE IF NOT EXISTS senteloans_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address VARCHAR(250),
    phone VARCHAR(20),
    created_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CLIENTS TABLE (Customer/Member records)
CREATE TABLE IF NOT EXISTS senteloans_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    member_number VARCHAR(50) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender gender_type NOT NULL,
    marital_status marital_status_type,
    member_type member_type NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    supabase_user_id UUID UNIQUE REFERENCES app_auth_users(id) ON DELETE SET NULL,
    national_id VARCHAR(50) NOT NULL,
    district VARCHAR(100),
    village VARCHAR(100),
    occupation VARCHAR(100),
    monthly_income DECIMAL(15,2),
    notes TEXT,
    -- Payout details (single-table approach)
    mobile_money_provider TEXT,
    mobile_money_number TEXT,
    bank_name TEXT,
    bank_account_number TEXT,
    bank_account_name TEXT,
    bank_branch TEXT,
    next_of_kin_name VARCHAR(255),
    next_of_kin_relationship VARCHAR(100),
    next_of_kin_phone VARCHAR(20),
    passport_photo VARCHAR(500),
    national_id_front VARCHAR(500),
    national_id_back VARCHAR(500),
    kyc_status kyc_status_type DEFAULT 'Pending',
    status status_type DEFAULT 'Active',
    join_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_members_number UNIQUE (institution_id, member_number),
    CONSTRAINT uk_clients_national_id UNIQUE (institution_id, national_id),
    -- Added to support composite FK from savings (member_id, institution_id)
    CONSTRAINT uk_clients_id_institution UNIQUE (id, institution_id)
);

-- 6. CLIENT SHARES TABLE (For SACCO institutions only)
CREATE TABLE IF NOT EXISTS senteloans_member_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES senteloans_members(id) ON DELETE CASCADE,
    number_of_shares INTEGER NOT NULL CHECK (number_of_shares > 0),
    share_value DECIMAL(15,2) NOT NULL CHECK (share_value > 0),
    total_value DECIMAL(15,2) GENERATED ALWAYS AS (number_of_shares * share_value) STORED,
    purchase_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. LOAN PRODUCTS TABLE (Institution-specific loan products)
-- Enhanced to support different lending models for SACCOs, MFIs, and Money Lenders
CREATE TABLE IF NOT EXISTS senteloans_loan_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    product_code VARCHAR(50) NOT NULL,
    description TEXT,
    minimum_amount DECIMAL(15,2) NOT NULL CHECK (minimum_amount > 0),
    maximum_amount DECIMAL(15,2) NOT NULL CHECK (maximum_amount >= minimum_amount),
    interest_rate DECIMAL(5,2) NOT NULL CHECK (interest_rate >= 0),
    minimum_tenure_months INTEGER NOT NULL CHECK (minimum_tenure_months > 0),
    maximum_tenure_months INTEGER NOT NULL CHECK (maximum_tenure_months >= minimum_tenure_months),
    interest_calculation_method interest_calculation_method NOT NULL DEFAULT 'reducing_balance',
    collateral_required BOOLEAN DEFAULT FALSE,
    guarantors_required INTEGER DEFAULT 0 CHECK (guarantors_required >= 0),
    processing_fee_percentage DECIMAL(5,2) DEFAULT 0 CHECK (processing_fee_percentage >= 0),
    insurance_required BOOLEAN DEFAULT FALSE,
    status status_type DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_loan_products_code UNIQUE (institution_id, product_code)
);

CREATE TABLE IF NOT EXISTS senteloans_loan_product_eligibilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_product_id UUID NOT NULL REFERENCES senteloans_loan_products(id) ON DELETE RESTRICT,
    eligibility TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Active'
    CHECK (status IN ('Active','Inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    
    CONSTRAINT uk_loan_product_eligibility
    UNIQUE (loan_product_id, eligibility)
); 

-- 8. LOANS TABLE (Individual loan records)
-- Updated to match loan products structure and add guarantor support
CREATE TABLE IF NOT EXISTS senteloans_loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES senteloans_members(id) ON DELETE RESTRICT,
    loan_product_id UUID NOT NULL REFERENCES senteloans_loan_products(id) ON DELETE RESTRICT,
    application_id VARCHAR(50) NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount > 0),
    interest_rate DECIMAL(5,2) NOT NULL CHECK (interest_rate >= 0),
    tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),
    monthly_payment DECIMAL(15,2),
    total_amount DECIMAL(15,2),
    outstanding_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    status loan_status_type NOT NULL DEFAULT 'Applied',
    -- Approved
    -- Partially Disbursed
    -- Fully Disbursed
    loan_type VARCHAR(20) NOT NULL DEFAULT 'normal',
    purpose TEXT,
    collateral_description TEXT,
    application_date DATE NOT NULL,
    reviewed_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    approved_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    disbursement_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    disbursement_date DATE,
    maturity_date DATE,
    next_payment_date DATE,
    overdue_days INTEGER DEFAULT 0 CHECK (overdue_days >= 0),
    created_by UUID REFERENCES senteloans_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_loans_application UNIQUE (institution_id, application_id),
    
    -- Composite unique key to support institution-scoped FKs
    CONSTRAINT uk_loans_id_institution UNIQUE (id, institution_id),

    CONSTRAINT chk_loans_dates CHECK (
        (approved_at IS NULL OR approved_at::date >= application_date) AND
        (disbursement_date IS NULL OR approved_at IS NULL OR disbursement_date >= approved_at::date) AND
        (maturity_date IS NULL OR disbursement_date IS NULL OR maturity_date >= disbursement_date)
    )
);

-- 9. Loan Disbursements Table ( helps us to track full, partial, external and more disbursements)
CREATE TABLE IF NOT EXISTS senteloans_loan_disbursements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    institution_id UUID NOT NULL
    REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,

    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,

    loan_id UUID NOT NULL
    REFERENCES senteloans_loans(id) ON DELETE CASCADE,

    disbursement_type VARCHAR(30) NOT NULL,
    -- client_cash
    -- internal_settlement
    -- external_buyout
    -- fees
    -- insurance

    transaction_id UUID,

    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),

    disbursement_date DATE,

    notes TEXT,

    created_by UUID
    REFERENCES senteloans_users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Loan Settlements Table ( helps us to track internal or external loan settlements)
CREATE TABLE IF NOT EXISTS senteloans_loan_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    institution_id UUID NOT NULL
    REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,

    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,

    disbursement_id UUID
    REFERENCES senteloans_loan_disbursements(id) ON DELETE CASCADE,

    new_loan_id UUID
    REFERENCES senteloans_loans(id) ON DELETE CASCADE,

    settled_loan_id UUID
    REFERENCES senteloans_loans(id) ON DELETE SET NULL,

    external_lender_name VARCHAR(255),

    settlement_amount DECIMAL(15,2) NOT NULL CHECK (settlement_amount > 0),

    settlement_type VARCHAR(20) NOT NULL, 
    -- internal_topup | external_buyout
    settlement_status settlement_status DEFAULT 'Pending',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uk_settlement UNIQUE(new_loan_id, settled_loan_id)
);

-- 11. Added loan guarantors table for SACCO and MFI lending models
CREATE TABLE IF NOT EXISTS senteloans_loan_guarantors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES senteloans_loans(id) ON DELETE CASCADE,
    guarantor_member_id UUID NOT NULL REFERENCES senteloans_members(id) ON DELETE RESTRICT,
    guaranteed_amount DECIMAL(15,2) NOT NULL CHECK (guaranteed_amount > 0),
    status status_type DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_loan_guarantors UNIQUE (loan_id, guarantor_member_id)
);

CREATE TABLE IF NOT EXISTS senteloans_loan_eligibility_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    loan_id UUID NOT NULL
    REFERENCES senteloans_loans(id) ON DELETE RESTRICT,

    eligibility TEXT NOT NULL,

    is_eligible BOOLEAN NOT NULL DEFAULT FALSE,

    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,

    modified_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    CONSTRAINT uk_loan_eligibility_review
    UNIQUE (loan_id, eligibility)
); 

-- 12. SAVINGS ACCOUNTS TABLE (Not applicable for Money Lenders)
CREATE TABLE IF NOT EXISTS senteloans_savings_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES senteloans_members(id) ON DELETE RESTRICT,
    account_number VARCHAR(50) NOT NULL,
    account_type account_type NOT NULL,
    available_balance DECIMAL(15,2) DEFAULT 0 CHECK (available_balance >= 0),
    total_balance DECIMAL(15,2) DEFAULT 0 CHECK (total_balance >= 0),
    status status_type DEFAULT 'Active',
    open_date DATE NOT NULL,
    last_transaction_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_accounts_number UNIQUE (institution_id, account_number),
    -- Composite unique key to support institution-scoped FKs
    CONSTRAINT uk_savings_id_institution UNIQUE (id, institution_id),
    
    CONSTRAINT chk_accounts_balance CHECK (available_balance <= total_balance)
    ,
    -- Enforce that savings.member_id and savings.institution_id match the client's institution
    CONSTRAINT fk_savings_client_institution
      FOREIGN KEY (member_id, institution_id)
      REFERENCES senteloans_members (id, institution_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
);

-- 13. TRANSACTIONS TABLE (All financial transactions)
CREATE TABLE IF NOT EXISTS senteloans_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES senteloans_members(id) ON DELETE RESTRICT,
    account_id UUID REFERENCES senteloans_savings_accounts(id) ON DELETE RESTRICT,
    loan_id UUID REFERENCES senteloans_loans(id) ON DELETE RESTRICT,
    transaction_number VARCHAR(50) NOT NULL,
    type transaction_type NOT NULL,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    mode payment_mode NOT NULL,
    description TEXT,
    reference_number VARCHAR(100),
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    processed_by UUID NOT NULL REFERENCES senteloans_users(id) ON DELETE RESTRICT,
    transaction_date TIMESTAMPTZ NOT NULL,
    status transaction_status DEFAULT 'Completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_transactions_number UNIQUE (institution_id, transaction_number),
    
    -- Enforce tenant consistency via composite FKs (client/account only for now; loans to be added later)
    CONSTRAINT fk_transactions_client_institution
      FOREIGN KEY (member_id, institution_id)
      REFERENCES senteloans_members (id, institution_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    CONSTRAINT fk_transactions_account_institution
      FOREIGN KEY (account_id, institution_id)
      REFERENCES senteloans_savings_accounts (id, institution_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,

    CONSTRAINT chk_transactions_reference CHECK (
        (account_id IS NOT NULL AND loan_id IS NULL) OR
        (account_id IS NULL AND loan_id IS NOT NULL) OR
        (account_id IS NOT NULL AND loan_id IS NOT NULL)
    )
);

-- Add transaction FK after senteloans_transactions exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_loan_disbursements_transaction'
    ) THEN
        ALTER TABLE senteloans_loan_disbursements
            ADD CONSTRAINT fk_loan_disbursements_transaction
            FOREIGN KEY (transaction_id)
            REFERENCES senteloans_transactions(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- 14. LOAN REPAYMENTS TABLE (Repayment schedule and tracking)
-- Updated field names to match seed data structure
CREATE TABLE IF NOT EXISTS senteloans_loan_repayments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES senteloans_loans(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount >= 0),
    interest_amount DECIMAL(15,2) NOT NULL CHECK (interest_amount >= 0),
    total_amount DECIMAL(15,2) GENERATED ALWAYS AS (principal_amount + interest_amount) STORED,
    amount_paid DECIMAL(15,2) DEFAULT 0 CHECK (amount_paid >= 0),
    payment_date DATE,
    status repayment_status DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_repayments_installment UNIQUE (loan_id, installment_number)
);

-- 15. AUDIT LOGS TABLE (System audit trail)
CREATE TABLE IF NOT EXISTS senteloans_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES senteloans_users(id) ON DELETE RESTRICT,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance optimization
-- Multi-tenant access patterns
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_branch ON senteloans_role_permissions(role_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON senteloans_role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_users_institution_id ON senteloans_users(institution_id);
CREATE INDEX IF NOT EXISTS idx_clients_institution_id ON senteloans_members(institution_id);
CREATE INDEX IF NOT EXISTS idx_loans_institution_id ON senteloans_loans(institution_id);
CREATE INDEX IF NOT EXISTS idx_savings_accounts_institution_id ON senteloans_savings_accounts(institution_id);
CREATE INDEX IF NOT EXISTS idx_transactions_institution_id ON senteloans_transactions(institution_id);
CREATE INDEX IF NOT EXISTS idx_loan_products_institution_id ON senteloans_loan_products(institution_id);
-- Added index for loan guarantors
CREATE INDEX IF NOT EXISTS idx_loan_guarantors_loan_id ON senteloans_loan_guarantors(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_guarantors_guarantor_id ON senteloans_loan_guarantors(guarantor_member_id);
CREATE INDEX IF NOT EXISTS idx_loan_disbursements_institution_loan ON senteloans_loan_disbursements(institution_id, loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_settlements_institution_new ON senteloans_loan_settlements(institution_id, new_loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_product_eligibilities_product_status ON senteloans_loan_product_eligibilities(loan_product_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_settlements_institution_settled ON senteloans_loan_settlements(institution_id, settled_loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_eligibility_reviews_loan ON senteloans_loan_eligibility_reviews(loan_id);
-- Common query patterns
CREATE INDEX IF NOT EXISTS idx_clients_status ON senteloans_members(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_status ON senteloans_loans(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_client_id ON senteloans_loans(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_client_id ON senteloans_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON senteloans_transactions(institution_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON senteloans_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_loan_id ON senteloans_transactions(loan_id);
-- Additional indexes for common filters on transactions
CREATE INDEX IF NOT EXISTS idx_transactions_institution_type ON senteloans_transactions(institution_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_institution_mode ON senteloans_transactions(institution_id, mode);
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON senteloans_loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_repayments_due_date ON senteloans_loan_repayments(due_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_institution_id ON senteloans_audit_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON senteloans_audit_logs(created_at DESC);

-- 16. CLIENT KYC DOCS TABLE (Pending/review documents uploaded by clients)
CREATE TABLE IF NOT EXISTS senteloans_member_kyc_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES senteloans_members(id) ON DELETE RESTRICT,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('passport_photo','national_id_front','national_id_back')),
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','verified','rejected','superseded')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS senteloans_investments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    provider_id UUID REFERENCES senteloans_clients(id) ON DELETE RESTRICT,
    investment_number VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('fixed_income', 'project', 'equity', 'partnership')),
    description TEXT,
    initial_amount NUMERIC(18,2) NOT NULL CHECK (initial_amount >= 0),
    current_value NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (current_value >= 0),
    expected_percentage NUMERIC(5,2), -- optional %
    penalty_percentage NUMERIC(5,2), -- optional %
    expected_returns NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (expected_returns >= 0), -- optional %
    risk_level VARCHAR(10) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    start_date DATE NOT NULL,
    period_in_months NUMERIC(18,2),
    period_in_years NUMERIC(18,2),
    maturity_date DATE,
    status VARCHAR(15) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'matured', 'closed', 'cancelled')),
    created_by UUID REFERENCES senteloans_users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES senteloans_users(id),
    updated_at TIMESTAMPTZ,
    CONSTRAINT uk_investment_number_per_branch UNIQUE (branch_id, investment_number),
    CONSTRAINT chk_dates CHECK (
        maturity_date IS NULL OR maturity_date >= start_date
    )
);

CREATE TABLE IF NOT EXISTS senteloans_investment_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES senteloans_investments(id) ON DELETE CASCADE,
    name TEXT, -- Name of the project or investment
    address TEXT, -- Physical address of the project
    created_by UUID NOT NULL 
        REFERENCES senteloans_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID
        REFERENCES senteloans_users(id),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS senteloans_investment_partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES senteloans_investments(id) ON DELETE CASCADE,
    counterparty_id UUID NOT NULL
        REFERENCES senteloans_clients(id) ON DELETE CASCADE,
    role VARCHAR(50), -- e.g. 'lead_partner', 'co_investor'
    status VARCHAR(10) NOT NULL DEFAULT 'Active',
    contribution_percentage NUMERIC(5,2)
        CHECK (contribution_percentage BETWEEN 0 AND 100),
    contribution_amount NUMERIC(18,2) CHECK (contribution_amount >= 0),
    ownership_percentage NUMERIC(5,2)
        CHECK (ownership_percentage BETWEEN 0 AND 100),
    created_by UUID REFERENCES senteloans_users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES senteloans_users(id) NOT NULL,
    updated_at TIMESTAMPTZ,
    CONSTRAINT unique_partner UNIQUE (investment_id, counterparty_id)
);

CREATE INDEX IF NOT EXISTS idx_investment_partners_investment_id
  ON senteloans_investment_partners(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_partners_counterparty_id
  ON senteloans_investment_partners(counterparty_id);

CREATE TABLE IF NOT EXISTS senteloans_investment_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES senteloans_investments(id) ON DELETE RESTRICT,
    report_period VARCHAR(15) NOT NULL, -- use month (e.g. march)
    opening_value NUMERIC(18,2) NOT NULL CHECK (opening_value >= 0),
    capital_added NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (capital_added >= 0),
    income NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (income >= 0),
    expenses NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (expenses >= 0),
    closing_value NUMERIC(18,2) NOT NULL CHECK (closing_value >= 0),
    notes TEXT,
    created_by UUID REFERENCES senteloans_users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES senteloans_users(id) NOT NULL,
    updated_at TIMESTAMPTZ,
    -- prevent duplicate monthly reports
    CONSTRAINT unique_investment_period UNIQUE (investment_id, report_period),
    -- logical constraint
    CONSTRAINT chk_closing_value CHECK (
        closing_value = opening_value + capital_added + income - expenses
    )
);

CREATE TABLE IF NOT EXISTS senteloans_investment_cashflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES senteloans_investments(id) ON DELETE RESTRICT,
    transaction_id UUID
        REFERENCES senteloans_transactions(id) ON DELETE RESTRICT,
    report_id UUID
        REFERENCES senteloans_investment_reports(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('inflow', 'outflow')),
    category TEXT NOT NULL CHECK (
        category IN ('capital', 'income', 'expense', 'adjustment')
    ),
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS senteloans_investment_valuations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES senteloans_investments(id) ON DELETE CASCADE,
    valuation_date DATE NOT NULL,
    value NUMERIC(18,2) NOT NULL CHECK (value >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_valuation UNIQUE (investment_id, valuation_date)
);

CREATE TABLE IF NOT EXISTS senteloans_institution_loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    client_id UUID NOT NULL REFERENCES senteloans_clients(id) ON DELETE RESTRICT,
    loan_product VARCHAR(120),
    principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount > 0),
    interest_rate DECIMAL(5,2) NOT NULL CHECK (interest_rate >= 0),
    tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),
    monthly_payment DECIMAL(15,2),
    total_amount DECIMAL(15,2),
    outstanding_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    status loan_status_type NOT NULL DEFAULT 'Applied',
    -- Approved
    -- Partially Disbursed
    -- Fully Disbursed
    loan_type VARCHAR(20) NOT NULL DEFAULT 'normal',
    purpose TEXT,
    collateral_description TEXT,
    application_date DATE NOT NULL,
    approved_by UUID REFERENCES senteloans_users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    disbursement_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    disbursement_date DATE,
    maturity_date DATE,
    next_payment_date DATE,
    overdue_days INTEGER DEFAULT 0 CHECK (overdue_days >= 0),
    created_by UUID REFERENCES senteloans_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES senteloans_users(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS senteloans_institution_loan_repayments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES senteloans_institution_loans(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0 CHECK (amount_paid >= 0),
    payment_date DATE,
    status repayment_status DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS senteloans_investment_funding_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES senteloans_investments(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (
        source_type IN ('savings', 'shares', 'reserves', 'loan', 'grant')
    ),
    loan_id UUID NULL REFERENCES senteloans_institution_loans(id) ON DELETE CASCADE, -- only if source_type = 'loan'
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for investments
CREATE INDEX IF NOT EXISTS idx_investments_institution_branch_status
  ON senteloans_investments(institution_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_investments_provider_id
  ON senteloans_investments(provider_id);
CREATE INDEX IF NOT EXISTS idx_investments_category
  ON senteloans_investments(category);
CREATE INDEX IF NOT EXISTS idx_investments_start_date
  ON senteloans_investments(start_date);
CREATE INDEX IF NOT EXISTS idx_investments_maturity_date
  ON senteloans_investments(maturity_date);
CREATE INDEX IF NOT EXISTS idx_investments_created_by
  ON senteloans_investments(created_by);

CREATE INDEX IF NOT EXISTS idx_investment_reports_investment_period
  ON senteloans_investment_reports(investment_id, report_period);
CREATE INDEX IF NOT EXISTS idx_investment_reports_created_by
  ON senteloans_investment_reports(created_by);

CREATE INDEX IF NOT EXISTS idx_investment_cashflows_investment_date
  ON senteloans_investment_cashflows(investment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investment_cashflows_report_id
  ON senteloans_investment_cashflows(report_id);
CREATE INDEX IF NOT EXISTS idx_investment_cashflows_type_category
  ON senteloans_investment_cashflows(type, category);

CREATE INDEX IF NOT EXISTS idx_investment_valuations_investment_date
  ON senteloans_investment_valuations(investment_id, valuation_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_funding_sources_investment_id
  ON senteloans_investment_funding_sources(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_funding_sources_type
  ON senteloans_investment_funding_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_investment_funding_sources_loan_id
  ON senteloans_investment_funding_sources(loan_id);

-- Indexes for KYC docs
CREATE INDEX IF NOT EXISTS idx_client_kyc_docs_institution ON senteloans_member_kyc_docs(institution_id);
CREATE INDEX IF NOT EXISTS idx_client_kyc_docs_client_doc ON senteloans_member_kyc_docs(member_id, doc_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_kyc_docs_status ON senteloans_member_kyc_docs(status);

-- 17. NOTIFICATIONS TABLE (In-app notifications for members and institution users)
CREATE TABLE IF NOT EXISTS senteloans_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('member', 'institution_user')),
    recipient_id UUID NOT NULL, -- member_id or user_id depending on recipient_type
    type TEXT NOT NULL, -- e.g., 'loan_status_change', 'payment_due', 'kyc_update', 'pending_approval'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT, -- Deep link to relevant page
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional context (loan_id, amount, etc.)
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days') -- Auto-delete after 90 days
);

-- 18. NOTIFICATION PREFERENCES TABLE (User preferences for notification channels)
CREATE TABLE IF NOT EXISTS senteloans_notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES senteloans_institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES senteloans_branches(id) ON DELETE RESTRICT,
    user_type TEXT NOT NULL CHECK (user_type IN ('member', 'institution_user')),
    user_id UUID NOT NULL,
    notification_type TEXT NOT NULL,
    in_app_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false, -- For Phase 2: Africa's Talking integration
    email_enabled BOOLEAN DEFAULT false, -- For Phase 3
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_notification_prefs UNIQUE(user_id, notification_type)
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON senteloans_notifications(recipient_id, recipient_type, read);
CREATE INDEX IF NOT EXISTS idx_notifications_institution ON senteloans_notifications(institution_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON senteloans_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON senteloans_notifications(type);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON senteloans_notification_preferences(user_id, user_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all tables
CREATE OR REPLACE TRIGGER update_institutions_updated_at BEFORE UPDATE ON senteloans_institutions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_users_updated_at BEFORE UPDATE ON senteloans_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_clients_updated_at BEFORE UPDATE ON senteloans_members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_client_shares_updated_at BEFORE UPDATE ON senteloans_member_shares FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_loan_products_updated_at BEFORE UPDATE ON senteloans_loan_products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_loans_updated_at BEFORE UPDATE ON senteloans_loans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Added trigger for loan guarantors table
CREATE OR REPLACE TRIGGER update_loan_guarantors_updated_at BEFORE UPDATE ON senteloans_loan_guarantors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_savings_accounts_updated_at BEFORE UPDATE ON senteloans_savings_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_transactions_updated_at BEFORE UPDATE ON senteloans_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_loan_repayments_updated_at BEFORE UPDATE ON senteloans_loan_repayments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Added trigger for client KYC docs table
CREATE OR REPLACE TRIGGER update_client_kyc_docs_updated_at BEFORE UPDATE ON senteloans_member_kyc_docs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Added trigger for notification preferences table
CREATE OR REPLACE TRIGGER update_notification_prefs_updated_at BEFORE UPDATE ON senteloans_notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE senteloans_institutions IS 'Multi-tenant root table for financial institutions';
COMMENT ON TABLE senteloans_users IS 'System users with role-based access control';
COMMENT ON TABLE senteloans_members IS 'Customer/member records for each institution';
COMMENT ON TABLE senteloans_member_shares IS 'Share ownership records for SACCO clients';
COMMENT ON TABLE senteloans_loan_products IS 'Loan product definitions per institution with support for different lending models';
COMMENT ON TABLE senteloans_loans IS 'Individual loan applications and tracking';
-- Added comment for loan guarantors table
COMMENT ON TABLE senteloans_loan_guarantors IS 'Guarantor records for SACCO and MFI loans';
COMMENT ON TABLE senteloans_savings_accounts IS 'Savings account records (not for Money Lenders)';
COMMENT ON TABLE senteloans_transactions IS 'All financial transaction records';
COMMENT ON TABLE senteloans_loan_repayments IS 'Loan repayment schedule and tracking';
COMMENT ON TABLE senteloans_audit_logs IS 'System audit trail for all operations';
COMMENT ON TABLE senteloans_member_kyc_docs IS 'Client KYC document uploads and verification tracking';
COMMENT ON TABLE senteloans_notifications IS 'In-app notifications for members and institution users';
COMMENT ON TABLE senteloans_notification_preferences IS 'User notification channel preferences';
