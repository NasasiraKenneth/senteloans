import { NextResponse } from "next/server"
import { runWithAuth } from "@/lib/db"
import {
  auditExpenseUpdate,
  expenseSnapshot,
} from "@/lib/audit/expense-audit"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { expenseFundingStatusBlock } from "@/lib/api/expense-funding-guard"
import {
  createExpenseCashflow,
} from "@/lib/expenses/create-expense"
import {
  isSettledExpenseCashflowStatus,
  mapExpensePaymentSettlementFailure,
  normalizeExpenseCashflowPaymentStatus,
  recordFullyPaidExpenseCashflow,
  recordUnpaidExpenseCashflow,
} from "@/lib/expenses/record-expense-cashflow-payment"
import { PaymentSettlementFailure, validatePaymentModeInput } from "@/lib/finances/settle-payment-mode"
import { requireStaffSession } from "@/lib/api/rbac"
import {
  assertExpenseWriteAccess,
  expenseScopeWhere,
  mapExpenseMutationErrorResponse,
} from "@/lib/api/expense-access"

const PAYMENT_MODES = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"] as const

function normalizeExpenseStatus(s: string): string {
  return String(s || "").trim().toLowerCase()
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiPath = getApiPath(req)
  const { id: expenseId } = await params
  if (!expenseId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const assigneeRaw = String(body.assignee_type ?? body.type ?? "").trim().toLowerCase()
  const staffIdRaw = body.staff_id ?? body.staffId
  const thirdPartyAgentIdRaw = body.third_party_agent_id ?? body.thirdPartyAgentId
  const staffId = staffIdRaw != null && String(staffIdRaw).trim() !== "" ? String(staffIdRaw).trim() : ""
  const thirdPartyAgentId =
    thirdPartyAgentIdRaw != null && String(thirdPartyAgentIdRaw).trim() !== ""
      ? String(thirdPartyAgentIdRaw).trim()
      : ""

  const amount = Number(body.amount ?? 0)
  const descriptionRaw = body.description
  const description =
    descriptionRaw === null || descriptionRaw === undefined || String(descriptionRaw).trim() === ""
      ? null
      : String(descriptionRaw).trim()
  const date = String(body.date ?? "").trim()
  const modeRaw = String(body.mode ?? body.payment_method ?? body.transactionMode ?? "").trim()
  const mode = modeRaw || null
  const paymentStatus = normalizeExpenseCashflowPaymentStatus(
    body.payment_status ?? body.paymentStatus,
  )
  const referenceNumber = String(body.reference_number ?? body.referenceNumber ?? "").trim()
  const bankAccountId = String(body.bank_account_id ?? body.bankAccountId ?? "").trim()
  const transactionChargesRaw = body.transaction_charges ?? body.transactionCharges
  const transactionCharges =
    transactionChargesRaw == null || transactionChargesRaw === ""
      ? 0
      : Number(transactionChargesRaw)

  if (paymentStatus == null) {
    return NextResponse.json({ error: "invalid_payment_status" }, { status: 400 })
  }
  const isFullyPaid = paymentStatus === "fully_paid"

  if (assigneeRaw !== "staff" && assigneeRaw !== "clients") {
    return NextResponse.json({ error: "invalid_assignee_type" }, { status: 400 })
  }
  if (assigneeRaw === "staff" && !staffId) {
    return NextResponse.json({ error: "staff_id_required" }, { status: 400 })
  }
  if (assigneeRaw === "clients" && !thirdPartyAgentId) {
    return NextResponse.json({ error: "third_party_agent_id_required" }, { status: 400 })
  }
  if (assigneeRaw === "staff" && thirdPartyAgentId) {
    return NextResponse.json({ error: "third_party_agent_id_not_allowed_for_staff_cashflow" }, { status: 400 })
  }
  if (assigneeRaw === "clients" && staffId) {
    return NextResponse.json({ error: "staff_id_not_allowed_for_client_cashflow" }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 })
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
  }

  if (isFullyPaid) {
    if (!mode) {
      return NextResponse.json({ error: "mode_required" }, { status: 400 })
    }
    if (!PAYMENT_MODES.includes(mode as (typeof PAYMENT_MODES)[number])) {
      return NextResponse.json({ error: "invalid_payment_method" }, { status: 400 })
    }
    if (!Number.isFinite(transactionCharges) || transactionCharges < 0) {
      return NextResponse.json({ error: "invalid_transaction_charges" }, { status: 400 })
    }
    if (mode === "Cash" && transactionCharges > 0) {
      return NextResponse.json({ error: "transaction_charges_not_allowed" }, { status: 400 })
    }
    const paymentModeError = validatePaymentModeInput({
      mode,
      referenceNumber,
      bankAccountId,
    })
    if (paymentModeError) {
      return NextResponse.json({ error: paymentModeError }, { status: 400 })
    }
  }

  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "expenses.cashflows.create.denied", { method: "POST", apiPath, status: sess.status, error: sess.error })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseWriteAccess(client, sess.authUserId, "record_cashflow")
      if (!access.ok) {
        return {
          error: access.error,
          message: access.message,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const { where, values } = expenseScopeWhere(actor, expenseId)
      const exRes = await client.query<{
        id: string
        branch_id: string
        status: string
        expense_number: string | null
        name: string | null
        description: string | null
        type: string | null
        approved_by: string | null
        approved_at: string | null
        rejected_by: string | null
        rejected_at: string | null
        completed_by: string | null
        completed_at: string | null
      }>(
        `SELECT e.id, e.branch_id, e.status, e.expense_number, e.name, e.description, e.type,
                e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at
         FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      )
      const expense = exRes.rows[0]
      if (!expense) return { error: "not_found" as const }
      const blocked = expenseFundingStatusBlock(String(expense.status || ""))
      if (blocked) return blocked

      const expenseStatusNorm = normalizeExpenseStatus(String(expense.status || ""))
      if (isFullyPaid && expenseStatusNorm !== "approved" && expenseStatusNorm !== "active") {
        return {
          error: "expense_not_approved_or_active" as const,
          message:
            "Fully paid cashflows can only be recorded when the expense is approved or active." as const,
        }
      }

      const branchId = String(expense.branch_id || "")
      const instId = actor.institution_id
      const expenseNumber = String(expense.expense_number || "").trim() || expenseId.slice(0, 8)

      if (assigneeRaw === "staff") {
        const s = await client.query(
          `SELECT u.id FROM users u
           WHERE u.id = $1::uuid AND u.institution_id = $2::uuid AND u.branch_id = $3::uuid
           LIMIT 1`,
          [staffId, instId, branchId],
        )
        if ((s.rowCount ?? 0) === 0) return { error: "invalid_staff" as const }
      } else {
        const c = await client.query(
          `SELECT id FROM third_party_agents
           WHERE id = $1::uuid AND institution_id = $2::uuid AND branch_id = $3::uuid
           LIMIT 1`,
          [thirdPartyAgentId, instId, branchId],
        )
        if ((c.rowCount ?? 0) === 0) return { error: "invalid_third_party_agent" as const }
      }

      const resolvedStaffId = assigneeRaw === "staff" ? staffId : null
      const resolvedAgentId = assigneeRaw === "clients" ? thirdPartyAgentId : null

      if (!isFullyPaid) {
        await client.query("BEGIN")
        let committed = false
        try {
          const recorded = await recordUnpaidExpenseCashflow({
            client,
            actor,
            institutionId: instId,
            branchId,
            expenseId,
            expenseNumber,
            staffId: resolvedStaffId,
            thirdPartyAgentId: resolvedAgentId,
            amount,
            date,
            description,
          })
          await client.query("COMMIT")
          committed = true
          const response = await buildCashflowResponse(client, recorded.cashflow, actor.id)
          return {
            ...response,
            payment_status: "unpaid" as const,
            transaction: {
              id: recorded.transactionId,
              transaction_number: recorded.transactionNumber,
            },
          }
        } catch (e: unknown) {
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            return { error: "transaction_insert_failed" as const }
          }
          throw e
        } finally {
          if (!committed) {
            await client.query("ROLLBACK").catch(() => undefined)
          }
        }
      }

      await client.query("BEGIN")
      let committed = false
      try {
        const cnt = await client.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c
           FROM expense_cashflows
           WHERE expense_id = $1::uuid
             AND LOWER(TRIM(COALESCE(status::text, ''))) IN ('completed', 'paid', 'fully paid')`,
          [expenseId],
        )
        const priorCompletedCashflowCount = Number(cnt.rows[0]?.c ?? 0)

        let settled: Awaited<ReturnType<typeof recordFullyPaidExpenseCashflow>>
        try {
          settled = await recordFullyPaidExpenseCashflow({
            client,
            actor,
            institutionId: instId,
            branchId,
            expenseId,
            expenseNumber,
            staffId: resolvedStaffId,
            thirdPartyAgentId: resolvedAgentId,
            amount,
            mode: mode!,
            date,
            description,
            referenceNumber,
            bankAccountId,
            charges: transactionCharges,
          })
        } catch (e: unknown) {
          if (e instanceof PaymentSettlementFailure) {
            return { error: mapExpensePaymentSettlementFailure(e) as string }
          }
          const msg = (e as Error)?.message || ""
          if (msg === "transaction_insert_failed") {
            return { error: "transaction_insert_failed" as const }
          }
          throw e
        }

        const created = settled.cashflow

        let expenseStatus: string | undefined
        if (priorCompletedCashflowCount === 0 && expenseStatusNorm === "approved") {
          const expUpd = await client.query(
            `UPDATE expenses e
             SET status = 'Active', updated_at = NOW()
             WHERE e.id = $1::uuid
               AND e.institution_id = $2::uuid
               AND LOWER(TRIM(COALESCE(e.status::text, ''))) = 'approved'
             RETURNING e.id, e.expense_number, e.name, e.description, e.status, e.type, e.branch_id,
                       e.approved_by, e.approved_at, e.rejected_by, e.rejected_at, e.completed_by, e.completed_at`,
            [expenseId, instId],
          )
          const newExpRow = expUpd.rows[0] as Record<string, unknown> | undefined
          if (newExpRow) {
            await auditExpenseUpdate(
              client,
              actor,
              expenseId,
              expenseSnapshot(expense as unknown as Record<string, unknown>),
              expenseSnapshot(newExpRow),
              branchId,
            )
            expenseStatus = "Active"
          }
        }

        await client.query("COMMIT")
        committed = true

        const response = await buildCashflowResponse(client, created, actor.id)
        return {
          ...response,
          payment_status: "fully_paid" as const,
          expense_payment_id: settled.expensePayment.id,
          transaction: {
            id: settled.transactionId,
            transaction_number: settled.transactionNumber,
          },
          ...(settled.chargesExpenseId
            ? {
                charges_expense_id: settled.chargesExpenseId,
                charges_transaction_id: settled.chargesTransactionId,
              }
            : {}),
          expense_status: expenseStatus,
        }
      } finally {
        if (!committed) {
          await client.query("ROLLBACK").catch(() => undefined)
        }
      }
    })

    if (result && "error" in result) {
      const code = String(result.error || "")
      const { status, body: errBody } = mapExpenseMutationErrorResponse(
        {
          error: code,
          message: "message" in result ? String(result.message || "") : undefined,
          staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
          branchStatus: "branchStatus" in result ? result.branchStatus : undefined,
        },
        {
          expense_already_completed: 409,
          expense_already_rejected: 409,
          expense_not_approved_or_active: 409,
          insert_failed: 500,
          transaction_insert_failed: 500,
        },
      )
      apiLog("warn", "expenses.cashflows.create.denied", { method: "POST", apiPath, status, error: code })
      return NextResponse.json(errBody, { status })
    }

    apiLog("info", "expenses.cashflows.create.success", { method: "POST", apiPath, status: 201 })
    return NextResponse.json({ ok: true, ...result }, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "expenses.cashflows.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

async function buildCashflowResponse(
  client: import("pg").PoolClient,
  created: Awaited<ReturnType<typeof createExpenseCashflow>>,
  actorId: string,
) {
  const sid = created.staffId
  const agentId = created.thirdPartyAgentId
  let assigned_type: "staff" | "client" | null = null
  if (sid) assigned_type = "staff"
  else if (agentId) assigned_type = "client"

  let assigned_name: string | null = null
  if (sid) {
    const nr = await client.query(`SELECT full_name FROM users WHERE id = $1::uuid LIMIT 1`, [sid])
    assigned_name =
      nr.rows[0]?.full_name != null ? String(nr.rows[0].full_name).trim() || "Staff" : "Staff"
  } else if (agentId) {
    const nr = await client.query(`SELECT name FROM third_party_agents WHERE id = $1::uuid LIMIT 1`, [agentId])
    assigned_name = nr.rows[0]?.name != null ? String(nr.rows[0].name).trim() || "Third Party Agent" : "Third Party Agent"
  }

  const nameRes = await client.query(`SELECT full_name FROM users WHERE id = $1::uuid LIMIT 1`, [actorId])
  const completed_by_name =
    nameRes.rows[0]?.full_name != null ? String(nameRes.rows[0].full_name).trim() : null

  const isSettled = isSettledExpenseCashflowStatus(String(created.status || ""))

  return {
    cashflow: {
      id: created.id,
      amount: created.amount,
      description: created.description,
      status: created.status,
      date: created.date,
      payment_method: created.paymentMethod,
      created_at: created.createdAt ?? "",
      staff_id: sid,
      third_party_agent_id: agentId,
      assigned_type,
      assigned_name,
      completed_by: isSettled ? actorId : null,
      completed_at: isSettled ? new Date().toISOString() : null,
      completed_by_name: isSettled ? completed_by_name : null,
      transaction_id: created.transactionId,
    },
  }
}
