export type ParsedLoanProductBody = {
  product_name: string
  product_code: string
  description: string | null
  minimum_amount: number
  maximum_amount: number
  interest_rate: number
  minimum_tenure_months: number
  maximum_tenure_months: number
  interest_calculation_method: string
  collateral_required: boolean
  guarantors_required: number
  processing_fee_percentage: number
  insurance_required: boolean
  status: string
  eligibilities: unknown
  branch_id?: string | null
}

export type ParseLoanProductBodyResult =
  | { ok: true; data: ParsedLoanProductBody }
  | { ok: false; error: string }

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  const normalized = String(value ?? "").replace(/,/g, "").trim()
  if (!normalized) return NaN
  return Number(normalized)
}

function toInt(value: unknown): number {
  const n = toNumber(value)
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

export function parseLoanProductBody(body: Record<string, unknown>): ParseLoanProductBodyResult {
  const product_name = String(body.product_name ?? "").trim()
  const product_code = String(body.product_code ?? "").trim()
  const descriptionRaw = body.description
  const description =
    descriptionRaw === null || descriptionRaw === undefined || String(descriptionRaw).trim() === ""
      ? null
      : String(descriptionRaw).trim()

  const minimum_amount = toNumber(body.minimum_amount)
  const maximum_amount = toNumber(body.maximum_amount)
  const interest_rate = toNumber(body.interest_rate)
  const minimum_tenure_months = toInt(body.minimum_tenure_months)
  const maximum_tenure_months = toInt(body.maximum_tenure_months)
  const guarantors_required = toInt(body.guarantors_required)
  const processing_fee_percentage = toNumber(body.processing_fee_percentage)

  if (!product_name) return { ok: false, error: "Missing required fields" }
  if (!product_code) return { ok: false, error: "Missing required fields" }
  if (!Number.isFinite(minimum_amount) || minimum_amount <= 0) return { ok: false, error: "Missing required fields" }
  if (!Number.isFinite(maximum_amount) || maximum_amount <= 0) return { ok: false, error: "Missing required fields" }
  if (!Number.isFinite(interest_rate) || interest_rate < 0) return { ok: false, error: "Missing required fields" }
  if (!Number.isFinite(minimum_tenure_months) || minimum_tenure_months <= 0) {
    return { ok: false, error: "Missing required fields" }
  }
  if (!Number.isFinite(maximum_tenure_months) || maximum_tenure_months <= 0) {
    return { ok: false, error: "Missing required fields" }
  }
  if (maximum_amount < minimum_amount) return { ok: false, error: "maximum_amount_below_minimum" }
  if (maximum_tenure_months < minimum_tenure_months) return { ok: false, error: "maximum_tenure_below_minimum" }

  const branch_id =
    body.branch_id != null && String(body.branch_id).trim() !== "" ? String(body.branch_id).trim() : null

  return {
    ok: true,
    data: {
      product_name,
      product_code,
      description,
      minimum_amount,
      maximum_amount,
      interest_rate,
      minimum_tenure_months,
      maximum_tenure_months,
      interest_calculation_method: String(body.interest_calculation_method || "reducing_balance").trim(),
      collateral_required: Boolean(body.collateral_required),
      guarantors_required: Number.isFinite(guarantors_required) && guarantors_required >= 0 ? guarantors_required : 0,
      processing_fee_percentage:
        Number.isFinite(processing_fee_percentage) && processing_fee_percentage >= 0 ? processing_fee_percentage : 0,
      insurance_required: Boolean(body.insurance_required),
      status: String(body.status || "Active").trim() || "Active",
      eligibilities: body.eligibilities,
      branch_id,
    },
  }
}
