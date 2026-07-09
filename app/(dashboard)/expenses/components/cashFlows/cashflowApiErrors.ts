/** Maps expense cashflow API error payloads to user-facing toast text. */
export function describeExpenseCashflowApiError(body: Record<string, unknown>): string {
  const msg = body?.message
  if (typeof msg === "string" && msg.trim()) return msg.trim()
  const code = String(body?.error ?? "")
  if (code === "cashflow_already_completed") {
    return "This cashflow has already been completed and cannot be edited."
  }
  if (code === "cashflow_already_rejected") {
    return "This cashflow has already been rejected and cannot be edited."
  }
  if (code === "cashflow_not_editable") {
    return "This cashflow cannot be edited because it is not pending."
  }
  if (code === "invalid_payment_status") {
    return "Select a valid payment status (fully paid or unpaid)."
  }
  if (code === "expense_not_approved_or_active") {
    return "Cashflow status can only be changed when the expense is approved or active."
  }
  if (code === "missing_permission:edit_cashflow_status") {
    return "You do not have permission to change cashflow status."
  }
  if (code === "missing_permission:edit_cashflow") {
    return "You do not have permission to edit cashflows."
  }
  if (code === "missing_permission:record_or_edit_cashflow") {
    return "You do not have permission to load staff for this expense."
  }
  if (code === "invalid_staff") {
    return "The selected staff member is not valid for this expense branch."
  }
  if (code === "invalid_third_party_agent") {
    return "The selected client is not valid for this expense branch."
  }
  if (code === "third_party_agent_id_required") {
    return "Select a client for this cashflow."
  }
  if (code === "third_party_agent_id_not_allowed_for_staff_cashflow") {
    return "A client cannot be assigned when the cashflow type is staff."
  }
  if (code === "cashflow_assignee_missing") {
    return "This cashflow has no staff or client assigned; it cannot be completed."
  }
  if (code === "transaction_insert_failed") {
    return "Could not create the ledger transaction. Please try again."
  }
  if (code === "missing_permission:record_cashflow") {
    return "You do not have permission to record cashflows."
  }
  if (code === "reference_number_required") {
    return "A reference number is required for this payment mode."
  }
  if (code === "bank_account_required") {
    return "Please select a bank account for this payment mode."
  }
  if (code === "bank_account_not_found") {
    return "The selected bank account could not be found for this branch."
  }
  if (code === "invalid_mode" || code === "invalid_payment_method") {
    return "Select a valid payment mode."
  }
  if (code === "mode_required") {
    return "Select a transaction mode."
  }
  if (code === "invalid_transaction_charges") {
    return "Transaction charges must be a valid, non-negative amount."
  }
  if (code === "transaction_charges_not_allowed") {
    return "Transaction charges are not allowed for this payment mode."
  }
  if (code === "expense_already_completed") {
    return "Expense already completed."
  }
  if (code === "amount_exceeds_outstanding") {
    return typeof body.outstanding === "number"
      ? `Amount exceeds outstanding balance of ${body.outstanding}.`
      : "Amount exceeds the outstanding balance."
  }
  if (code === "cashflow_not_payable") {
    return "This cashflow cannot accept payments in its current status."
  }
  if (code === "cashflow_fully_paid") {
    return "This cashflow is already fully paid."
  }
  if (code === "invalid_payment_date") {
    return "Please select a valid payment date."
  }
  if (code === "bank_account_insufficient_funds") {
    return "Insufficient funds in the selected bank account."
  }
  if (code === "insufficient_cash_balance") {
    return "Insufficient cash balance for this payment."
  }
  if (code === "insufficient_mobile_money_balance") {
    return "Insufficient mobile money balance for this payment."
  }
  if (code === "expense_already_rejected") {
    return "Expense already rejected."
  }
  return code || "Something went wrong"
}
