import { getInstitutionCurrency } from "@/lib/session"

const DEFAULT_CURRENCY = "UGX"

/**
 * Resolve the active branch currency from the cached session.
 * The value originates from the `config.currency` column for the branch.
 * Falls back to UGX when unavailable (e.g. on the server or pre-login).
 */
export function getBranchCurrency(): string {
  return getInstitutionCurrency(DEFAULT_CURRENCY)
}

/**
 * Format a money value using the branch currency.
 *
 * - Pass an explicit `currency` (ISO code like "UGX"/"KES"/"USD") to override.
 * - When omitted, the branch currency is read from the session config.
 * - By default, whole amounts omit decimals (1,000 not 1,000.00); fractional
 *   amounts show two decimal places (1,000.23, 1,000.10). Pass `fractionDigits`
 *   to force a fixed number of decimal places.
 * - If the stored value isn't a valid ISO code (e.g. a raw symbol), it is
 *   gracefully prefixed instead of throwing.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency?: string,
  options?: { fractionDigits?: number },
): string {
  const code = currency && currency.trim() ? currency.trim() : getBranchCurrency()
  const normalized = Math.round((Number(amount) || 0) * 100) / 100

  let minimumFractionDigits: number
  let maximumFractionDigits: number
  if (options?.fractionDigits !== undefined) {
    minimumFractionDigits = options.fractionDigits
    maximumFractionDigits = options.fractionDigits
  } else {
    const isWholeNumber = Number.isInteger(normalized)
    minimumFractionDigits = isWholeNumber ? 0 : 2
    maximumFractionDigits = isWholeNumber ? 0 : 2
  }

  try {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: code,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(normalized)
  } catch {
    // `code` isn't a valid ISO 4217 currency code — treat it as a symbol/prefix.
    return `${code} ${normalized.toLocaleString("en-UG", {
      minimumFractionDigits,
      maximumFractionDigits,
    })}`
  }
}
