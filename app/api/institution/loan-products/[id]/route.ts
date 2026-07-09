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
} from "@/lib/api/rbac"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import { auditLogger } from "@/lib/audit/audit-logger"

function productScopeWhere(
  actor: ActorContext,
  tableAlias: string,
  idParamIndex: number,
  institutionParamIndex: number,
) {
  if (isSuperAdmin(actor)) {
    return {
      clause: `${tableAlias}.id = $${idParamIndex}
               AND ${tableAlias}.institution_id = $${institutionParamIndex}`,
      params: [actor.institution_id],
    }
  }
  if (!actor.branch_id) {
    return { error: "actor_branch_missing" as const }
  }
  return {
    clause: `${tableAlias}.id = $${idParamIndex}
             AND ${tableAlias}.institution_id = $${institutionParamIndex}
             AND ${tableAlias}.branch_id = $${institutionParamIndex + 1}`,
    params: [actor.institution_id, actor.branch_id],
  }
}

function routeErrorStatus(error: string | undefined): number {
  const code = error || "unexpected_error"
  if (code.startsWith("missing_permission:")) return 403
  if (code === "no_app_user_profile") return 403
  if (code === "staff_inactive") return 403
  if (code === "branch_inactive") return 403
  if (code === "product_not_found") return 404
  if (code === "invalid_product_code") return 400
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

const extractShortCodeFromFull = (fullCode: string): string => {
  const parts = String(fullCode || "").split("-")
  if (parts.length >= 3) {
    const middle = parts.slice(1, -1).join("-")
    return normalizeShortProductCode(middle)
  }
  return normalizeShortProductCode(fullCode)
}

const buildNextProductCode = async (
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ product_code: string }> }> },
  institutionId: string,
  institutionName: string,
  shortCodeInput: string,
  excludeProductId?: string,
): Promise<string> => {
  const institutionInitials = deriveInstitutionInitials(institutionName)
  const shortCode = normalizeShortProductCode(shortCodeInput)
  if (!shortCode) throw new Error("invalid_product_code")

  const prefix = `${institutionInitials}-${shortCode}-`
  const params: unknown[] = [institutionId, `${prefix}%`]
  let sql = `SELECT product_code
             FROM loan_products
             WHERE institution_id = $1
               AND product_code LIKE $2`
  if (excludeProductId) {
    sql += ` AND id <> $3`
    params.push(excludeProductId)
  }
  const res = await client.query(sql, params)

  const maxSeq = res.rows.reduce((max, row) => {
    const m = String(row.product_code || "").match(/-(\d+)$/)
    if (!m) return max
    const n = Number(m[1])
    return Number.isFinite(n) && n > max ? n : max
  }, 0)

  const nextSeq = String(maxSeq + 1).padStart(3, "0")
  return `${prefix}${nextSeq}`
}

async function loadScopedProduct(
  client: PoolClient,
  actor: ActorContext,
  productId: string,
  options?: { includeInstitutionName?: boolean },
) {
  const scope = productScopeWhere(actor, "lp", 1, 2)
  if ("error" in scope) return { error: scope.error as "actor_branch_missing" }

  if (options?.includeInstitutionName) {
    const currentRes = await client.query(
      `SELECT lp.branch_id,
              lp.product_name, lp.product_code, lp.description,
              lp.minimum_amount, lp.maximum_amount, lp.interest_rate,
              lp.minimum_tenure_months, lp.maximum_tenure_months,
              lp.interest_calculation_method, lp.collateral_required, lp.guarantors_required,
              lp.processing_fee_percentage, lp.insurance_required, lp.status,
              $2::uuid AS institution_id, i.name AS institution_name
       FROM loan_products lp
       JOIN institutions i ON i.id = $2
       WHERE ${scope.clause}`,
      [productId, ...scope.params],
    )
    const current = currentRes.rows[0]
    if (!current) return { error: "product_not_found" as const }
    return { product: current }
  }

  const res = await client.query(
    `SELECT lp.id, lp.branch_id, lp.product_name, lp.product_code, lp.description,
            lp.minimum_amount, lp.maximum_amount, lp.interest_rate,
            lp.minimum_tenure_months, lp.maximum_tenure_months,
            lp.interest_calculation_method, lp.collateral_required, lp.guarantors_required,
            lp.processing_fee_percentage, lp.insurance_required, lp.status
     FROM loan_products lp
     WHERE ${scope.clause}`,
    [productId, ...scope.params],
  )
  const product = res.rows[0]
  if (!product) return { error: "product_not_found" as const }
  return { product }
}

/**
 * GET /api/institution/loan-products/[id]
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(_req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loan_products.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "loan_products.detail.denied", { method: "GET", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const { id } = await params

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      if (!isSuperAdmin(actor) && !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const allowed = await hasPermission(client, actor, "view_loan_products")
      if (!allowed) return { error: "missing_permission:view_loan_products" as const }

      const loaded = await loadScopedProduct(client, actor, id)
      if ("error" in loaded) return { error: loaded.error }
      const product = loaded.product

      const eligRes = await client.query(
        `SELECT id, eligibility, status
         FROM loan_product_eligibilities
         WHERE loan_product_id = $1
         ORDER BY created_at ASC`,
        [id],
      )

      return { ...product, eligibilities: eligRes.rows }
    })

    if (result && "error" in result) {
      const statusCode = routeErrorStatus(result.error)
      apiLog("warn", "loan_products.detail.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId, productId: id })
      return NextResponse.json({ error: result.error }, { status: statusCode })
    }
    if (!result) {
      apiLog("warn", "loan_products.detail.not_found", { method: "GET", apiPath, status: 404, authUserId: session.user.authUserId, productId: id })
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }
    apiLog("info", "loan_products.detail.success", { method: "GET", apiPath, status: 200, authUserId: session.user.authUserId, productId: id })
    return NextResponse.json({ product: result })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "loan_products.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

/**
 * PUT /api/institution/loan-products/[id]
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  let productId = ""
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "loan_products.update.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "loan_products.update.denied", { method: "PUT", apiPath, status: 403, error: "not_staff" })
      return NextResponse.json({ error: "not_staff" }, { status: 403 })
    }

    const { id } = await params
    productId = id
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

      const actorCheck = await assertActorActive(client, actor)
      if (!actorCheck.ok) return { error: "staff_inactive" as const }

      if (!isSuperAdmin(actor) && !actor.branch_id) {
        return { error: "actor_branch_missing" as const }
      }

      const allowed = await hasPermission(client, actor, "edit_loan_product")
      if (!allowed) return { error: "missing_permission:edit_loan_product" as const }

      const loaded = await loadScopedProduct(client, actor, id, { includeInstitutionName: true })
      if ("error" in loaded) return { error: loaded.error }
      const current = loaded.product

      const branchCheck = await assertBranchActive(client, String(current.branch_id))
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error === "branch_inactive" ? "branch_inactive" as const : "branch_not_found" as const,
        }
      }

      const requestedShortCode = normalizeShortProductCode(product_code)
      if (!requestedShortCode) return { error: "invalid_product_code" as const }

      const currentShortCode = extractShortCodeFromFull(String(current.product_code || ""))
      const finalProductCode =
        currentShortCode === requestedShortCode
          ? String(current.product_code)
          : await buildNextProductCode(
              client,
              String(current.institution_id),
              String(current.institution_name || ""),
              requestedShortCode,
              productId,
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
                .map((item) => [item.eligibility.toLowerCase(), item]),
            ).values(),
          )
        : []

      await client.query("BEGIN")
      try {
        const oldEligRes = await client.query(
          `SELECT eligibility, status
           FROM loan_product_eligibilities
           WHERE loan_product_id = $1
           ORDER BY created_at ASC`,
          [id],
        )
        const updateRes = await client.query(
          `UPDATE loan_products SET
             product_name = $1, product_code = $2, description = $3,
             minimum_amount = $4, maximum_amount = $5, interest_rate = $6,
             minimum_tenure_months = $7, maximum_tenure_months = $8,
             interest_calculation_method = $9, collateral_required = $10,
             guarantors_required = $11, processing_fee_percentage = $12,
             insurance_required = $13, status = $14, updated_at = NOW()
           WHERE id = $15
             AND institution_id = $16
             AND ($17::uuid IS NULL OR branch_id = $17::uuid)`,
          [
            product_name, finalProductCode, description || null,
            minimum_amount, maximum_amount, interest_rate,
            minimum_tenure_months, maximum_tenure_months,
            interest_calculation_method || "reducing_balance",
            collateral_required || false, guarantors_required || 0,
            processing_fee_percentage || 0, insurance_required || false,
            status || "Active", productId, actor.institution_id,
            isSuperAdmin(actor) ? null : actor.branch_id,
          ],
        )
        if ((updateRes.rowCount ?? 0) === 0) {
          await client.query("ROLLBACK")
          return { error: "product_not_found" as const }
        }

        await client.query(
          `DELETE FROM loan_product_eligibilities WHERE loan_product_id = $1`,
          [productId],
        )

        for (const item of normalizedEligibilities) {
          await client.query(
            `INSERT INTO loan_product_eligibilities (loan_product_id, eligibility, status)
             VALUES ($1, $2, $3)
             ON CONFLICT (loan_product_id, eligibility)
             DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
            [productId, item.eligibility, item.status],
          )
        }
        await auditLogger.logUpdate(
          "loan_products",
          productId,
          {
            product_name: current.product_name,
            product_code: current.product_code,
            description: current.description,
            minimum_amount: current.minimum_amount,
            maximum_amount: current.maximum_amount,
            interest_rate: current.interest_rate,
            minimum_tenure_months: current.minimum_tenure_months,
            maximum_tenure_months: current.maximum_tenure_months,
            interest_calculation_method: current.interest_calculation_method,
            collateral_required: current.collateral_required,
            guarantors_required: current.guarantors_required,
            processing_fee_percentage: current.processing_fee_percentage,
            insurance_required: current.insurance_required,
            status: current.status,
            eligibilities: oldEligRes.rows,
          },
          {
            product_name,
            product_code: finalProductCode,
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
          { branch_id: String(current.branch_id) },
          client,
        )

        await client.query("COMMIT")
        return { ok: true }
      } catch (err) {
        await client.query("ROLLBACK")
        throw err
      }
    })

    if (result && "error" in result) {
      const statusCode = routeErrorStatus(result.error)
      const message =
        result.error === "product_not_found"
          ? "Product not found"
          : result.error === "invalid_product_code"
            ? "Invalid product code"
            : result.error
      apiLog("warn", "loan_products.update.denied", { method: "PUT", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId, productId })
      return NextResponse.json({ error: message }, { status: statusCode })
    }

    apiLog("info", "loan_products.update.success", { method: "PUT", apiPath, status: 200, authUserId: session.user.authUserId, productId })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const err = e as Error
    if (err?.message === "product_not_found") {
      apiLog("warn", "loan_products.update.not_found", { method: "PUT", apiPath, status: 404, productId })
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }
    if (err?.message === "invalid_product_code") {
      apiLog("warn", "loan_products.update.invalid_request", { method: "PUT", apiPath, status: 400, error: "invalid_product_code", productId })
      return NextResponse.json({ error: "Invalid product code" }, { status: 400 })
    }
    if (err?.message?.includes("uk_loan_products_code")) {
      apiLog("warn", "loan_products.update.conflict", { method: "PUT", apiPath, status: 409, error: "uk_loan_products_code", productId })
      return NextResponse.json({ error: "A product with this code already exists" }, { status: 409 })
    }
    apiLog("error", "loan_products.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error", productId })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
