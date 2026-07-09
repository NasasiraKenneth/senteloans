/** Client-safe expense cashflow status helpers (no Node/pg imports). */

export type ExpenseCashflowPaymentStatus = "fully_paid" | "unpaid"

/** Cashflow row status when payment is settled on record. */
export const EXPENSE_CASHFLOW_FULLY_PAID_STATUS = "Fully Paid"

/** Cashflow row status after a partial settlement payment. */
export const EXPENSE_CASHFLOW_PARTIALLY_PAID_STATUS = "Partially Paid"

/** Cashflow row status before payment is settled. */
export const EXPENSE_CASHFLOW_UNPAID_STATUS = "Unpaid"

/** Placeholder mode recorded on unpaid cashflows before settlement. */
export const UNPAID_EXPENSE_CASHFLOW_MODE = "Bank Transfer"

/** Normalize form/API payment status values. */
export function normalizeExpenseCashflowPaymentStatus(raw: unknown): ExpenseCashflowPaymentStatus | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
  if (!s || s === "unpaid") return "unpaid"
  if (s === "fully_paid" || s === "paid") return "fully_paid"
  return null
}

export function isSettledExpenseCashflowStatus(status: string): boolean {
  const s = String(status || "").trim().toLowerCase()
  return s === "completed" || s === "fully paid" || s === "paid"
}

/** Cashflows that can still be edited or completed/rejected. */
export function isEditableExpenseCashflowStatus(status: string): boolean {
  const s = String(status || "").trim().toLowerCase()
  return s === "pending" || s === "unpaid"
}

/** Cashflows eligible for the record-payment action in the UI. */
export function isExpenseCashflowPaymentRecordable(status: string): boolean {
  const s = normalizeExpenseCashflowRowStatus(status)
  return s === "unpaid" || s === "partially paid" || s === "part paid"
}

/** Cashflows that can be marked rejected from the UI. */
export function isExpenseCashflowUnpaidStatus(status: string): boolean {
  return normalizeExpenseCashflowRowStatus(status) === "unpaid"
}

function normalizeExpenseCashflowRowStatus(status: string): string {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
}

export function isExpenseCashflowPartiallyPaidStatus(status: string): boolean {
  const s = normalizeExpenseCashflowRowStatus(status)
  return s === "partially paid" || s === "part paid"
}

/** UI label for cashflow assignee party (staff vs third-party agent). */
export function formatExpenseCashflowAssignedPartyLabel(
  assignedType: "staff" | "client" | "third_party_agent" | string | null | undefined,
): string | null {
  const t = String(assignedType || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
  if (t === "staff") return "Staff"
  if (t === "client" || t === "third party agent" || t === "clients") return "Third Party Agent"
  return null
}
