import { getSession } from "@/lib/session"

const DEFAULT_CURRENCY = "UGX"

/**
 * Resolve the active branch currency from the cached session.
 * The value originates from the `config.currency` column for the branch.
 * Falls back to UGX when unavailable (e.g. on the server or pre-login).
 */
export function getBranchCurrency(): string {
  const session = getSession()
  const code = session?.institution?.config?.currency
  return typeof code === "string" && code.trim() ? code.trim() : DEFAULT_CURRENCY
}

/**
 * Format a money value using the branch currency.
 *
 * - Pass an explicit `currency` (ISO code like "UGX"/"KES"/"USD") to override.
 * - When omitted, the branch currency is read from the session config.
 * - If the stored value isn't a valid ISO code (e.g. a raw symbol), it is
 *   gracefully prefixed instead of throwing.
 */
export function formatCurrency(amount: number | null | undefined, currency?: string): string {
  const code = currency && currency.trim() ? currency.trim() : getBranchCurrency()
  const value = Number(amount) || 0

  try {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
    }).format(value)
  } catch {
    // `code` isn't a valid ISO 4217 currency code — treat it as a symbol/prefix.
    return `${code} ${value.toLocaleString()}`
  }
}
