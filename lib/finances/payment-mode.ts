export const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

export type PaymentMode = (typeof PAYMENT_MODES)[number]

export const PAYMENT_MODE_OPTIONS = PAYMENT_MODES.map((value) => ({ value, label: value }))

export function normalizePaymentMode(raw: unknown): PaymentMode | null {
  const s = String(raw || "").trim()
  if (!s) return null
  const lower = s.toLowerCase().replace(/[_-]+/g, " ")
  if (lower === "cash") return "Cash"
  if (lower === "mobile money" || lower === "mobile") return "Mobile Money"
  if (lower === "bank transfer" || lower === "bank") return "Bank Transfer"
  if (lower === "cheque" || lower === "check") return "Cheque"
  if (lower === "card") return "Card"
  const exact = PAYMENT_MODES.find((m) => m.toLowerCase() === lower)
  return exact || null
}
