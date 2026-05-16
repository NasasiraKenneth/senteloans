/** Maps expense API error payloads to user-facing toast text. */
export function describeExpenseApiError(body: Record<string, unknown>): string {
  const msg = body?.message
  if (typeof msg === "string" && msg.trim()) return msg.trim()
  const code = String(body?.error ?? "")
  if (code === "expense_not_pending") {
    return "Only pending expenses can be approved."
  }
  if (code === "expense_not_pending_or_approved") {
    return "Only pending or approved expenses can be cancelled."
  }
  if (code === "expense_not_active") {
    return "Only active expenses can be completed."
  }
  if (code === "missing_permission:edit_expense_status") {
    return "You do not have permission to change expense status."
  }
  if (code === "expense_not_editable") {
    return "Only expenses in Pending status can be edited."
  }
  if (code === "missing_permission:edit_expense") {
    return "You do not have permission to edit expenses."
  }
  return code || "Something went wrong"
}
