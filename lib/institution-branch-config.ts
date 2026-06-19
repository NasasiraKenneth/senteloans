/** Shared branch `config` row normalization for institution and client APIs. */

export type BranchConfigModules = {
  loans: boolean
  shares: boolean
  savings: boolean
  mobile_money: boolean
}

export type NormalizedBranchConfig = {
  modules: BranchConfigModules
  currency: string
  clientTerminology: string
}

const readString = (obj: Record<string, unknown> | null | undefined, ...keys: string[]): string | undefined => {
  if (!obj) return undefined
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "string" && value.trim().length > 0) return value
  }
  return undefined
}

export const toConfigFlag = (v: unknown, fallback = false): boolean => {
  if (typeof v === "boolean") return v
  const s = String(v ?? "").trim().toLowerCase()
  if (s === "true") return true
  if (s === "false") return false
  return fallback
}

/** Map DB institution `type` values to client-facing terminology. */
export function clientTerminologyForInstitutionType(type: string): string {
  const normalized = type.trim().toLowerCase()
  if (normalized === "sacco") return "Member"
  if (normalized === "mfi") return "Client"
  if (normalized === "money lender") return "Borrower"
  return "Member"
}

export function isMoneyLenderInstitutionType(type: string): boolean {
  return type.trim().toLowerCase() === "money lender"
}

export function normalizeBranchConfig(
  cfg: Record<string, unknown> | null | undefined,
  institutionType: string,
): NormalizedBranchConfig {
  const row = cfg || {}
  return {
    modules: {
      loans: toConfigFlag(row.loans, false),
      shares: toConfigFlag(row.shares, false),
      savings: toConfigFlag(row.savings, false),
      mobile_money: toConfigFlag(row.mobile_money, false),
    },
    currency: readString(row, "currency") || "UGX",
    clientTerminology: clientTerminologyForInstitutionType(institutionType),
  }
}
