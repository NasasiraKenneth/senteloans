import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"

type ActorContext = {
  id: string
  institution_id: string
  branch_id: string | null
  role_id: string | null
  role: string | null
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
}

const deriveInstitutionInitials = (institutionName: string): string => {
  const parts = institutionName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return "INST"
  const initials = parts.map((p) => p[0]).join("").slice(0, 6)
  return initials || "INST"
}

const normalizeShortProductCode = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim()

const buildNextProductCode = async (
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ product_code: string }> }> },
  institutionId: string,
  institutionName: string,
  shortCodeInput: string
): Promise<string> => {
  const institutionInitials = deriveInstitutionInitials(institutionName)
  const shortCode = normalizeShortProductCode(shortCodeInput)
  if (!shortCode) throw new Error("invalid_product_code")

  const prefix = `${institutionInitials}-${shortCode}-`
  const res = await client.query(
    `SELECT product_code
     FROM senteloans_loan_products
     WHERE institution_id = $1
       AND product_code LIKE $2`,
    [institutionId, `${prefix}%`]
  )

  const maxSeq = res.rows.reduce((max, row) => {
    const m = String(row.product_code || "").match(/-(\d+)$/)
    if (!m) return max
    const n = Number(m[1])
    return Number.isFinite(n) && n > max ? n : max
  }, 0)

  const nextSeq = String(maxSeq + 1).padStart(3, "0")
  return `${prefix}${nextSeq}`
}

/**
 * GET /api/institution/loan-products
 * Query params: status (defaults to Active), limit
 */
export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loan_products.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "loan_products.list.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const url = new URL(req.url)
    const statusParam = url.searchParams.get("status")
    const status = statusParam === null ? "Active" : statusParam
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10), 1), 200)
    const q = (url.searchParams.get("q") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_loan_products")
      if (!allowed) return { error: "missing_permission:view_loan_products" as const }

      let where = "lp.institution_id = $1"
      const params: unknown[] = [actor.institution_id]
      let idx = 2
      const role = String(actor.role || "").trim().toLowerCase()
      const isSuperAdmin = role === "super_admin"
      if (!isSuperAdmin) {
        if (!actor.branch_id) return { error: "actor_branch_missing" as const }
        where += ` AND lp.branch_id = $${idx++}`
        params.push(actor.branch_id)
      } else if (selectedBranchIds.length > 0) {
        where += ` AND lp.branch_id = ANY($${idx++}::uuid[])`
        params.push(selectedBranchIds)
      }
      if (status) {
        where += ` AND lp.status = $${idx++}`
        params.push(status)
      }
      if (q) {
        where += ` AND (lp.product_name ILIKE $${idx} OR lp.product_code ILIKE $${idx})`
        params.push(`%${q}%`)
        idx++
      }
      params.push(limit)
      const res = await client.query(
        `SELECT
           lp.id,
           lp.product_name,
           lp.product_code,
           lp.description,
           lp.minimum_amount,
           lp.maximum_amount,
           lp.interest_rate,
           lp.minimum_tenure_months,
           lp.maximum_tenure_months,
           lp.interest_calculation_method,
           lp.collateral_required,
           lp.guarantors_required,
           lp.processing_fee_percentage,
           lp.insurance_required,
           lp.status,
           COALESCE(
             json_agg(
               json_build_object(
                 'id', lpe.id,
                 'eligibility', lpe.eligibility,
                 'status', lpe.status
               )
               ORDER BY lpe.created_at ASC
             ) FILTER (WHERE lpe.id IS NOT NULL),
             '[]'::json
           ) AS eligibilities
         FROM senteloans_loan_products lp
         LEFT JOIN senteloans_loan_product_eligibilities lpe ON lpe.loan_product_id = lp.id
         WHERE ${where}
         GROUP BY lp.id
         ORDER BY lp.product_name ASC
         LIMIT $${idx}`,
        params
      )
      return { items: res.rows }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:view_loan_products" ? 403 :
        result.error === "no_app_user_profile" ? 403 :
        result.error === "actor_branch_missing" ? 400 : 400
      apiLog("warn", "loan_products.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    const items = result?.items || []
    apiLog("info", "loan_products.list.success", { method: "GET", apiPath, status: 200, count: items.length, authUserId: session.user.authUserId })
    return NextResponse.json({ items })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loan_products.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * POST /api/institution/loan-products
 * Create a new loan product
 */
export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loan_products.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "loan_products.create.denied", { method: "POST", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const body = await req.json()
    const {
      product_name, product_code, description,
      minimum_amount, maximum_amount, interest_rate,
      minimum_tenure_months, maximum_tenure_months,
      interest_calculation_method, collateral_required,
      guarantors_required, processing_fee_percentage,
      insurance_required, status, eligibilities,
    } = body

    if (!product_name || !product_code || !minimum_amount || !maximum_amount || !interest_rate || !minimum_tenure_months || !maximum_tenure_months) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "create_loan_product")
      if (!allowed) return { error: "missing_permission:create_loan_product" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      const instRes = await client.query(
        `SELECT u.institution_id, i.name AS institution_name
         FROM senteloans_users u
         JOIN senteloans_institutions i ON i.id = u.institution_id
         WHERE u.supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const institutionId = instRes.rows[0]?.institution_id
      const institutionName = String(instRes.rows[0]?.institution_name || "")
      if (!institutionId) throw new Error("Institution not found")
      if (!institutionName) throw new Error("Institution name not found")

      const generatedProductCode = await buildNextProductCode(client, institutionId, institutionName, product_code)

      const normalizedEligibilities = Array.isArray(eligibilities)
        ? Array.from(
            new Map(
              eligibilities
                .map((item: any) => ({
                  eligibility: String(item?.eligibility || "").trim(),
                  status: String(item?.status || "Active") === "Inactive" ? "Inactive" : "Active",
                }))
                .filter((item) => item.eligibility)
                .map((item) => [item.eligibility.toLowerCase(), item])
            ).values()
          )
        : []

      await client.query("BEGIN")
      try {
        const res = await client.query(
          `INSERT INTO senteloans_loan_products
           (institution_id, branch_id, product_name, product_code, description, minimum_amount, maximum_amount,
            interest_rate, minimum_tenure_months, maximum_tenure_months, interest_calculation_method,
            collateral_required, guarantors_required, processing_fee_percentage, insurance_required, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING id`,
          [
            institutionId, actor.branch_id, product_name, generatedProductCode, description || null,
            minimum_amount, maximum_amount, interest_rate,
            minimum_tenure_months, maximum_tenure_months,
            interest_calculation_method || "reducing_balance",
            collateral_required || false, guarantors_required || 0,
            processing_fee_percentage || 0, insurance_required || false,
            status || "Active",
          ]
        )
        const product = res.rows[0]

        for (const item of normalizedEligibilities) {
          await client.query(
            `INSERT INTO senteloans_loan_product_eligibilities (loan_product_id, eligibility, status)
             VALUES ($1, $2, $3)
             ON CONFLICT (loan_product_id, eligibility)
             DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
            [product.id, item.eligibility, item.status]
          )
        }

        await client.query("COMMIT")
        return product
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    })

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:create_loan_product" ? 403 :
        result.error === "no_app_user_profile" ? 403 :
        result.error === "actor_branch_missing" ? 400 : 400
      apiLog("warn", "loan_products.create.denied", { method: "POST", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    apiLog("info", "loan_products.create.success", { method: "POST", apiPath, status: 201, productId: result?.id, authUserId: session.user.authUserId })
    return NextResponse.json({ id: result?.id }, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    if (err?.message?.includes("uk_loan_products_code")) {
      apiLog("warn", "loan_products.create.conflict", { method: "POST", apiPath, status: 409, error: "uk_loan_products_code" })
      return NextResponse.json({ error: "A product with this code already exists" }, { status: 409 })
    }
    apiLog("error", "loan_products.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
