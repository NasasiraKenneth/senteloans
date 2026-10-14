import sys

def replace_exact(filepath, old_text, new_text):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    if old_text not in content:
        print(f"FAILED: old_text not found in {filepath}")
        return False
    content = content.replace(old_text, new_text, 1)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"OK: {filepath}")
    return True

# 1. dashboard-stats
with open("app/api/institution/dashboard-stats/route.ts", "r") as f:
    lines = f.readlines()
start = next(i for i, l in enumerate(lines) if "const [membersRes, loansRes" in l)
end = next(i for i in range(start, len(lines)) if lines[i].strip() == "])")
new_dashboard_stats = """      const membersRes = await client.query(
        `SELECT COUNT(*)::int AS total,
                (COUNT(*) FILTER (WHERE m.status = 'Active'))::int AS active,
                (COUNT(*) FILTER (WHERE m.status = 'Inactive'))::int AS inactive
         FROM members m
         WHERE ${membersScope.where}`,
        membersParams,
      )
      const loansRes = await client.query(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(outstanding_balance), 0)::numeric AS outstanding,
                (COUNT(*) FILTER (WHERE status IN (${activeLoanList})))::int AS active_loans,
                (COUNT(*) FILTER (WHERE approved_at IS NOT NULL))::int AS approved_loans,
                COALESCE(AVG(principal_amount) FILTER (WHERE status IN (${activeLoanList})), 0)::numeric AS avg_principal
         FROM loans l
         WHERE ${loansScope.where}`,
        loansParams,
      )
      const txRes = await client.query(
        `SELECT COUNT(*)::int AS tx_count FROM transactions t
         WHERE ${txScope.where}
           AND t.transaction_date >= date_trunc('month', CURRENT_TIMESTAMP)`,
        txParams,
      )
      const savingsRes = await client.query(
        `SELECT COALESCE(SUM(sa.total_balance), 0)::numeric AS total
         FROM savings_accounts sa
         WHERE ${savingsScope.where}`,
        savingsParams,
      )
      const portfolioRes = await client.query(
        `SELECT
           COALESCE(SUM(outstanding_balance) FILTER (WHERE status = 'Defaulted'), 0)::numeric AS npl_outstanding,
           COALESCE(SUM(outstanding_balance) FILTER (WHERE status IN (${activeLoanList}, 'Defaulted')), 0)::numeric AS portfolio_outstanding
         FROM loans l
         WHERE ${loansScope.where}`,
        loansParams,
      )
      const collectionRes = await client.query(
        `SELECT
           COALESCE(SUM(lr.amount_due) FILTER (
             WHERE lr.due_date >= date_trunc('month', CURRENT_DATE)::date
               AND lr.due_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
           ), 0)::numeric AS due_this_month,
           COALESCE(SUM(lr.amount_paid) FILTER (
             WHERE lr.payment_date >= date_trunc('month', CURRENT_DATE)::date
               AND lr.payment_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
           ), 0)::numeric AS collected_this_month
         FROM loan_repayments lr
         INNER JOIN loans l ON l.id = lr.loan_id
         WHERE ${loansScope.where}`,
        loansParams,
      )
      const overdueRes = await client.query(
        `SELECT COUNT(DISTINCT l.id)::int AS overdue_count
         FROM loans l
         INNER JOIN loan_repayments lr ON lr.loan_id = l.id
         WHERE ${loansScope.where}
           AND l.status IN (${activeLoanList})
           AND lr.status != 'Paid'
           AND lr.due_date < CURRENT_DATE`,
        loansParams,
      )
"""
lines[start:end+1] = [new_dashboard_stats]
with open("app/api/institution/dashboard-stats/route.ts", "w") as f:
    f.writelines(lines)
print("OK: app/api/institution/dashboard-stats/route.ts")

# 2. loans/permissions
old_loans_perm = """      const [viewLoans, createLoan, sellLoan] = await Promise.all([
        hasPermission(client, actor, "view_loans"),
        hasPermission(client, actor, "create_loan"),
        hasPermission(client, actor, "sell_loan"),
      ])"""
new_loans_perm = """      const perms = await hasPermissions(client, actor, ["view_loans", "create_loan", "sell_loan"] as const)
      const viewLoans = perms.view_loans
      const createLoan = perms.create_loan
      const sellLoan = perms.sell_loan"""
replace_exact("app/api/institution/loans/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/loans/permissions/route.ts", old_loans_perm, new_loans_perm)

# 3. sacco-loans/permissions
old_sacco_perm = """      const [
        viewSaccoLoans,
        createSaccoLoan,
        approveSaccoLoan,
        rejectSaccoLoan,
        disburseSaccoLoan,
        activateSaccoLoan,
        recordSaccoLoanPayment,
      ] = await Promise.all([
        hasPermission(client, actor, "view_sacco_loans"),
        hasPermission(client, actor, "create_sacco_loan"),
        hasPermission(client, actor, "approve_sacco_loan"),
        hasPermission(client, actor, "reject_sacco_loan"),
        hasPermission(client, actor, "disburse_sacco_loan"),
        hasPermission(client, actor, "activate_sacco_loan"),
        hasPermission(client, actor, "record_sacco_loan_payment"),
      ])"""
new_sacco_perm = """      const perms = await hasPermissions(client, actor, [
        "view_sacco_loans",
        "create_sacco_loan",
        "approve_sacco_loan",
        "reject_sacco_loan",
        "disburse_sacco_loan",
        "activate_sacco_loan",
        "record_sacco_loan_payment",
      ] as const)
      const viewSaccoLoans = perms.view_sacco_loans
      const createSaccoLoan = perms.create_sacco_loan
      const approveSaccoLoan = perms.approve_sacco_loan
      const rejectSaccoLoan = perms.reject_sacco_loan
      const disburseSaccoLoan = perms.disburse_sacco_loan
      const activateSaccoLoan = perms.activate_sacco_loan
      const recordSaccoLoanPayment = perms.record_sacco_loan_payment"""
replace_exact("app/api/institution/sacco-loans/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/sacco-loans/permissions/route.ts", old_sacco_perm, new_sacco_perm)

# 4. settings/route.ts
old_settings_check = """      const canEdit = await Promise.all([
        hasPermission(client, actor, "edit_loan_policies"),
        hasPermission(client, actor, "edit_membership_policies"),
        hasPermission(client, actor, "edit_invoice_policies"),
        hasPermission(client, actor, "edit_share_policies"),
        hasPermission(client, actor, "edit_branch_financial_info"),
      ])
      if (!canEdit.some(Boolean)) return { error: "missing_permission:edit_institution_settings" as const }"""
new_settings_check = """      const perms = await hasPermissions(client, actor, [
        "edit_loan_policies",
        "edit_membership_policies",
        "edit_invoice_policies",
        "edit_share_policies",
        "edit_branch_financial_info",
      ] as const)
      if (!Object.values(perms).some(Boolean)) return { error: "missing_permission:edit_institution_settings" as const }"""
replace_exact("app/api/institution/settings/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/settings/route.ts", old_settings_check, new_settings_check)

# 5. settings/permissions
old_settings_perm = """      const [
        editLoanPolicies,
        editMembershipPolicies,
        editInvoicePolicies,
        editSharePolicies,
        editBranchFinancialInfo,
        editInstitutionInfo,
        editBranchInfo,
        editRolePermissionsRaw,
      ] = await Promise.all([
        hasPermission(client, actor, "edit_loan_policies"),
        hasPermission(client, actor, "edit_membership_policies"),
        hasPermission(client, actor, "edit_invoice_policies"),
        hasPermission(client, actor, "edit_share_policies"),
        hasPermission(client, actor, "edit_branch_financial_info"),
        hasPermission(client, actor, "edit_institution_info"),
        hasPermission(client, actor, "edit_branch_info"),
        hasPermission(client, actor, "edit_role_permissions"),
      ])"""
new_settings_perm = """      const perms = await hasPermissions(client, actor, [
        "edit_loan_policies",
        "edit_membership_policies",
        "edit_invoice_policies",
        "edit_share_policies",
        "edit_branch_financial_info",
        "edit_institution_info",
        "edit_branch_info",
        "edit_role_permissions",
      ] as const)
      const editLoanPolicies = perms.edit_loan_policies
      const editMembershipPolicies = perms.edit_membership_policies
      const editInvoicePolicies = perms.edit_invoice_policies
      const editSharePolicies = perms.edit_share_policies
      const editBranchFinancialInfo = perms.edit_branch_financial_info
      const editInstitutionInfo = perms.edit_institution_info
      const editBranchInfo = perms.edit_branch_info
      const editRolePermissionsRaw = perms.edit_role_permissions"""
replace_exact("app/api/institution/settings/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/settings/permissions/route.ts", old_settings_perm, new_settings_perm)

# 6. loan-products/permissions
old_lp_perm = """      const [viewLoanProducts, createLoanProduct, editLoanProduct] = await Promise.all([
        hasPermission(client, actor, "view_loan_products"),
        hasPermission(client, actor, "create_loan_product"),
        hasPermission(client, actor, "edit_loan_product"),
      ])"""
new_lp_perm = """      const perms = await hasPermissions(client, actor, [
        "view_loan_products",
        "create_loan_product",
        "edit_loan_product",
      ] as const)
      const viewLoanProducts = perms.view_loan_products
      const createLoanProduct = perms.create_loan_product
      const editLoanProduct = perms.edit_loan_product"""
replace_exact("app/api/institution/loan-products/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/loan-products/permissions/route.ts", old_lp_perm, new_lp_perm)

# 7. savings/permissions
old_sav_perm = """      const [viewSavings, viewAccount, createTransaction, addAccount, editAccount, generateAccountStatements] = await Promise.all([
        hasPermission(client, actor, "view_savings"),
        hasPermission(client, actor, "view_account"),
        hasPermission(client, actor, "create_transaction"),
        hasPermission(client, actor, "add_account"),
        hasPermission(client, actor, "edit_account"),
        hasPermission(client, actor, "generate_account_statements"),
      ])"""
new_sav_perm = """      const perms = await hasPermissions(client, actor, [
        "view_savings",
        "view_account",
        "create_transaction",
        "add_account",
        "edit_account",
        "generate_account_statements",
      ] as const)
      const viewSavings = perms.view_savings
      const viewAccount = perms.view_account
      const createTransaction = perms.create_transaction
      const addAccount = perms.add_account
      const editAccount = perms.edit_account
      const generateAccountStatements = perms.generate_account_statements"""
replace_exact("app/api/institution/savings/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/savings/permissions/route.ts", old_sav_perm, new_sav_perm)

# 8. invoices/permissions
old_inv_perm = """      const [viewInvoices, addInvoice, editInvoice, editInvoiceStatus, downloadInvoice] =
        await Promise.all([
          hasPermission(client, actor, "view_invoices"),
          hasPermission(client, actor, "add_invoice"),
          hasPermission(client, actor, "edit_invoice"),
          hasPermission(client, actor, "edit_invoice_status"),
          hasPermission(client, actor, "download_invoice"),
        ])"""
new_inv_perm = """      const perms = await hasPermissions(client, actor, [
        "view_invoices",
        "add_invoice",
        "edit_invoice",
        "edit_invoice_status",
        "download_invoice",
      ] as const)
      const viewInvoices = perms.view_invoices
      const addInvoice = perms.add_invoice
      const editInvoice = perms.edit_invoice
      const editInvoiceStatus = perms.edit_invoice_status
      const downloadInvoice = perms.download_invoice"""
replace_exact("app/api/institution/invoices/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/invoices/permissions/route.ts", old_inv_perm, new_inv_perm)

# 9. expenses/permissions
old_exp_perm = """      const [
        viewExpenses,
        createExpense,
        editExpense,
        editExpenseStatus,
        recordCashflow,
        downloadExpense,
        editCashflow,
        editCashflowStatus,
      ] = await Promise.all([
        hasPermission(client, actor, "view_expenses"),
        hasPermission(client, actor, "create_expense"),
        hasPermission(client, actor, "edit_expense"),
        hasPermission(client, actor, "edit_expense_status"),
        hasPermission(client, actor, "record_cashflow"),
        hasPermission(client, actor, "download_expense"),
        hasPermission(client, actor, "edit_cashflow"),
        hasPermission(client, actor, "edit_cashflow_status"),
      ])"""
new_exp_perm = """      const perms = await hasPermissions(client, actor, [
        "view_expenses",
        "create_expense",
        "edit_expense",
        "edit_expense_status",
        "record_cashflow",
        "download_expense",
        "edit_cashflow",
        "edit_cashflow_status",
      ] as const)
      const viewExpenses = perms.view_expenses
      const createExpense = perms.create_expense
      const editExpense = perms.edit_expense
      const editExpenseStatus = perms.edit_expense_status
      const recordCashflow = perms.record_cashflow
      const downloadExpense = perms.download_expense
      const editCashflow = perms.edit_cashflow
      const editCashflowStatus = perms.edit_cashflow_status"""
replace_exact("app/api/institution/expenses/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/expenses/permissions/route.ts", old_exp_perm, new_exp_perm)

# 10. navigation/permissions
old_nav_perm = """      const [
        viewUsers,
        viewMembers,
        viewThirdPartyAgents,
        viewLoans,
        viewSaccoLoans,
        viewLoanProducts,
        viewSavings,
        viewInvestments,
        viewInvestmentReports,
        viewTransactions,
        viewInvoices,
        viewBankAccounts,
        viewGrants,
        viewUnclaimedDeposits,
        viewExpenses,
        editLoanPolicies,
        editMembershipPolicies,
        editInvoicePolicies,
        editSharePolicies,
        editBranchFinancialInfo,
        editInstitutionInfo,
        editBranchInfo,
        editRolePermissions,
        viewChats,
      ] = await Promise.all([
        hasPermission(client, actor, "view_users"),
        hasPermission(client, actor, "view_members"),
        hasPermission(client, actor, "view_third_party_agents"),
        hasPermission(client, actor, "view_loans"),
        hasPermission(client, actor, "view_sacco_loans"),
        hasPermission(client, actor, "view_loan_products"),
        hasPermission(client, actor, "view_savings"),
        hasPermission(client, actor, "view_investments"),
        hasPermission(client, actor, "view_investment_reports"),
        hasPermission(client, actor, "view_transactions"),
        hasPermission(client, actor, "view_invoices"),
        hasPermission(client, actor, "view_bank_accouts"),
        hasPermission(client, actor, "view_grants"),
        hasPermission(client, actor, "view_unclaimed_deposits"),
        hasPermission(client, actor, "view_expenses"),
        hasPermission(client, actor, "edit_loan_policies"),
        hasPermission(client, actor, "edit_membership_policies"),
        hasPermission(client, actor, "edit_invoice_policies"),
        hasPermission(client, actor, "edit_share_policies"),
        hasPermission(client, actor, "edit_branch_financial_info"),
        hasPermission(client, actor, "edit_institution_info"),
        hasPermission(client, actor, "edit_branch_info"),
        hasPermission(client, actor, "edit_role_permissions"),
        hasPermission(client, actor, "view_chats"),
      ])"""
new_nav_perm = """      const perms = await hasPermissions(client, actor, [
        "view_users",
        "view_members",
        "view_third_party_agents",
        "view_loans",
        "view_sacco_loans",
        "view_loan_products",
        "view_savings",
        "view_investments",
        "view_investment_reports",
        "view_transactions",
        "view_invoices",
        "view_bank_accouts",
        "view_grants",
        "view_unclaimed_deposits",
        "view_expenses",
        "edit_loan_policies",
        "edit_membership_policies",
        "edit_invoice_policies",
        "edit_share_policies",
        "edit_branch_financial_info",
        "edit_institution_info",
        "edit_branch_info",
        "edit_role_permissions",
        "view_chats",
      ] as const)
      const viewUsers = perms.view_users
      const viewMembers = perms.view_members
      const viewThirdPartyAgents = perms.view_third_party_agents
      const viewLoans = perms.view_loans
      const viewSaccoLoans = perms.view_sacco_loans
      const viewLoanProducts = perms.view_loan_products
      const viewSavings = perms.view_savings
      const viewInvestments = perms.view_investments
      const viewInvestmentReports = perms.view_investment_reports
      const viewTransactions = perms.view_transactions
      const viewInvoices = perms.view_invoices
      const viewBankAccounts = perms.view_bank_accouts
      const viewGrants = perms.view_grants
      const viewUnclaimedDeposits = perms.view_unclaimed_deposits
      const viewExpenses = perms.view_expenses
      const editLoanPolicies = perms.edit_loan_policies
      const editMembershipPolicies = perms.edit_membership_policies
      const editInvoicePolicies = perms.edit_invoice_policies
      const editSharePolicies = perms.edit_share_policies
      const editBranchFinancialInfo = perms.edit_branch_financial_info
      const editInstitutionInfo = perms.edit_institution_info
      const editBranchInfo = perms.edit_branch_info
      const editRolePermissions = perms.edit_role_permissions
      const viewChats = perms.view_chats"""
replace_exact("app/api/institution/navigation/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/navigation/permissions/route.ts", old_nav_perm, new_nav_perm)

# 11. transactions/permissions
old_tx_perm = """      const [viewTransactions, createTransaction] = await Promise.all([
        hasPermission(client, actor, "view_transactions"),
        hasPermission(client, actor, "create_transaction"),
      ])"""
new_tx_perm = """      const perms = await hasPermissions(client, actor, ["view_transactions", "create_transaction"] as const)
      const viewTransactions = perms.view_transactions
      const createTransaction = perms.create_transaction"""
replace_exact("app/api/institution/transactions/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/transactions/permissions/route.ts", old_tx_perm, new_tx_perm)

# 12. members/permissions
old_mem_perm = """      const [viewMembers, createMember, editMember, editKyc, editMembershipFee, editShares, editOpeningSavings, editOpeningLoans] = await Promise.all([
        hasPermission(client, actor, "view_members"),
        hasPermission(client, actor, "create_member"),
        hasPermission(client, actor, "edit_member"),
        hasPermission(client, actor, "edit_kyc"),
        hasPermission(client, actor, "edit_membership_fee"),
        hasPermission(client, actor, "edit_shares"),
        hasPermission(client, actor, "edit_opening_savings"),
        hasPermission(client, actor, "edit_opening_loans"),
      ])"""
new_mem_perm = """      const perms = await hasPermissions(client, actor, [
        "view_members",
        "create_member",
        "edit_member",
        "edit_kyc",
        "edit_membership_fee",
        "edit_shares",
        "edit_opening_savings",
        "edit_opening_loans",
      ] as const)
      const viewMembers = perms.view_members
      const createMember = perms.create_member
      const editMember = perms.edit_member
      const editKyc = perms.edit_kyc
      const editMembershipFee = perms.edit_membership_fee
      const editShares = perms.edit_shares
      const editOpeningSavings = perms.edit_opening_savings
      const editOpeningLoans = perms.edit_opening_loans"""
replace_exact("app/api/institution/members/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/members/permissions/route.ts", old_mem_perm, new_mem_perm)

# 13. staff/permissions
old_stf_perm = """      const [viewUsers, createUser, editUser, hasEditRolePerm] = await Promise.all([
        hasPermission(client, actor, "view_users"),
        hasPermission(client, actor, "create_user"),
        hasPermission(client, actor, "edit_user"),
        hasPermission(client, actor, "edit_role_permissions"),
      ])"""
new_stf_perm = """      const perms = await hasPermissions(client, actor, [
        "view_users",
        "create_user",
        "edit_user",
        "edit_role_permissions",
      ] as const)
      const viewUsers = perms.view_users
      const createUser = perms.create_user
      const editUser = perms.edit_user
      const hasEditRolePerm = perms.edit_role_permissions"""
replace_exact("app/api/institution/staff/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/staff/permissions/route.ts", old_stf_perm, new_stf_perm)

# 14. third-party-agents/permissions
old_tpa_perm = """      const [viewThirdPartyAgents, createThirdPartyAgent, editThirdPartyAgent] = await Promise.all([
        hasPermission(client, actor, "view_third_party_agents"),
        hasPermission(client, actor, "create_third_party_agent"),
        hasPermission(client, actor, "edit_third_party_agent"),
      ])"""
new_tpa_perm = """      const perms = await hasPermissions(client, actor, [
        "view_third_party_agents",
        "create_third_party_agent",
        "edit_third_party_agent",
      ] as const)
      const viewThirdPartyAgents = perms.view_third_party_agents
      const createThirdPartyAgent = perms.create_third_party_agent
      const editThirdPartyAgent = perms.edit_third_party_agent"""
replace_exact("app/api/institution/third-party-agents/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/third-party-agents/permissions/route.ts", old_tpa_perm, new_tpa_perm)

# 15. finances/permissions
old_fin_perm = """      const [
        viewBankAccounts,
        addBankAccount,
        editBankAccount,
        editBankAmount,
        viewGrants,
        addGrant,
        editGrant,
        editGrantAmount,
        viewUnclaimedDeposits,
        addUnclaimedDeposit,
        editUnclaimedDeposit,
      ] = await Promise.all([
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewBankAccounts),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addBankAccount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editBankAccount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editBankAmount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewGrants),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addGrant),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editGrant),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editGrantAmount),
        hasPermission(client, actor, FINANCE_PERMISSIONS.viewUnclaimedDeposits),
        hasPermission(client, actor, FINANCE_PERMISSIONS.addUnclaimedDeposit),
        hasPermission(client, actor, FINANCE_PERMISSIONS.editUnclaimedDeposit),
      ])"""
new_fin_perm = """      const finPermKeys = [
        FINANCE_PERMISSIONS.viewBankAccounts,
        FINANCE_PERMISSIONS.addBankAccount,
        FINANCE_PERMISSIONS.editBankAccount,
        FINANCE_PERMISSIONS.editBankAmount,
        FINANCE_PERMISSIONS.viewGrants,
        FINANCE_PERMISSIONS.addGrant,
        FINANCE_PERMISSIONS.editGrant,
        FINANCE_PERMISSIONS.editGrantAmount,
        FINANCE_PERMISSIONS.viewUnclaimedDeposits,
        FINANCE_PERMISSIONS.addUnclaimedDeposit,
        FINANCE_PERMISSIONS.editUnclaimedDeposit,
      ]
      const perms = await hasPermissions(client, actor, finPermKeys)
      const viewBankAccounts = perms[FINANCE_PERMISSIONS.viewBankAccounts]
      const addBankAccount = perms[FINANCE_PERMISSIONS.addBankAccount]
      const editBankAccount = perms[FINANCE_PERMISSIONS.editBankAccount]
      const editBankAmount = perms[FINANCE_PERMISSIONS.editBankAmount]
      const viewGrants = perms[FINANCE_PERMISSIONS.viewGrants]
      const addGrant = perms[FINANCE_PERMISSIONS.addGrant]
      const editGrant = perms[FINANCE_PERMISSIONS.editGrant]
      const editGrantAmount = perms[FINANCE_PERMISSIONS.editGrantAmount]
      const viewUnclaimedDeposits = perms[FINANCE_PERMISSIONS.viewUnclaimedDeposits]
      const addUnclaimedDeposit = perms[FINANCE_PERMISSIONS.addUnclaimedDeposit]
      const editUnclaimedDeposit = perms[FINANCE_PERMISSIONS.editUnclaimedDeposit]"""
replace_exact("app/api/institution/finances/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/finances/permissions/route.ts", old_fin_perm, new_fin_perm)

# 16. investments/permissions
old_inv_perm2 = """      const [viewInvestments, viewInvestmentReports] = await Promise.all([
        hasPermission(client, actor, \"view_investments\"),
        hasPermission(client, actor, \"view_investment_reports\"),
      ])"""
new_inv_perm2 = """      const perms = await hasPermissions(client, actor, [
        \"view_investments\",
        \"view_investment_reports\",
      ] as const)
      const viewInvestments = perms.view_investments
      const viewInvestmentReports = perms.view_investment_reports"""
replace_exact("app/api/institution/investments/permissions/route.ts", "hasPermission,", "hasPermission, hasPermissions,")
replace_exact("app/api/institution/investments/permissions/route.ts", old_inv_perm2, new_inv_perm2)

# 17. loans/route.ts (productRes, topUpLoanRes)
old_ln_rt = """      const [productRes, topUpLoanRes] = await Promise.all([
        client.query(`SELECT id, institution_id, branch_id, status, product_name, interest_rate, minimum_amount, maximum_amount, minimum_tenure_months, maximum_tenure_months, guarantors_required, interest_calculation_method FROM loan_products WHERE id = $1`, [loan_product_id]),
        loan_type === "top up"
          ? client.query(
              `SELECT id, institution_id, branch_id, member_id, outstanding_balance, status
               FROM loans
               WHERE id = $1
               LIMIT 1`,
              [top_up_loan_id]
            )
          : Promise.resolve({ rows: [] as any[] }),
      ])"""
new_ln_rt = """      const productRes = await client.query(
        `SELECT id, institution_id, branch_id, status, product_name, interest_rate, minimum_amount, maximum_amount, minimum_tenure_months, maximum_tenure_months, guarantors_required, interest_calculation_method FROM loan_products WHERE id = $1`,
        [loan_product_id],
      )
      const topUpLoanRes =
        loan_type === "top up"
          ? await client.query(
              `SELECT id, institution_id, branch_id, member_id, outstanding_balance, status
               FROM loans
               WHERE id = $1
               LIMIT 1`,
              [top_up_loan_id],
            )
          : { rows: [] as any[] }"""
replace_exact("app/api/institution/loans/route.ts", old_ln_rt, new_ln_rt)

# 18. loans/[id]/route.ts
old_ln_id_rt = """      const [loanRes, actorRes] = await Promise.all([
        client.query(
          `SELECT id, institution_id, branch_id, member_id, status, approved_at, loan_product_id
           FROM loans
           WHERE id = $1`,
          [id]
        ),
        client.query(`SELECT id, institution_id, branch_id FROM users WHERE id = $1`, [actor.id]),
      ])"""
new_ln_id_rt = """      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, status, approved_at, loan_product_id
         FROM loans
         WHERE id = $1`,
        [id],
      )
      const actorRes = await client.query(`SELECT id, institution_id, branch_id FROM users WHERE id = $1`, [actor.id])"""
replace_exact("app/api/institution/loans/[id]/route.ts", old_ln_id_rt, new_ln_id_rt)

# 19. loans/[id]/disburse/route.ts
old_dsb_rt = """      const [loanRes, actorRes] = await Promise.all([
        client.query(
          `SELECT id, institution_id, branch_id, member_id, application_id, status, approved_at, total_amount, principal_amount, interest_rate, tenure_months, loan_product_id, loan_type, disbursement_balance
           FROM loans
           WHERE id = $1`,
          [id],
        ),
        client.query(`SELECT id, institution_id, branch_id FROM users WHERE id = $1`, [actor.id]),
      ])"""
new_dsb_rt = """      const loanRes = await client.query(
        `SELECT id, institution_id, branch_id, member_id, application_id, status, approved_at, total_amount, principal_amount, interest_rate, tenure_months, loan_product_id, loan_type, disbursement_balance
         FROM loans
         WHERE id = $1`,
        [id],
      )
      const actorRes = await client.query(`SELECT id, institution_id, branch_id FROM users WHERE id = $1`, [actor.id])"""
replace_exact("app/api/institution/loans/[id]/disburse/route.ts", old_dsb_rt, new_dsb_rt)

# 20. loans/[id]/record-payment/route.ts
old_rec_pay = """            const [instRes, cfgRes] = await Promise.all([
              client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [institutionId]),
              client.query<{ currency: string }>(
                `SELECT currency FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [loanBranchId],
              ),
            ])"""
new_rec_pay = """            const instRes = await client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [institutionId])
            const cfgRes = await client.query<{ currency: string }>(
              `SELECT currency FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
              [loanBranchId],
            )"""
replace_exact("app/api/institution/loans/[id]/record-payment/route.ts", old_rec_pay, new_rec_pay)

# 21. loans/[id]/sell-off/route.ts
old_sell_off = """            const [instRes, cfgRes] = await Promise.all([
              client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [institutionId]),
              client.query<{ currency: string }>(
                `SELECT currency FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [loanBranchId],
              ),
            ])"""
new_sell_off = """            const instRes = await client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [institutionId])
            const cfgRes = await client.query<{ currency: string }>(
              `SELECT currency FROM config WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 1`,
              [loanBranchId],
            )"""
replace_exact("app/api/institution/loans/[id]/sell-off/route.ts", old_sell_off, new_sell_off)

# 22. transactions/route.ts
old_tx_dest = """        const [instRes, cfgRes, destMemberRes] = await Promise.all([
          client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [actor.institution_id]),
          client.query<{ currency: string }>(
            `SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`,
            [branchId],
          ),
          isTransfer && transferDestAccount
            ? client.query<{ id: string; full_name: string; member_number: string; email: string | null }>(
                `SELECT id, full_name, member_number, email FROM members WHERE id = $1`,
                [transferDestAccount.member_id],
              )
            : Promise.resolve({ rows: [] as Array<{ id: string; full_name: string; member_number: string; email: string | null }> }),
        ])"""
new_tx_dest = """        const instRes = await client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [actor.institution_id])
        const cfgRes = await client.query<{ currency: string }>(
          `SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`,
          [branchId],
        )
        const destMemberRes =
          isTransfer && transferDestAccount
            ? await client.query<{ id: string; full_name: string; member_number: string; email: string | null }>(
                `SELECT id, full_name, member_number, email FROM members WHERE id = $1`,
                [transferDestAccount.member_id],
              )
            : { rows: [] as Array<{ id: string; full_name: string; member_number: string; email: string | null }> }"""
replace_exact("app/api/institution/transactions/route.ts", old_tx_dest, new_tx_dest)

# 23. reports/loans/route.ts
old_rep_ln = """      const [countRes, aggregates] = await Promise.all([
        client.query(`SELECT COUNT(*)::int AS total FROM loans l WHERE ${where}`, params),
        fetchLoanReportAggregates(client, where, params),
      ])"""
new_rep_ln = """      const countRes = await client.query(`SELECT COUNT(*)::int AS total FROM loans l WHERE ${where}`, params)
      const aggregates = await fetchLoanReportAggregates(client, where, params)"""
replace_exact("app/api/institution/reports/loans/route.ts", old_rep_ln, new_rep_ln)

# 24. lib/reports/loan-report.ts
with open("lib/reports/loan-report.ts", "r") as f:
    l_lines = f.readlines()
start = next(i for i, l in enumerate(l_lines) if "const [statusRes, productRes, typeRes, monthRes, collectionsRes]" in l)
end = next(i for i in range(start, len(l_lines)) if l_lines[i].strip() == "])")
new_rep_block = """  const statusRes = await client.query(
    `SELECT l.status, COUNT(*)::int AS count,
            COALESCE(SUM(l.principal_amount), 0)::numeric AS principal,
            COALESCE(SUM(l.outstanding_balance), 0)::numeric AS outstanding
     FROM loans l WHERE ${where}
     GROUP BY l.status ORDER BY count DESC`,
    params,
  )
  const productRes = await client.query(
    `SELECT COALESCE(lp.product_name, 'Unknown') AS name,
            COUNT(*)::int AS count,
            COALESCE(SUM(l.outstanding_balance), 0)::numeric AS outstanding
     FROM loans l
     LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
     WHERE ${where}
     GROUP BY lp.product_name
     ORDER BY outstanding DESC
     LIMIT 8`,
    params,
  )
  const typeRes = await client.query(
    `SELECT COALESCE(l.loan_type, 'normal') AS loan_type,
            COUNT(*)::int AS count,
            COALESCE(SUM(l.principal_amount), 0)::numeric AS principal
     FROM loans l WHERE ${where}
     GROUP BY l.loan_type ORDER BY count DESC`,
    params,
  )
  const monthRes = await client.query(
    `SELECT to_char(date_trunc('month', l.application_date), 'Mon YYYY') AS month,
            date_trunc('month', l.application_date) AS sort_month,
            COUNT(*)::int AS count,
            COALESCE(SUM(l.principal_amount), 0)::numeric AS principal,
            COALESCE(SUM(l.disbursement_balance), 0)::numeric AS disbursed
     FROM loans l
     WHERE ${where} AND l.application_date >= (CURRENT_DATE - INTERVAL '12 months')
     GROUP BY date_trunc('month', l.application_date)
     ORDER BY sort_month ASC`,
    params,
  )
  const collectionsRes = await client.query(
    `SELECT to_char(date_trunc('month', lr.payment_date), 'Mon YYYY') AS month,
            date_trunc('month', lr.payment_date) AS sort_month,
            COALESCE(SUM(lr.amount_paid), 0)::numeric AS amount
     FROM loan_repayments lr
     INNER JOIN loans l ON l.id = lr.loan_id
     WHERE ${where} AND lr.payment_date >= (CURRENT_DATE - INTERVAL '12 months')
     GROUP BY date_trunc('month', lr.payment_date)
     ORDER BY sort_month ASC`,
    params,
  )
"""
l_lines[start:end+1] = [new_rep_block]
with open("lib/reports/loan-report.ts", "w") as f:
    f.writelines(l_lines)
print("OK: lib/reports/loan-report.ts")

# 25. chats/server/list-inbox.ts
old_inbox = """  const [conversations, totalUnread] = await Promise.all([
    loadConversationRows(client, conversationIds, chatIdentityId, {
      publicMessagesOnly,
      allowMissingParticipant: includeSupportQueue,
      viewerRole: query.viewerRole,
    }),
    getTotalUnread(client, chatIdentityId, publicMessagesOnly),
  ])"""
new_inbox = """  const conversations = await loadConversationRows(client, conversationIds, chatIdentityId, {
    publicMessagesOnly,
    allowMissingParticipant: includeSupportQueue,
    viewerRole: query.viewerRole,
  })
  const totalUnread = await getTotalUnread(client, chatIdentityId, publicMessagesOnly)"""
replace_exact("lib/chats/server/list-inbox.ts", old_inbox, new_inbox)

# 26. chats/server/list-contacts.ts
old_contacts = """  const [staff, members] = await Promise.all([
    listStaffContacts(client, institutionId, excludeChatIdentityId, query),
    listMemberContacts(client, institutionId, excludeChatIdentityId, query),
  ])"""
new_contacts = """  const staff = await listStaffContacts(client, institutionId, excludeChatIdentityId, query)
  const members = await listMemberContacts(client, institutionId, excludeChatIdentityId, query)"""
replace_exact("lib/chats/server/list-contacts.ts", old_contacts, new_contacts)

# 27. chats/server/fetch-conversation.ts
old_fetch = """  const [participantsRes, referencesRes] = await Promise.all([
    client.query(PARTICIPANTS_SQL, [conversationIds]),
    client.query(REFERENCES_SQL, [conversationIds]),
  ])"""
new_fetch = """  const participantsRes = await client.query(PARTICIPANTS_SQL, [conversationIds])
  const referencesRes = await client.query(REFERENCES_SQL, [conversationIds])"""
replace_exact("lib/chats/server/fetch-conversation.ts", old_fetch, new_fetch)

print("ALL FIXES APPLIED SUCCESSFULLY!")
