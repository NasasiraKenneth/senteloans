export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially paid"
  | "fully paid"
  | "overdue"
  | "cancelled"

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "draft",
  "sent",
  "partially paid",
  "fully paid",
  "overdue",
  "cancelled",
]

const STATUS_ALIASES: Record<string, InvoiceStatus> = {
  paid: "fully paid",
}

/** Normalize user/API input; maps legacy `paid` to `fully paid`. */
export function normalizeInvoiceStatus(
  value: unknown,
  fallback: InvoiceStatus = "draft",
): InvoiceStatus {
  const raw = String(value ?? "").trim().toLowerCase()
  if (!raw) return fallback
  const mapped = STATUS_ALIASES[raw] ?? raw
  return (INVOICE_STATUSES as readonly string[]).includes(mapped)
    ? (mapped as InvoiceStatus)
    : fallback
}

export function isAllowedInvoiceStatus(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase()
  if (!raw) return false
  const mapped = STATUS_ALIASES[raw] ?? raw
  return (INVOICE_STATUSES as readonly string[]).includes(mapped)
}

export function isPaidInvoiceStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase()
  return s === "fully paid" || s === "paid"
}

export function isPartiallyPaidInvoiceStatus(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase() === "partially paid"
}

export function isDraftInvoiceStatus(status: unknown): boolean {
  return normalizeInvoiceStatus(status, "draft") === "draft"
}

export function isCancelledInvoiceStatus(status: unknown): boolean {
  return normalizeInvoiceStatus(status, "draft") === "cancelled"
}

/** Only draft invoices may be fully edited (PUT). */
export function canEditInvoice(status: unknown): boolean {
  return isDraftInvoiceStatus(status)
}

export function getInvoiceEditBlockedReason(status: unknown): string | null {
  if (canEditInvoice(status)) return null
  const label = formatInvoiceStatusLabel(status).toLowerCase()
  return `Only draft invoices can be edited. This invoice is ${label}.`
}

/** Allowed manual status transitions from the datatable / PATCH endpoint. */
const STATUS_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["overdue", "cancelled"],
  overdue: ["cancelled"],
  "partially paid": ["overdue", "cancelled"],
  "fully paid": [],
  cancelled: [],
}

export function getAllowedInvoiceStatusTransitions(
  status: unknown,
): InvoiceStatus[] {
  const current = normalizeInvoiceStatus(status)
  return [...(STATUS_TRANSITIONS[current] ?? [])]
}

export function isInvoiceStatusTransitionAllowed(
  fromStatus: unknown,
  toStatus: unknown,
): boolean {
  const from = normalizeInvoiceStatus(fromStatus)
  const to = normalizeInvoiceStatus(toStatus)
  if (from === to) return false
  return getAllowedInvoiceStatusTransitions(from).includes(to)
}

export function isDraftToSentTransition(
  fromStatus: unknown,
  toStatus: unknown,
): boolean {
  return (
    normalizeInvoiceStatus(fromStatus) === "draft" &&
    normalizeInvoiceStatus(toStatus) === "sent"
  )
}

/** Notification side-effects to run after a successful manual status change. */
export function getInvoiceStatusNotificationKind(
  fromStatus: unknown,
  toStatus: unknown,
): "sent" | "cancelled" | "overdue" | null {
  const from = normalizeInvoiceStatus(fromStatus)
  const to = normalizeInvoiceStatus(toStatus)
  if (from === to) return null
  if (isDraftToSentTransition(from, to)) return "sent"
  if (to === "cancelled") return "cancelled"
  if (to === "overdue") return "overdue"
  return null
}

export function getInvoiceStatusTransitionBlockedReason(
  fromStatus: unknown,
  toStatus: unknown,
): string | null {
  const from = normalizeInvoiceStatus(fromStatus)
  const to = normalizeInvoiceStatus(toStatus)
  if (from === to) return "Invoice already has this status."
  if (isInvoiceStatusTransitionAllowed(from, to)) return null

  if (from === "cancelled") {
    return "Cancelled invoices cannot change status."
  }
  if (from === "fully paid") {
    return "Fully paid invoices cannot change status."
  }
  if (from === "partially paid") {
    return "Partially paid invoices can only be marked as overdue or cancelled."
  }
  if (from === "sent" && to === "draft") {
    return "Sent invoices cannot be marked as draft."
  }
  if (from === "overdue" && to === "sent") {
    return "Overdue invoices cannot be marked as sent."
  }

  const allowed = getAllowedInvoiceStatusTransitions(from)
  if (allowed.length === 0) {
    return `${formatInvoiceStatusLabel(from)} invoices cannot change status.`
  }
  return `Cannot change status from ${formatInvoiceStatusLabel(from).toLowerCase()} to ${formatInvoiceStatusLabel(to).toLowerCase()}.`
}

/** Status values that match a list/tab filter (e.g. `paid` includes legacy + fully paid). */
export function expandStatusFilter(statusParam: string): string[] {
  const s = statusParam.trim().toLowerCase()
  if (!s) return []
  if (s === "paid") return ["paid", "fully paid"]
  return [normalizeInvoiceStatus(s)]
}

export function formatInvoiceStatusLabel(status: unknown): string {
  const normalized = normalizeInvoiceStatus(status, "draft")
  if (normalized === "fully paid") return "Fully Paid"
  if (normalized === "partially paid") return "Partially Paid"
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

/** Map UI/API filter values to invoice target column semantics. */
export function normalizeTargetTypeFilter(value: string): "member" | "third_party_agent" | "" {
  const t = value.trim().toLowerCase()
  if (t === "member") return "member"
  if (t === "third_party_agent" || t === "client") return "third_party_agent"
  return ""
}

/** Whether staff can record a payment against this invoice (UI + API). */
export function canRecordInvoicePayment(input: {
  status: unknown
  total_amount?: number
  paid_amount?: number
  outstanding?: number
}): boolean {
  const status = normalizeInvoiceStatus(input.status)
  if (status === "fully paid" || status === "cancelled" || status === "draft") {
    return false
  }
  const total = Number(input.total_amount || 0)
  const paid = Number(input.paid_amount || 0)
  const outstanding =
    typeof input.outstanding === "number"
      ? Math.max(input.outstanding, 0)
      : Math.max(total - paid, 0)
  return outstanding > 0
}
