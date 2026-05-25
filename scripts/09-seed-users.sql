-- Phase 3: RBAC and users seed
-- Seeds roles, permissions, staff/manager role_permissions, and users with role_id.
-- Admin gets full branch-scoped permission catalog; Super Admin access is role-driven by app/RLS.

-- 1) Seed role catalog

INSERT INTO senteloans_expense_categories (category, description)
VALUES
    ('Utilities', 'Expenses incurred for essential services required to operate SACCO offices and branches, such as electricity, water, and waste management services.'),
    ('Fuel', 'Costs related to fuel consumption for SACCO vehicles, generators, field operations, and official travel activities.'),
    ('Salaries', 'Payments made to employees and staff members as compensation for their work, including wages, salaries, bonuses, and related payroll costs.'),
    ('Stationery', 'Expenses for office supplies and materials used in daily operations, such as paper, pens, files, books, printing materials, and other consumables.'),
    ('Airtime', 'Costs for mobile phone airtime, call credits, SMS services, and communication allowances used for official SACCO operations.'),
    ('Loan Recovery Costs', 'Expenses incurred during the process of loan follow-up and recovery, including field visits, legal fees, auctioneer charges, and debt collection activities.'),
    ('Maintenance', 'Costs associated with repairing, servicing, and maintaining SACCO assets, equipment, buildings, vehicles, and office infrastructure.'),
    ('Transport', 'Expenses related to transportation services, travel facilitation, staff movement, delivery services, and official operational travel.'),
    ('Marketing', 'Costs incurred in promoting SACCO products and services through advertising, branding, campaigns, events, promotions, and public awareness activities.'),
    ('Allowances', 'Payments provided to staff, board members, or agents for facilitation, travel, meals, accommodation, sitting allowances, or other approved operational activities.'),
    ('Rent', 'Payments made for leasing office premises, branch spaces, equipment, or other rented properties used by the SACCO.'),
    ('Internet', 'Expenses for internet connectivity, broadband subscriptions, data bundles, networking services, and online communication systems used in SACCO operations.'),
    ('Insurance', 'Costs paid for insurance coverage and protection of SACCO assets, vehicles, employees, deposits, or other operational risks against potential losses.')
ON CONFLICT (category) DO NOTHING;


INSERT INTO senteloans_roles (name, description)
VALUES
  ('Manager', 'Department manager'),
  ('Loan Officer', 'Loan processing and member loan support'),
  ('Teller', 'Cash and front desk transactions'),
  ('Consultant', 'Advisory and support access'),
  ('Treasurer', 'Treasury and cash management'),
  ('Credit Officer', 'Credit appraisal and monitoring'),
  ('Accountant', 'Accounting and reconciliation'),
  ('Admin', 'Institution branch system management'),
  ('Super Admin', 'Full institution system access that is (All branches of an institution)')
ON CONFLICT (name) DO NOTHING;

-- 2) Seed permission catalog
INSERT INTO senteloans_permissions (name, module)
VALUES
  ('edit_loan_policies', 'settings'),
  ('edit_membership_policies', 'settings'),
  ('edit_invoice_policies', 'settings'),
  ('edit_share_policies', 'settings'),
  ('edit_loan_policies', 'settings'),
  ('edit_branch_info', 'settings'),
  ('edit_branch_financial_info', 'settings'),
  ('edit_institution_info', 'settings'),
  ('edit_role_permissions', 'settings'),
  ('view_users', 'users'),
  ('create_user', 'users'),
  ('edit_user', 'users'),
  ('edit_daily_report', 'finances'),
  ('view_bank_accouts', 'finances'),
  ('add_bank_account', 'finances'),
  ('edit_bank_account', 'finances'),
  ('edit_bank_amount', 'finances'),
  ('view_grants', 'finances'),
  ('add_grant', 'finances'),
  ('edit_grant', 'finances'),
  ('edit_grant_amount', 'finances'),
  ('view_unclaimed_deposits', 'finances'),
  ('add_unclaimed_deposit', 'finances'),
  ('edit_unclaimed_deposit', 'finances'),
  ('view_members', 'members'),
  ('edit_member', 'members'),
  ('edit_membership_fee', 'members'),
  ('edit_opening_savings', 'members'),
  ('edit_opening_loans', 'members'),
  ('edit_shares', 'members'),
  ('create_member', 'members'),
  ('create_client', 'clients'),
  ('edit_client', 'clients'),
  ('view_clients', 'clients'),
  ('view_account', 'savings'),
  ('edit_account', 'savings'),
  ('generate_account_statements', 'savings'),
  ('view_savings', 'savings'),
  ('view_account', 'savings'),
  ('view_loans', 'loans'),
  ('approve_loan', 'loans'),
  ('review_loan', 'loans'),
  ('create_loan', 'loans'),
  ('disburse_loan', 'loans'),
  ('record_payment', 'loans'),
  ('review_eligibilities', 'loans'),
  ('reject_loan', 'loans'),
  ('close_loan', 'loans'),
  ('view_expenses', 'expenses'),
  ('create_expense', 'expenses'),
  ('edit_expense', 'expenses'),
  ('view_expense', 'expenses'),
  ('edit_expense_status', 'expenses'),
  ('record_cashflow', 'expenses'),
  ('add_expense_funding', 'expenses'),
  ('edit_expense_funding', 'expenses'),
  ('delete_expense_funding', 'expenses'),
  ('edit_cashflow', 'expenses'),
  ('edit_cashflow_status', 'expenses'),
  ('download_expense', 'expenses'),
  ('view_loan_products', 'loan_products'),
  ('create_loan_product', 'loan_products'),
  ('edit_loan_product', 'loan_products'),
  ('create_sacco_loan', 'sacco_loans'),
  ('approve_sacco_loan', 'sacco_loans'),
  ('reject_sacco_loan', 'sacco_loans'),
  ('view_sacco_loan', 'sacco_loans'),
  ('view_sacco_loans', 'sacco_loans'),
  ('disburse_sacco_loan', 'sacco_loans'),
  ('record_sacco_loan_payment', 'sacco_loans'),
  ('view_transactions', 'transactions'),
  ('view_transaction', 'transactions'),
  ('create_transaction', 'transactions'),
  ('edit_transaction_status', 'transactions'),
  ('add_investment', 'investments'),
  ('edit_investment', 'investments'),
  ('view_investments', 'investments'),
  ('record_cashflow', 'investments'),
  ('record_monthly_report', 'investments'),
  ('edit_investment_funding', 'investments'),
  ('edit_investment_status', 'investments'),
  ('view_investment_reports', 'investment_reports'),
  ('download_investment_report', 'investment_reports'),
  ('view_invoices', 'invoices'),
  ('add_invoice', 'invoices'),
  ('edit_invoice', 'invoices'),
  ('send_invoice', 'invoices'),
  ('edit_invoice_status', 'invoices'),
  ('download_invoice', 'invoices'),
  ('generate_staff_audit_reports', 'reports'),
  ('generate_invoice_reports', 'reports'),
  ('generate_investment_reports', 'reports'),
  ('generate_treasury_reports', 'reports'),
  ('generate_financial_reports', 'reports'),
  ('generate_statement_reports', 'reports'),
  ('generate_share_reports', 'reports'),
  ('generate_loan_reports', 'reports'),
  ('generate_balance_sheets', 'reports'),
  ('generate_sacco_loan_reports', 'reports')
ON CONFLICT (name) DO NOTHING;

-- 3) Seed role permissions
WITH role_permission_map(role_name, permission_name) AS (
  VALUES
    -- Loan Officer
    ('Loan Officer', 'view_users'),
    ('Loan Officer', 'view_members'),
    ('Loan Officer', 'view_clients'),
    ('Loan Officer', 'view_savings'),
    ('Loan Officer', 'view_account'),
    ('Loan Officer', 'view_loans'),
    ('Loan Officer', 'view_loan_products'),
    ('Loan Officer', 'view_transactions'),
    ('Loan Officer', 'create_transaction'),
    ('Loan Officer', 'record_payment'),

    -- Manager
    ('Manager', 'view_users'),
    ('Manager', 'create_user'),
    ('Manager', 'edit_user'),
    ('Manager', 'view_members'),
    ('Manager', 'create_member'),
    ('Manager', 'edit_member'),
    ('Manager', 'edit_membership_fee'),
    ('Manager', 'edit_opening_savings'),
    ('Manager', 'edit_opening_loans'),
    ('Manager', 'edit_shares'),
    ('Manager', 'view_clients'),
    ('Manager', 'create_client'),
    ('Manager', 'edit_client'),
    ('Manager', 'view_savings'),
    ('Manager', 'view_account'),
    ('Manager', 'view_loans'),
    ('Manager', 'review_loan'),
    ('Manager', 'create_loan'),
    ('Manager', 'approve_loan'),
    ('Manager', 'disburse_loan'),
    ('Manager', 'record_payment'),
    ('Manager', 'reject_loan'),
    ('Manager', 'close_loan'),
    ('Manager', 'view_loan_products'),
    ('Manager', 'create_loan_product'),
    ('Manager', 'edit_loan_product'),
    ('Manager', 'view_transactions'),
    ('Manager', 'create_transaction')
)
INSERT INTO senteloans_role_permissions (branch_id, role_id, permission_id)
SELECT
  b.id,
  r.id,
  p.id
FROM senteloans_branches b
JOIN role_permission_map rpm ON TRUE
JOIN senteloans_roles r ON r.name = rpm.role_name
JOIN senteloans_permissions p ON p.name = rpm.permission_name
UNION ALL
-- Admin: full permission catalog for branch-level operations.
SELECT
  b.id,
  r.id,
  p.id
FROM senteloans_branches b
JOIN senteloans_roles r ON r.name = 'Admin'
JOIN senteloans_permissions p ON TRUE
ON CONFLICT (branch_id, role_id, permission_id) DO NOTHING;

-- 4) Seed users with role_id
DO $$
DECLARE
    platform_id UUID;
    kampala_sacco_id UUID;
    quick_cash_id UUID;
    opportunity_mfi_id UUID;
    platform_branch_id UUID;
    kampala_sacco_branch_id UUID;
    quick_cash_branch_id UUID;
    opportunity_mfi_branch_id UUID;
    role_loan_officer_id UUID;
    role_teller_id UUID;
    role_manager_id UUID;
    role_admin_id UUID;
    role_super_admin_id UUID;
BEGIN
    SELECT id INTO platform_id FROM senteloans_institutions WHERE name = 'SenteLoans Platform';
    SELECT id INTO kampala_sacco_id FROM senteloans_institutions WHERE name = 'Kampala Central SACCO';
    SELECT id INTO quick_cash_id FROM senteloans_institutions WHERE name = 'Quick Cash Uganda';
    SELECT id INTO opportunity_mfi_id FROM senteloans_institutions WHERE name = 'Opportunity Microfinance Uganda';

    SELECT id INTO platform_branch_id FROM senteloans_branches WHERE institution_id = platform_id ORDER BY created_at LIMIT 1;
    SELECT id INTO kampala_sacco_branch_id FROM senteloans_branches WHERE institution_id = kampala_sacco_id ORDER BY created_at LIMIT 1;
    SELECT id INTO quick_cash_branch_id FROM senteloans_branches WHERE institution_id = quick_cash_id ORDER BY created_at LIMIT 1;
    SELECT id INTO opportunity_mfi_branch_id FROM senteloans_branches WHERE institution_id = opportunity_mfi_id ORDER BY created_at LIMIT 1;

    SELECT id INTO role_loan_officer_id FROM senteloans_roles WHERE name = 'Loan Officer' LIMIT 1;
    SELECT id INTO role_teller_id FROM senteloans_roles WHERE name = 'Teller' LIMIT 1;
    SELECT id INTO role_manager_id FROM senteloans_roles WHERE name = 'Manager' LIMIT 1;
    SELECT id INTO role_admin_id FROM senteloans_roles WHERE name = 'Admin' LIMIT 1;
    SELECT id INTO role_super_admin_id FROM senteloans_roles WHERE name = 'Super Admin' LIMIT 1;

    -- Platform super admin
    INSERT INTO senteloans_users (
        id, supabase_user_id, institution_id, branch_id, role_id, email, full_name, phone_number, status
    ) VALUES (
        uuid_generate_v4(), NULL::uuid, platform_id, platform_branch_id, role_super_admin_id,
        'admin@senteloans.com', 'SenteLoans System Admin', '+256000000000', 'Active'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Institution admins
    INSERT INTO senteloans_users (
        id, supabase_user_id, institution_id, branch_id, role_id, email, full_name, phone_number, status
    ) VALUES
    (
        uuid_generate_v4(), NULL::uuid, kampala_sacco_id, kampala_sacco_branch_id, role_admin_id,
        'admin@kampalacentralsacco.ug', 'John Ssebunya', '+256414123456', 'Active'
    ),
    (
        uuid_generate_v4(), NULL::uuid, quick_cash_id, quick_cash_branch_id, role_admin_id,
        'admin@quickcashug.com', 'Moses Lubega', '+256701987654', 'Active'
    ),
    (
        uuid_generate_v4(), NULL::uuid, opportunity_mfi_id, opportunity_mfi_branch_id, role_admin_id,
        'admin@opportunityug.org', 'Sarah Namukasa', '+256312456789', 'Active'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Institution users
    INSERT INTO senteloans_users (
        id, supabase_user_id, institution_id, branch_id, role_id, email, full_name, phone_number, status
    ) VALUES
    (
        uuid_generate_v4(), NULL::uuid, kampala_sacco_id, kampala_sacco_branch_id, role_loan_officer_id,
        'annet.mukasa@kampalacentralsacco.ug', 'Annet Mukasa', '+256701111111', 'Active'
    ),
    (
        uuid_generate_v4(), NULL::uuid, kampala_sacco_id, kampala_sacco_branch_id, role_loan_officer_id,
        'samuel.kato@kampalacentralsacco.ug', 'Samuel Kato', '+256702222222', 'Active'
    ),
    (
        uuid_generate_v4(), NULL::uuid, quick_cash_id, quick_cash_branch_id, role_loan_officer_id,
        'peter.ssali@quickcashug.com', 'Peter Ssali', '+256703333333', 'Active'
    ),
    (
        uuid_generate_v4(), NULL::uuid, opportunity_mfi_id, opportunity_mfi_branch_id, role_loan_officer_id,
        'grace.nakato@opportunityug.org', 'Grace Nakato', '+256704444444', 'Active'
    ),
    (
        uuid_generate_v4(), NULL::uuid, kampala_sacco_id, kampala_sacco_branch_id, role_teller_id,
        'mary.nakato@kampalacentralsacco.ug', 'Mary Nakato', '+256705555555', 'Active'
    ),
    (
        uuid_generate_v4(), NULL::uuid, opportunity_mfi_id, opportunity_mfi_branch_id, role_loan_officer_id,
        'patricia.nambi@opportunityug.org', 'Patricia Nambi', '+256707777777', 'Active'
    )
    ON CONFLICT (email) DO NOTHING;

    -- Manager user
    INSERT INTO senteloans_users (
        id, supabase_user_id, institution_id, branch_id, role_id, email, full_name, phone_number, status
    ) VALUES
    (
        uuid_generate_v4(), NULL::uuid, quick_cash_id, quick_cash_branch_id, role_manager_id,
        'james.mukasa@quickcashug.com', 'James Mukasa', '+256706666666', 'Active'
    )
    ON CONFLICT (email) DO NOTHING;
END $$;

SELECT
    'User Accounts Created Successfully' as status,
    COUNT(*) as total_users_created
FROM senteloans_users;

SELECT
    i.name as institution_name,
    b.name as branch_name,
    u.full_name,
    u.email,
    r.name as role_name,
    u.status
FROM senteloans_users u
JOIN senteloans_institutions i ON u.institution_id = i.id
JOIN senteloans_branches b ON u.branch_id = b.id
JOIN senteloans_roles r ON u.role_id = r.id
ORDER BY i.name, b.name, r.name, u.full_name;
