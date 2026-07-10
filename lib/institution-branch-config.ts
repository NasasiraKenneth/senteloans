/** Shared branch `config` row normalization for institution and client APIs. */

export type BranchConfigModules = {
  loans: boolean
  shares: boolean
  savings: boolean
  mobile_money: boolean
  chats: boolean
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

export function readInstitutionConfigString(
  config: Record<string, unknown> | null | undefined,
  key: string,
  fallback: string,
): string {
  return readString(config, key) ?? fallback
}

export function readClientTerminology(
  config: Record<string, unknown> | null | undefined,
  fallback = "Member",
): string {
  return readInstitutionConfigString(config, "clientTerminology", fallback)
}

export function readInstitutionCurrency(
  config: Record<string, unknown> | null | undefined,
  fallback = "UGX",
): string {
  return readInstitutionConfigString(config, "currency", fallback)
}

export function readInstitutionConfigModuleEnabled(
  config: Record<string, unknown> | null | undefined,
  module: keyof BranchConfigModules,
): boolean {
  const modules = config?.modules
  if (!modules || typeof modules !== "object" || Array.isArray(modules)) return false
  return toConfigFlag((modules as Record<string, unknown>)[module], false)
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
      chats: toConfigFlag(row.chats, false),
    },
    currency: readString(row, "currency") || "UGX",
    clientTerminology: clientTerminologyForInstitutionType(institutionType),
  }
}
