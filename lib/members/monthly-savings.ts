export type RegistrationSavingsType = "Voluntary" | "Fixed"

/** Parse monthly savings from registration/update payloads. */
export function parseMonthlySavingsInput(
  raw: unknown,
  accountType: RegistrationSavingsType,
): { value: number | null; error?: "monthly_savings_required_for_fixed_account" | "invalid_monthly_savings" } {
  const hasValue =
    raw !== undefined &&
    raw !== null &&
    !(typeof raw === "string" && raw.trim() === "")

  if (!hasValue) {
    if (accountType === "Fixed") {
      return { value: null, error: "monthly_savings_required_for_fixed_account" }
    }
    return { value: null }
  }

  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    if (accountType === "Fixed") {
      return { value: null, error: "monthly_savings_required_for_fixed_account" }
    }
    return { value: null, error: "invalid_monthly_savings" }
  }

  return { value: n }
}

/** Subquery for the member's primary (oldest) savings account monthly commitment. */
export const PRIMARY_SAVINGS_MONTHLY_SAVINGS_SQL = `(
  SELECT sa.monthly_savings
  FROM savings_accounts sa
  WHERE sa.member_id = c.id AND sa.institution_id = c.institution_id
  ORDER BY sa.created_at ASC
  LIMIT 1
) AS monthly_savings`
