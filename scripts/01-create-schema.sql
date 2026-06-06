-- SenteLoans Database Schema Creation Script
-- Phase 1: Core Tables with Multi-Tenant Architecture
-- All tables prefixed with  ' for proper namespacing

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
        {"name": "transaction_type", "values": ["Deposit", "Withdrawal", "Transfer", "Loan Disbursement", "Loan Repayment", "Interest Payment", "Expense Payment", "Fee Payment", "Shares Purchase","Shares Dividend","Investment Deposit","Investment Withdrawal"]},
        {"name": "payment_mode", "values": ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]},
        {"name": "transaction_status", "values": ["Pending", "Completed", "Failed", "Reversed"]},
        {"name": "settlement_status", "values": ["Pending", "Completed", "Failed", "Reversed"]},
        {"name": "repayment_status", "values": ["Pending", "Paid", "Completed", "Overdue", "Partial"]},
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
CREATE TABLE IF NOT EXISTS institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type institution_type NOT NULL,
    registration_number VARCHAR(100) UNIQUE NOT NULL,
    license_number VARCHAR(100),
    website VARCHAR(255),
    logo VARCHAR(255),
    status status_type DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BRANCH TYPES TABLE (Keeps system flexible if new branch types are introduced later)
CREATE TABLE IF NOT EXISTS branch_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BRANCH TYPES TABLE (Keeps system flexible if new branches are introduced later)
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,

    branch_type_id UUID
    REFERENCES branch_types(id) ON DELETE SET NULL,

    branch_code VARCHAR(50),
    -- Branch outlet identity and contact (per physical / logical location)
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

CREATE TABLE IF NOT EXISTS config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID NOT NULL
        REFERENCES branches(id) ON DELETE CASCADE,
    loans VARCHAR(10) NOT NULL DEFAULT 'false',
    shares VARCHAR(10) NOT NULL DEFAULT 'false',
    savings VARCHAR(10) NOT NULL DEFAULT 'false',
    mobile_money VARCHAR(10) NOT NULL DEFAULT 'false',
    auto_invoices VARCHAR(10) NOT NULL DEFAULT 'false',
    currency VARCHAR(20) NOT NULL,
    membership_fee NUMERIC(18,2) NOT NULL CHECK (membership_fee >= 0),
    share_value NUMERIC(18,2) NOT NULL CHECK (share_value >= 0),
    minimum_shares INT NOT NULL CHECK (minimum_shares >= 0),
    maximum_shares INT,
    maximum_parallel_loans INT,
    loan_overdue_period INT,
    loan_overdue_interest NUMERIC(18,2) NOT NULL CHECK (loan_overdue_interest >= 0),
    loan_overdue_interest_per VARCHAR(20) NOT NULL DEFAULT 'day',
    loan_default_period INT,
    invoice_overdue_period INT,
    savings_overdue_period INT,
    membership_overdue_period INT,
    membership_overdue_interest NUMERIC(18,2) NOT NULL CHECK (membership_overdue_interest >= 0),
    membership_overdue_interest_per VARCHAR(20) NOT NULL DEFAULT 'day',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Added as plain UUID first to avoid forward-reference before users exists.
    modified_by UUID,
    updated_at TIMESTAMPTZ,
    UNIQUE (branch_id)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL
        REFERENCES institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL
        REFERENCES branches(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    bank_account_number TEXT NOT NULL,
    available_balance DECIMAL(15,2) DEFAULT 0 CHECK (available_balance >= 0),
    total_amount DECIMAL(15,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Added as plain UUID first to avoid forward-reference before users exists.
    modified_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_bank_accounts_name_not_blank CHECK (btrim(bank_name) <> ''),
    CONSTRAINT chk_bank_accounts_number_not_blank CHECK (btrim(bank_account_number) <> ''),
    CONSTRAINT uk_bank_account_per_institution UNIQUE (institution_id, bank_name, bank_account_number)
);

-- provider ENUM(
--         'mailgun',
--         'ses',
--         'sendgrid',
--         'smtp'
--     )

CREATE TABLE IF NOT EXISTS email_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL
        REFERENCES institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL
        REFERENCES branches(id) ON DELETE CASCADE,
    provider VARCHAR(255)  NOT NULL,
    domain VARCHAR(255),
    api_key TEXT,
    smtp_host VARCHAR(255),
    smtp_port INT,
    smtp_username VARCHAR(255),
    smtp_password TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24-create-roles.sql
-- Adds permissions and role permissions tables

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL UNIQUE,
    module VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    UNIQUE(branch_id,role_id, permission_id),

    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 4. USERS TABLE (Authentication & Authorization)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supabase_user_id UUID UNIQUE REFERENCES app_auth_users(id) ON DELETE SET NULL,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL DEFAULT 'temp_hash',
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20),
    status status_type DEFAULT 'Active',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add config.modified_by FK after users exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_config_modified_by_user'
    ) THEN
        ALTER TABLE config
            ADD CONSTRAINT fk_config_modified_by_user
            FOREIGN KEY (modified_by)
            REFERENCES users(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- Add bank_accounts.modified_by FK after users exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_bank_accounts_modified_by_user'
    ) THEN
        ALTER TABLE bank_accounts
            ADD CONSTRAINT fk_bank_accounts_modified_by_user
            FOREIGN KEY (modified_by)
            REFERENCES users(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- 4b. THIRD PARTY AGENTS DIRECTORY TABLE (Institution-level third_party_agent organizations/contacts)
CREATE TABLE IF NOT EXISTS third_party_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address VARCHAR(250),
    phone VARCHAR(20),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_third_party_agents_institution_branch ON third_party_agents(institution_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_third_party_agents_status ON third_party_agents(status);

CREATE TABLE IF NOT EXISTS grants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    third_party_agent_id UUID NOT NULL REFERENCES third_party_agents(id) ON DELETE RESTRICT,
    total_amount DECIMAL(15,2) DEFAULT 0 CHECK (total_amount >= 0),
    available_balance DECIMAL(15,2) DEFAULT 0 CHECK (available_balance >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS daily_finances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    bank_total_amount DECIMAL(15,2),
    mobile_money_amount DECIMAL(15,2),
    cash_amount DECIMAL(15,2),
    total_amount DECIMAL(15,2) DEFAULT 0 CHECK (total_amount >= 0),
    available_balance DECIMAL(15,2) DEFAULT 0 CHECK (available_balance >= 0),
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ
);

-- 5. third_party_agents TABLE (Customer/Member records)
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
    monthly_savings DECIMAL(15,2) DEFAULT 0 CHECK (monthly_savings >= 0),
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
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    kyc_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    kyc_approved_at TIMESTAMPTZ,
    modified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ,
    
    CONSTRAINT uk_members_number UNIQUE (institution_id, member_number),
    CONSTRAINT uk_third_party_agents_national_id UNIQUE (institution_id, national_id),
    -- Added to support composite FK from savings (member_id, institution_id)
    CONSTRAINT uk_third_party_agents_id_institution UNIQUE (id, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_third_party_agents_created_by ON members(created_by);
CREATE INDEX IF NOT EXISTS idx_third_party_agents_modified_by ON members(modified_by);
CREATE INDEX IF NOT EXISTS idx_third_party_agents_kyc_approved_by ON members(kyc_approved_by);

-- 6. third_party_agent SHARES TABLE (For SACCO institutions only)
CREATE TABLE IF NOT EXISTS member_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    number_of_shares INTEGER NOT NULL CHECK (number_of_shares > 0),
    share_value DECIMAL(15,2) NOT NULL CHECK (share_value > 0),
    total_value DECIMAL(15,2) GENERATED ALWAYS AS (number_of_shares * share_value) STORED,
    purchase_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. LOAN PRODUCTS TABLE (Institution-specific loan products)
-- Enhanced to support different lending models for SACCOs, MFIs, and Money Lenders
CREATE TABLE IF NOT EXISTS loan_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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

CREATE TABLE IF NOT EXISTS loan_product_eligibilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_product_id UUID NOT NULL REFERENCES loan_products(id) ON DELETE RESTRICT,
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
CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    loan_product_id UUID NOT NULL REFERENCES loan_products(id) ON DELETE RESTRICT,
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
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    disbursement_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    disbursement_date DATE,
    maturity_date DATE,
    next_payment_date DATE,
    overdue_days INTEGER DEFAULT 0 CHECK (overdue_days >= 0),
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
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
CREATE TABLE IF NOT EXISTS loan_disbursements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE RESTRICT,

    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,

    loan_id UUID NOT NULL
    REFERENCES loans(id) ON DELETE CASCADE,

    disbursement_type VARCHAR(30) NOT NULL,
    -- third_party_agent_cash
    -- internal_settlement
    -- external_buyout
    -- fees
    -- insurance

    transaction_id UUID,

    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),

    disbursement_date DATE,

    notes TEXT,

    created_by UUID
    REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Loan Settlements Table ( helps us to track internal or external loan settlements)
CREATE TABLE IF NOT EXISTS loan_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE RESTRICT,

    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,

    disbursement_id UUID
    REFERENCES loan_disbursements(id) ON DELETE CASCADE,

    new_loan_id UUID
    REFERENCES loans(id) ON DELETE CASCADE,

    settled_loan_id UUID
    REFERENCES loans(id) ON DELETE SET NULL,

    external_lender_id UUID REFERENCES third_party_agents(id) ON DELETE RESTRICT,

    settlement_amount DECIMAL(15,2) NOT NULL CHECK (settlement_amount > 0),

    settlement_type VARCHAR(20) NOT NULL, 
    -- internal_topup | external_buyout
    settlement_status settlement_status DEFAULT 'Pending',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uk_settlement UNIQUE(new_loan_id, settled_loan_id)
);

-- 11. Added loan guarantors table for SACCO and MFI lending models
CREATE TABLE IF NOT EXISTS loan_guarantors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    guarantor_member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    guaranteed_amount DECIMAL(15,2) NOT NULL CHECK (guaranteed_amount > 0),
    status status_type DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_loan_guarantors UNIQUE (loan_id, guarantor_member_id)
);

CREATE TABLE IF NOT EXISTS loan_eligibility_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    loan_id UUID NOT NULL
    REFERENCES loans(id) ON DELETE RESTRICT,

    eligibility TEXT NOT NULL,

    is_eligible BOOLEAN NOT NULL DEFAULT FALSE,

    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,

    modified_by UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    CONSTRAINT uk_loan_eligibility_review
    UNIQUE (loan_id, eligibility)
); 

-- 12. SAVINGS ACCOUNTS TABLE (Not applicable for Money Lenders)
CREATE TABLE IF NOT EXISTS savings_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
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
    -- Enforce that savings.member_id and savings.institution_id match the third_party_agent's institution
    CONSTRAINT fk_savings_third_party_agent_institution
      FOREIGN KEY (member_id, institution_id)
      REFERENCES members (id, institution_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS institution_loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    third_party_agent_id UUID NOT NULL REFERENCES third_party_agents(id) ON DELETE RESTRICT,
    loan_product VARCHAR(120),
    principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount > 0),
    interest_rate DECIMAL(5,2) NOT NULL CHECK (interest_rate >= 0),
    tenure_months INTEGER NOT NULL CHECK (tenure_months >= 0),
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
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    disbursement_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    disbursement_date DATE,
    maturity_date DATE,
    next_payment_date DATE,
    overdue_days INTEGER DEFAULT 0 CHECK (overdue_days >= 0),
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ
);

-- 13. TRANSACTIONS TABLE (All financial transactions)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    member_id UUID REFERENCES members(id) ON DELETE RESTRICT,
    third_party_agent_id UUID REFERENCES third_party_agents(id) ON DELETE RESTRICT,
    staff_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    account_id UUID REFERENCES savings_accounts(id) ON DELETE RESTRICT,
    transferred_to_id UUID REFERENCES savings_accounts(id) ON DELETE RESTRICT,
    loan_id UUID REFERENCES loans(id) ON DELETE RESTRICT,
    sacco_loan_id UUID REFERENCES institution_loans(id) ON DELETE RESTRICT,
    transaction_number VARCHAR(50) NOT NULL,
    type transaction_type NOT NULL,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    mode payment_mode NOT NULL,
    description TEXT,
    reference_number VARCHAR(100),
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    charges DECIMAL(15,2),
    processed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    transaction_date TIMESTAMPTZ NOT NULL,
    status transaction_status DEFAULT 'Completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_transactions_number UNIQUE (institution_id, transaction_number),
    
    -- Enforce tenant consistency via composite FKs (third_party_agent/account only for now; loans to be added later)
    CONSTRAINT fk_transactions_third_party_agent_institution
      FOREIGN KEY (member_id, institution_id)
      REFERENCES members (id, institution_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    CONSTRAINT fk_transactions_account_institution
      FOREIGN KEY (account_id, institution_id)
      REFERENCES savings_accounts (id, institution_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,
    -- Keep transfer destination account in same institution/tenant
    CONSTRAINT fk_transactions_transferred_to_institution
      FOREIGN KEY (transferred_to_id, institution_id)
      REFERENCES savings_accounts (id, institution_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT,

    CONSTRAINT chk_transactions_reference CHECK (
        account_id IS NULL OR loan_id IS NULL OR (account_id IS NOT NULL AND loan_id IS NOT NULL) OR (account_id IS NULL AND loan_id IS NULL)
    ),

    -- Expense payments from expense cashflows: exactly one of staff or third_party_agent (not both, not neither)
    CONSTRAINT chk_expense_payment_staff_or_third_party_agent CHECK (
        type != 'Expense Payment'::transaction_type
        OR (
          (staff_id IS NOT NULL AND third_party_agent_id IS NULL)
          OR (staff_id IS NULL AND third_party_agent_id IS NOT NULL)
        )
    )
);

-- Add transaction FK after transactions exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_loan_disbursements_transaction'
    ) THEN
        ALTER TABLE loan_disbursements
            ADD CONSTRAINT fk_loan_disbursements_transaction
            FOREIGN KEY (transaction_id)
            REFERENCES transactions(id)
            ON DELETE SET NULL;
    END IF;
END $$;


CREATE TABLE IF NOT EXISTS unclaimed_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    member_id UUID REFERENCES members(id) ON DELETE RESTRICT,
    third_party_agent_id UUID REFERENCES third_party_agents(id) ON DELETE RESTRICT,
    transaction_id UUID REFERENCES transactions(id) ON DELETE RESTRICT,
    unclaimed_deposit_number VARCHAR(50),
    transaction_number VARCHAR(50),
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    mode payment_mode NOT NULL,
    date DATE,
    status VARCHAR(15) DEFAULT 'unclaimed',
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uk_unclaimed_deposits_number UNIQUE (branch_id, unclaimed_deposit_number)
);

CREATE INDEX IF NOT EXISTS idx_unclaimed_deposits_transaction_id
  ON unclaimed_deposits(transaction_id);

-- 14. LOAN REPAYMENTS TABLE (Repayment schedule and tracking)
-- Updated field names to match seed data structure
CREATE TABLE IF NOT EXISTS loan_repayments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    principal_amount DECIMAL(15,2) NOT NULL CHECK (principal_amount >= 0),
    interest_amount DECIMAL(15,2) NOT NULL CHECK (interest_amount >= 0),
    total_amount DECIMAL(15,2) GENERATED ALWAYS AS (principal_amount + interest_amount) STORED,
    amount_paid DECIMAL(15,2) DEFAULT 0 CHECK (amount_paid >= 0),
    payment_date DATE,
    penalty_amount DECIMAL(15,2) DEFAULT 0,
    amount_due DECIMAL(15,2) NOT NULL,
    days_overdue INTEGER DEFAULT 0,
    status repayment_status DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT uk_repayments_installment UNIQUE (loan_id, installment_number)
);

-- 15. AUDIT LOGS TABLE (System audit trail)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    table_name VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance optimization
-- Multi-tenant access patterns
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_branch ON role_permissions(role_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_users_institution_id ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_institution_id ON bank_accounts(institution_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_branch_id ON bank_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_third_party_agents_institution_id ON members(institution_id);
CREATE INDEX IF NOT EXISTS idx_loans_institution_id ON loans(institution_id);
CREATE INDEX IF NOT EXISTS idx_savings_accounts_institution_id ON savings_accounts(institution_id);
CREATE INDEX IF NOT EXISTS idx_transactions_institution_id ON transactions(institution_id);
CREATE INDEX IF NOT EXISTS idx_loan_products_institution_id ON loan_products(institution_id);
-- Added index for loan guarantors
CREATE INDEX IF NOT EXISTS idx_loan_guarantors_loan_id ON loan_guarantors(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_guarantors_guarantor_id ON loan_guarantors(guarantor_member_id);
CREATE INDEX IF NOT EXISTS idx_loan_disbursements_institution_loan ON loan_disbursements(institution_id, loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_settlements_institution_new ON loan_settlements(institution_id, new_loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_product_eligibilities_product_status ON loan_product_eligibilities(loan_product_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_settlements_institution_settled ON loan_settlements(institution_id, settled_loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_eligibility_reviews_loan ON loan_eligibility_reviews(loan_id);
-- Common query patterns
CREATE INDEX IF NOT EXISTS idx_third_party_agents_status ON members(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_third_party_agent_id ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_third_party_agent_id ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(institution_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transferred_to_id ON transactions(transferred_to_id);
CREATE INDEX IF NOT EXISTS idx_transactions_loan_id ON transactions(loan_id);
-- Additional indexes for common filters on transactions
CREATE INDEX IF NOT EXISTS idx_transactions_institution_type ON transactions(institution_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_institution_mode ON transactions(institution_id, mode);
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_repayments_due_date ON loan_repayments(due_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_institution_id ON audit_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Treasury: branch-level daily finance aggregates & grants
CREATE INDEX IF NOT EXISTS idx_daily_finances_institution_id ON daily_finances(institution_id);
CREATE INDEX IF NOT EXISTS idx_daily_finances_branch_id ON daily_finances(branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_finances_institution_branch ON daily_finances(institution_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_daily_finances_branch_created_at ON daily_finances(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_finances_created_by ON daily_finances(created_by);

CREATE INDEX IF NOT EXISTS idx_grants_institution_id ON grants(institution_id);
CREATE INDEX IF NOT EXISTS idx_grants_branch_id ON grants(branch_id);
CREATE INDEX IF NOT EXISTS idx_grants_third_party_agent_id ON grants(third_party_agent_id);
CREATE INDEX IF NOT EXISTS idx_grants_institution_branch ON grants(institution_id, branch_id);

-- 16. third_party_agent KYC DOCS TABLE (Pending/review documents uploaded by third_party_agents)
CREATE TABLE IF NOT EXISTS member_kyc_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('passport_photo','national_id_front','national_id_back')),
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','verified','rejected','superseded')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberfee_fines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    penalty_amount DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MEMBERSHIP FEES TABLE (one row per fee payment; domain projection of the matching transactions row)
CREATE TABLE IF NOT EXISTS membership_fees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id     UUID NOT NULL REFERENCES branches(id)      ON DELETE RESTRICT,
    member_id     UUID NOT NULL REFERENCES members(id)       ON DELETE CASCADE,

    -- Money
    amount_paid          DECIMAL(15,2) NOT NULL CHECK (amount_paid > 0),
    total_membership_fee DECIMAL(15,2) NOT NULL,                -- snapshot of config.membership_fee at payment time
    balance_before       DECIMAL(15,2) NOT NULL,                -- remaining BEFORE this payment
    balance_after        DECIMAL(15,2) NOT NULL,                -- remaining AFTER this payment

    -- Payment metadata
    mode              payment_mode NOT NULL,
    reference_number  VARCHAR(100),
    description       TEXT,

    -- Linkage / audit
    transaction_id    UUID UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
    processed_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payment_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_membership_fees_balance
      CHECK (balance_before >= balance_after AND balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS idx_membership_fees_member
  ON membership_fees(member_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_membership_fees_institution
  ON membership_fees(institution_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_membership_fees_branch
  ON membership_fees(branch_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_membership_fees_transaction
  ON membership_fees(transaction_id);

CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    provider_id UUID REFERENCES third_party_agents(id) ON DELETE RESTRICT,
    investment_number VARCHAR(50) NOT NULL,
    investment_name TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('fixed_income', 'project', 'equity', 'partnership')),
    description TEXT,
    address TEXT,
    initial_amount NUMERIC(18,2) NOT NULL CHECK (initial_amount >= 0),
    current_value NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (current_value >= 0),
    expected_percentage NUMERIC(5,2), -- optional %
    extracted_returns NUMERIC(18,2) DEFAULT 0 CHECK (extracted_returns >= 0), -- optional %
    risk_level VARCHAR(10) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    start_date DATE,
    period_in_months NUMERIC(18,2),
    period_in_years NUMERIC(18,2),
    maturity_date DATE,
    status VARCHAR(15) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'under_development', 'active', 'matured', 'closed', 'cancelled')),
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ,
    CONSTRAINT uk_investment_number_per_branch UNIQUE (branch_id, investment_number),
    CONSTRAINT chk_dates CHECK (
        maturity_date IS NULL OR maturity_date >= start_date
    )
);


CREATE TABLE IF NOT EXISTS investment_partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES investments(id) ON DELETE CASCADE,
    counterparty_id UUID NOT NULL
        REFERENCES third_party_agents(id) ON DELETE CASCADE,
    role VARCHAR(50), -- e.g. 'lead_partner', 'co_investor'
    status VARCHAR(10) NOT NULL DEFAULT 'Active',
    contribution_percentage NUMERIC(5,2)
        CHECK (contribution_percentage BETWEEN 0 AND 100),
    contribution_amount NUMERIC(18,2) CHECK (contribution_amount >= 0),
    ownership_percentage NUMERIC(5,2)
        CHECK (ownership_percentage BETWEEN 0 AND 100),
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES users(id) NOT NULL,
    updated_at TIMESTAMPTZ,
    CONSTRAINT unique_partner UNIQUE (investment_id, counterparty_id)
);

CREATE INDEX IF NOT EXISTS idx_investment_partners_investment_id
  ON investment_partners(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_partners_counterparty_id
  ON investment_partners(counterparty_id);

CREATE TABLE IF NOT EXISTS investment_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES investments(id) ON DELETE RESTRICT,
    report_number VARCHAR(50) NOT NULL,
    report_period VARCHAR(25) NOT NULL, -- use month (e.g. march-2026)
    opening_value NUMERIC(18,2) NOT NULL CHECK (opening_value >= 0),
    capital_inflow NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (capital_inflow >= 0),
    capital_outflow NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (capital_outflow >= 0),
    income NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (income >= 0),
    expenses NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (expenses >= 0),
    closing_value NUMERIC(18,2) NOT NULL CHECK (closing_value >= 0),
    notes TEXT,
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_by UUID REFERENCES users(id) NOT NULL,
    updated_at TIMESTAMPTZ,
    -- prevent duplicate monthly reports
    CONSTRAINT unique_investment_period UNIQUE (investment_id, report_period)
);

CREATE TABLE IF NOT EXISTS investment_cashflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES investments(id) ON DELETE RESTRICT,
    transaction_id UUID
        REFERENCES transactions(id) ON DELETE RESTRICT,
    report_id UUID
        REFERENCES investment_reports(id) ON DELETE RESTRICT,
    type TEXT NOT NULL CHECK (type IN ('inflow', 'outflow')),
    category TEXT NOT NULL CHECK (
        category IN ('capital', 'income', 'expense', 'adjustment')
    ),
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investment_valuations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES investments(id) ON DELETE CASCADE,
    valuation_date DATE NOT NULL,
    value NUMERIC(18,2) NOT NULL CHECK (value >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_valuation UNIQUE (investment_id, valuation_date)
);

COMMENT ON COLUMN institution_loans.disbursement_balance IS 'UGX remaining to disburse to the third_party_agent; reduced each disbursement until zero when Fully Disbursed.';
COMMENT ON COLUMN institution_loans.disbursement_date IS 'Date of the latest disbursement to the third_party_agent.';

CREATE TABLE IF NOT EXISTS institution_loan_repayments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES institution_loans(id) ON DELETE RESTRICT,
    transaction_id UUID
        REFERENCES transactions(id) ON DELETE RESTRICT,
    due_date DATE NOT NULL,
    amount_paid DECIMAL(15,2) DEFAULT 0 CHECK (amount_paid >= 0),
    payment_date DATE,
    status repayment_status DEFAULT 'Completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS investment_funding_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investment_id UUID NOT NULL
        REFERENCES investments(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (
        source_type IN ('savings', 'shares', 'reserves', 'loan', 'grant')
    ),
    loan_id UUID NULL REFERENCES institution_loans(id) ON DELETE CASCADE, -- only if source_type = 'loan'
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL
    REFERENCES institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    expense_number VARCHAR(50) NOT NULL,
    name TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'Pending',
    type VARCHAR(30),
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    completed_by UUID,
    completed_at TIMESTAMPTZ,
    rejected_by UUID,
    rejected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS expense_funding_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL
        REFERENCES expenses(id) ON DELETE CASCADE,
    source_type VARCHAR(10) NOT NULL CHECK (
        source_type IN ('savings', 'shares', 'reserves', 'loan', 'grant')
    ),
    loan_id UUID NULL REFERENCES institution_loans(id) ON DELETE CASCADE, -- only if source_type = 'loan'
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_cashflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL
        REFERENCES expenses(id) ON DELETE RESTRICT,
    transaction_id UUID
        REFERENCES transactions(id) ON DELETE RESTRICT,
    staff_id UUID REFERENCES users(id) ON DELETE CASCADE,
    third_party_agent_id UUID REFERENCES third_party_agents(id) ON DELETE CASCADE,
    payment_method payment_mode,
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    status VARCHAR(10) DEFAULT 'Pending',
    date DATE,
    completed_by UUID,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for expenses & expense sub-tables
CREATE INDEX IF NOT EXISTS idx_expenses_institution_id ON expenses(institution_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_institution_branch ON expenses(institution_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_institution_expense_number ON expenses(institution_id, expense_number);
CREATE INDEX IF NOT EXISTS idx_expenses_institution_type ON expenses(institution_id, type);

CREATE INDEX IF NOT EXISTS idx_expense_funding_sources_expense_id ON expense_funding_sources(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_funding_sources_source_type ON expense_funding_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_expense_funding_sources_loan_id ON expense_funding_sources(loan_id);

CREATE INDEX IF NOT EXISTS idx_expense_cashflows_expense_id ON expense_cashflows(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_cashflows_transaction_id ON expense_cashflows(transaction_id);
CREATE INDEX IF NOT EXISTS idx_expense_cashflows_staff_id ON expense_cashflows(staff_id);
CREATE INDEX IF NOT EXISTS idx_expense_cashflows_third_party_agent_id ON expense_cashflows(third_party_agent_id);
CREATE INDEX IF NOT EXISTS idx_expense_cashflows_status ON expense_cashflows(status);
CREATE INDEX IF NOT EXISTS idx_expense_cashflows_date ON expense_cashflows(date);
CREATE INDEX IF NOT EXISTS idx_expense_cashflows_expense_date ON expense_cashflows(expense_id, date);

-- Indexes for investments
CREATE INDEX IF NOT EXISTS idx_investments_institution_branch_status
  ON investments(institution_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_investments_provider_id
  ON investments(provider_id);
CREATE INDEX IF NOT EXISTS idx_investments_category
  ON investments(category);
CREATE INDEX IF NOT EXISTS idx_investments_start_date
  ON investments(start_date);
CREATE INDEX IF NOT EXISTS idx_investments_maturity_date
  ON investments(maturity_date);
CREATE INDEX IF NOT EXISTS idx_investments_created_by
  ON investments(created_by);

CREATE INDEX IF NOT EXISTS idx_investment_reports_investment_period
  ON investment_reports(investment_id, report_period);
CREATE INDEX IF NOT EXISTS idx_investment_reports_created_by
  ON investment_reports(created_by);

CREATE INDEX IF NOT EXISTS idx_investment_cashflows_investment_date
  ON investment_cashflows(investment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investment_cashflows_report_id
  ON investment_cashflows(report_id);
CREATE INDEX IF NOT EXISTS idx_investment_cashflows_type_category
  ON investment_cashflows(type, category);

CREATE INDEX IF NOT EXISTS idx_investment_valuations_investment_date
  ON investment_valuations(investment_id, valuation_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_funding_sources_investment_id
  ON investment_funding_sources(investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_funding_sources_type
  ON investment_funding_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_investment_funding_sources_loan_id
  ON investment_funding_sources(loan_id);

-- Indexes for KYC docs
CREATE INDEX IF NOT EXISTS idx_third_party_agent_kyc_docs_institution ON member_kyc_docs(institution_id);
CREATE INDEX IF NOT EXISTS idx_third_party_agent_kyc_docs_third_party_agent_doc ON member_kyc_docs(member_id, doc_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_third_party_agent_kyc_docs_status ON member_kyc_docs(status);

-- 17. NOTIFICATIONS TABLE (In-app notifications for members and institution users)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, recipient_type, read);
CREATE INDEX IF NOT EXISTS idx_notifications_institution ON notifications(institution_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id, user_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all tables
CREATE OR REPLACE TRIGGER update_institutions_updated_at BEFORE UPDATE ON institutions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_third_party_agents_updated_at BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_third_party_agent_shares_updated_at BEFORE UPDATE ON member_shares FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_membership_fees_updated_at BEFORE UPDATE ON membership_fees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_loan_products_updated_at BEFORE UPDATE ON loan_products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_loans_updated_at BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Added trigger for loan guarantors table
CREATE OR REPLACE TRIGGER update_loan_guarantors_updated_at BEFORE UPDATE ON loan_guarantors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_savings_accounts_updated_at BEFORE UPDATE ON savings_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_loan_repayments_updated_at BEFORE UPDATE ON loan_repayments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Added trigger for third_party_agent KYC docs table
CREATE OR REPLACE TRIGGER update_third_party_agent_kyc_docs_updated_at BEFORE UPDATE ON member_kyc_docs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Added trigger for notification preferences table
CREATE OR REPLACE TRIGGER update_notification_prefs_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE institutions IS 'Multi-tenant root table for financial institutions';
COMMENT ON TABLE users IS 'System users with role-based access control';
COMMENT ON TABLE members IS 'Customer/member records for each institution';
COMMENT ON TABLE member_shares IS 'Share ownership records for SACCO third_party_agents';
COMMENT ON TABLE membership_fees IS 'One row per membership-fee payment; domain projection of the matching transactions row';
COMMENT ON TABLE loan_products IS 'Loan product definitions per institution with support for different lending models';
COMMENT ON TABLE loans IS 'Individual loan applications and tracking';
-- Added comment for loan guarantors table
COMMENT ON TABLE loan_guarantors IS 'Guarantor records for SACCO and MFI loans';
COMMENT ON TABLE savings_accounts IS 'Savings account records (not for Money Lenders)';
COMMENT ON TABLE transactions IS 'All financial transaction records';
COMMENT ON TABLE loan_repayments IS 'Loan repayment schedule and tracking';
COMMENT ON TABLE audit_logs IS 'System audit trail for all operations';
COMMENT ON TABLE member_kyc_docs IS 'third_party_agent KYC document uploads and verification tracking';
COMMENT ON TABLE notifications IS 'In-app notifications for members and institution users';
COMMENT ON TABLE notification_preferences IS 'User notification channel preferences';
