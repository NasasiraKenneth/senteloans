import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import type { PoolClient } from "pg"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  type ActorContext,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
  scopeWhere,
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { auditLogger } from "@/lib/audit/audit-logger"

type CreateBranchError =
  | "actor_branch_missing"
  | "branch_id_required"
  | "branch_not_found"
  | "branch_inactive"
  | "cross_branch_operation_forbidden"
  | "cross_tenant_operation_forbidden"

async function resolveCreateBranchId(
  client: PoolClient,
  actor: ActorContext,
  bodyBranchId: unknown,
): Promise<
  | { ok: true; branchId: string }
  | { ok: false; error: CreateBranchError; branchStatus?: string }
> {
  const requestedBranchId =
    bodyBranchId != null && String(bodyBranchId).trim() !== ""
      ? String(bodyBranchId).trim()
      : ""

  if (isSuperAdmin(actor)) {
    const branchId = requestedBranchId || String(actor.branch_id || "").trim()
    if (!branchId) return { ok: false, error: "branch_id_required" }

    const branchCheck = await assertBranchActive(client, branchId)
    if (!branchCheck.ok) {
      return {
        ok: false,
        error: branchCheck.error === "branch_inactive" ? "branch_inactive" : "branch_not_found",
        ...(branchCheck.error === "branch_inactive" ? { branchStatus: branchCheck.status } : {}),
      }
    }
    if (branchCheck.branch.institution_id !== actor.institution_id) {
      return { ok: false, error: "cross_tenant_operation_forbidden" }
    }
    return { ok: true, branchId }
  }

  if (!actor.branch_id) return { ok: false, error: "actor_branch_missing" }
  if (requestedBranchId && requestedBranchId !== String(actor.branch_id)) {
    return { ok: false, error: "cross_branch_operation_forbidden" }
  }

  const branchCheck = await assertBranchActive(client, actor.branch_id)
  if (!branchCheck.ok) {
    return {
      ok: false,
      error: branchCheck.error === "branch_inactive" ? "branch_inactive" : "branch_not_found",
      ...(branchCheck.error === "branch_inactive" ? { branchStatus: branchCheck.status } : {}),
    }
  }
  return { ok: true, branchId: actor.branch_id }
}

function createErrorStatus(error: string | undefined): number {
  const code = error || "unexpected_error"
  if (code.startsWith("missing_permission:")) return 403
  if (code === "no_app_user_profile") return 403
  if (code === "staff_inactive") return 403
  if (code === "cross_branch_operation_forbidden") return 403
  if (code === "cross_tenant_operation_forbidden") return 403
  if (code === "branch_inactive") return 403
  return 400
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
     FROM loan_products
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
 * Query params: status (defaults to Active), page, pageSize
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
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 200)
    const q = (url.searchParams.get("q") || "").trim()
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      if (!isSuperAdmin(actor) && !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const allowed = await hasPermission(client, actor, "view_loan_products")
      if (!allowed) return { error: "missing_permission:view_loan_products" as const }

      const scoped = scopeWhere({
        tableAlias: "lp",
        actor,
        selectedBranchIds,
        startIndex: 1,
      })
      let where = scoped.where
      const params: unknown[] = scoped.values
      let idx = scoped.nextIndex

      if (status) {
        where += ` AND lp.status = $${idx++}`
        params.push(status)
      }
      if (q) {
        where += ` AND (lp.product_name ILIKE $${idx} OR lp.product_code ILIKE $${idx})`
        params.push(`%${q}%`)
        idx++
      }
      const countRes = await client.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c
         FROM loan_products lp
         WHERE ${where}`,
        params
      )
      const total = Number(countRes.rows[0]?.c || 0)
      const offset = (page - 1) * pageSize
      params.push(pageSize, offset)
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
         FROM loan_products lp
         LEFT JOIN loan_product_eligibilities lpe ON lpe.loan_product_id = lp.id
         WHERE ${where}
         GROUP BY lp.id
         ORDER BY lp.product_name ASC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      )
      return { items: res.rows, total, page, pageSize }
    })

    if (result && "error" in result) {
      const statusCode = createErrorStatus(result.error)
      apiLog("warn", "loan_products.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }

    const items = result?.items || []
    apiLog("info", "loan_products.list.success", { method: "GET", apiPath, status: 200, count: items.length, authUserId: session.user.authUserId })
    return NextResponse.json({ items, total: result?.total || 0, page: result?.page || page, pageSize: result?.pageSize || pageSize })
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
      branch_id: branchIdInput,
    } = body

    if (!product_name || !product_code || !minimum_amount || !maximum_amount || !interest_rate || !minimum_tenure_months || !maximum_tenure_months) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      const actorCheck = await assertActorActive(client, actor)
      if (!actorCheck.ok) return { error: "staff_inactive" as const }

      if (!isSuperAdmin(actor) && !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const allowed = await hasPermission(client, actor, "create_loan_product")
      if (!allowed) return { error: "missing_permission:create_loan_product" as const }

      const branchRes = await resolveCreateBranchId(client, actor, branchIdInput)
      if (!branchRes.ok) return { error: branchRes.error, branchStatus: branchRes.branchStatus }
      const branchId = branchRes.branchId

      const instRes = await client.query(
        `SELECT name AS institution_name
         FROM institutions
         WHERE id = $1
         LIMIT 1`,
        [actor.institution_id]
      )
      const institutionName = String(instRes.rows[0]?.institution_name || "")
      if (!institutionName) throw new Error("Institution name not found")

      const generatedProductCode = await buildNextProductCode(
        client,
        actor.institution_id,
        institutionName,
        product_code,
      )

      const normalizedEligibilities = Array.isArray(eligibilities)
        ? Array.from(
            new Map(
              eligibilities
                .map((item: { eligibility?: unknown; status?: unknown }) => ({
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
          `INSERT INTO loan_products
           (institution_id, branch_id, product_name, product_code, description, minimum_amount, maximum_amount,
            interest_rate, minimum_tenure_months, maximum_tenure_months, interest_calculation_method,
            collateral_required, guarantors_required, processing_fee_percentage, insurance_required, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING id`,
          [
            actor.institution_id, branchId, product_name, generatedProductCode, description || null,
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
            `INSERT INTO loan_product_eligibilities (loan_product_id, eligibility, status)
             VALUES ($1, $2, $3)
             ON CONFLICT (loan_product_id, eligibility)
             DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
            [product.id, item.eligibility, item.status]
          )
        }
        await auditLogger.logInsert(
          "loan_products",
          String(product.id),
          {
            product_name,
            product_code: generatedProductCode,
            branch_id: branchId,
            description: description || null,
            minimum_amount,
            maximum_amount,
            interest_rate,
            minimum_tenure_months,
            maximum_tenure_months,
            interest_calculation_method: interest_calculation_method || "reducing_balance",
            collateral_required: collateral_required || false,
            guarantors_required: guarantors_required || 0,
            processing_fee_percentage: processing_fee_percentage || 0,
            insurance_required: insurance_required || false,
            status: status || "Active",
            eligibilities: normalizedEligibilities,
          },
          actor.institution_id,
          actor.id,
          { branch_id: branchId },
          client
        )

        await client.query("COMMIT")
        return product
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    })

    if (result && "error" in result) {
      const statusCode = createErrorStatus(String(result.error))
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
