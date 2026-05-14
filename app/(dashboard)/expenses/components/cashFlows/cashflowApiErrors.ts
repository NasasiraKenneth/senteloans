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
  if (code === "cashflow_assignee_missing") {
    return "This cashflow has no staff or client assigned; it cannot be completed."
  }
  if (code === "transaction_insert_failed") {
    return "Could not create the ledger transaction. Please try again."
  }
  if (code === "missing_permission:record_cashflow") {
    return "You do not have permission to record cashflows."
  }
  return code || "Something went wrong"
}
