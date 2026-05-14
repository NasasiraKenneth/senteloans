/** Maps expense funding API error payloads to user-facing toast text. */
export function describeExpenseFundingApiError(body: Record<string, unknown>): string {
  const msg = body?.message
  if (typeof msg === "string" && msg.trim()) return msg.trim()
  const code = String(body?.error ?? "")
  if (code === "expense_already_completed") {
    return "Expense already completed."
  }
  if (code === "expense_already_rejected") {
    return "Expense already rejected."
  }
  return code || "Something went wrong"
}
