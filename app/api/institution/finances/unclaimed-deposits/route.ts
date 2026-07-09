import { NextResponse } from "next/server"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { requireStaffSession, scopeWhere } from "@/lib/api/rbac"
import {
  assertFinanceBranchScope,
  assertFinanceMutationAccess,
  assertFinanceReadAccess,
  financeAccessErrorResponseOrNull,
  resolveFinanceWriteBranchId,
} from "@/lib/api/finance-access"
import { runWithAuth } from "@/lib/db"
import { auditUnclaimedDepositInsert, unclaimedDepositSnapshot } from "@/lib/audit/finances-audit"
import { FINANCE_PERMISSIONS } from "@/lib/finances/permissions"
import { toDateOnlyString } from "@/lib/finances/date-only"
import { normalizePaymentMode } from "@/lib/finances/payment-mode"
import { getBranchBankAccount } from "@/lib/finances/bank-account"
import { parseUnclaimedAssignedTypeFilter } from "@/lib/finances/unclaimed-deposit"
import { insertWithTransactionNumberRetry } from "@/lib/transactions/transaction-number-retry"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []
    const status = (url.searchParams.get("status") || "").trim()
    const search = (url.searchParams.get("q") || "").trim()
    const assignedTypeRaw = (url.searchParams.get("assigned_type") || "").trim().toLowerCase()
    const assignedType = parseUnclaimedAssignedTypeFilter(assignedTypeRaw)
    const dateFromRaw = (url.searchParams.get("date_from") || "").trim()
    const dateToRaw = (url.searchParams.get("date_to") || "").trim()
    const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
    const dateFrom = isIsoDate(dateFromRaw) ? dateFromRaw : ""
    const dateTo = isIsoDate(dateToRaw) ? dateToRaw : ""
    const pageRaw = parseInt(url.searchParams.get("page") || "0", 10)
    const rowsPerPageRaw = parseInt(url.searchParams.get("rowsPerPage") || "10", 10)
    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0
    const rowsPerPage = Math.min(Math.max(Number.isFinite(rowsPerPageRaw) ? rowsPerPageRaw : 10, 1), 200)
    const offset = page * rowsPerPage

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceReadAccess(client, sess.authUserId, FINANCE_PERMISSIONS.viewUnclaimedDeposits)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const scoped = scopeWhere({ tableAlias: "ud", actor, selectedBranchIds })
      let where = scoped.where
      const values: unknown[] = [...scoped.values]
      let idx = scoped.nextIndex

      if (status) {
        where += ` AND lower(trim(ud.status)) = lower(trim($${idx}::text))`
        values.push(status)
        idx++
      }

      if (search) {
        where += ` AND (
          ud.unclaimed_deposit_number ILIKE $${idx}
          OR ud.transaction_number ILIKE $${idx}
          OR m.full_name ILIKE $${idx}
          OR c.name ILIKE $${idx}
        )`
        values.push(`%${search}%`)
        idx++
      }

      if (assignedType === "member") {
        where += ` AND ud.member_id IS NOT NULL`
      } else if (assignedType === "third_party_agent") {
        where += ` AND ud.third_party_agent_id IS NOT NULL`
      }

      if (dateFrom) {
        where += ` AND ud.date >= $${idx}::date`
        values.push(dateFrom)
        idx++
      }
      if (dateTo) {
        where += ` AND ud.date <= $${idx}::date`
        values.push(dateTo)
        idx++
      }

      const limitIdx = idx
      const offsetIdx = idx + 1
      values.push(rowsPerPage, offset)

      const listRes = await client.query(
        `SELECT
           ud.id,
           COALESCE(ud.unclaimed_deposit_number, '') AS unclaimed_deposit_number,
           COALESCE(ud.transaction_number, '') AS transaction_number,
           ud.amount,
           ud.mode,
           ud.date,
           ud.status,
           COALESCE(m.full_name, c.name, '—') AS assigned_to,
           CASE
             WHEN ud.member_id IS NOT NULL THEN 'Member'
             WHEN ud.third_party_agent_id IS NOT NULL THEN 'Third Party Agent'
             ELSE '—'
           END AS assigned_type,
           COALESCE(ud.notes, '') AS notes,
           ud.created_at,
           ud.updated_at,
           COALESCE(b.name, '') AS branch_name,
           COALESCE(cu.full_name, '') AS created_by_name,
           COALESCE(mu.full_name, '') AS modified_by_name,
           ud.transaction_id,
           t.transaction_number AS linked_transaction_number,
           t.type             AS linked_transaction_type,
           t.amount           AS linked_transaction_amount,
           t.mode             AS linked_transaction_mode,
           t.transaction_date AS linked_transaction_date,
           t.reference_number AS linked_transaction_reference,
           t.description      AS linked_transaction_description,
           COUNT(*) OVER()::int AS total_count
         FROM unclaimed_deposits ud
         LEFT JOIN members m ON m.id = ud.member_id
         LEFT JOIN third_party_agents c ON c.id = ud.third_party_agent_id
         LEFT JOIN branches b ON b.id = ud.branch_id
         LEFT JOIN users cu ON cu.id = ud.created_by
         LEFT JOIN users mu ON mu.id = ud.modified_by
         LEFT JOIN transactions t ON t.id = ud.transaction_id
         WHERE ${where}
         ORDER BY ud.date DESC NULLS LAST, ud.created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values,
      )

      const total = listRes.rows[0]?.total_count != null ? Number(listRes.rows[0].total_count) : 0

      return {
        rows: listRes.rows.map((row) => {
          const linkedId = row.transaction_id ? String(row.transaction_id) : ""
          return {
            id: String(row.id),
            unclaimed_deposit_number: String(row.unclaimed_deposit_number || ""),
            transaction_number: String(row.transaction_number || ""),
            amount: Number(row.amount || 0),
            mode: String(row.mode || ""),
            date: toDateOnlyString(row.date),
            status: String(row.status || "unclaimed"),
            assigned_to: String(row.assigned_to || "—"),
            assigned_type: String(row.assigned_type || "—") as "Member" | "Third Party Agent" | "—",
            notes: String(row.notes || ""),
            branch_name: String(row.branch_name || ""),
            created_at: row.created_at ? new Date(row.created_at).toISOString() : "",
            updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : "",
            created_by_name: String(row.created_by_name || ""),
            modified_by_name: String(row.modified_by_name || ""),
            linked_transaction: linkedId
              ? {
                  id: linkedId,
                  transaction_number: String(row.linked_transaction_number || ""),
                  type: String(row.linked_transaction_type || ""),
                  amount: Number(row.linked_transaction_amount || 0),
                  mode: String(row.linked_transaction_mode || ""),
                  date: row.linked_transaction_date
                    ? new Date(row.linked_transaction_date).toISOString()
                    : "",
                  reference_number: String(row.linked_transaction_reference || ""),
                  description: String(row.linked_transaction_description || ""),
                }
              : null,
          }
        }),
        total,
      }
    })

    if (result && "error" in result) {
      const accessResponse = financeAccessErrorResponseOrNull(result)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      return NextResponse.json({ error: result.error }, { status: 403 })
    }

    return NextResponse.json({ rows: result?.rows || [], total: result?.total || 0 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.unclaimed.list.error", { method: "GET", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const body = await req.json().catch(() => ({}))
    const amount = Number(body?.amount)
    const mode = normalizePaymentMode(body?.mode)
    const depositDate = String(body?.date || "").trim() || null
    const transactionNumber = String(body?.transaction_number || "").trim() || null
    const bankAccountIdRaw = String(body?.bank_account_id || "").trim()
    const notes = String(body?.notes || "").trim() || null
    const branchId = String(body?.branch_id || "").trim()

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    if (!mode) {
      return NextResponse.json({ error: "invalid_payment_mode" }, { status: 400 })
    }
    if (mode === "Bank Transfer" && !bankAccountIdRaw) {
      return NextResponse.json({ error: "bank_account_required" }, { status: 400 })
    }

    const created = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertFinanceMutationAccess(client, sess.authUserId, FINANCE_PERMISSIONS.addUnclaimedDeposit)
      if (!access.ok) {
        return {
          error: access.error,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        }
      }
      const { actor } = access

      const targetBranchId = resolveFinanceWriteBranchId(actor, branchId)
      const branchScope = await assertFinanceBranchScope(client, actor, targetBranchId)
      if (!branchScope.ok) {
        return {
          error: branchScope.error,
          staffStatus: branchScope.staffStatus,
          branchStatus: branchScope.branchStatus,
        }
      }

      let bankAccountId: string | null = null
      if (mode === "Bank Transfer") {
        const bankAccount = await getBranchBankAccount(client, {
          bankAccountId: bankAccountIdRaw,
          institutionId: actor.institution_id,
          branchId: branchScope.branchId,
        })
        if (!bankAccount) return { error: "invalid_bank_account" as const }
        bankAccountId = bankAccount.id
      }

      const inserted = await insertWithTransactionNumberRetry<{
        id: string
        unclaimed_deposit_number: string
        transaction_number: string | null
        amount: string | number
        mode: string
        date: string | null
        status: string
        member_id: string | null
        third_party_agent_id: string | null
        transaction_id: string | null
        branch_id: string
        notes: string | null
      }>(
        (unclaimedDepositNumber) =>
          client.query(
            `INSERT INTO unclaimed_deposits (
               institution_id, branch_id, bank_account_id, unclaimed_deposit_number, transaction_number,
               amount, mode, date, status, notes, created_by, modified_by
             ) VALUES (
               $1::uuid, $2::uuid, $3::uuid, $4, $5,
               $6, $7::payment_mode, $8::date, 'unclaimed', $9, $10::uuid, $10::uuid
             )
             RETURNING id, unclaimed_deposit_number, transaction_number, amount, mode, date, status,
                       member_id, third_party_agent_id, bank_account_id, transaction_id, branch_id, notes`,
            [
              actor.institution_id,
              branchScope.branchId,
              bankAccountId,
              unclaimedDepositNumber,
              transactionNumber,
              amount,
              mode,
              depositDate,
              notes,
              actor.id,
            ],
          ),
        { prefix: "UCD" },
      )

      if (!inserted) return { error: "unclaimed_deposit_number_generation_failed" as const }

      const newRow = inserted.row as unknown as Record<string, unknown>
      const newId = String(newRow.id || "")
      if (newId) {
        await auditUnclaimedDepositInsert(
          client,
          actor,
          newId,
          unclaimedDepositSnapshot(newRow),
          (newRow.branch_id as string | null | undefined) ?? branchScope.branchId,
        )
      }

      return {
        id: newId,
        unclaimed_deposit_number: String(newRow.unclaimed_deposit_number || inserted.transactionNumber),
      }
    })

    if (created && "error" in created) {
      const accessResponse = financeAccessErrorResponseOrNull(created)
      if (accessResponse) {
        return NextResponse.json(accessResponse.body, { status: accessResponse.status })
      }
      const statusCode =
        created.error === "unclaimed_deposit_number_generation_failed"
          ? 500
          : created.error === "invalid_bank_account" || created.error === "bank_account_required"
            ? 400
            : 403
      return NextResponse.json({ error: created.error }, { status: statusCode })
    }

    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "finances.unclaimed.create.error", { method: "POST", apiPath, status: 500, error: err?.message })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
