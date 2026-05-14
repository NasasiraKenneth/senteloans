/**
 * Blocks add/edit/delete of expense funding when the expense is in a terminal state.
 */
export function expenseFundingStatusBlock(
  statusRaw: string,
):
  | { error: "expense_already_completed"; message: string }
  | { error: "expense_already_rejected"; message: string }
  | null {
  const s = String(statusRaw || "").trim().toLowerCase()
  if (s === "completed") {
    return { error: "expense_already_completed", message: "Expense already completed." }
  }
  if (s === "rejected") {
    return { error: "expense_already_rejected", message: "Expense already rejected." }
  }
  return null
}
